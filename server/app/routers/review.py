"""Review API for the browser UI: list, edit and approve translations.

Every endpoint checks permissions through app.permissions, so reviewers only ever see
and change the projects and languages they are assigned to.
"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Project, Translation, TranslationKey, TranslationStatus, User
from app.permissions import can_review, reviewable_locales
from app.schemas import (
    LOCALE_PATTERN,
    BulkApprove,
    BulkApproveResult,
    ReviewEdit,
    ReviewLocale,
    ReviewProject,
    ReviewString,
    ReviewStringPage,
)
from app.security import CurrentUser

router = APIRouter(prefix="/api/review", tags=["review"])

DbSession = Annotated[Session, Depends(get_db)]
ProjectSlug = Annotated[str, Path(alias="projectId", pattern=r"^[A-Za-z0-9._-]{1,100}$")]
Locale = Annotated[str, Path(pattern=LOCALE_PATTERN, max_length=35)]


def _project_for_review(db: Session, user: User, slug: str, locale: str) -> Project:
    project = db.scalar(select(Project).where(Project.slug == slug))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{slug}' not found.")
    if not can_review(db, user, project, locale):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=f"You are not assigned to review '{locale}' in '{slug}'."
        )
    return project


def _to_review_string(key: TranslationKey, translation: Translation) -> ReviewString:
    return ReviewString(
        key=key.key_path,
        source_text=key.source_text,
        source_file=key.source_file,
        value=translation.value,
        machine_translation=translation.pushed_value,
        status=TranslationStatus(translation.status).value,
        updated_at=translation.updated_at,
        approved_at=translation.approved_at,
        approved_by=translation.approved_by.name if translation.approved_by else None,
    )


@router.get("/projects", response_model=list[ReviewProject])
def list_projects(user: CurrentUser, db: DbSession) -> list[ReviewProject]:
    """Projects and languages the signed-in user can review, with progress counts."""
    result: list[ReviewProject] = []
    for project in db.scalars(select(Project).order_by(Project.slug)):
        counts: dict[str, dict[str, int]] = {}
        rows = db.execute(
            select(Translation.locale, Translation.status, func.count())
            .join(TranslationKey, Translation.key_id == TranslationKey.id)
            .where(TranslationKey.project_id == project.id)
            .group_by(Translation.locale, Translation.status)
        ).all()
        for locale, row_status, count in rows:
            counts.setdefault(locale, {})[TranslationStatus(row_status).value] = count

        allowed = reviewable_locales(db, user, project)
        locales = sorted(counts) if allowed is None else sorted(allowed)
        if not locales:
            continue
        result.append(
            ReviewProject(
                project_id=project.slug,
                source_locale=project.source_locale,
                locales=[
                    ReviewLocale(
                        locale=locale,
                        total=sum(counts.get(locale, {}).values()),
                        machine_translated=counts.get(locale, {}).get("machine_translated", 0),
                        approved=counts.get(locale, {}).get("approved", 0),
                    )
                    for locale in locales
                ],
            )
        )
    return result


@router.get("/projects/{projectId}/locales/{locale}/strings", response_model=ReviewStringPage)
def list_strings(
    project_slug: ProjectSlug,
    locale: Locale,
    user: CurrentUser,
    db: DbSession,
    status_filter: Annotated[str | None, Query(alias="status", pattern=r"^(machine_translated|approved)$")] = None,
    q: Annotated[str | None, Query(max_length=200, description="Search in key, source and translation")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ReviewStringPage:
    """Source and translation side by side for one language, filterable and paginated."""
    project = _project_for_review(db, user, project_slug, locale)
    query = (
        select(TranslationKey, Translation)
        .join(Translation, Translation.key_id == TranslationKey.id)
        .where(TranslationKey.project_id == project.id, Translation.locale == locale)
    )
    if status_filter:
        query = query.where(Translation.status == TranslationStatus(status_filter))
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(
                TranslationKey.key_path.ilike(pattern),
                TranslationKey.source_text.ilike(pattern),
                Translation.value.ilike(pattern),
            )
        )
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.execute(query.order_by(TranslationKey.key_path).limit(limit).offset(offset)).all()
    return ReviewStringPage(
        project_id=project.slug,
        locale=locale,
        total=total or 0,
        items=[_to_review_string(key, translation) for key, translation in rows],
    )


@router.post("/projects/{projectId}/locales/{locale}/strings/approve", response_model=BulkApproveResult)
def bulk_approve(
    project_slug: ProjectSlug, locale: Locale, body: BulkApprove, user: CurrentUser, db: DbSession
) -> BulkApproveResult:
    """Approve several translations at once, as they are."""
    project = _project_for_review(db, user, project_slug, locale)
    rows = db.execute(
        select(TranslationKey.key_path, Translation)
        .join(Translation, Translation.key_id == TranslationKey.id)
        .where(
            TranslationKey.project_id == project.id,
            Translation.locale == locale,
            TranslationKey.key_path.in_(body.keys),
        )
    ).all()
    found = {key_path: translation for key_path, translation in rows}
    approved = already = 0
    now = datetime.now(UTC)
    for translation in found.values():
        if translation.status == TranslationStatus.APPROVED:
            already += 1
            continue
        translation.status = TranslationStatus.APPROVED
        translation.approved_at = now
        translation.approved_by_id = user.id
        approved += 1
    db.commit()
    return BulkApproveResult(
        approved=approved,
        already_approved=already,
        not_found=sorted(set(body.keys) - set(found)),
    )


@router.patch("/projects/{projectId}/locales/{locale}/strings/{keyPath:path}", response_model=ReviewString)
def edit_string(
    project_slug: ProjectSlug,
    locale: Locale,
    key_path: Annotated[str, Path(alias="keyPath", max_length=500)],
    body: ReviewEdit,
    user: CurrentUser,
    db: DbSession,
) -> ReviewString:
    """Edit a translation, approve it, or both in one call.

    - value only: saves the edit and leaves it unapproved (like an unconfirmed segment)
    - approved=true: approves the current (or newly edited) value and records who approved it
    - approved=false: withdraws an approval
    """
    project = _project_for_review(db, user, project_slug, locale)
    row = db.execute(
        select(TranslationKey, Translation)
        .join(Translation, Translation.key_id == TranslationKey.id)
        .where(
            TranslationKey.project_id == project.id,
            TranslationKey.key_path == key_path,
            Translation.locale == locale,
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No '{locale}' translation for '{key_path}'.")
    key, translation = row

    if body.value is not None and body.value != translation.value:
        translation.value = body.value
        if body.approved is None:
            translation.status = TranslationStatus.MACHINE_TRANSLATED
            translation.approved_at = None
            translation.approved_by_id = None
    if body.approved is True:
        translation.status = TranslationStatus.APPROVED
        translation.approved_at = datetime.now(UTC)
        translation.approved_by_id = user.id
    elif body.approved is False:
        translation.status = TranslationStatus.MACHINE_TRANSLATED
        translation.approved_at = None
        translation.approved_by_id = None

    db.commit()
    db.refresh(translation)
    return _to_review_string(key, translation)
