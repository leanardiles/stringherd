"""Sign-in for people: password hashing, sessions and the current-user dependency.

Machines (DeepL Sync, CI scripts) authenticate with the TMS key in app/auth.py instead.
The two are deliberately separate: the TMS key never goes to a browser, and a person's
session never grants the machine endpoints.
"""

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import User, UserSession

SESSION_COOKIE = "stringherd_session"

_hasher = PasswordHasher()
# Used when the email is unknown, so a failed sign-in takes the same time either way
# and response timing does not reveal which emails have accounts.
_DUMMY_HASH = _hasher.hash("not-a-real-password")


# ---------- Passwords ----------

def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def authenticate(db: Session, email: str, password: str) -> User | None:
    """Return the user for valid credentials, or None. Same cost whether or not the email exists."""
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        verify_password(_DUMMY_HASH, password)
        return None
    if not verify_password(user.password_hash, password) or not user.is_active:
        return None
    return user


# ---------- Sessions ----------

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(UTC)


def _as_utc(moment: datetime) -> datetime:
    # SQLite returns naive datetimes; Postgres returns aware ones. Compare in UTC either way.
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def create_session(db: Session, user: User) -> str:
    """Start a session and return the raw token for the cookie. Only its hash is stored."""
    token = secrets.token_urlsafe(32)
    db.add(
        UserSession(
            token_hash=_hash_token(token),
            user_id=user.id,
            expires_at=_now() + timedelta(days=get_settings().session_days),
        )
    )
    user.last_login_at = _now()
    # Housekeeping: drop this user's expired sessions.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id, UserSession.expires_at < _now()))
    db.commit()
    return token


def end_session(db: Session, token: str) -> None:
    db.execute(delete(UserSession).where(UserSession.token_hash == _hash_token(token)))
    db.commit()


def end_all_sessions(db: Session, user_id: int) -> None:
    """Sign a user out everywhere, e.g. after a password change or deactivation."""
    db.execute(delete(UserSession).where(UserSession.user_id == user_id))


# ---------- Dependencies ----------

def current_user(
    db: Annotated[Session, Depends(get_db)],
    stringherd_session: Annotated[str | None, Cookie()] = None,
) -> User:
    """The signed-in user, or 401. Expired sessions and deactivated users are rejected."""
    unauthenticated = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")
    if not stringherd_session:
        raise unauthenticated
    session = db.scalar(select(UserSession).where(UserSession.token_hash == _hash_token(stringherd_session)))
    if session is None or _as_utc(session.expires_at) <= _now():
        raise unauthenticated
    if not session.user.is_active:
        raise unauthenticated
    return session.user


CurrentUser = Annotated[User, Depends(current_user)]


def require_admin(user: CurrentUser) -> User:
    from app.permissions import can_manage_users  # local import keeps the modules independent

    if not can_manage_users(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only.")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
