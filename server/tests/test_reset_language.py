"""reset-language: a language back to DeepL's machine translation, every string to review."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app import cli
from app.models import Delivery, Project, Translation, TranslationKey, TranslationStatus
from app.services.delivery import reset_language
from tests.conftest import AUTH

MT, APPROVED, DELIVERED = (
    TranslationStatus.MACHINE_TRANSLATED,
    TranslationStatus.APPROVED,
    TranslationStatus.DELIVERED,
)
NOW = datetime.now(UTC)


@pytest.fixture
def french(db_session_factory):
    """FitJournal's French in every state a review leaves behind, plus German that must not move."""
    rows = [
        # key, locale, value, pushed_value (DeepL), status, delivered_value
        ("a.delivered_edited", "fr", "Bonjour !", "Bonjour", DELIVERED, "Bonjour !"),
        ("b.approved", "fr", "Merci", "Merci", APPROVED, None),
        ("c.untouched", "fr", "Oui", "Oui", MT, None),
        ("d.edited_not_approved", "fr", "Non merci", "Non", MT, None),
        ("e.no_original", "fr", "Ancien", None, APPROVED, None),
        ("b.approved", "de", "Danke", "Danke", APPROVED, None),
    ]
    with db_session_factory() as db:
        project = db.scalar(select(Project).where(Project.slug == "fitjournal"))
        keys = {}
        for key, locale, value, pushed, status, delivered in rows:
            if key not in keys:
                keys[key] = TranslationKey(project_id=project.id, key_path=key, source_text=key)
                db.add(keys[key])
                db.flush()
            db.add(
                Translation(
                    key_id=keys[key].id,
                    locale=locale,
                    value=value,
                    pushed_value=pushed,
                    status=status,
                    approved_at=NOW if status != MT else None,
                    delivered_value=delivered,
                    delivered_at=NOW if delivered else None,
                )
            )
        db.add(Delivery(project_id=project.id, locale="fr", delivered_at=NOW, strings=1, not_approved=3))
        db.commit()
    return db_session_factory


def state(factory, locale="fr"):
    with factory() as db:
        rows = db.execute(
            select(TranslationKey.key_path, Translation)
            .join(Translation, Translation.key_id == TranslationKey.id)
            .where(Translation.locale == locale)
        ).all()
        return {key: (t.value, t.status, t.delivered_value, t.approved_at is not None) for key, t in rows}


def run(factory, apply):
    with factory() as db:
        project = db.scalar(select(Project).where(Project.slug == "fitjournal"))
        return reset_language(db, project, "fr", apply=apply)


def test_reports_what_would_change_without_changing_it(french):
    before = state(french)
    plan = run(french, apply=False)
    assert (plan.total, plan.delivered, plan.approved, plan.edited, plan.already_machine) == (5, 1, 1, 2, 1)
    assert plan.without_original == ["e.no_original"]
    assert plan.changing == 3
    assert state(french) == before


def test_puts_every_string_back_to_deepl_and_to_review(french):
    run(french, apply=True)
    assert state(french) == {
        "a.delivered_edited": ("Bonjour", MT, None, False),
        "b.approved": ("Merci", MT, None, False),
        "c.untouched": ("Oui", MT, None, False),
        "d.edited_not_approved": ("Non", MT, None, False),
        # No DeepL text on record: left exactly as it was.
        "e.no_original": ("Ancien", APPROVED, None, True),
    }


def test_leaves_other_languages_and_past_deliveries_alone(french):
    german = state(french, "de")
    run(french, apply=True)
    assert state(french, "de") == german
    with french() as db:
        assert db.scalar(select(func.count()).select_from(Delivery)) == 1


def test_nothing_is_pullable_until_the_next_deliver(client, french):
    assert client.get("/api/projects/fitjournal/keys/export?locale=fr", headers=AUTH).json() == {
        "a.delivered_edited": "Bonjour !"
    }
    run(french, apply=True)
    assert client.get("/api/projects/fitjournal/keys/export?locale=fr", headers=AUTH).json() == {}


def test_running_it_twice_changes_nothing_the_second_time(french):
    run(french, apply=True)
    assert run(french, apply=False).changing == 0


# ---------- The command ----------


def command(french, *, answer="fr", dry_run=False, project="fitjournal", locale="fr"):
    asked = []

    def confirm(prompt):
        asked.append(prompt)
        return answer

    result = cli.reset_language(project, locale, dry_run=dry_run, confirm=confirm, session_factory=french)
    return result, asked


def test_command_shows_the_plan_and_asks_before_changing(french, capsys):
    result, asked = command(french)
    shown = capsys.readouterr().out
    assert "Project fitjournal, language fr: 5 strings." in shown
    assert "1 delivered, 1 approved, 2 edited by a reviewer" in shown
    assert "left as they are: e.no_original" in shown
    assert "Reset: 3 strings go back to DeepL's text" in shown
    assert asked == ["Type fr to reset: "]
    assert result == "Done: 3 strings of fr are back to DeepL's text, to review."
    assert state(french)["a.delivered_edited"][1] == MT


def test_command_changes_nothing_without_the_language_code(french):
    before = state(french)
    result, _ = command(french, answer="yes")
    assert result == "Nothing changed."
    assert state(french) == before


def test_dry_run_never_asks(french):
    before = state(french)
    result, asked = command(french, dry_run=True)
    assert (result, asked) == ("Dry run: nothing changed.", [])
    assert state(french) == before


def test_unknown_project_or_language(french):
    assert command(french, project="nope")[0] == "No project nope. Nothing changed."
    assert command(french, locale="it")[0] == "Project fitjournal has no strings in it. Nothing changed."
