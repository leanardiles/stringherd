"""The hosted demo (DEMO_MODE): one-click sign-in, guardrails on the shared accounts, and the reset."""

import json
from pathlib import Path

import pytest
from sqlalchemy import delete, func, select

from app import cli, demo
from app.config import get_settings
from app.models import Project, User, UserSession
from tests.conftest import login

SECRET = "a-long-random-cron-secret"
RESET = {"Authorization": f"Bearer {SECRET}"}


@pytest.fixture
def seeded(db_session_factory):
    """The Trailhead demo, alone in the database, as on the hosted demo."""
    with db_session_factory() as db:
        db.execute(delete(Project))
        db.commit()
        demo.seed_demo(db)
    return db_session_factory


@pytest.fixture
def demo_mode(monkeypatch):
    monkeypatch.setattr(get_settings(), "demo_mode", True)
    monkeypatch.setattr(get_settings(), "cron_secret", SECRET)


def sign_in(client, role):
    return client.post("/api/demo/sign-in", json={"role": role})


def user_id(factory, email):
    with factory() as db:
        return db.scalar(select(User.id).where(User.email == email))


# ---------- Off: nothing is there ----------


def test_without_demo_mode_the_demo_does_not_exist(seeded, client):
    assert client.get("/api/demo").status_code == 404
    assert sign_in(client, "admin").status_code == 404
    assert client.post("/api/demo/reset", headers=RESET).status_code == 404


def test_without_demo_mode_the_demo_accounts_are_ordinary(seeded, client):
    assert login(client, demo.ADMIN_EMAIL, demo.DEMO_PASSWORD).json()["demo_account"] is False
    reviewer = user_id(seeded, demo.REVIEWER_EMAIL)
    assert client.post(f"/api/admin/users/{reviewer}/reset-password").status_code == 200


# ---------- One-click sign-in ----------


def test_the_ui_learns_when_the_demo_resets(demo_mode, client):
    assert client.get("/api/demo").json() == {"resets_utc": ["07:00", "19:00"]}


@pytest.mark.parametrize(("role", "email"), [("reviewer", demo.REVIEWER_EMAIL), ("admin", demo.ADMIN_EMAIL)])
def test_one_click_signs_in_as_the_shared_account(demo_mode, seeded, client, role, email):
    response = sign_in(client, role)
    assert response.status_code == 200
    me = client.get("/api/auth/me").json()
    assert (me["email"], me["role"], me["demo_account"]) == (email, role, True)


def test_one_click_before_the_demo_is_seeded(demo_mode, client):
    response = sign_in(client, "admin")
    assert response.status_code == 503
    assert "set up" in response.json()["detail"]


def test_only_the_two_demo_roles_exist(demo_mode, seeded, client):
    assert sign_in(client, "owner").status_code == 422


# ---------- Guardrails ----------


@pytest.fixture
def demo_admin(demo_mode, seeded, client):
    sign_in(client, "admin")
    return client


def test_visitors_cannot_change_the_shared_accounts(demo_admin, seeded):
    reviewer = user_id(seeded, demo.REVIEWER_EMAIL)
    admin = user_id(seeded, demo.ADMIN_EMAIL)
    attempts = [
        demo_admin.patch(f"/api/admin/users/{reviewer}", json={"is_active": False}),
        demo_admin.patch(f"/api/admin/users/{reviewer}", json={"password": "something-else-123"}),
        demo_admin.patch(f"/api/admin/users/{admin}", json={"name": "Someone"}),
        demo_admin.post(f"/api/admin/users/{reviewer}/reset-password"),
        demo_admin.delete(f"/api/admin/users/{reviewer}/assignments/trailhead/fr"),
        demo_admin.post(f"/api/admin/users/{reviewer}/assignments", json={"project_id": "trailhead", "locale": "fr"}),
        demo_admin.post(
            "/api/auth/password",
            json={"current_password": demo.DEMO_PASSWORD, "new_password": "something-else-123"},
        ),
    ]
    assert [response.status_code for response in attempts] == [403] * len(attempts)
    assert attempts[0].json()["detail"] == "This is a shared demo account, so it can't be changed."
    with seeded() as db:
        reviewer_user = db.get(User, reviewer)
        assert reviewer_user.is_active and len(reviewer_user.assignments) == 2


