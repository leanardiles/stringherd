"""Projects, their target languages and their machine keys.

The single place where projects are created and keys issued, so that when organizations
arrive, "this project belongs to organization X" is set here and nowhere else.
"""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import Project, ProjectApiKey, ProjectLocale, User

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
