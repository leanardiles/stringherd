"""Deliver: approved strings become pullable only when a reviewer delivers the language.

Uses the `setup` fixture (conftest.py): fitjournal with three fr and de strings, an admin and a French reviewer.
"""

from sqlalchemy import select

from app.models import Delivery
from tests.conftest import AUTH
from tests.test_review import BASE, deliver, export

PUSH = "/api/projects/fitjournal/keys"
SOURCE = "/api/projects/fitjournal/source"


def approve(client, key, locale="fr", value=None):
    body = {"approved": True} if value is None else {"value": value, "approved": True}
    return client.patch(f"{BASE}/{locale}/strings/{key}", json=body)


def item(client, key, locale="fr"):
    return next(i for i in client.get(f"{BASE}/{locale}/strings").json()["items"] if i["key"] == key)


def push(tms, key, value, locale="fr"):
    return tms.put(f"{PUSH}/{key}", json={"locale": locale, "value": value}, headers=AUTH)


# ---------- What Deliver sends ----------

def test_approved_strings_wait_for_deliver(setup):
    reviewer, tms = setup["reviewer"], setup["tms"]
    approve(reviewer, "home.title")
    assert export(tms) == {}

    result = deliver(reviewer).json()

    assert result["delivered"] == 1 and result["not_approved"] == 2 and result["locale"] == "fr"
    assert export(tms) == {"home.title": "Accueil"}
    assert item(reviewer, "home.title")["status"] == "delivered"
    assert item(reviewer, "home.title")["delivered_by"] == "René Reviewer"


def test_reviewer_can_change_approved_strings_before_delivering(setup):
    reviewer, tms = setup["reviewer"], setup["tms"]
    approve(reviewer, "home.title")
    approve(reviewer, "home.title", value="Page d'accueil")  # second thoughts during the session
    deliver(reviewer)
    assert export(tms) == {"home.title": "Page d'accueil"}


def test_deliver_is_per_language(setup):
    admin, tms = setup["admin"], setup["tms"]
    approve(admin, "home.title", locale="fr")
    approve(admin, "home.title", locale="de")
    deliver(admin, "fr")
    assert export(tms, "fr") == {"home.title": "Accueil"}
    assert export(tms, "de") == {}
    assert item(admin, "home.title", "de")["status"] == "approved"


def test_deliver_includes_everyone_s_approvals(setup):
    admin, reviewer, tms = setup["admin"], setup["reviewer"], setup["tms"]
    approve(admin, "login.button")
    approve(reviewer, "home.title")
    assert deliver(reviewer).json()["delivered"] == 2
    assert set(export(tms)) == {"home.title", "login.button"}


def test_nothing_to_deliver_is_409(setup):
    response = deliver(setup["reviewer"])
    assert response.status_code == 409
    assert "Nothing to deliver" in response.json()["detail"]


def test_only_reviewers_of_the_language_and_admins_deliver(setup):
    approve(setup["admin"], "home.title", locale="de")
    assert deliver(setup["reviewer"], "de").status_code == 403
    assert deliver(setup["admin"], "de").status_code == 200


def test_delivery_is_recorded(setup, db_session_factory):
    approve(setup["reviewer"], "home.title")
    deliver(setup["reviewer"])
    with db_session_factory() as session:
        record = session.scalar(select(Delivery))
        assert (record.locale, record.strings, record.not_approved) == ("fr", 1, 2)
        assert record.delivered_by.name == "René Reviewer"

    fr = next(
        entry
        for project in setup["reviewer"].get("/api/review/projects").json()
        for entry in project["locales"]
        if entry["locale"] == "fr"
    )
    assert fr["delivered"] == 1 and fr["approved"] == 0 and fr["machine_translated"] == 2
    assert fr["last_delivered_at"] is not None


# ---------- Delivered strings are locked ----------

def test_delivered_strings_are_locked(setup):
    reviewer = setup["reviewer"]
    approve(reviewer, "home.title")
    deliver(reviewer)

    response = reviewer.patch(f"{BASE}/fr/strings/home.title", json={"value": "Autre chose"})
    assert response.status_code == 409
    assert "An admin can reopen it" in response.json()["detail"]
    assert setup["admin"].patch(f"{BASE}/fr/strings/home.title", json={"approved": False}).status_code == 409
    bulk = reviewer.post(f"{BASE}/fr/strings/approve", json={"keys": ["home.title"]}).json()
    assert bulk == {"approved": 0, "already_approved": 1, "not_found": [], "skipped": []}


