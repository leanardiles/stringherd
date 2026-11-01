"""The data behind importing existing translations: a language's import state, and where each
translation's text came from. Nothing uses them yet; these tests pin down their defaults and
the values the database accepts."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.models import ImportMode, Project, ProjectLocale, TextOrigin, Translation
from tests.conftest import AUTH

NOW = datetime.now(UTC)


def fitjournal(db):
    return db.scalar(select(Project).where(Project.slug == "fitjournal"))


def test_a_pushed_translation_comes_from_deepl(client, db_session_factory):
    client.put("/api/projects/fitjournal/keys/nav.home", json={"locale": "fr", "value": "Accueil"}, headers=AUTH)
    with db_session_factory() as db:
        translation = db.scalar(select(Translation))
        assert (translation.origin, translation.imported_at) == (TextOrigin.DEEPL, None)


def test_a_language_starts_without_an_import(db_session_factory):
    with db_session_factory() as db:
        db.add(ProjectLocale(project_id=fitjournal(db).id, locale="nl"))
        db.commit()
        language = db.scalar(select(ProjectLocale))
        assert language.import_mode is None
        assert not language.importing


def test_an_import_is_open_from_start_to_finish(db_session_factory):
    with db_session_factory() as db:
        language = ProjectLocale(project_id=fitjournal(db).id, locale="nl", import_mode=ImportMode.REVIEW)
        db.add(language)
        assert not language.importing
        language.import_started_at = NOW
        assert language.importing
        language.import_finished_at = NOW
        assert not language.importing
        db.commit()


def test_values_are_stored_as_plain_text(db_session_factory):
    """The values are readable in the database itself, not Python names."""
    with db_session_factory() as db:
        project_id = fitjournal(db).id
        db.add(ProjectLocale(project_id=project_id, locale="nl", import_mode=ImportMode.REVIEWED))
        db.commit()
        assert db.execute(text("SELECT import_mode FROM project_locales")).scalar() == "reviewed"


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE translations SET origin = 'human'",
        "UPDATE project_locales SET import_mode = 'keep'",
        # Finished without ever starting.
        "UPDATE project_locales SET import_finished_at = CURRENT_TIMESTAMP",
    ],
)
def test_the_database_refuses_other_values(client, db_session_factory, statement):
    client.put("/api/projects/fitjournal/keys/nav.home", json={"locale": "fr", "value": "Accueil"}, headers=AUTH)
    with db_session_factory() as db:
        with pytest.raises(IntegrityError):
            db.execute(text(statement))
            db.commit()
