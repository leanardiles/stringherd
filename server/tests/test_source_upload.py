"""Tests for the source upload extension endpoint."""

from sqlalchemy import select

from app.models import Project, Translation, TranslationKey, TranslationStatus
from tests.conftest import AUTH

BASE = "/api/projects/demo-app"
FILE = "web/src/i18n/locales/en/common.json"


def upload(client, strings, file=FILE, locale="en", commit="abc1234", headers=AUTH):
    body = {"locale": locale, "strings": strings}
    if file is not None:
        body["file"] = file
    if commit is not None:
        body["commit"] = commit
    return client.put(f"{BASE}/source", json=body, headers=headers)


def push(client, key, locale, value):
    return client.put(f"{BASE}/keys/{key}", json={"locale": locale, "value": value}, headers=AUTH)


def approve_all(session_factory):
    with session_factory() as session:
        for translation in session.scalars(select(Translation)):
            translation.status = TranslationStatus.APPROVED
        session.commit()


def get_key(session_factory, key_path):
    with session_factory() as session:
        return session.scalar(select(TranslationKey).where(TranslationKey.key_path == key_path))


# ---------- Basics ----------

def test_requires_auth(client):
    assert upload(client, {"a": "A"}, headers={}).status_code == 401


def test_first_upload_creates_keys_with_file_and_commit(client, db_session_factory):
    response = upload(client, {"home.title": "Home", "home.subtitle": "Welcome"})

    assert response.status_code == 200
    body = response.json()
    assert body["created"] == 2 and body["unchanged"] == 0 and body["removed"] == []
    key = get_key(db_session_factory, "home.title")
    assert key.source_text == "Home"
    assert key.source_file == FILE
    assert key.source_commit == "abc1234"


def test_first_upload_sets_project_source_locale(client, db_session_factory):
    upload(client, {"home.title": "Home"})
    with db_session_factory() as session:
        assert session.scalar(select(Project.source_locale)) == "en"


def test_reupload_unchanged_is_a_no_op(client):
    upload(client, {"home.title": "Home", "home.subtitle": "Welcome"})
    body = upload(client, {"home.title": "Home", "home.subtitle": "Welcome"}).json()
    assert body["created"] == 0 and body["updated"] == 0 and body["unchanged"] == 2


# ---------- Working together with the DeepL Sync push ----------

def test_upload_after_translation_push_fills_source(client, db_session_factory):
    push(client, "home.title", "fr", "Accueil")

    body = upload(client, {"home.title": "Home"}).json()

    assert body["filled"] == 1 and body["created"] == 0
    key = get_key(db_session_factory, "home.title")
    assert key.source_text == "Home"
    assert key.source_file == FILE


def test_filling_source_does_not_reset_approvals(client, db_session_factory):
    push(client, "home.title", "fr", "Accueil")
    approve_all(db_session_factory)

    body = upload(client, {"home.title": "Home"}).json()

    assert body["approvals_reset"] == 0
    assert client.get(f"{BASE}/keys/export", params={"locale": "fr"}, headers=AUTH).json() == {"home.title": "Accueil"}


def test_changed_source_sends_approved_translations_back_to_review(client, db_session_factory):
    upload(client, {"home.title": "Home", "home.subtitle": "Welcome"})
    push(client, "home.title", "fr", "Accueil")
    push(client, "home.subtitle", "fr", "Bienvenue")
    approve_all(db_session_factory)

    body = upload(client, {"home.title": "Start page", "home.subtitle": "Welcome"}, commit="def5678").json()

    assert body["updated"] == 1 and body["unchanged"] == 1 and body["approvals_reset"] == 1
    assert get_key(db_session_factory, "home.title").source_commit == "def5678"
    # The changed key is no longer exported; the untouched one still is.
    export = client.get(f"{BASE}/keys/export", params={"locale": "fr"}, headers=AUTH).json()
    assert export == {"home.subtitle": "Bienvenue"}


# ---------- Removed keys ----------

def test_keys_missing_from_upload_are_reported_not_deleted(client, db_session_factory):
    upload(client, {"home.title": "Home", "home.old": "Old"})

    body = upload(client, {"home.title": "Home"}).json()

    assert body["removed"] == ["home.old"]
    assert get_key(db_session_factory, "home.old") is not None


def test_removed_only_checks_keys_of_the_same_file(client):
    upload(client, {"errors.a": "A"}, file="locales/en/errors.json")

    body = upload(client, {"home.title": "Home"}).json()

    assert body["removed"] == []


# ---------- Files ----------

def test_same_key_from_different_file_is_rejected_atomically(client, db_session_factory):
    upload(client, {"common.notFound": "Not found"}, file="locales/en/errors.json")

    response = upload(client, {"common.notFound": "Missing", "home.title": "Home"}, file=FILE)

    assert response.status_code == 409
    assert response.json()["detail"]["conflicts"] == {"common.notFound": "locales/en/errors.json"}
    # Nothing from the rejected upload was written.
    assert get_key(db_session_factory, "home.title") is None
    assert get_key(db_session_factory, "common.notFound").source_text == "Not found"


def test_windows_paths_are_normalized(client, db_session_factory):
    upload(client, {"home.title": "Home"}, file=".\\web\\src\\i18n\\locales\\en\\common.json")
    assert get_key(db_session_factory, "home.title").source_file == FILE


def test_dot_directories_are_kept(client, db_session_factory):
    upload(client, {"home.title": "Home"}, file="./.config/locales/en.json")
    assert get_key(db_session_factory, "home.title").source_file == ".config/locales/en.json"


def test_upload_without_file_works(client, db_session_factory):
    body = upload(client, {"home.title": "Home"}, file=None).json()
    assert body["created"] == 1 and body["removed"] == []
    assert get_key(db_session_factory, "home.title").source_file is None


# ---------- Validation ----------

def test_locale_mismatch_is_rejected(client):
    upload(client, {"home.title": "Home"})
    response = upload(client, {"home.title": "Accueil"}, locale="fr")
    assert response.status_code == 409


def test_empty_upload_is_rejected(client):
    assert upload(client, {}).status_code == 422


def test_key_with_slash_is_rejected(client):
    assert upload(client, {"a/b": "x"}).status_code == 422


def test_oversized_source_text_is_rejected(client):
    assert upload(client, {"a": "x" * (64 * 1024 + 1)}).status_code == 422
