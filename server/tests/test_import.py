"""Importing a language's existing translations (v1.1): the admin's answer, the push of an
import, Finish import, and what reset-language and remove-language do with imported strings."""

import pytest
from sqlalchemy import select

from app import cli
from app.models import Delivery, ProjectLocale, ReviewerAssignment, Translation, TranslationKey
from tests.conftest import AUTH, login

ADMIN = "/api/admin/projects/fitjournal"
MACHINE = "/api/projects/fitjournal"
FILE = "web-react/src/i18n/locales/en/common.json"
SOURCE = {"nav.home": "Home", "nav.saved": "Saved", "auth.signIn": "Sign in"}
DUTCH = {"nav.home": "Startpagina", "nav.saved": "Opgeslagen", "auth.signIn": "Inloggen"}


@pytest.fixture
def admin(new_client, make_user):
    make_user("admin@example.com", role="admin")
    client = new_client()
    login(client, "admin@example.com")
    return client


@pytest.fixture
def project(client):
    """FitJournal with its English uploaded and French from DeepL, before Dutch joins."""
    client.put(f"{MACHINE}/source", json={"locale": "en", "file": FILE, "strings": SOURCE}, headers=AUTH)
    push(client, "nav.home", "fr", "Accueil")
    return client


def push(client, key, locale, value):
    response = client.put(f"{MACHINE}/keys/{key}", json={"locale": locale, "value": value}, headers=AUTH)
    assert response.status_code == 200
    return response.json()


def push_dutch(client, strings=DUTCH):
    return [push(client, key, "nl", value) for key, value in strings.items()]


def add_dutch(admin, mode):
    response = admin.post(f"{ADMIN}/locales", json={"locale": "nl", "import_mode": mode})
    assert response.status_code == 201
    return language(response.json())


def language(detail, locale="nl"):
    return next(entry for entry in detail["locales"] if entry["locale"] == locale)


def dutch_state(admin):
    return language(admin.get(ADMIN).json())["existing_translations"]


def exported(client, locale="nl"):
    return client.get(f"{MACHINE}/keys/export?locale={locale}", headers=AUTH).json()


def strings(admin, locale="nl"):
    items = admin.get(f"/api/review/projects/fitjournal/locales/{locale}/strings").json()["items"]
    return {item["key"]: item for item in items}


# ---------- Setting up the language ----------


def test_keep_answers_open_the_import_at_once(project, admin):
    state = add_dutch(admin, "review")["existing_translations"]
    assert state["mode"] == "review"
    assert state["importing"] is True
    assert state["started_at"] is not None
    assert (state["finished_at"], state["imported"], state["files"]) == (None, 0, [])


def test_a_language_without_an_answer_works_as_before(project, admin):
    assert add_dutch(admin, None)["existing_translations"] is None
    push_dutch(project)
    assert {item["origin"] for item in strings(admin).values()} == {"deepl"}
    assert exported(project) == {}


def test_translate_again_imports_nothing_and_estimates_the_cost(project, admin):
    state = add_dutch(admin, "retranslate")["existing_translations"]
    assert state["importing"] is False
    assert state["estimated_characters"] == len("Home") + len("Saved") + len("Sign in")
    push_dutch(project)
    assert {item["origin"] for item in strings(admin).values()} == {"deepl"}


def test_the_answer_can_change_until_strings_arrive(project, admin):
    add_dutch(admin, "retranslate")
    response = admin.patch(f"{ADMIN}/locales/nl", json={"import_mode": "reviewed"})
    assert response.status_code == 200
    assert language(response.json())["existing_translations"]["importing"] is True

    push_dutch(project)
    response = admin.patch(f"{ADMIN}/locales/nl", json={"import_mode": None})
    assert response.status_code == 409
    assert dutch_state(admin)["mode"] == "reviewed"


# ---------- The push of an import ----------


def test_keep_for_review_stores_the_repository_text_to_review_and_exports_it(project, admin):
    add_dutch(admin, "review")
    push_dutch(project)
    home = strings(admin)["nav.home"]
    assert (home["value"], home["origin"], home["status"]) == ("Startpagina", "repository", "machine_translated")
    assert home["imported_at"] is not None
    # Delivered at once: the first pull writes the same text and records every key in the lockfile.
    assert exported(project) == DUTCH


def test_keep_as_reviewed_stores_it_delivered(project, admin):
    add_dutch(admin, "reviewed")
    push_dutch(project)
    assert {item["status"] for item in strings(admin).values()} == {"delivered"}
    assert {item["origin"] for item in strings(admin).values()} == {"repository"}
    assert exported(project) == DUTCH


def test_pushing_the_same_import_twice_changes_nothing(project, admin):
    add_dutch(admin, "review")
    assert all(result["changed"] for result in push_dutch(project))
    assert not any(result["changed"] for result in push_dutch(project))


def test_a_file_changed_during_the_import_is_imported_again(project, admin):
    add_dutch(admin, "review")
    push_dutch(project)
    push(project, "nav.home", "nl", "Home")
    assert strings(admin)["nav.home"]["value"] == "Home"
    assert exported(project)["nav.home"] == "Home"


def test_other_languages_are_not_imported(project, admin):
    add_dutch(admin, "review")
    push(project, "nav.saved", "fr", "Enregistrés")
    assert {item["origin"] for item in strings(admin, "fr").values()} == {"deepl"}


