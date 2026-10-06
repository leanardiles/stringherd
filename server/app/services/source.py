"""Storing source strings (the text being translated), independent of how they arrive.

Every input path (the upload endpoint today, a GitHub App or other importers later)
calls store_source_strings(), so the storage and change-detection rules live in one place.
"""

from dataclasses import dataclass, field

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models import Project, Translation, TranslationKey, TranslationStatus


class SourceConflictError(Exception):
    """Some keys in the upload are already recorded as coming from a different file."""

    def __init__(self, conflicts: dict[str, str]):
        self.conflicts = conflicts
        super().__init__(f"{len(conflicts)} key(s) already belong to a different file")


class SourceLocaleMismatchError(Exception):
    """The upload's locale differs from the project's source locale."""

    def __init__(self, expected: str, received: str):
        self.expected = expected
        self.received = received
        super().__init__(f"Project source locale is '{expected}', upload is '{received}'")


@dataclass
class SourceUploadSummary:
    created: int = 0  # new keys
    filled: int = 0  # keys that existed (e.g. from a translation push) without source text
    updated: int = 0  # keys whose source text changed
    unchanged: int = 0
    approvals_reset: int = 0  # approved translations sent back to review because the source changed
    removed: list[str] = field(default_factory=list)  # keys of this file missing from the upload


def _insert(db: Session):
    return pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert


def store_source_strings(
    db: Session,
    project_slug: str,
    locale: str,
    strings: dict[str, str],
    file: str | None = None,
    commit: str | None = None,
) -> SourceUploadSummary:
    """Store a full snapshot of source strings and work out what changed.

    The caller sends every source string each time; this function compares with what is
    stored, so a missed or repeated upload is harmless (the next one repairs the state).
    """
    insert = _insert(db)
    summary = SourceUploadSummary()

    db.execute(insert(Project).values(slug=project_slug).on_conflict_do_nothing(index_elements=["slug"]))
    project = db.scalar(select(Project).where(Project.slug == project_slug))

    if project.source_locale is None:
        project.source_locale = locale
    elif project.source_locale != locale:
        raise SourceLocaleMismatchError(project.source_locale, locale)

    existing = {
        key.key_path: key
        for key in db.scalars(select(TranslationKey).where(TranslationKey.project_id == project.id))
    }

    # A key can only belong to one file. Reject the whole upload before changing anything.
    if file is not None:
        conflicts = {
            key_path: existing[key_path].source_file
            for key_path in strings
            if key_path in existing
            and existing[key_path].source_file is not None
            and existing[key_path].source_file != file
        }
        if conflicts:
            raise SourceConflictError(conflicts)

    new_rows = [
        {
            "project_id": project.id,
            "key_path": key_path,
            "source_text": text,
            "source_file": file,
            "source_commit": commit,
        }
        for key_path, text in strings.items()
        if key_path not in existing
    ]
    if new_rows:
        db.execute(
            insert(TranslationKey).values(new_rows).on_conflict_do_nothing(index_elements=["project_id", "key_path"])
        )
        summary.created = len(new_rows)

    changed_key_ids: list[int] = []
    for key_path, text in strings.items():
        key = existing.get(key_path)
        if key is None:
            continue
        if file is not None and key.source_file is None:
            key.source_file = file
        if key.source_text == text:
            summary.unchanged += 1
            continue
        if key.source_text is None:
            summary.filled += 1
        else:
            # The source changed: translations approved against the old text need review again.
            summary.updated += 1
            changed_key_ids.append(key.id)
        key.source_text = text
        key.source_commit = commit

    if changed_key_ids:
        result = db.execute(
            update(Translation)
            .where(
                Translation.key_id.in_(changed_key_ids),
                Translation.status == TranslationStatus.APPROVED,
            )
            .values(status=TranslationStatus.MACHINE_TRANSLATED, approved_at=None)
        )
        summary.approvals_reset = result.rowcount or 0

    # Removed keys are reported, not deleted: removal could be a mistake, and deleting would
    # drop their translations and history. Only keys known to belong to this file are checked.
    if file is not None:
        summary.removed = sorted(
            key_path for key_path, key in existing.items() if key.source_file == file and key_path not in strings
        )

    db.commit()
    return summary
