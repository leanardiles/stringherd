"""Sign-in and sign-out for people, using a session cookie."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.demo import is_demo_account
from app.models import User
from app.schemas import AssignmentOut, LoginRequest, PasswordChange, UserOut
from app.security import (
    SESSION_COOKIE,
    SignedInUser,
    authenticate,
    create_session,
    end_other_sessions,
    end_session,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["sign-in"])

DbSession = Annotated[Session, Depends(get_db)]

DEMO_ACCOUNT_LOCKED = "This is a shared demo account, so it can't be changed."


def refuse_demo_account(user: User) -> None:
    """The hosted demo's two accounts stay as they are, so one visitor cannot lock out the next."""
    if is_demo_account(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=DEMO_ACCOUNT_LOCKED)


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value if hasattr(user.role, "value") else user.role,
        is_active=user.is_active,
        must_change_password=user.must_change_password,
        last_login_at=user.last_login_at,
        assignments=[AssignmentOut(project_id=a.project.slug, locale=a.locale) for a in user.assignments],
        demo_account=is_demo_account(user),
    )


def start_session(response: Response, db: Session, user: User) -> None:
    """Sign the browser in as this user: a new session, in an HttpOnly cookie."""
    token = create_session(db, user)
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(timedelta(days=settings.session_days).total_seconds()),
        httponly=True,  # JavaScript cannot read it
        samesite="lax",  # not sent on requests other sites trigger in the background
        secure=settings.cookie_secure,  # HTTPS only when enabled
        path="/",
    )


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: DbSession) -> UserOut:
    """Check email and password; on success set an HttpOnly session cookie."""
    user = authenticate(db, body.email, body.password)
    if user is None:
        # Same message for unknown email, wrong password or deactivated account.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.")
    start_session(response, db, user)
    return user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response, db: DbSession, stringherd_session: Annotated[str | None, Cookie()] = None
) -> None:
    """End this browser's session. Safe to call when already signed out."""
    if stringherd_session:
        end_session(db, stringherd_session)
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: SignedInUser) -> UserOut:
    """The signed-in user and their assignments.

    Works while a temporary password is still in place, so the UI can see
    `must_change_password` and show the change-password page.
    """
    return user_out(user)


@router.post("/password", response_model=UserOut)
def change_password(
    body: PasswordChange,
    user: SignedInUser,
    db: DbSession,
    stringherd_session: Annotated[str | None, Cookie()] = None,
) -> UserOut:
    """Replace your password. Required after a temporary one; signs out your other browsers."""
    refuse_demo_account(user)
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")
    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="The new password must differ from the current one."
        )
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    if stringherd_session:
        end_other_sessions(db, user.id, keep_token=stringherd_session)
    db.commit()
    db.refresh(user)
    return user_out(user)
