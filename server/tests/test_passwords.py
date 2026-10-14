"""Temporary passwords, the forced change at first sign-in, and admin resets."""

import pytest

from tests.conftest import PASSWORD, login

NEW = "my-own-password-42"


@pytest.fixture
def admin(new_client, make_user):
    make_user("admin@example.com", role="admin")
    client = new_client()
    login(client, "admin@example.com")
    return client


def test_generated_temporary_password_is_returned_once(admin, new_client):
    response = admin.post("/api/admin/users", json={"email": "Rev@Example.com", "name": "Rev"})
    assert response.status_code == 201
    body = response.json()
    temporary = body["temporary_password"]
    assert len(temporary) >= 12
    assert body["must_change_password"] is True

    listed = next(u for u in admin.get("/api/admin/users").json() if u["email"] == "rev@example.com")
    assert "temporary_password" not in listed
    assert login(new_client(), "rev@example.com", temporary).status_code == 200


def test_admin_chosen_password_is_also_temporary(admin):
    body = admin.post(
        "/api/admin/users", json={"email": "rev@example.com", "name": "Rev", "password": "temporary-pass-1"}
    ).json()
    assert body["temporary_password"] is None
    assert body["must_change_password"] is True


def test_temporary_password_blocks_everything_but_the_change(admin, new_client):
    temporary = admin.post("/api/admin/users", json={"email": "rev@example.com", "name": "Rev"}).json()[
        "temporary_password"
    ]
    reviewer = new_client()
    login(reviewer, "rev@example.com", temporary)

    me = reviewer.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["must_change_password"] is True
    blocked = reviewer.get("/api/review/projects")
    assert blocked.status_code == 403
    assert "new password" in blocked.json()["detail"]

    response = reviewer.post("/api/auth/password", json={"current_password": temporary, "new_password": NEW})
    assert response.status_code == 200
    assert response.json()["must_change_password"] is False
    assert reviewer.get("/api/review/projects").status_code == 200


def test_temporary_password_also_blocks_admins(new_client, make_user, db_session_factory):
    from app.models import User

    admin_id = make_user("admin@example.com", role="admin")
    with db_session_factory() as session:
        session.get(User, admin_id).must_change_password = True
        session.commit()
    admin = new_client()
    login(admin, "admin@example.com")
    assert admin.get("/api/admin/users").status_code == 403


def test_change_needs_the_current_password(new_client, make_user):
    make_user("rev@example.com")
    reviewer = new_client()
    login(reviewer, "rev@example.com")
    wrong = reviewer.post("/api/auth/password", json={"current_password": "nope", "new_password": NEW})
    assert wrong.status_code == 400
    same = reviewer.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": PASSWORD})
    assert same.status_code == 400
    short = reviewer.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": "short"})
    assert short.status_code == 422


def test_change_signs_out_other_browsers_but_not_this_one(new_client, make_user):
    make_user("rev@example.com")
    here, elsewhere = new_client(), new_client()
    login(here, "rev@example.com")
    login(elsewhere, "rev@example.com")

    here.post("/api/auth/password", json={"current_password": PASSWORD, "new_password": NEW})
    assert here.get("/api/auth/me").status_code == 200
    assert elsewhere.get("/api/auth/me").status_code == 401
    assert login(new_client(), "rev@example.com", PASSWORD).status_code == 401
    assert login(new_client(), "rev@example.com", NEW).status_code == 200


def test_change_requires_sign_in(client):
    response = client.post("/api/auth/password", json={"current_password": "x", "new_password": NEW})
    assert response.status_code == 401


def test_admin_reset_issues_a_new_temporary_password(admin, new_client, make_user):
    rev_id = make_user("rev@example.com")
    reviewer = new_client()
    login(reviewer, "rev@example.com")

    response = admin.post(f"/api/admin/users/{rev_id}/reset-password")
    assert response.status_code == 200
    temporary = response.json()["temporary_password"]

    assert reviewer.get("/api/auth/me").status_code == 401  # signed out everywhere
    assert login(new_client(), "rev@example.com", PASSWORD).status_code == 401
    fresh = new_client()
    assert login(fresh, "rev@example.com", temporary).json()["must_change_password"] is True


def test_admin_cannot_reset_their_own_password(admin):
    me = admin.get("/api/auth/me").json()
    assert admin.post(f"/api/admin/users/{me['id']}/reset-password").status_code == 409


def test_reviewer_cannot_reset_passwords(new_client, make_user):
    target = make_user("other@example.com")
    make_user("rev@example.com")
    reviewer = new_client()
    login(reviewer, "rev@example.com")
    assert reviewer.post(f"/api/admin/users/{target}/reset-password").status_code == 403


def test_cli_set_password_clears_the_temporary_flag(admin, new_client, monkeypatch, db_session_factory):
    from app import cli

    temporary = admin.post("/api/admin/users", json={"email": "rev@example.com", "name": "Rev"}).json()
    assert temporary["must_change_password"] is True
    monkeypatch.setattr(cli, "SessionLocal", db_session_factory)
    cli.set_password("rev@example.com", "operator-set-pass-1")
    reviewer = new_client()
    assert login(reviewer, "rev@example.com", "operator-set-pass-1").json()["must_change_password"] is False
