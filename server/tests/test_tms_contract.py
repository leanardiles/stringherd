"""Tests for the TMS contract called by `deepl sync push` / `deepl sync pull`."""

from sqlalchemy import select

from app.models import Translation, TranslationStatus
from tests.conftest import AUTH

BASE = "/api/projects/demo-app"


def push(client, key, locale, value, headers=AUTH):
    return client.put(f"{BASE}/keys/{key}", json={"locale": locale, "value": value}, headers=headers)


def approve(session_factory, key_locale_pairs):
    """Stand-in for the review UI (step 5): mark translations as approved."""
    with session_factory() as session:
        for translation in session.scalars(select(Translation)):
            if (translation.key.key_path, translation.locale) in key_locale_pairs:
                translation.status = TranslationStatus.APPROVED
        session.commit()


# ---------- Auth ----------

def test_missing_auth_header_is_rejected(client):
    response = push(client, "home.title", "de", "Start", headers={})
    assert response.status_code == 401
    assert "Authorization" in response.json()["detail"]


def test_wrong_key_is_rejected(client):
    response = push(client, "home.title", "de", "Start", headers={"Authorization": "ApiKey nope"})
    assert response.status_code == 401


def test_bearer_scheme_is_accepted(client):
    response = push(client, "home.title", "de", "Start", headers={"Authorization": "Bearer test-key"})
    assert response.status_code == 200


def test_unsupported_scheme_is_rejected(client):
    response = push(client, "home.title", "de", "Start", headers={"Authorization": "Basic test-key"})
    assert response.status_code == 401


# ---------- Push ----------

def test_first_push_creates_project_key_and_translation(client):
    response = push(client, "settings.actions.save", "de", "Speichern")
    assert response.status_code == 200
    assert response.json() == {
        "key": "settings.actions.save",
        "locale": "de",
        "status": "machine_translated",
        "changed": True,
    }


def test_url_encoded_key_is_decoded(client):
    # deepl sync encodes keys with encodeURIComponent.
    response = client.put(f"{BASE}/keys/greeting%20text", json={"locale": "de", "value": "Hallo"}, headers=AUTH)
    assert response.status_code == 200
    assert response.json()["key"] == "greeting text"


def test_repushing_same_value_keeps_approval(client, db_session_factory):
    push(client, "home.title", "de", "Start")
    approve(db_session_factory, {("home.title", "de")})

    response = push(client, "home.title", "de", "Start")

    assert response.json()["changed"] is False
    assert response.json()["status"] == "approved"


def test_pushing_changed_value_resets_to_machine_translated(client, db_session_factory):
    push(client, "home.title", "de", "Start")
    approve(db_session_factory, {("home.title", "de")})

    response = push(client, "home.title", "de", "Startseite")

    assert response.json()["changed"] is True
    assert response.json()["status"] == "machine_translated"


def test_key_with_slash_is_rejected(client):
    response = client.put(f"{BASE}/keys/a%2Fb", json={"locale": "de", "value": "x"}, headers=AUTH)
    assert response.status_code == 422


def test_invalid_locale_is_rejected(client):
    response = push(client, "home.title", "not a locale", "Start")
    assert response.status_code == 422


def test_oversized_value_is_rejected(client):
    response = push(client, "home.title", "de", "x" * (64 * 1024 + 1))
    assert response.status_code == 422


# ---------- Export (pull) ----------

def test_export_returns_only_approved_translations(client, db_session_factory):
    push(client, "home.title", "de", "Start")
    push(client, "home.subtitle", "de", "Willkommen")
    push(client, "home.title", "fr", "Accueil")
    approve(db_session_factory, {("home.title", "de"), ("home.title", "fr")})

    response = client.get(f"{BASE}/keys/export", params={"format": "json", "locale": "de"}, headers=AUTH)

    assert response.status_code == 200
    assert response.json() == {"home.title": "Start"}


def test_export_unknown_project_is_404(client):
    response = client.get("/api/projects/nope/keys/export", params={"locale": "de"}, headers=AUTH)
    assert response.status_code == 404


def test_export_rejects_non_json_format(client):
    push(client, "home.title", "de", "Start")
    response = client.get(f"{BASE}/keys/export", params={"format": "xml", "locale": "de"}, headers=AUTH)
    assert response.status_code == 400


def test_export_requires_auth(client):
    response = client.get(f"{BASE}/keys/export", params={"locale": "de"})
    assert response.status_code == 401


# ---------- Project status ----------

