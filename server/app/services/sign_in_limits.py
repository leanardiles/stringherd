"""Limits on failed password sign-ins, so passwords cannot be tried endlessly.

Every failed attempt is recorded with the email typed and the network address it came from.
Within any 15 minutes:

- 5 failures for one email lock that email's sign-in, so one account's password cannot be
  guessed by trying many;
- 20 failures from one address lock sign-ins from that address, so many accounts cannot be
  tried a few times each.

A lock lifts as the failures age out of the 15 minutes, so at most 15 minutes after the last
one. Refused attempts are not recorded, or a lock could never lift. A successful sign-in
clears that email's failures, and failures older than a day are deleted as new ones arrive.
Kept in the database because serverless functions keep nothing in memory between requests.
"""

import math
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import SignInFailure

ACCOUNT_LIMIT = 5
ADDRESS_LIMIT = 20
WINDOW = timedelta(minutes=15)
KEEP = timedelta(days=1)


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(moment: datetime) -> datetime:
    # SQLite returns naive datetimes; Postgres returns aware ones. Compare in UTC either way.
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def _normalize(email: str) -> str:
    return email.strip().lower()


def _wait_for(db: Session, column, value: str, limit: int, now: datetime) -> timedelta | None:
    """How long until fewer than `limit` failures for this value fall within the window."""
    recent = db.scalars(
        select(SignInFailure.created_at)
        .where(column == value, SignInFailure.created_at > now - WINDOW)
        .order_by(SignInFailure.created_at.desc())
        .limit(limit)
    ).all()
    if len(recent) < limit:
        return None
    # The lock lifts when the oldest of the last `limit` failures leaves the window.
    return _as_utc(recent[-1]) + WINDOW - now


def locked_for(db: Session, email: str, address: str | None) -> int | None:
    """Minutes until this email, or this address, may try again; None when it may now."""
    now = _now()
    waits = [_wait_for(db, SignInFailure.email, _normalize(email), ACCOUNT_LIMIT, now)]
    if address:
        waits.append(_wait_for(db, SignInFailure.address, address, ADDRESS_LIMIT, now))
    longest = max((wait for wait in waits if wait is not None), default=None)
    if longest is None:
        return None
    return max(1, math.ceil(longest.total_seconds() / 60))


def record_failure(db: Session, email: str, address: str | None) -> None:
    now = _now()
    db.execute(delete(SignInFailure).where(SignInFailure.created_at < now - KEEP))
    db.add(SignInFailure(email=_normalize(email), address=address, created_at=now))
    db.commit()


def clear(db: Session, email: str) -> None:
    """After a successful sign-in: that email starts again from zero."""
    db.execute(delete(SignInFailure).where(SignInFailure.email == _normalize(email)))
    db.commit()
