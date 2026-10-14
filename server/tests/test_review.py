"""Review API: listing, editing and approving, with per-project, per-language permissions.

The `setup` fixture (conftest.py) has fitjournal with fr and de strings, an admin and a French reviewer.
"""

from tests.conftest import AUTH

BASE = "/api/review/projects/fitjournal/locales"


def deliver(client, locale="fr"):
    return client.post(f"{BASE}/{locale}/deliver")


def export(tms, locale="fr"):
    return tms.get("/api/projects/fitjournal/keys/export", params={"locale": locale}, headers=AUTH).json()


# ---------- Access ----------

def test_review_requires_sign_in(client):
    assert client.get("/api/review/projects").status_code == 401


def test_reviewer_sees_only_assigned_languages(setup):
    projects = setup["reviewer"].get("/api/review/projects").json()
    assert [p["project_id"] for p in projects] == ["fitjournal"]
    assert [loc["locale"] for loc in projects[0]["locales"]] == ["fr"]


def test_admin_sees_all_languages(setup):
    projects = setup["admin"].get("/api/review/projects").json()
    assert [loc["locale"] for loc in projects[0]["locales"]] == ["de", "fr"]
    fr = next(loc for loc in projects[0]["locales"] if loc["locale"] == "fr")
    assert fr == {
        "locale": "fr",
        "total": 3,
        "machine_translated": 3,
        "approved": 0,
        "delivered": 0,
        "last_delivered_at": None,
    }


def test_reviewer_cannot_list_unassigned_language(setup):
    assert setup["reviewer"].get(f"{BASE}/de/strings").status_code == 403


def test_reviewer_cannot_edit_or_approve_unassigned_language(setup):
    reviewer = setup["reviewer"]
    assert reviewer.patch(f"{BASE}/de/strings/home.title", json={"approved": True}).status_code == 403
    assert reviewer.post(f"{BASE}/de/strings/approve", json={"keys": ["home.title"]}).status_code == 403


def test_unknown_project_is_404(setup):
    assert setup["admin"].get("/api/review/projects/nope/locales/fr/strings").status_code == 404


# ---------- Listing ----------

def test_list_shows_source_translation_and_machine_translation(setup):
    page = setup["reviewer"].get(f"{BASE}/fr/strings").json()
    assert page["total"] == 3
    first = page["items"][0]
    assert first["key"] == "dashboard.sets_other"
    assert first["source_text"] == "{{count}} sets"
    assert first["value"] == first["machine_translation"] == "{{count}} définit"
    assert first["status"] == "machine_translated"
    assert first["source_file"] == "locales/en/common.json"


def test_list_filters_by_status_and_search(setup):
    reviewer = setup["reviewer"]
    reviewer.patch(f"{BASE}/fr/strings/home.title", json={"approved": True})

    assert reviewer.get(f"{BASE}/fr/strings", params={"status": "approved"}).json()["total"] == 1
    assert reviewer.get(f"{BASE}/fr/strings", params={"status": "machine_translated"}).json()["total"] == 2
    found = reviewer.get(f"{BASE}/fr/strings", params={"q": "connexion"}).json()
    assert [i["key"] for i in found["items"]] == ["login.button"]


def test_list_is_paginated(setup):
    page = setup["reviewer"].get(f"{BASE}/fr/strings", params={"limit": 2, "offset": 2}).json()
    assert page["total"] == 3 and [i["key"] for i in page["items"]] == ["login.button"]


# ---------- Editing and approving ----------

def test_edit_and_approve_in_one_call_records_the_reviewer(setup):
    response = setup["reviewer"].patch(
        f"{BASE}/fr/strings/dashboard.sets_other", json={"value": "{{count}} séries", "approved": True}
    )
    body = response.json()
    assert body["value"] == "{{count}} séries"
    assert body["machine_translation"] == "{{count}} définit"  # DeepL's original is kept for reference
    assert body["status"] == "approved" and body["approved_by"] == "René Reviewer"
    assert "dashboard.sets_other" not in export(setup["tms"])  # approved, not delivered yet
    deliver(setup["reviewer"])
    assert export(setup["tms"])["dashboard.sets_other"] == "{{count}} séries"


def test_edit_without_approving_stays_unapproved(setup):
    reviewer = setup["reviewer"]
    reviewer.patch(f"{BASE}/fr/strings/home.title", json={"approved": True})

    body = reviewer.patch(f"{BASE}/fr/strings/home.title", json={"value": "Page d'accueil"}).json()

    assert body["status"] == "machine_translated" and body["approved_by"] is None
    assert "home.title" not in export(setup["tms"])


def test_withdrawing_approval(setup):
    reviewer = setup["reviewer"]
    reviewer.patch(f"{BASE}/fr/strings/home.title", json={"approved": True})
    body = reviewer.patch(f"{BASE}/fr/strings/home.title", json={"approved": False}).json()
    assert body["status"] == "machine_translated" and body["approved_at"] is None


def test_edit_missing_translation_is_404(setup):
    assert setup["reviewer"].patch(f"{BASE}/fr/strings/does.not.exist", json={"approved": True}).status_code == 404


def test_bulk_approve(setup):
    reviewer = setup["reviewer"]
    reviewer.patch(f"{BASE}/fr/strings/home.title", json={"approved": True})

    result = reviewer.post(
        f"{BASE}/fr/strings/approve", json={"keys": ["home.title", "login.button", "dashboard.sets_other", "nope"]}
    ).json()

    assert result == {"approved": 2, "already_approved": 1, "not_found": ["nope"]}
    deliver(reviewer)
    assert len(export(setup["tms"])) == 3


def test_admin_can_review_any_language(setup):
    body = setup["admin"].patch(f"{BASE}/de/strings/home.title", json={"approved": True}).json()
    assert body["status"] == "approved" and body["approved_by"] == "Ada Admin"


# ---------- The whole loop ----------

def test_reviewer_edit_survives_repush_and_comes_back_on_pull(setup):
    tms, reviewer = setup["tms"], setup["reviewer"]
    reviewer.patch(f"{BASE}/fr/strings/dashboard.sets_other", json={"value": "{{count}} séries", "approved": True})
    deliver(reviewer)

    # A push before pull re-sends DeepL's original text: the edit stays.
    tms.put("/api/projects/fitjournal/keys/dashboard.sets_other", json={"locale": "fr", "value": "{{count}} définit"}, headers=AUTH)
    assert export(tms)["dashboard.sets_other"] == "{{count}} séries"

    # After pull the file holds the edit; pushing it back changes nothing.
    tms.put("/api/projects/fitjournal/keys/dashboard.sets_other", json={"locale": "fr", "value": "{{count}} séries"}, headers=AUTH)
    item = reviewer.get(f"{BASE}/fr/strings", params={"q": "sets"}).json()["items"][0]
    assert item["status"] == "delivered" and item["approved_by"] == "René Reviewer"
    assert item["delivered_by"] == "René Reviewer"
