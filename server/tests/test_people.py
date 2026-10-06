"""Sign-in, sessions, user administration and the permissions module."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import Project, ReviewerAssignment, User, UserSession
from app.permissions import can_review, reviewable_locales
from app.security import SESSION_COOKIE
from tests.conftest import AUTH, PASSWORD, login


# ---------- Sign-in ----------

def test_login_sets_httponly_session_cookie(client, make_user):
    make_user("ana@example.com", role="admin")

    response = login(client, "ana@example.com")

    assert response.status_code == 200
    assert response.json()["role"] == "admin"
    cookie = response.headers["set-cookie"]
    assert SESSION_COOKIE in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie


def test_email_is_case_insensitive(client, make_user):
    make_user("ana@example.com")
    assert login(client, "Ana@Example.COM").status_code == 200


def test_wrong_password_and_unknown_email_get_the_same_answer(client, make_user):
    make_user("ana@example.com")
    wrong = login(client, "ana@example.com", "not the password")
    unknown = login(client, "nobody@example.com")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_deactivated_user_cannot_sign_in(client, make_user):
    make_user("ana@example.com", active=False)
    assert login(client, "ana@example.com").status_code == 401


def test_me_requires_sign_in(client):
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_user_after_sign_in(client, make_user):
    make_user("ana@example.com", name="Ana")
    login(client, "ana@example.com")
    assert client.get("/api/auth/me").json()["name"] == "Ana"


def test_logout_ends_the_session(client, make_user):
    make_user("ana@example.com")
    login(client, "ana@example.com")
    token = client.cookies.get(SESSION_COOKIE)

    client.post("/api/auth/logout")

    client.cookies.set(SESSION_COOKIE, token)  # even replaying the old cookie must fail
    assert client.get("/api/auth/me").status_code == 401


def test_expired_session_is_rejected(client, make_user, db_session_factory):
    make_user("ana@example.com")
    login(client, "ana@example.com")
    with db_session_factory() as session:
        for s in session.scalars(select(UserSession)):
            s.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_session_token_is_stored_hashed(client, make_user, db_session_factory):
    make_user("ana@example.com")
    login(client, "ana@example.com")
    token = client.cookies.get(SESSION_COOKIE)
    with db_session_factory() as session:
        stored = session.scalar(select(UserSession.token_hash))
    assert stored != token and len(stored) == 64


def test_password_is_stored_hashed(make_user, db_session_factory):
    make_user("ana@example.com")
    with db_session_factory() as session:
        stored = session.scalar(select(User.password_hash))
    assert PASSWORD not in stored and stored.startswith("$argon2")


def test_tms_key_does_not_grant_review_access(client):
    assert client.get("/api/review/projects", headers=AUTH).status_code == 401


# ---------- Administration ----------

def test_admin_creates_reviewer_who_can_sign_in(new_client, make_user):
    make_user("admin@example.com", role="admin")
    admin = new_client()
    login(admin, "admin@example.com")

    created = admin.post(
        "/api/admin/users",
        json={"email": "Rev@Example.com", "name": "Rev", "role": "reviewer", "password": "temporary-pass-123"},
    )

    assert created.status_code == 201 and created.json()["email"] == "rev@example.com"
    reviewer = new_client()
    assert login(reviewer, "rev@example.com", "temporary-pass-123").status_code == 200


def test_duplicate_email_is_rejected(new_client, make_user):
    make_user("admin@example.com", role="admin")
    admin = new_client()
    login(admin, "admin@example.com")
    body = {"email": "rev@example.com", "name": "Rev", "password": "temporary-pass-123"}
    admin.post("/api/admin/users", json=body)
    assert admin.post("/api/admin/users", json=body).status_code == 409


def test_short_password_is_rejected(new_client, make_user):
    make_user("admin@example.com", role="admin")
    admin = new_client()
    login(admin, "admin@example.com")
    response = admin.post("/api/admin/users", json={"email": "r@example.com", "name": "R", "password": "short"})
    assert response.status_code == 422


def test_reviewer_cannot_use_admin_endpoints(new_client, make_user):
    make_user("rev@example.com")
    reviewer = new_client()
    login(reviewer, "rev@example.com")
    assert reviewer.get("/api/admin/users").status_code == 403


def test_admin_cannot_demote_or_deactivate_themselves(new_client, make_user):
    admin_id = make_user("admin@example.com", role="admin")
    admin = new_client()
    login(admin, "admin@example.com")
    assert admin.patch(f"/api/admin/users/{admin_id}", json={"role": "reviewer"}).status_code == 409
    assert admin.patch(f"/api/admin/users/{admin_id}", json={"is_active": False}).status_code == 409


def test_deactivating_a_user_signs_them_out(new_client, make_user):
    make_user("admin@example.com", role="admin")
    rev_id = make_user("rev@example.com")
    admin, reviewer = new_client(), new_client()
    login(admin, "admin@example.com")
    login(reviewer, "rev@example.com")

    admin.patch(f"/api/admin/users/{rev_id}", json={"is_active": False})

    assert reviewer.get("/api/auth/me").status_code == 401


def test_password_change_signs_the_user_out(new_client, make_user):
    make_user("admin@example.com", role="admin")
    rev_id = make_user("rev@example.com")
    admin, reviewer = new_client(), new_client()
    login(admin, "admin@example.com")
    login(reviewer, "rev@example.com")

    admin.patch(f"/api/admin/users/{rev_id}", json={"password": "a-brand-new-password"})

    assert reviewer.get("/api/auth/me").status_code == 401
    assert login(new_client(), "rev@example.com", "a-brand-new-password").status_code == 200


def test_assignments_are_added_and_removed(new_client, make_user):
    make_user("admin@example.com", role="admin")
    rev_id = make_user("rev@example.com")
    admin = new_client()
    login(admin, "admin@example.com")
    admin.put("/api/projects/fitjournal/keys/home.title", json={"locale": "fr", "value": "Accueil"}, headers=AUTH)

    added = admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "fitjournal", "locale": "fr"})
    assert added.json()["assignments"] == [{"project_id": "fitjournal", "locale": "fr"}]
    # Adding the same assignment twice is harmless.
    admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "fitjournal", "locale": "fr"})

    removed = admin.delete(f"/api/admin/users/{rev_id}/assignments/fitjournal/fr")
    assert removed.json()["assignments"] == []


def test_assignment_to_unknown_project_is_404(new_client, make_user):
    make_user("admin@example.com", role="admin")
    rev_id = make_user("rev@example.com")
    admin = new_client()
    login(admin, "admin@example.com")
    response = admin.post(f"/api/admin/users/{rev_id}/assignments", json={"project_id": "nope", "locale": "fr"})
    assert response.status_code == 404


# ---------- Permissions module ----------

def test_can_review_rules(make_user, db_session_factory):
    admin_id = make_user("admin@example.com", role="admin")
    rev_id = make_user("rev@example.com")
    with db_session_factory() as session:
        project = Project(slug="fitjournal")
        session.add(project)
        session.flush()
        session.add(ReviewerAssignment(user_id=rev_id, project_id=project.id, locale="fr"))
        session.commit()
        admin, reviewer = session.get(User, admin_id), session.get(User, rev_id)

        assert can_review(session, admin, project, "de")  # admins review any language
        assert can_review(session, reviewer, project, "fr")
        assert not can_review(session, reviewer, project, "de")
        assert reviewable_locales(session, admin, project) is None
        assert reviewable_locales(session, reviewer, project) == {"fr"}


# ---------- Command line ----------

def test_cli_creates_admin_and_sets_password(monkeypatch, db_session_factory, new_client):
    import app.cli as cli

    monkeypatch.setattr(cli, "SessionLocal", db_session_factory)
    assert "created" in cli.create_admin("Boss@Example.com", "Boss", "first-password-123")
    assert "already exists" in cli.create_admin("boss@example.com", "Boss", "first-password-123")
    assert login(new_client(), "boss@example.com", "first-password-123").status_code == 200

    assert "updated" in cli.set_password("boss@example.com", "second-password-123")
    assert login(new_client(), "boss@example.com", "second-password-123").status_code == 200
