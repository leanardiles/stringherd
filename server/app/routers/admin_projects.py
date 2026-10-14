"""Project administration: projects, their languages, machine keys and setup. Admins only.

A project must exist here before DeepL Sync can push to it. Each project has its own API
keys, so a key leaked from one repository opens only that project.
"""

from typing import Annotated
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Path, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import (
    Project,
    ProjectApiKey,
    ProjectLocale,
    ReviewerAssignment,
    Translation,
    TranslationKey,
    TranslationStatus,
    User,
)
from app.permissions import can_manage_project, projects_visible_to
from app.schemas import (
    LOCALE_PATTERN,
    ApiKeyCreate,
    ApiKeyIssued,
    ApiKeyOut,
    LocaleIn,
    ProjectAdminDetail,
    ProjectAdminOut,
    ProjectCreate,
    ProjectLocaleOut,
    ProjectSetup,
    ProjectUpdate,
    ReviewerRef,
)
from app.security import AdminUser
from app.services.projects import (
    ProjectExistsError,
    create_project,
    get_project,
    issue_api_key,
    revoke_api_key,
)

router = APIRouter(prefix="/api/admin/projects", tags=["project administration"])

DbSession = Annotated[Session, Depends(get_db)]
ProjectSlug = Annotated[str, Path(alias="projectId", pattern=r"^[A-Za-z0-9._-]{1,100}$")]
Locale = Annotated[str, Path(pattern=LOCALE_PATTERN, max_length=35)]


def _managed_project(db: Session, user: User, slug: str) -> Project:
    project = get_project(db, slug)
    if project is None or not can_manage_project(user, project):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{slug}' not found.")
    return project


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=detail)


def _key_out(key: ProjectApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=key.id,
        label=key.label,
        prefix=key.prefix,
        created_at=key.created_at,
        created_by=key.created_by.name if key.created_by else None,
        last_used_at=key.last_used_at,
        revoked_at=key.revoked_at,
    )


def _project_out(db: Session, project: Project) -> ProjectAdminOut:
    counts: dict[str, dict[str, int]] = {}
    rows = db.execute(
        select(Translation.locale, Translation.status, func.count())
        .join(TranslationKey, Translation.key_id == TranslationKey.id)
        .where(TranslationKey.project_id == project.id)
        .group_by(Translation.locale, Translation.status)
    ).all()
    for locale, row_status, count in rows:
        counts.setdefault(locale, {})[TranslationStatus(row_status).value] = count

    reviewers: dict[str, list[ReviewerRef]] = {}
    for locale, user_id, name in db.execute(
        select(ReviewerAssignment.locale, User.id, User.name)
        .join(User, ReviewerAssignment.user_id == User.id)
        .where(ReviewerAssignment.project_id == project.id, User.is_active.is_(True))
        .order_by(User.name)
    ):
        reviewers.setdefault(locale, []).append(ReviewerRef(id=user_id, name=name))

    strings = db.scalar(select(func.count()).where(TranslationKey.project_id == project.id)) or 0
    return ProjectAdminOut(
        project_id=project.slug,
        name=project.name,
        source_locale=project.source_locale,
        target_locales=project.target_locales,
        strings=strings,
        locales=[
            ProjectLocaleOut(
                locale=locale,
                total=sum(counts.get(locale, {}).values()),
                approved=counts.get(locale, {}).get("approved", 0),
                reviewers=reviewers.get(locale, []),
            )
            for locale in project.target_locales
        ],
        active_keys=sum(1 for key in project.api_keys if key.revoked_at is None),
        created_at=project.created_at,
    )


def _project_detail(db: Session, project: Project) -> ProjectAdminDetail:
    return ProjectAdminDetail(
        **_project_out(db, project).model_dump(),
        api_keys=[_key_out(key) for key in project.api_keys],
    )


# ---------- Projects ----------

@router.get("", response_model=list[ProjectAdminOut])
def list_projects(admin: AdminUser, db: DbSession) -> list[ProjectAdminOut]:
    """Every project the admin manages, with string counts, progress and reviewers per language."""
    return [_project_out(db, project) for project in projects_visible_to(db, admin)]


@router.post("", response_model=ProjectAdminDetail, status_code=status.HTTP_201_CREATED)
def add_project(body: ProjectCreate, admin: AdminUser, db: DbSession) -> ProjectAdminDetail:
    """Create a project. `project_id` must match `tms.project_id` in the repository's .deepl-sync.yaml."""
    if body.source_locale in body.target_locales:
        raise _invalid(f"'{body.source_locale}' is the source language; it cannot also be a target.")
    try:
        project = create_project(
            db,
            slug=body.project_id,
            name=body.name,
            source_locale=body.source_locale,
            target_locales=body.target_locales,
        )
    except ProjectExistsError:
        raise _conflict(f"A project with id '{body.project_id}' already exists.")
    db.commit()
    db.refresh(project)
    return _project_detail(db, project)


@router.get("/{projectId}", response_model=ProjectAdminDetail)
def project_detail(project_slug: ProjectSlug, admin: AdminUser, db: DbSession) -> ProjectAdminDetail:
    return _project_detail(db, _managed_project(db, admin, project_slug))


@router.patch("/{projectId}", response_model=ProjectAdminDetail)
def update_project(
    project_slug: ProjectSlug, body: ProjectUpdate, admin: AdminUser, db: DbSession
) -> ProjectAdminDetail:
    """Rename a project, or change its source language while it has no source strings yet.

    The project id cannot change: repositories refer to it in .deepl-sync.yaml.
    """
    project = _managed_project(db, admin, project_slug)
    if body.name is not None:
        project.name = body.name
    if body.source_locale is not None and body.source_locale != project.source_locale:
        if body.source_locale in project.target_locales:
            raise _invalid(f"'{body.source_locale}' is a target language; remove it first.")
        has_source = db.scalar(
            select(TranslationKey.id)
            .where(TranslationKey.project_id == project.id, TranslationKey.source_text.is_not(None))
            .limit(1)
        )
        if has_source is not None:
            raise _conflict("The source language cannot change after source strings have been uploaded.")
        project.source_locale = body.source_locale
    db.commit()
    db.refresh(project)
    return _project_detail(db, project)


