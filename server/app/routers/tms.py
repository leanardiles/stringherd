"""The TMS REST contract that `deepl sync push` and `deepl sync pull` call.

Contract: https://github.com/DeepL/deepl-cli/blob/main/docs/SYNC.md
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.auth import require_api_key
from app.db import get_db
from app.models import Project, Translation, TranslationKey, TranslationStatus
from app.schemas import (
    LOCALE_PATTERN,
    MAX_VALUE_BYTES,
    LocaleCounts,
    ProjectStatus,
    PushResult,
    PushTranslation,
)

router = APIRouter(prefix="/api/projects", tags=["tms contract"], dependencies=[Depends(require_api_key)])

DbSession = Annotated[Session, Depends(get_db)]
ProjectSlug = Annotated[str, Path(alias="projectId", pattern=r"^[A-Za-z0-9._-]{1,100}$")]


def _insert(db: Session):
    """Dialect-specific INSERT that supports ON CONFLICT (Postgres in production, SQLite in tests)."""
    return pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert


def _get_project(db: Session, slug: str) -> Project:
    project = db.scalar(select(Project).where(Project.slug == slug))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{slug}' not found.")
    return project


@router.put("/{projectId}/keys/{keyPath:path}", response_model=PushResult)
def push_translation(
    project_slug: ProjectSlug,
    key_path: Annotated[str, Path(alias="keyPath", max_length=500)],
    body: PushTranslation,
    db: DbSession,
) -> PushResult:
    """Store a machine translation pushed by `deepl sync push`.

    DeepL Sync re-sends every translated key on each push, so this is idempotent:
    an unchanged value keeps its status (including `approved`); a changed value
    goes back to `machine_translated` for review.
    """
    if "/" in key_path:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Keys containing '/' are not supported: DeepL Sync pull rejects them.",
        )
    if len(body.value.encode("utf-8")) > MAX_VALUE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Value exceeds {MAX_VALUE_BYTES // 1024} KiB, the per-value limit DeepL Sync pull accepts.",
        )

    # deepl sync push sends up to 10 requests in parallel, so several may try to create the
    # same project or key at once. INSERT ... ON CONFLICT DO NOTHING makes creation atomic:
    # exactly one request inserts the row, the others find it.
    insert = _insert(db)

    # The first push to a new project_id creates it, so no setup step is needed.
    db.execute(insert(Project).values(slug=project_slug).on_conflict_do_nothing(index_elements=["slug"]))
    project_id = db.scalar(select(Project.id).where(Project.slug == project_slug))

    db.execute(
        insert(TranslationKey)
        .values(project_id=project_id, key_path=key_path)
        .on_conflict_do_nothing(index_elements=["project_id", "key_path"])
    )
    key_id = db.scalar(
        select(TranslationKey.id).where(TranslationKey.project_id == project_id, TranslationKey.key_path == key_path)
    )

    inserted_id = db.scalar(
        insert(Translation)
        .values(
            key_id=key_id,
            locale=body.locale,
            value=body.value,
            status=TranslationStatus.MACHINE_TRANSLATED.value,
        )
        .on_conflict_do_nothing(index_elements=["key_id", "locale"])
        .returning(Translation.id)
    )
    translation = db.scalar(select(Translation).where(Translation.key_id == key_id, Translation.locale == body.locale))

    changed = True
    if inserted_id is None:
        # The translation already existed.
        if translation.value == body.value:
            changed = False
        else:
            translation.value = body.value
            translation.status = TranslationStatus.MACHINE_TRANSLATED
            translation.approved_at = None

    db.commit()
    return PushResult(key=key_path, locale=body.locale, status=TranslationStatus(translation.status).value, changed=changed)


@router.get("/{projectId}/keys/export")
def export_translations(
    project_slug: ProjectSlug,
    db: DbSession,
    locale: Annotated[str, Query(pattern=LOCALE_PATTERN, max_length=35)],
    format: Annotated[str, Query()] = "json",
) -> dict[str, str]:
    """Return approved translations for one locale as a flat `{key: value}` object, for `deepl sync pull`."""
    if format != "json":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only format=json is supported.")
    project = _get_project(db, project_slug)
    rows = db.execute(
        select(TranslationKey.key_path, Translation.value)
        .join(Translation, Translation.key_id == TranslationKey.id)
        .where(
            TranslationKey.project_id == project.id,
            Translation.locale == locale,
            Translation.status == TranslationStatus.APPROVED,
        )
        .order_by(TranslationKey.key_path)
    ).all()
    return {key_path: value for key_path, value in rows}


@router.get("/{projectId}", response_model=ProjectStatus)
def project_status(project_slug: ProjectSlug, db: DbSession) -> ProjectStatus:
    """Key count and per-locale review progress. Reserved in the contract; used by Stringherd's UI."""
    project = _get_project(db, project_slug)
    key_count = db.scalar(select(func.count()).select_from(TranslationKey).where(TranslationKey.project_id == project.id))
    rows = db.execute(
        select(Translation.locale, Translation.status, func.count())
        .join(TranslationKey, Translation.key_id == TranslationKey.id)
        .where(TranslationKey.project_id == project.id)
        .group_by(Translation.locale, Translation.status)
    ).all()
    locales: dict[str, LocaleCounts] = {}
    for locale, row_status, count in rows:
        setattr(locales.setdefault(locale, LocaleCounts()), TranslationStatus(row_status).value, count)
    return ProjectStatus(project_id=project.slug, keys=key_count or 0, locales=locales)