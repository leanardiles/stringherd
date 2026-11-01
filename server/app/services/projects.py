"""Projects, their target languages and their machine keys.

The single place where projects are created and keys issued, so that when organizations
arrive, "this project belongs to organization X" is set here and nowhere else.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import (
    Delivery,
    Project,
    ProjectApiKey,
    ProjectLocale,
    ReviewerAssignment,
    TextOrigin,
    Translation,
    TranslationKey,
    TranslationStatus,
    User,
)

KEY_PREFIX = "shp_"  # Stringherd project key; makes leaked keys easy to recognise in logs and scanners


class ProjectExistsError(Exception):
    pass


@dataclass
class IssuedKey:
    record: ProjectApiKey
    secret: str  # the full key; returned once, never stored


def hash_api_key(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def get_project(db: Session, slug: str) -> Project | None:
    return db.scalar(select(Project).where(Project.slug == slug))


def create_project(
    db: Session, *, slug: str, name: str, source_locale: str | None, target_locales: list[str]
) -> Project:
    if get_project(db, slug) is not None:
        raise ProjectExistsError(slug)
    project = Project(slug=slug, name=name, source_locale=source_locale)
    project.locales = [ProjectLocale(locale=locale) for locale in dict.fromkeys(target_locales)]
    db.add(project)
    db.flush()
    return project


def ensure_locale(db: Session, project: Project, locale: str) -> None:
    """Add a target language if the project does not list it yet. Safe under parallel pushes."""
    insert = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    db.execute(
        insert(ProjectLocale)
        .values(project_id=project.id, locale=locale)
        .on_conflict_do_nothing(index_elements=["project_id", "locale"])
    )


def issue_api_key(db: Session, project: Project, *, label: str, created_by: User | None) -> IssuedKey:
    secret = KEY_PREFIX + secrets.token_urlsafe(32)
    record = ProjectApiKey(
        project=project,
        label=label,
        prefix=secret[: len(KEY_PREFIX) + 6],
        key_hash=hash_api_key(secret),
        created_by=created_by,
    )
    db.add(record)
    db.flush()
    return IssuedKey(record=record, secret=secret)


def find_active_key(db: Session, secret: str) -> ProjectApiKey | None:
    key = db.scalar(select(ProjectApiKey).where(ProjectApiKey.key_hash == hash_api_key(secret)))
    if key is None or key.revoked_at is not None:
        return None
    return key


def revoke_api_key(key: ProjectApiKey) -> None:
    if key.revoked_at is None:
        key.revoked_at = datetime.now(UTC)


@dataclass
class LanguageRemoval:
    """What removing a language deletes (or would delete)."""

    listed: bool  # the project lists the language
    strings: int
    delivered: int
    approved: int
    imported: int  # imported from the repository
    assignments: int
    deliveries: int


def remove_language(db: Session, project: Project, locale: str, *, apply: bool) -> LanguageRemoval:
    """Remove a language from a project with everything Stringherd holds for it.

    An operator's tool (python -m app.cli remove-language), for starting a language over, for
    example between import tests: its translations, reviewer assignments and delivery history
    go, and so does the language itself. The keys stay, since every language shares them, and
    the repository is never touched. With apply=False it only reports what would go.
    """
    language = db.scalar(
        select(ProjectLocale).where(ProjectLocale.project_id == project.id, ProjectLocale.locale == locale)
    )
    translation_ids = (
        select(Translation.id)
        .join(TranslationKey, Translation.key_id == TranslationKey.id)
        .where(TranslationKey.project_id == project.id, Translation.locale == locale)
    )
    by_status = dict(
        db.execute(
            select(Translation.status, func.count())
            .where(Translation.id.in_(translation_ids))
            .group_by(Translation.status)
        ).all()
    )
    assignments = ReviewerAssignment.project_id == project.id, ReviewerAssignment.locale == locale
    deliveries = Delivery.project_id == project.id, Delivery.locale == locale
    summary = LanguageRemoval(
        listed=language is not None,
        strings=sum(by_status.values()),
        delivered=by_status.get(TranslationStatus.DELIVERED, 0),
        approved=by_status.get(TranslationStatus.APPROVED, 0),
        imported=db.scalar(
            select(func.count()).where(Translation.id.in_(translation_ids), Translation.origin == TextOrigin.REPOSITORY)
        )
        or 0,
        assignments=db.scalar(select(func.count()).select_from(ReviewerAssignment).where(*assignments)) or 0,
        deliveries=db.scalar(select(func.count()).select_from(Delivery).where(*deliveries)) or 0,
    )
    if apply:
        db.execute(
            delete(Translation).where(Translation.id.in_(translation_ids)).execution_options(synchronize_session=False)
        )
        db.execute(delete(ReviewerAssignment).where(*assignments))
        db.execute(delete(Delivery).where(*deliveries))
        if language is not None:
            db.delete(language)
        db.commit()
    return summary
