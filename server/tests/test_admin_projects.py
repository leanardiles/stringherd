"""Project administration: projects, languages, setup, and what reviewers see as a result."""

import pytest

from tests.conftest import AUTH, login

ADMIN = "/api/admin/projects"


@pytest.fixture
def admin(new_client, make_user):
    make_user("admin@example.com", role="admin")
    client = new_client()
    login(client, "admin@example.com")
    return client


def create(admin, project_id="shop", name="Shop", source="en", targets=("fr", "es")):
    return admin.post(
        ADMIN, json={"project_id": project_id, "name": name, "source_locale": source, "target_locales": list(targets)}
    )


# ---------- Projects ----------

def test_admin_creates_a_project(admin):
    response = create(admin)
    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == "shop"
    assert body["name"] == "Shop"
    assert body["source_locale"] == "en"
    assert body["target_locales"] == ["es", "fr"]
    assert body["strings"] == 0
    assert body["api_keys"] == []
    assert [entry["locale"] for entry in body["locales"]] == ["es", "fr"]


def test_project_ids_are_unique(admin):
    create(admin)
    response = create(admin, name="Another shop")
    assert response.status_code == 409


def test_source_cannot_also_be_a_target(admin):
    assert create(admin, targets=("en", "fr")).status_code == 422


def test_invalid_project_id_and_locale_are_rejected(admin):
    assert create(admin, project_id="has space").status_code == 422
    assert create(admin, targets=("fr!",)).status_code == 422


def test_reviewers_cannot_manage_projects(new_client, make_user):
    make_user("rev@example.com")
    reviewer = new_client()
    login(reviewer, "rev@example.com")
    assert reviewer.get(ADMIN).status_code == 403
    assert create(reviewer).status_code == 403


def test_list_shows_progress_and_reviewers(admin, client, make_user):
    create(admin)
    rev_id = make_user("marie@example.com", name="Marie")
    admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "shop", "locale": "fr"})
    admin.post(f"{ADMIN}/shop/keys", json={"label": "CI"})
    client.put("/api/projects/shop/keys/home.title", json={"locale": "fr", "value": "Accueil"}, headers=AUTH)

    shop = next(p for p in admin.get(ADMIN).json() if p["project_id"] == "shop")
    assert shop["strings"] == 1
    assert shop["active_keys"] == 1
    fr = next(entry for entry in shop["locales"] if entry["locale"] == "fr")
    assert fr == {
        "locale": "fr",
        "total": 1,
        "approved": 0,
        "delivered": 0,
        "last_delivered_at": None,
        "reviewers": [{"id": rev_id, "name": "Marie"}],
    }


def test_rename_keeps_the_project_id(admin):
    create(admin)
    response = admin.patch(f"{ADMIN}/shop", json={"name": "Shop web"})
    assert response.status_code == 200
    assert response.json()["name"] == "Shop web"
    assert response.json()["project_id"] == "shop"


def test_source_locale_changes_only_before_source_upload(admin, client):
    create(admin)
    assert admin.patch(f"{ADMIN}/shop", json={"source_locale": "de"}).json()["source_locale"] == "de"

    client.put("/api/projects/shop/source", json={"locale": "de", "strings": {"a": "Hallo"}}, headers=AUTH)
    response = admin.patch(f"{ADMIN}/shop", json={"source_locale": "en"})
    assert response.status_code == 409


def test_unknown_project_is_404(admin):
    assert admin.get(f"{ADMIN}/nope").status_code == 404
    assert admin.get(f"{ADMIN}/nope/setup").status_code == 404


# ---------- Languages ----------

def test_add_and_remove_a_language(admin):
    create(admin)
    response = admin.post(f"{ADMIN}/shop/locales", json={"locale": "de"})
    assert response.status_code == 201
    assert response.json()["target_locales"] == ["de", "es", "fr"]

    assert admin.post(f"{ADMIN}/shop/locales", json={"locale": "de"}).status_code == 409
    assert admin.post(f"{ADMIN}/shop/locales", json={"locale": "en"}).status_code == 422

    response = admin.delete(f"{ADMIN}/shop/locales/de")
    assert response.status_code == 200
    assert response.json()["target_locales"] == ["es", "fr"]
    assert admin.delete(f"{ADMIN}/shop/locales/de").status_code == 404


def test_language_with_translations_cannot_be_removed(admin, client):
    create(admin)
    client.put("/api/projects/shop/keys/home.title", json={"locale": "fr", "value": "Accueil"}, headers=AUTH)
    response = admin.delete(f"{ADMIN}/shop/locales/fr")
    assert response.status_code == 409
    assert "1 translation" in response.json()["detail"]


def test_removing_a_language_removes_its_assignments(admin, make_user):
    create(admin)
    rev_id = make_user("rev@example.com")
    admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "shop", "locale": "es"})
    admin.delete(f"{ADMIN}/shop/locales/es")
    user = next(u for u in admin.get("/api/admin/users").json() if u["id"] == rev_id)
    assert user["assignments"] == []


def test_push_adds_a_new_language_to_the_project(admin, client):
    create(admin, targets=("fr",))
    client.put("/api/projects/shop/keys/home.title", json={"locale": "it", "value": "Home"}, headers=AUTH)
    assert admin.get(f"{ADMIN}/shop").json()["target_locales"] == ["fr", "it"]


def test_assignment_needs_a_target_language(admin, make_user):
    create(admin, targets=("fr",))
    rev_id = make_user("rev@example.com")
    response = admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "shop", "locale": "de"})
    assert response.status_code == 422
    response = admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "shop", "locale": "fr"})
    assert response.status_code == 201


def test_reviewer_sees_assigned_language_before_the_first_push(admin, new_client, make_user):
    create(admin, targets=("fr",))
    rev_id = make_user("rev@example.com")
    admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "shop", "locale": "fr"})
    reviewer = new_client()
    login(reviewer, "rev@example.com")
    projects = reviewer.get("/api/review/projects").json()
    assert [(p["project_id"], p["name"]) for p in projects] == [("shop", "Shop")]
    assert projects[0]["locales"][0]["locale"] == "fr"
    assert projects[0]["locales"][0]["total"] == 0


# ---------- Setup ----------

def test_setup_snippet_uses_the_request_address(admin):
    create(admin)
    setup = admin.get(f"{ADMIN}/shop/setup").json()
    assert setup["server_url"] == "http://testserver"
    assert "project_id: shop" in setup["deepl_sync_yaml"]
    assert "server: http://testserver" in setup["deepl_sync_yaml"]
    assert "deepl config set tms.allowedServers testserver" in setup["commands"]
    assert "shp_" in setup["commands"]  # a placeholder, never a real key


def test_setup_snippet_prefers_public_url(admin, monkeypatch):
    from app.config import get_settings

    create(admin)
    monkeypatch.setattr(get_settings(), "public_url", "https://strings.example.com/")
    setup = admin.get(f"{ADMIN}/shop/setup").json()
    assert setup["server_url"] == "https://strings.example.com"
    assert "tms.allowedServers strings.example.com" in setup["commands"]
