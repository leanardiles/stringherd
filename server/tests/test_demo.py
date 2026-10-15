"""The Trailhead demo data: right states for the review screen, same rules as real data."""

import pytest
from sqlalchemy import delete, func, select

from app import demo
from app.models import Delivery, Project, Translation, TranslationStatus
from app.services.qa import blocking, check_translation
from tests.conftest import AUTH, login

BASE = "/api/review/projects/trailhead/locales"


@pytest.fixture
def empty_db(db_session_factory):
    """The shared fixture creates two projects; seed-demo needs a database without any."""
    with db_session_factory() as db:
        db.execute(delete(Project))
        db.commit()
    return db_session_factory


@pytest.fixture
def seeded(empty_db):
    with empty_db() as db:
        demo.seed_demo(db)
    return empty_db


def statuses(factory, locale):
    with factory() as db:
        rows = db.execute(
            select(Translation.status, func.count()).where(Translation.locale == locale).group_by(Translation.status)
        ).all()
    return {status: count for status, count in rows}


def test_creates_one_project_in_two_languages(seeded):
    with seeded() as db:
        project = db.scalar(select(Project))
        assert (project.slug, project.source_locale, project.target_locales) == (
            "trailhead",
            "en",
            ["es-419", "fr"],
        )
        assert len(project.keys) == len(demo.SOURCE)
        assert all(key.source_text and key.source_file == demo.SOURCE_FILE for key in project.keys)


def test_french_has_a_review_session_behind_it(seeded):
    assert statuses(seeded, "fr") == {
        TranslationStatus.DELIVERED: len(demo.FR_DELIVERED),
        TranslationStatus.APPROVED: len(demo.FR_APPROVED),
        TranslationStatus.MACHINE_TRANSLATED: len(demo.SOURCE) - len(demo.FR_DELIVERED) - len(demo.FR_APPROVED),
    }
    with seeded() as db:
        assert db.scalar(select(func.count()).select_from(Delivery)) == 1


def test_spanish_is_all_still_to_review(seeded):
    assert statuses(seeded, "es-419") == {TranslationStatus.MACHINE_TRANSLATED: len(demo.SOURCE)}


def test_the_quality_checks_have_something_to_show():
    fr = demo.MACHINE["fr"]
    assert [i.code for i in blocking(check_translation(demo.SOURCE["auth.welcome"], fr["auth.welcome"]))] == [
        "placeholdersMissing"
    ]
    warnings = check_translation(demo.SOURCE["settings.saved"], fr["settings.saved"])
    assert [i.code for i in warnings] == ["endPunctuation"] and not blocking(warnings)
    # Everything else passes without errors, in both languages.
    for locale, values in demo.MACHINE.items():
        for key, value in values.items():
            if (locale, key) != ("fr", "auth.welcome"):
                assert not blocking(check_translation(demo.SOURCE[key], value)), (
                    locale,
                    key,
                )


def test_both_languages_cover_every_source_string():
    for values in demo.MACHINE.values():
        assert values.keys() == demo.SOURCE.keys()


def test_demo_people_can_sign_in_and_review(client, seeded):
    response = login(client, demo.REVIEWER_EMAIL, demo.DEMO_PASSWORD)
    assert response.status_code == 200
    assert response.json()["role"] == "reviewer"

    page = client.get(f"{BASE}/fr/strings").json()
    edited = next(item for item in page["items"] if item["key"] == "nav.trails")
    assert (edited["value"], edited["machine_translation"], edited["status"]) == (
        "Sentiers",
        "Pistes",
        "approved",
    )

    # The error string cannot be approved, like any other.
    refused = client.patch(f"{BASE}/fr/strings/auth.welcome", json={"approved": True})
    assert refused.status_code == 422

    client.post("/api/auth/logout")
    assert login(client, demo.ADMIN_EMAIL, demo.DEMO_PASSWORD).json()["role"] == "admin"


def test_pull_exports_only_the_delivered_french(client, seeded):
    exported = client.get("/api/projects/trailhead/keys/export?locale=fr", headers=AUTH).json()
    assert exported == {key: demo.MACHINE["fr"][key] for key in demo.FR_DELIVERED}
    assert client.get("/api/projects/trailhead/keys/export?locale=es-419", headers=AUTH).json() == {}


def test_only_fills_an_empty_database(seeded):
    with seeded() as db:
        with pytest.raises(demo.DatabaseNotEmptyError):
            demo.seed_demo(db)
        assert db.scalar(select(func.count()).select_from(Project)) == 1


def test_refuses_a_database_with_real_projects(db_session_factory):
    # The shared fixture's two projects stand in for real data.
    with db_session_factory() as db, pytest.raises(demo.DatabaseNotEmptyError):
        demo.seed_demo(db)