def test_delivered_strings_stay_searchable(setup):
    reviewer = setup["reviewer"]
    approve(reviewer, "home.title")
    deliver(reviewer)
    delivered = reviewer.get(f"{BASE}/fr/strings", params={"status": "delivered"}).json()
    assert [i["key"] for i in delivered["items"]] == ["home.title"]
    found = reviewer.get(f"{BASE}/fr/strings", params={"q": "Accueil"}).json()
    assert found["items"][0]["status"] == "delivered"


# ---------- Reopen ----------

def test_only_admins_reopen(setup):
    approve(setup["reviewer"], "home.title")
    deliver(setup["reviewer"])
    assert setup["reviewer"].post(f"{BASE}/fr/strings/home.title/reopen").status_code == 403
    response = setup["admin"].post(f"{BASE}/fr/strings/home.title/reopen")
    assert response.status_code == 200
    assert response.json()["status"] == "approved"


def test_reopening_a_string_that_is_not_delivered_is_409(setup):
    assert setup["admin"].post(f"{BASE}/fr/strings/home.title/reopen").status_code == 409


def test_reopened_string_keeps_exporting_delivered_text_until_delivered_again(setup):
    admin, reviewer, tms = setup["admin"], setup["reviewer"], setup["tms"]
    approve(reviewer, "home.title")
    deliver(reviewer)
    admin.post(f"{BASE}/fr/strings/home.title/reopen")

    approve(reviewer, "home.title", value="Page d'accueil")
    assert export(tms) == {"home.title": "Accueil"}  # still what the code has
    assert item(reviewer, "home.title")["delivered_value"] == "Accueil"

    deliver(reviewer)
    assert export(tms) == {"home.title": "Page d'accueil"}


def test_withdrawn_reopened_string_keeps_its_delivered_text(setup):
    admin, reviewer, tms = setup["admin"], setup["reviewer"], setup["tms"]
    approve(reviewer, "home.title")
    deliver(reviewer)
    admin.post(f"{BASE}/fr/strings/home.title/reopen")
    reviewer.patch(f"{BASE}/fr/strings/home.title", json={"approved": False})
    assert export(tms) == {"home.title": "Accueil"}


# ---------- Pushes and source changes ----------

def test_push_of_delivered_text_does_not_overwrite_a_reopened_edit(setup):
    admin, reviewer, tms = setup["admin"], setup["reviewer"], setup["tms"]
    approve(reviewer, "home.title", value="Page d'accueil")
    deliver(reviewer)
    admin.post(f"{BASE}/fr/strings/home.title/reopen")
    reviewer.patch(f"{BASE}/fr/strings/home.title", json={"value": "Accueil principal"})

    # After a pull the repository holds the delivered text; the next push sends it back.
    response = push(tms, "home.title", "Page d'accueil")

    assert response.json()["changed"] is False
    assert item(reviewer, "home.title")["value"] == "Accueil principal"


def test_new_machine_translation_reopens_a_delivered_string(setup):
    reviewer, tms = setup["reviewer"], setup["tms"]
    approve(reviewer, "home.title")
    deliver(reviewer)

    response = push(tms, "home.title", "Démarrer")  # DeepL translated a changed source

    assert response.json()["changed"] is True and response.json()["status"] == "machine_translated"
    assert export(tms) == {}  # the old delivered text translated the old source
    assert item(reviewer, "home.title")["delivered_value"] is None


def test_source_change_reopens_delivered_strings(setup):
    reviewer, tms = setup["reviewer"], setup["tms"]
    approve(reviewer, "home.title")
    approve(reviewer, "login.button")
    deliver(reviewer)

    body = tms.put(
        SOURCE,
        json={"locale": "en", "file": "locales/en/common.json", "strings": {
            "dashboard.sets_other": "{{count}} sets", "home.title": "Start page", "login.button": "Sign in"}},
        headers=AUTH,
    ).json()

    assert body["approvals_reset"] == 1
    assert export(tms) == {"login.button": "Connexion"}
    assert item(reviewer, "home.title")["status"] == "machine_translated"


def test_admin_project_page_shows_delivery(setup):
    approve(setup["reviewer"], "home.title")
    deliver(setup["reviewer"])
    project = setup["admin"].get("/api/admin/projects/fitjournal").json()
    fr = next(entry for entry in project["locales"] if entry["locale"] == "fr")
    assert fr["delivered"] == 1 and fr["approved"] == 0 and fr["last_delivered_at"] is not None
