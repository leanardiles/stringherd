"""Security headers on every response, from the server and from vercel.json alike."""

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security_headers import HEADERS, STRICT_TRANSPORT_SECURITY, SecurityHeaders
from tests.test_web import dist, use_build  # noqa: F401  (a UI build for one test)

EXPECTED = {name.lower(): value for name, value in HEADERS.items()}


def headers_of(response):
    return {name: response.headers.get(name) for name in EXPECTED}


def test_api_responses_carry_the_headers(client):
    for response in (client.get("/health"), client.get("/api/does-not-exist"), client.get("/api/auth/me")):
        assert headers_of(response) == EXPECTED
    # Served over plain HTTP here (COOKIE_SECURE off), so HTTPS is not insisted on.
    assert "strict-transport-security" not in client.get("/health").headers


def test_the_ui_carries_the_headers(client, dist):  # noqa: F811  (the fixture imported above)
    assert headers_of(client.get("/review/fitjournal/fr")) == EXPECTED


def test_the_api_docs_keep_working(client):
    response = client.get("/docs")
    assert response.status_code == 200
    # Their scripts come from a public CDN, which the content policy would block.
    assert "content-security-policy" not in response.headers
    assert response.headers["x-frame-options"] == "DENY"


def test_over_https_browsers_are_told_to_insist_on_it():
    app = FastAPI()
    app.get("/")(lambda: {"ok": True})
    app.add_middleware(SecurityHeaders, https=True)
    response = TestClient(app).get("/")
    assert response.headers["strict-transport-security"] == STRICT_TRANSPORT_SECURITY


def test_vercel_gives_the_ui_the_same_headers():
    config = json.loads((Path(__file__).resolve().parents[2] / "vercel.json").read_text(encoding="utf-8"))
    rules = config["services"]["web"]["headers"]
    assert [rule["source"] for rule in rules] == ["/(.*)"]
    on_vercel = {header["key"]: header["value"] for header in rules[0]["headers"]}
    # Vercel always serves over HTTPS.
    assert on_vercel == {**HEADERS, "Strict-Transport-Security": STRICT_TRANSPORT_SECURITY}