def test_everything_else_stays_allowed(demo_admin):
    created = demo_admin.post(
        "/api/admin/users", json={"email": "visitor@example.com", "name": "Visitor", "role": "reviewer"}
    )
    assert created.status_code == 201
    visitor = created.json()["id"]
    assert demo_admin.patch(f"/api/admin/users/{visitor}", json={"is_active": False}).status_code == 200
    assert demo_admin.patch("/api/admin/projects/trailhead", json={"name": "Renamed"}).status_code == 200


# ---------- The reset ----------


def test_the_reset_needs_the_secret(demo_mode, seeded, client, monkeypatch):
    assert client.post("/api/demo/reset").status_code == 401
    assert client.post("/api/demo/reset", headers={"Authorization": "Bearer wrong"}).status_code == 401
    monkeypatch.setattr(get_settings(), "cron_secret", None)
    assert client.post("/api/demo/reset", headers=RESET).status_code == 404


def test_the_reset_brings_back_the_demo_and_signs_everyone_out(demo_admin, seeded):
    demo_admin.patch("/api/admin/projects/trailhead", json={"name": "Renamed"})
    demo_admin.post("/api/admin/users", json={"email": "visitor@example.com", "name": "Visitor", "role": "reviewer"})

    response = demo_admin.post("/api/demo/reset", headers=RESET)
    assert response.status_code == 200
    assert response.json() == {"strings": len(demo.SOURCE), "languages": ["fr", "es-419"]}
    with seeded() as db:
        assert db.scalar(select(Project.name)) == "Trailhead"
        assert sorted(db.scalars(select(User.email))) == sorted(demo.DEMO_ACCOUNTS.values())
        assert db.scalar(select(func.count()).select_from(UserSession)) == 0
    assert demo_admin.get("/api/auth/me").status_code == 401


def test_the_reset_refuses_a_database_without_the_demo(demo_mode, client, db_session_factory):
    # The shared fixture's database holds other projects and no demo admin, like a real one.
    response = client.post("/api/demo/reset", headers=RESET)
    assert response.status_code == 409
    with db_session_factory() as db:
        assert db.scalar(select(func.count()).select_from(Project)) == 2


def test_vercel_resets_at_the_hours_the_banner_shows():
    config = json.loads((Path(__file__).resolve().parents[2] / "vercel.json").read_text(encoding="utf-8"))
    schedule = config["schedules"]["demo-reset"]
    minute, hours, *_ = schedule["schedule"].split()
    assert (schedule["path"], schedule["requestMethod"], minute) == ("/api/demo/reset", "POST", "0")
    assert tuple(int(hour) for hour in hours.split(",")) == demo.RESET_HOURS_UTC


# ---------- reset-demo, from this machine ----------


def test_reset_demo_asks_first(seeded, capsys):
    assert cli.reset_demo(confirm=lambda _: "no", session_factory=seeded) == "Nothing changed."
    assert "empties every Stringherd table" in capsys.readouterr().out


def test_reset_demo_resets(seeded):
    with seeded() as db:
        db.execute(delete(User).where(User.email == demo.REVIEWER_EMAIL))
        db.commit()
    result = cli.reset_demo(confirm=lambda _: "trailhead", session_factory=seeded)
    assert result == f"Demo reset: Trailhead with {len(demo.SOURCE)} strings in fr, es-419."
    assert user_id(seeded, demo.REVIEWER_EMAIL) is not None


def test_reset_demo_refuses_a_database_without_the_demo(db_session_factory):
    result = cli.reset_demo(confirm=lambda _: "trailhead", session_factory=db_session_factory)
    assert result.endswith("so it does not hold the demo. Nothing changed.")
