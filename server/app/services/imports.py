"""Importing a language's existing translations, so DeepL does not translate them again.

The admin answers, when adding a language, what to do with the translations the repository
already has (ImportMode). For the two keep answers an import opens at once: until the admin
finishes it, every `deepl sync push` for that language sends the repository's own text, and
Stringherd stores it as imported instead of as DeepL's.

Imported text counts as delivered from the start, also when it is still to review: the export
returns it, so the first `deepl sync pull` records every key in the lockfile and a later
`deepl sync` cannot overwrite the files during the review.

A push carries no hint of who wrote its text. Stringherd trusts that the files still hold the
existing translations when the push runs; a bare `deepl sync` before it would overwrite them.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    ImportMode,
    Project,
    ProjectLocale,
    TextOrigin,
    Translation,
    TranslationKey,
    TranslationStatus,
)

KEEP = (ImportMode.REVIEW, ImportMode.REVIEWED)


class LanguageHasStringsError(Exception):
    """The answer can only be set or changed while the language has no strings."""


class NoImportOpenError(Exception):
    """Finish import was asked for a language with no open import."""


class NothingImportedError(Exception):
    """Finish import was asked before any string arrived: the push has not run."""


def language_strings(db: Session, project: Project, locale: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Translation)
            .join(TranslationKey, Translation.key_id == TranslationKey.id)
            .where(TranslationKey.project_id == project.id, Translation.locale == locale)
        )
        or 0
    )


def set_import_mode(db: Session, project: Project, language: ProjectLocale, mode: ImportMode | None) -> None:
    """Record the admin's answer. A keep answer opens the import at once.

    Only while the language has no strings: after the first push, the strings already carry
    the meaning of the answer they arrived under.
    """
    if language_strings(db, project, language.locale):
        raise LanguageHasStringsError()
    language.import_mode = mode
    language.import_started_at = datetime.now(UTC) if mode in KEEP else None
    language.import_finished_at = None


def finish_import(db: Session, project: Project, language: ProjectLocale) -> None:
    """Close the import: from now on, pushes for this language are DeepL's again."""
    if not language.importing:
        raise NoImportOpenError()
    if not imported_strings(db, project, language.locale):
        raise NothingImportedError()
    language.import_finished_at = datetime.now(UTC)


def importing_mode(db: Session, project: Project, locale: str) -> ImportMode | None:
    """The keep answer of an open import for this language, or None outside an import."""
    language = db.scalar(
        select(ProjectLocale).where(ProjectLocale.project_id == project.id, ProjectLocale.locale == locale)
    )
    return language.import_mode if language is not None and language.importing else None


def import_text(translation: Translation, value: str, mode: ImportMode) -> None:
    """Store a pushed text as imported from the repository, under a keep answer."""
    now = datetime.now(UTC)
    translation.value = value
    translation.pushed_value = value
    translation.origin = TextOrigin.REPOSITORY
    translation.imported_at = now
    # Delivered at once, so the export returns it and the first pull protects the files.
    translation.delivered_value = value
    translation.delivered_at = now
    translation.delivered_by_id = None
    if mode == ImportMode.REVIEWED:
        translation.status = TranslationStatus.DELIVERED
        translation.approved_at = now
    else:
        translation.status = TranslationStatus.MACHINE_TRANSLATED
        translation.approved_at = None
    translation.approved_by_id = None


def imported_strings(db: Session, project: Project, locale: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(Translation)
            .join(TranslationKey, Translation.key_id == TranslationKey.id)
            .where(
                TranslationKey.project_id == project.id,
                Translation.locale == locale,
                Translation.origin == TextOrigin.REPOSITORY,
            )
        )
        or 0
    )


@dataclass
class ImportCounts:
    """How many strings each language imported, in total and per source file."""

    strings: dict[str, int] = field(default_factory=dict)
    files: dict[str, dict[str | None, int]] = field(default_factory=dict)
    keys: dict[str | None, int] = field(default_factory=dict)  # keys of each source file, all languages


def import_counts(db: Session, project: Project) -> ImportCounts:
    rows = db.execute(
        select(Translation.locale, TranslationKey.source_file, func.count())
        .join(TranslationKey, Translation.key_id == TranslationKey.id)
        .where(TranslationKey.project_id == project.id, Translation.origin == TextOrigin.REPOSITORY)
        .group_by(Translation.locale, TranslationKey.source_file)
    ).all()
    counts = ImportCounts()
    for locale, source_file, count in rows:
        counts.strings[locale] = counts.strings.get(locale, 0) + count
        counts.files.setdefault(locale, {})[source_file] = count
    if rows:
        counts.keys = dict(
            db.execute(
                select(TranslationKey.source_file, func.count())
                .where(TranslationKey.project_id == project.id)
                .group_by(TranslationKey.source_file)
            ).all()
        )
    return counts


def source_characters(db: Session, project: Project) -> int:
    """The length of the project's source strings: roughly what DeepL bills to translate one language."""
    return (
        db.scalar(
            select(func.coalesce(func.sum(func.length(TranslationKey.source_text)), 0)).where(
                TranslationKey.project_id == project.id
            )
        )
        or 0
    )