def test_project_status_counts_per_locale(client, db_session_factory):
    push(client, "home.title", "de", "Start")
    push(client, "home.subtitle", "de", "Willkommen")
    push(client, "home.title", "fr", "Accueil")
    approve(db_session_factory, {("home.title", "de")})

    response = client.get(BASE, headers=AUTH)

    assert response.status_code == 200
    assert response.json() == {
        "project_id": "demo-app",
        "keys": 2,
        "locales": {
            "de": {"machine_translated": 1, "approved": 1},
            "fr": {"machine_translated": 1, "approved": 0},
        },
    }


def test_project_status_unknown_project_is_404(client):
    assert client.get("/api/projects/nope", headers=AUTH).status_code == 404

# ---------- Reviewer edits vs. re-pushes ----------

def review_edit(session_factory, key_path, locale, new_value):
    """Stand-in for the review screen: a reviewer edits and approves a translation."""
    with session_factory() as session:
        for translation in session.scalars(select(Translation)):
            if translation.key.key_path == key_path and translation.locale == locale:
                translation.value = new_value
                translation.status = TranslationStatus.APPROVED
        session.commit()


def test_first_push_records_pushed_value(client, db_session_factory):
    push(client, "dashboard.sets_other", "fr", "{{count}} définit")
    with db_session_factory() as session:
        translation = session.scalar(select(Translation))
        assert translation.pushed_value == "{{count}} définit"


def test_reviewer_edit_survives_repush_of_old_machine_translation(client, db_session_factory):
    push(client, "dashboard.sets_other", "fr", "{{count}} définit")
    review_edit(db_session_factory, "dashboard.sets_other", "fr", "{{count}} séries")

    # The repo file still holds DeepL's original text until the next pull, so a push re-sends it.
    response = push(client, "dashboard.sets_other", "fr", "{{count}} définit")

    assert response.json()["changed"] is False
    assert response.json()["status"] == "approved"
    export = client.get(f"{BASE}/keys/export", params={"locale": "fr"}, headers=AUTH).json()
    assert export == {"dashboard.sets_other": "{{count}} séries"}


def test_new_machine_translation_after_edit_reopens(client, db_session_factory):
    push(client, "home.title", "fr", "Accueil")
    review_edit(db_session_factory, "home.title", "fr", "Page d'accueil")

    # DeepL delivers something new (the source changed): the reviewer's edit is stale.
    response = push(client, "home.title", "fr", "Démarrer")

    assert response.json()["changed"] is True
    assert response.json()["status"] == "machine_translated"
    with db_session_factory() as session:
        translation = session.scalar(select(Translation))
        assert translation.value == "Démarrer"
        assert translation.pushed_value == "Démarrer"


def test_row_without_pushed_value_falls_back_to_value(client, db_session_factory):
    push(client, "home.title", "fr", "Accueil")
    with db_session_factory() as session:
        translation = session.scalar(select(Translation))
        translation.pushed_value = None  # as for rows created before pushed_value existed
        translation.status = TranslationStatus.APPROVED
        session.commit()

    response = push(client, "home.title", "fr", "Accueil")

    assert response.json()["changed"] is False
    assert response.json()["status"] == "approved"
    with db_session_factory() as session:
        assert session.scalar(select(Translation)).pushed_value == "Accueil"


def test_reviewed_value_coming_back_after_pull_keeps_approval(client, db_session_factory):
    push(client, "dashboard.sets_other", "fr", "{{count}} définit")
    review_edit(db_session_factory, "dashboard.sets_other", "fr", "{{count}} séries")

    # After `deepl sync pull` the file holds the reviewer's text, so the next push sends it.
    response = push(client, "dashboard.sets_other", "fr", "{{count}} séries")

    assert response.json()["changed"] is False
    assert response.json()["status"] == "approved"
    # And re-sending it again stays stable.
    assert push(client, "dashboard.sets_other", "fr", "{{count}} séries").json()["status"] == "approved"


def test_stale_repush_after_pull_keeps_approval(client, db_session_factory):
    push(client, "dashboard.sets_other", "fr", "{{count}} définit")
    review_edit(db_session_factory, "dashboard.sets_other", "fr", "{{count}} séries")
    push(client, "dashboard.sets_other", "fr", "{{count}} séries")  # after pull

    # Someone pushes from an older checkout whose file still has DeepL's original text.
    response = push(client, "dashboard.sets_other", "fr", "{{count}} définit")

    assert response.json()["changed"] is False
    assert response.json()["status"] == "approved"
