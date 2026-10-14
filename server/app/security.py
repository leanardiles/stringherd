"""Sign-in for people: password hashing, sessions and the current-user dependency.

Machines (DeepL Sync, CI scripts) authenticate with project API keys in app/auth.py instead.
The two are deliberately separate: an API key never goes to a browser, and a person's
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
    """Sign a user out everywhere, e.g. after a password reset or deactivation."""
    db.execute(delete(UserSession).where(UserSession.user_id == user_id))


def end_other_sessions(db: Session, user_id: int, keep_token: str) -> None:
    """Sign a user out of every other browser, keeping the one making the request."""
    db.execute(
        delete(UserSession).where(UserSession.user_id == user_id, UserSession.token_hash != _hash_token(keep_token))
    )


def generate_temporary_password() -> str:
    """A random password for a new user or a reset. The user must replace it at first sign-in."""
    return secrets.token_urlsafe(12)  # 16 characters, about 96 bits


# ---------- Dependencies ----------

def signed_in_user(
    db: Annotated[Session, Depends(get_db)],
    stringherd_session: Annotated[str | None, Cookie()] = None,
) -> User:
    """The signed-in user, or 401, even if they still have to change a temporary password.

    Only the endpoints that let such a user finish signing in use this directly (who am I,
    change password). Everything else uses current_user.
    """
    unauthenticated = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")
    if not stringherd_session:
        raise unauthenticated
    session = db.scalar(select(UserSession).where(UserSession.token_hash == _hash_token(stringherd_session)))
    if session is None or _as_utc(session.expires_at) <= _now():
        raise unauthenticated
    if not session.user.is_active:
        raise unauthenticated
    return session.user


SignedInUser = Annotated[User, Depends(signed_in_user)]

PASSWORD_CHANGE_REQUIRED = "Choose a new password before continuing."


def current_user(user: SignedInUser) -> User:
    """The signed-in user, or 401; 403 while they still have a temporary password."""
    if user.must_change_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PASSWORD_CHANGE_REQUIRED)
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_admin(user: CurrentUser) -> User:
    from app.permissions import can_manage_users  # local import keeps the modules independent

    if not can_manage_users(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only.")
    return user


AdminUser = Annotated[User, Depends(require_admin)]
