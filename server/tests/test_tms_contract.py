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