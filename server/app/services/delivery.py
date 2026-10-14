"""Deliver: when reviewed strings become pullable, and what keeps them that way.

A reviewer approves strings during a session and can still change them. Deliver takes a
snapshot of the approved strings of one language; only that snapshot is exported to
`deepl sync pull`, and delivered strings are locked until an admin reopens them.

All the rules about delivered text live here, so the push, the source upload and the
review screen apply them the same way.
"""

from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Delivery, Project, Translation, TranslationKey, TranslationStatus, User


class NothingToDeliverError(Exception):
    """No approved strings in the language, so Deliver would send nothing."""


class NotDeliveredError(Exception):
    """Reopen was asked for a string that is not delivered."""


@dataclass
class DeliverySummary:
    delivered: int  # strings this Deliver sent
    not_approved: int  # strings of the language left as they were (not approved yet)
    delivered_at: datetime


def _language(project: Project, locale: str):
    """Translations of one project and language, as a subquery of ids."""
    return (
        select(Translation.id)
        .join(TranslationKey, Translation.key_id == TranslationKey.id)
        .where(TranslationKey.project_id == project.id, Translation.locale == locale)
    )


def deliver(db: Session, project: Project, locale: str, user: User) -> DeliverySummary:
    """Deliver every approved string of one language, whoever approved it.

    Strings that are not approved keep whatever they had: their last delivered text if they
    were reopened, or nothing, so `deepl sync pull` leaves them as they are in the repository.
    """
    ids = _language(project, locale)
    approved = db.scalar(
        select(func.count()).where(Translation.id.in_(ids), Translation.status == TranslationStatus.APPROVED)
    )
    if not approved:
        raise NothingToDeliverError()
    not_approved = db.scalar(
        select(func.count()).where(
            Translation.id.in_(ids), Translation.status == TranslationStatus.MACHINE_TRANSLATED
        )
    )
    now = datetime.now(UTC)
    db.execute(
        update(Translation)
        .where(Translation.id.in_(ids), Translation.status == TranslationStatus.APPROVED)
        .values(
            status=TranslationStatus.DELIVERED,
            delivered_value=Translation.value,
            delivered_at=now,
            delivered_by_id=user.id,
        )
        .execution_options(synchronize_session=False)
    )
    db.add(
        Delivery(
            project_id=project.id,
            locale=locale,
            delivered_by_id=user.id,
            delivered_at=now,
            strings=approved,
            not_approved=not_approved or 0,
        )
    )
    db.commit()
    return DeliverySummary(delivered=approved, not_approved=not_approved or 0, delivered_at=now)


def reopen(translation: Translation) -> None:
    """Unlock a delivered string so it can be corrected and delivered again.

    It goes back to approved, so it shows as finished work waiting for the next Deliver.
    Until then, pull keeps exporting the delivered text, which is what the code already has.
    """
    if translation.status != TranslationStatus.DELIVERED:
        raise NotDeliveredError()
    translation.status = TranslationStatus.APPROVED


def is_known_text(translation: Translation, value: str) -> bool:
    """Whether a pushed value is something Stringherd already has, so nothing new.

    After a pull the repository holds the delivered text; a later push sends it back. If a
    reviewer has edited a reopened string meanwhile, treating that text as new would
    overwrite the edit.
    """
    last_machine = translation.pushed_value if translation.pushed_value is not None else translation.value
    return value in (translation.value, last_machine) or (
        translation.delivered_value is not None and value == translation.delivered_value
    )


def reset_for_new_text(translation: Translation) -> None:
    """DeepL sent a new translation (the source changed): back to review, nothing delivered."""
    translation.status = TranslationStatus.MACHINE_TRANSLATED
    translation.approved_at = None
    translation.approved_by_id = None
    clear_delivery(translation)


def clear_delivery(translation: Translation) -> None:
    translation.delivered_value = None
    translation.delivered_at = None
    translation.delivered_by_id = None


def reset_for_source_change(db: Session, key_ids: list[int]) -> int:
    """The source text of these keys changed: their reviewed translations go back to review.

    Approved and delivered translations reopen, and every delivered text is dropped: it
    translates the old source, and pulling it would overwrite DeepL's new translation.
    Returns how many reviewed translations were sent back.
    """
    reviewed = (TranslationStatus.APPROVED, TranslationStatus.DELIVERED)
    result = db.execute(
        update(Translation)
        .where(Translation.key_id.in_(key_ids), Translation.status.in_(reviewed))
        .values(status=TranslationStatus.MACHINE_TRANSLATED, approved_at=None)
        .execution_options(synchronize_session=False)
    )
    db.execute(
        update(Translation)
        .where(Translation.key_id.in_(key_ids), Translation.delivered_value.is_not(None))
        .values(delivered_value=None, delivered_at=None, delivered_by_id=None)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount or 0


def last_deliveries(db: Session, project: Project) -> dict[str, datetime]:
    """When each language of a project was last delivered."""
    rows = db.execute(
        select(Delivery.locale, func.max(Delivery.delivered_at))
        .where(Delivery.project_id == project.id)
        .group_by(Delivery.locale)
    ).all()
    return {locale: at for locale, at in rows}
