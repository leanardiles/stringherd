"""Quality checks: the shared cases, and what approve and bulk approve do with errors."""

import json
from pathlib import Path

import pytest

from app.services.qa import CHECKS, check_translation, qa_rules
from tests.test_review import BASE

CASES = json.loads((Path(__file__).parents[2] / "shared" / "qa-cases.json").read_text(encoding="utf-8"))["cases"]


def _shape(issues):
    return [{"code": i["code"], **({"items": i["items"]} if i.get("items") else {})} for i in issues]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_shared_case(case):
    """The same file runs in web/src/lib/qa.test.ts, so screen and server agree."""
    got = [{"code": i.code, "items": i.items} for i in check_translation(case["source"], case["target"])]
    assert _shape(got) == _shape(case["issues"])


def test_severity_comes_from_the_rules():
    issues = check_translation("{{count}} sets", "séries")
    assert [(i.code, i.severity) for i in issues] == [("placeholdersMissing", "error")]
    assert check_translation("Dashboard", "Dashboard")[0].severity == "warning"


def test_warnings_can_be_turned_off_but_locked_errors_stay():
    rules = {**qa_rules(), "sameAsSource": "off", "placeholdersMissing": "off"}
    assert check_translation("Dashboard", "Dashboard", rules) == []
    assert check_translation("{{count}} sets", "séries", rules)[0].severity == "error"


def test_only_empty_and_placeholders_are_locked():
    assert {code for code, check in CHECKS.items() if check.locked} == {"empty", "placeholdersMissing", "placeholdersExtra"}
    assert {code for code, check in CHECKS.items() if check.level == "error"} == {
        "empty",
        "placeholdersMissing",
        "placeholdersExtra",
    }


# ---------- Approve ----------

def test_approve_refuses_qa_errors(setup):
    reviewer = setup["reviewer"]
    response = reviewer.patch(
        f"{BASE}/fr/strings/dashboard.sets_other", json={"value": "séries", "approved": True}
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Fix before approving: missing placeholders: {{count}}."
    # Nothing changed: not even the edit was saved.
    item = next(
        i for i in reviewer.get(f"{BASE}/fr/strings").json()["items"] if i["key"] == "dashboard.sets_other"
    )
    assert item["value"] == "{{count}} définit" and item["status"] == "machine_translated"


def test_edit_with_errors_can_be_saved_unapproved(setup):
    response = setup["reviewer"].patch(f"{BASE}/fr/strings/dashboard.sets_other", json={"value": "séries"})
    assert response.status_code == 200 and response.json()["status"] == "machine_translated"


def test_approving_a_broken_saved_edit_is_refused(setup):
    reviewer = setup["reviewer"]
    reviewer.patch(f"{BASE}/fr/strings/home.title", json={"value": "   "})
    assert reviewer.patch(f"{BASE}/fr/strings/home.title", json={"approved": True}).status_code == 422


def test_warnings_do_not_block(setup):
    response = setup["reviewer"].patch(f"{BASE}/fr/strings/home.title", json={"value": "Home", "approved": True})
    assert response.status_code == 200 and response.json()["status"] == "approved"


# ---------- Bulk approve ----------

def test_bulk_approve_skips_qa_errors_and_reports_them(setup):
    reviewer = setup["reviewer"]
    reviewer.patch(f"{BASE}/fr/strings/dashboard.sets_other", json={"value": "séries"})

    result = reviewer.post(
        f"{BASE}/fr/strings/approve", json={"keys": ["dashboard.sets_other", "home.title", "login.button"]}
    ).json()

    assert result["approved"] == 2
    assert result["skipped"] == [
        {
            "key": "dashboard.sets_other",
            "issues": [{"code": "placeholdersMissing", "severity": "error", "items": ["{{count}}"]}],
        }
    ]
    statuses = {i["key"]: i["status"] for i in reviewer.get(f"{BASE}/fr/strings").json()["items"]}
    assert statuses == {"dashboard.sets_other": "machine_translated", "home.title": "approved", "login.button": "approved"}