def test_the_admin_sees_how_many_strings_arrived_per_file(project, admin):
    add_dutch(admin, "review")
    push_dutch(project)
    push(project, "only.pushed", "nl", "Alleen gepusht")  # a key the source upload never sent
    state = dutch_state(admin)
    assert state["imported"] == 4
    assert state["files"] == [{"file": None, "strings": 1, "keys": 1}, {"file": FILE, "strings": 3, "keys": 3}]


# ---------- Finish import ----------


def test_finish_needs_strings_and_an_open_import(project, admin):
    assert admin.post(f"{ADMIN}/locales/fr/import/finish").status_code == 409  # no import
    add_dutch(admin, "review")
    response = admin.post(f"{ADMIN}/locales/nl/import/finish")
    assert response.status_code == 409
    assert "deepl sync push --locale nl" in response.json()["detail"]


def test_after_finish_pushes_are_deepl_again(project, admin):
    add_dutch(admin, "review")
    push_dutch(project)
    response = admin.post(f"{ADMIN}/locales/nl/import/finish")
    assert response.status_code == 200
    state = language(response.json())["existing_translations"]
    assert (state["importing"], state["imported"]) == (False, 3)
    assert state["finished_at"] is not None

    # The repository text again, as every later push sends it: nothing changes.
    assert not push(project, "nav.home", "nl", "Startpagina")["changed"]
    # A key the files lacked: DeepL translates it.
    push(project, "nav.new", "nl", "Nieuw")
    assert strings(admin)["nav.new"]["origin"] == "deepl"
    # The English changed, so DeepL translated the string again: the text is DeepL's now.
    push(project, "nav.saved", "nl", "Bewaard")
    saved = strings(admin)["nav.saved"]
    assert (saved["origin"], saved["imported_at"], saved["status"]) == ("deepl", None, "machine_translated")
    assert "nav.saved" not in exported(project)


def test_finishing_twice_is_refused(project, admin):
    add_dutch(admin, "reviewed")
    push_dutch(project)
    assert admin.post(f"{ADMIN}/locales/nl/import/finish").status_code == 200
    assert admin.post(f"{ADMIN}/locales/nl/import/finish").status_code == 409


# ---------- reset-language and remove-language ----------


def test_reset_puts_imported_strings_back_to_the_repository_text(project, admin, db_session_factory, capsys):
    add_dutch(admin, "reviewed")
    push_dutch(project)
    admin.patch(
        "/api/review/projects/fitjournal/locales/nl/strings/nav.home", json={"value": "Thuis", "approved": False}
    )
    result = cli.reset_language(
        "fitjournal", "nl", dry_run=False, confirm=lambda _: "nl", session_factory=db_session_factory
    )
    assert "3 imported from the repository" in capsys.readouterr().out
    assert result == (
        "Done: 3 strings of nl are back to the text they arrived with (3 imported from the repository), to review."
    )
    home = strings(admin)["nav.home"]
    assert (home["value"], home["status"], home["origin"]) == ("Startpagina", "machine_translated", "repository")


def remove(db_session_factory, *, answer="nl", dry_run=False, locale="nl"):
    return cli.remove_language(
        "fitjournal", locale, dry_run=dry_run, confirm=lambda _: answer, session_factory=db_session_factory
    )


def test_remove_language_shows_the_plan_and_asks(project, admin, db_session_factory, capsys):
    add_dutch(admin, "reviewed")
    push_dutch(project)
    assert remove(db_session_factory, dry_run=True) == "Dry run: nothing changed."
    shown = capsys.readouterr().out
    assert "language nl: 3 strings (3 delivered, 0 approved, 3 imported from the repository)" in shown
    assert remove(db_session_factory, answer="yes") == "Nothing changed."
    assert len(strings(admin)) == 3


def test_remove_language_removes_everything_of_that_language_only(project, admin, db_session_factory, make_user):
    add_dutch(admin, "review")
    push_dutch(project)
    with db_session_factory() as db:
        project_id = db.scalar(select(ProjectLocale.project_id).where(ProjectLocale.locale == "nl"))
        reviewer = make_user("dutch@example.com")
        db.add(ReviewerAssignment(user_id=reviewer, project_id=project_id, locale="nl"))
        db.add(Delivery(project_id=project_id, locale="nl", strings=1, not_approved=0))
        db.commit()

    assert remove(db_session_factory) == "Done: nl is removed from fitjournal."
    with db_session_factory() as db:
        assert db.scalars(select(Translation.locale)).all() == ["fr"]
        assert db.scalar(select(ProjectLocale).where(ProjectLocale.locale == "nl")) is None
        assert db.scalars(select(ReviewerAssignment)).all() == []
        assert db.scalars(select(Delivery)).all() == []
        assert len(db.scalars(select(TranslationKey)).all()) == 3  # the keys stay
    # The language can be added again, with another answer.
    assert add_dutch(admin, "retranslate")["existing_translations"]["mode"] == "retranslate"


def test_remove_language_for_an_unknown_language(project, db_session_factory):
    assert remove(db_session_factory, locale="it") == "Project fitjournal has no language it. Nothing changed."


def test_the_admin_sees_when_a_file_is_missing_strings(project, admin):
    add_dutch(admin, "review")
    push_dutch(project, {"nav.home": "Startpagina", "nav.saved": "Opgeslagen"})  # the file lacks auth.signIn
    assert dutch_state(admin)["files"] == [{"file": FILE, "strings": 2, "keys": 3}]
