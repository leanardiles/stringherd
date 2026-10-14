"""The built UI is served at the same address as the API, without ever shadowing it."""

import pytest

from app.config import Settings
from app.main import app
from app.web import ui_response

INDEX = "<!doctype html><title>Stringherd</title><div id=root></div>"


@pytest.fixture
def dist(tmp_path, monkeypatch):
    """A small stand-in for web/dist, swapped in for the real one."""
    (tmp_path / "index.html").write_text(INDEX)
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "index-a1b2c3.js").write_text("console.log('ui')")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    (tmp_path.parent / "secret.txt").write_text("outside the build")
    monkeypatch.setattr(app.state, "web_dist", tmp_path)
    return tmp_path


def test_root_and_deep_links_open_the_ui(client, dist):
    for path in ("/", "/review/fitjournal/fr", "/review/my.app/pt-BR", "/admin/people/3", "/login"):
        response = client.get(path)
        assert response.status_code == 200, path
        assert response.text == INDEX
        assert response.headers["cache-control"] == "no-cache"
        assert response.headers["content-type"].startswith("text/html")


def test_query_strings_do_not_matter(client, dist):
    response = client.get("/review/fitjournal/fr?view=single&key=a.first")
    assert response.text == INDEX


def test_bundles_are_cached_for_a_year(client, dist):
    response = client.get("/assets/index-a1b2c3.js")
    assert response.status_code == 200
    assert response.text == "console.log('ui')"
    assert response.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert response.headers["content-type"].startswith("text/javascript")


def test_other_files_in_the_build_are_revalidated(client, dist):
    response = client.get("/favicon.svg")
    assert response.text == "<svg/>"
    assert response.headers["cache-control"] == "no-cache"


def test_a_bundle_from_an_older_build_is_a_real_404(client, dist):
    response = client.get("/assets/index-old.js")
    assert response.status_code == 404
    assert response.text == ""


def test_head_requests_work(client, dist):
    assert client.head("/review/fitjournal/fr").status_code == 200


def test_the_api_keeps_priority(client, dist):
    assert client.get("/health").json() == {"status": "ok", "database": "ok"}
    assert client.get("/openapi.json").json()["info"]["title"] == "Stringherd"

    unknown = client.get("/api/does-not-exist")
    assert unknown.status_code == 404
    assert unknown.json() == {"detail": "Not Found"}

    assert client.get("/api").status_code == 404
    assert client.get("/api").headers["content-type"] == "application/json"


def test_wrong_methods_and_missing_projects_stay_json(client, dist):
    # POST to an unknown address is not a page load.
    assert client.post("/review/fitjournal/fr").json() == {"detail": "Not Found"}
    # A wrong method on a real endpoint is still a 405.
    assert client.get("/api/auth/logout").status_code == 405
    # A 404 raised by an endpoint keeps its own message.
    missing = client.get("/api/projects/nope", headers={"Authorization": "ApiKey test-key"})
    assert missing.status_code == 404
    assert missing.headers["content-type"] == "application/json"


def test_nothing_outside_the_build_is_served(client, dist):
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"):
        response = client.get(path)
        assert "outside the build" not in response.text, path
    # Clients normalise ../ before sending, so also check the server side directly.
    assert ui_response(dist, "/../secret.txt").path == dist.resolve() / "index.html"


def test_without_a_build_the_api_runs_and_the_ui_explains(client, tmp_path, monkeypatch):
    monkeypatch.setattr(app.state, "web_dist", tmp_path / "missing")
    response = client.get("/review/fitjournal/fr")
    assert response.status_code == 404
    assert "the review UI is not built" in response.text
    assert "npm run build:web" in response.text
    assert client.get("/health").status_code == 200


def test_ui_can_be_turned_off(client, monkeypatch):
    monkeypatch.setattr(app.state, "web_dist", None)
    assert "not built" in client.get("/").text


def test_web_dist_setting(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite://")
    monkeypatch.delenv("WEB_DIST", raising=False)
    default = Settings().web_dist
    assert default is not None
    assert default.parts[-2:] == ("web", "dist")

    monkeypatch.setenv("WEB_DIST", "")
    assert Settings().web_dist is None

    monkeypatch.setenv("WEB_DIST", "/srv/stringherd-ui")
    assert str(Settings().web_dist) == "/srv/stringherd-ui"
