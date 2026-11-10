from sqlalchemy.exc import OperationalError

from app.db import get_db
from app.main import app


def test_health_ok(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_unreachable_database(client):
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    response = client.get("/health")

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unreachable"}


def test_health_answers_head(client):
    """Uptime services check with HEAD: same status, no body."""
    response = client.head("/health")
    assert response.status_code == 200
    assert response.content == b""


def test_health_head_reports_unreachable_database(client):
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    assert client.head("/health").status_code == 503


def test_head_is_not_in_the_api_docs(client):
    assert list(client.get("/openapi.json").json()["paths"]["/health"]) == ["get"]