# ---------- Languages ----------

@router.post("/{projectId}/locales", response_model=ProjectAdminDetail, status_code=status.HTTP_201_CREATED)
def add_locale(project_slug: ProjectSlug, body: LocaleIn, admin: AdminUser, db: DbSession) -> ProjectAdminDetail:
    """Add a target language, so reviewers can be assigned to it before the first push."""
    project = _managed_project(db, admin, project_slug)
    if body.locale == project.source_locale:
        raise _invalid(f"'{body.locale}' is the source language of '{project.slug}'.")
    if body.locale in project.target_locales:
        raise _conflict(f"'{body.locale}' is already a target language of '{project.slug}'.")
    project.locales.append(ProjectLocale(locale=body.locale))
    db.commit()
    db.refresh(project)
    return _project_detail(db, project)


@router.delete("/{projectId}/locales/{locale}", response_model=ProjectAdminDetail)
def remove_locale(project_slug: ProjectSlug, locale: Locale, admin: AdminUser, db: DbSession) -> ProjectAdminDetail:
    """Remove a target language that has no translations yet. Its reviewer assignments go with it.

    Languages with translations stay, so nothing reviewed is lost by accident.
    """
    project = _managed_project(db, admin, project_slug)
    entry = next((e for e in project.locales if e.locale == locale), None)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"'{locale}' is not a target language of '{project.slug}'."
        )
    translations = db.scalar(
        select(func.count())
        .select_from(Translation)
        .join(TranslationKey, Translation.key_id == TranslationKey.id)
        .where(TranslationKey.project_id == project.id, Translation.locale == locale)
    )
    if translations:
        raise _conflict(f"'{locale}' has {translations} translation(s) and cannot be removed.")
    for assignment in db.scalars(
        select(ReviewerAssignment).where(
            ReviewerAssignment.project_id == project.id, ReviewerAssignment.locale == locale
        )
    ):
        db.delete(assignment)
    project.locales.remove(entry)
    db.commit()
    db.refresh(project)
    return _project_detail(db, project)


# ---------- API keys ----------

@router.get("/{projectId}/keys", response_model=list[ApiKeyOut])
def list_keys(project_slug: ProjectSlug, admin: AdminUser, db: DbSession) -> list[ApiKeyOut]:
    """The project's keys, including revoked ones. Only a short prefix of each key is shown."""
    return [_key_out(key) for key in _managed_project(db, admin, project_slug).api_keys]


@router.post("/{projectId}/keys", response_model=ApiKeyIssued, status_code=status.HTTP_201_CREATED)
def create_key(project_slug: ProjectSlug, body: ApiKeyCreate, admin: AdminUser, db: DbSession) -> ApiKeyIssued:
    """Issue a key for DeepL Sync and the source upload. `key` is returned only in this response."""
    project = _managed_project(db, admin, project_slug)
    issued = issue_api_key(db, project, label=body.label, created_by=admin)
    db.commit()
    db.refresh(issued.record)
    return ApiKeyIssued(**_key_out(issued.record).model_dump(), key=issued.secret)


@router.delete("/{projectId}/keys/{key_id}", response_model=ApiKeyOut)
def revoke_key(
    project_slug: ProjectSlug, key_id: Annotated[int, Path()], admin: AdminUser, db: DbSession
) -> ApiKeyOut:
    """Revoke a key. It stops working at once; the record stays for the audit trail."""
    project = _managed_project(db, admin, project_slug)
    key = db.get(ProjectApiKey, key_id)
    if key is None or key.project_id != project.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found.")
    revoke_api_key(key)
    db.commit()
    db.refresh(key)
    return _key_out(key)


# ---------- Setup ----------

@router.get("/{projectId}/setup", response_model=ProjectSetup)
def setup(project_slug: ProjectSlug, request: Request, admin: AdminUser, db: DbSession) -> ProjectSetup:
    """What to put in the repository: the .deepl-sync.yaml block and the commands to run."""
    project = _managed_project(db, admin, project_slug)
    server_url = (get_settings().public_url or str(request.base_url)).rstrip("/")
    host = urlsplit(server_url).hostname or server_url
    source = project.source_locale or "en"
    deepl_sync_yaml = (
        "tms:\n"
        "  enabled: true\n"
        f"  server: {server_url}\n"
        f"  project_id: {project.slug}\n"
    )
    commands = (
        "# Once per machine: allow DeepL Sync to talk to this server\n"
        f"deepl config set tms.allowedServers {host}\n"
        "\n"
        "# The project key, from your secret store (never commit it)\n"
        "export TMS_API_KEY=shp_...\n"
        "\n"
        "# Machine-translate, then send the translations for review\n"
        "deepl sync --flag-for-review\n"
        "deepl sync push\n"
        "\n"
        "# Send the source strings, so reviewers see what is being translated\n"
        f"node upload-source.mjs --server {server_url} --project {project.slug} \\\n"
        f"  --locale {source} --file path/to/{source}/common.json\n"
        "\n"
        "# After review: bring approved translations back into the repository\n"
        "deepl sync pull\n"
    )
    return ProjectSetup(
        server_url=server_url, project_id=project.slug, deepl_sync_yaml=deepl_sync_yaml, commands=commands
    )
