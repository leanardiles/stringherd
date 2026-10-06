import os

# Must run before `app` is imported: settings and the engine are created at import time.
# Tests never touch Supabase or call DeepL.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ["TMS_API_KEY"] = "test-key"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import models  # noqa: E402,F401
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

AUTH = {"Authorization": "ApiKey test-key"}


@pytest.fixture
def db_session_factory():
    """A fresh, empty in-memory database for every test."""
    # StaticPool keeps one shared connection, so every session sees the same in-memory database.
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    engine.dispose()


@pytest.fixture
def client(db_session_factory):
    def override_get_db():
        with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()

# ---------- People ----------

PASSWORD = "correct horse battery"


@pytest.fixture
def make_user(db_session_factory):
    """Create a user directly in the database; returns its id."""
    from app.models import User, UserRole
    from app.security import hash_password

    def _make(email, role="reviewer", name=None, password=PASSWORD, active=True):
        with db_session_factory() as session:
            user = User(
                email=email,
                name=name or email.split("@")[0].title(),
                role=UserRole(role),
                password_hash=hash_password(password),
                is_active=active,
            )
            session.add(user)
            session.commit()
            return user.id

    return _make


@pytest.fixture
def new_client(db_session_factory):
    """A separate browser (own cookie jar) per call, sharing the test database."""

    def override_get_db():
        with db_session_factory() as session:
            yield session

    clients = []

    def _new():
        app.dependency_overrides[get_db] = override_get_db
        c = TestClient(app)
        clients.append(c)
        return c

    yield _new
    for c in clients:
        c.close()
    app.dependency_overrides.clear()


def login(client, email, password=PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})
