"""Per-project API keys: issuing, using, scoping and revoking them."""

import pytest
from sqlalchemy import select

from app.models import ProjectApiKey
from tests.conftest import AUTH, login

ADMIN = "/api/admin/projects"


@pytest.fixture
def admin(new_client, make_user):
    make_user("admin@example.com", role="admin")
    client = new_client()
    login(client, "admin@example.com")
    return client


def issue(admin, project="fitjournal", label="CI"):
    response = admin.post(f"{ADMIN}/{project}/keys", json={"label": label})
    assert response.status_code == 201
    return response.json()


def push(client, key, project="fitjournal", scheme="ApiKey"):
    return client.put(
        f"/api/projects/{project}/keys/home.title",
        json={"locale": "fr", "value": "Accueil"},
        headers={"Authorization": f"{scheme} {key}"},
    )


def test_key_is_shown_once_and_stored_hashed(admin, db_session_factory):
    issued = issue(admin)
    assert issued["key"].startswith("shp_")
    assert issued["key"].startswith(issued["prefix"])
    assert len(issued["key"]) > 40
    assert issued["created_by"] == "Admin"

    listed = admin.get(f"{ADMIN}/fitjournal/keys").json()
    assert "key" not in listed[0]
    with db_session_factory() as session:
        stored = session.scalar(select(ProjectApiKey))
        assert issued["key"] not in (stored.key_hash, stored.prefix)


def test_project_key_opens_its_project(admin, client):
    key = issue(admin)["key"]
    assert push(client, key).status_code == 200
    assert push(client, key, scheme="Bearer").status_code == 200
    assert client.get("/api/projects/fitjournal", headers={"Authorization": f"ApiKey {key}"}).status_code == 200
    export = client.get(
        "/api/projects/fitjournal/keys/export?format=json&locale=fr", headers={"Authorization": f"ApiKey {key}"}
    )
    assert export.status_code == 200


def test_project_key_opens_the_source_upload(admin, client):
    key = issue(admin)["key"]
    response = client.put(
        "/api/projects/fitjournal/source",
        json={"locale": "en", "strings": {"home.title": "Home"}},
        headers={"Authorization": f"ApiKey {key}"},
    )
    assert response.status_code == 200


def test_key_for_another_project_is_403(admin, client):
    key = issue(admin, project="demo-app")["key"]
    response = push(client, key, project="fitjournal")
    assert response.status_code == 403
    assert "demo-app" in response.json()["detail"]


def test_unknown_key_is_401(client):
    assert push(client, "shp_not-a-real-key").status_code == 401


def test_revoked_key_stops_working(admin, client):
    issued = issue(admin)
    assert push(client, issued["key"]).status_code == 200
    response = admin.delete(f"{ADMIN}/fitjournal/keys/{issued['id']}")
    assert response.status_code == 200
    assert response.json()["revoked_at"] is not None
    assert push(client, issued["key"]).status_code == 401
    assert admin.get(f"{ADMIN}/fitjournal").json()["active_keys"] == 0


def test_revoking_through_another_project_is_404(admin):
    issued = issue(admin, project="demo-app")
    assert admin.delete(f"{ADMIN}/fitjournal/keys/{issued['id']}").status_code == 404


def test_last_used_is_recorded(admin, client):
    issued = issue(admin)
    assert issued["last_used_at"] is None
    push(client, issued["key"])
    assert admin.get(f"{ADMIN}/fitjournal/keys").json()[0]["last_used_at"] is not None


def test_push_to_unknown_project_is_404_with_a_hint(client):
    response = push(client, "test-key", project="nope")
    assert response.status_code == 404
    assert "Create it in Stringherd" in response.json()["detail"]


def test_server_key_opens_every_existing_project(client):
    assert client.put(
        "/api/projects/demo-app/keys/a", json={"locale": "fr", "value": "x"}, headers=AUTH
    ).status_code == 200
    assert client.put(
        "/api/projects/fitjournal/keys/a", json={"locale": "fr", "value": "x"}, headers=AUTH
    ).status_code == 200


def test_without_a_server_key_only_project_keys_work(admin, client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "tms_api_key", None)
    assert push(client, "test-key").status_code == 401
    assert push(client, issue(admin)["key"]).status_code == 200


def test_project_key_does_not_open_the_review_api(admin, client):
    key = issue(admin)["key"]
    response = client.get("/api/review/projects", headers={"Authorization": f"ApiKey {key}"})
    assert response.status_code == 401
