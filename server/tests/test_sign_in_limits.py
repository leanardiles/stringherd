"""Limits on failed password sign-ins: 5 per email and 20 per address within 15 minutes."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select

from app.models import SignInFailure
from app.routers.auth import client_address
from tests.conftest import PASSWORD, login

EMAIL = "rene@example.com"


@pytest.fixture
def rene(make_user):
    make_user(EMAIL)


def fail(client, email=EMAIL, times=1):
    return [login(client, email, "wrong-password") for _ in range(times)][-1]


def failures(factory, email=None):
    with factory() as db:
        query = select(func.count()).select_from(SignInFailure)
        if email:
            query = query.where(SignInFailure.email == email)
        return db.scalar(query)


def age_failures(factory, by):
    """Move every recorded failure back in time, as if `by` had passed."""
    with factory() as db:
        for failure in db.scalars(select(SignInFailure)):
            failure.created_at -= by
        db.commit()


def test_four_failures_still_allow_signing_in(rene, client, db_session_factory):
    assert fail(client, times=4).status_code == 401
    assert login(client, EMAIL).status_code == 200
    assert failures(db_session_factory, EMAIL) == 0  # a success starts the count again


def test_five_failures_lock_the_account(rene, client, db_session_factory):
    assert fail(client, times=5).status_code == 401
    response = login(client, EMAIL)  # even with the right password
    assert response.status_code == 429
    assert response.json()["detail"] == "Too many failed sign-ins. Try again in 15 minutes."
    assert response.headers["Retry-After"] == "900"
    # Refused attempts are not counted, so the lock can lift.
    assert failures(db_session_factory, EMAIL) == 5


def test_the_lock_lifts_as_failures_age(rene, client, db_session_factory):
    fail(client, times=5)
    age_failures(db_session_factory, timedelta(minutes=10))
    assert login(client, EMAIL).json()["detail"] == "Too many failed sign-ins. Try again in 5 minutes."
    age_failures(db_session_factory, timedelta(minutes=5, seconds=1))
    assert login(client, EMAIL).status_code == 200


def test_the_count_ignores_case_and_spaces(rene, client):
    for email in ["Rene@Example.com", " rene@example.com", "RENE@EXAMPLE.COM ", "rene@example.com", EMAIL]:
        fail(client, email)
    assert login(client, EMAIL).status_code == 429


def test_one_locked_account_does_not_lock_another(rene, make_user, client):
    make_user("ana@example.com")
    fail(client, times=5)
    assert login(client, "ana@example.com").status_code == 200


def test_unknown_emails_count_too(client):
    fail(client, "nobody@example.com", times=5)
    assert login(client, "nobody@example.com").status_code == 429


def test_twenty_failures_from_one_address_lock_it(make_user, client):
    make_user("ana@example.com")
    for number in range(20):
        fail(client, f"guess{number}@example.com")
    response = login(client, "ana@example.com")  # an account never tried, right password
    assert response.status_code == 429
    assert "Try again in 15 minutes" in response.json()["detail"]


def test_old_failures_are_deleted(rene, client, db_session_factory):
    fail(client, times=3)
    age_failures(db_session_factory, timedelta(days=1, minutes=1))
    fail(client, "someone@example.com")
    assert failures(db_session_factory) == 1


class FakeRequest:
    def __init__(self, headers, host):
        self.headers = headers
        self.client = type("Client", (), {"host": host})()


def test_the_address_comes_from_vercel_only_on_vercel(monkeypatch):
    request = FakeRequest({"x-real-ip": "203.0.113.7"}, "10.0.0.1")
    monkeypatch.delenv("VERCEL", raising=False)
    assert client_address(request) == "10.0.0.1"  # a header anyone could send is ignored
    monkeypatch.setenv("VERCEL", "1")
    assert client_address(request) == "203.0.113.7"


def test_the_password_constant_signs_in(rene, client):
    assert login(client, EMAIL, PASSWORD).status_code == 200
