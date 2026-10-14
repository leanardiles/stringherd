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

AUTH = {"Authorization": "ApiKey test-key"}  # the server-wide development key
KNOWN_PROJECTS = ("demo-app", "fitjournal")


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
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    # Projects must exist before a push. These are the ones the tests push to; "nope" stays unknown.
    from app.models import Project

    with factory() as session:
        session.add_all([Project(slug=slug, name=slug.title()) for slug in KNOWN_PROJECTS])
        session.commit()
    yield factory
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


# ---------- Review ----------

@pytest.fixture
def setup(new_client, make_user, db_session_factory):
    """fitjournal with fr and de translations and English source; an admin and a French reviewer."""
    from sqlalchemy import select

    from app.models import Project, ReviewerAssignment

    tms = new_client()
    for key, en, fr, de in [
        ("dashboard.sets_other", "{{count}} sets", "{{count}} définit", "{{count}} Sätze"),
        ("home.title", "Home", "Accueil", "Startseite"),
        ("login.button", "Sign in", "Connexion", "Anmelden"),
    ]:
        tms.put(f"/api/projects/fitjournal/keys/{key}", json={"locale": "fr", "value": fr}, headers=AUTH)
        tms.put(f"/api/projects/fitjournal/keys/{key}", json={"locale": "de", "value": de}, headers=AUTH)
    tms.put(
        "/api/projects/fitjournal/source",
        json={"locale": "en", "file": "locales/en/common.json", "strings": {
            "dashboard.sets_other": "{{count}} sets", "home.title": "Home", "login.button": "Sign in"}},
        headers=AUTH,
    )
    make_user("admin@example.com", role="admin", name="Ada Admin")
    rev_id = make_user("rev@example.com", name="René Reviewer")
    with db_session_factory() as session:
        project = session.scalar(select(Project).where(Project.slug == "fitjournal"))
        session.add(ReviewerAssignment(user_id=rev_id, project_id=project.id, locale="fr"))
        session.commit()
    admin, reviewer = new_client(), new_client()
    login(admin, "admin@example.com")
    login(reviewer, "rev@example.com")
    return {"admin": admin, "reviewer": reviewer, "tms": tms}
