"""Sign-in and sign-out for people, using a session cookie."""

from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.schemas import AssignmentOut, LoginRequest, UserOut
from app.security import SESSION_COOKIE, CurrentUser, authenticate, create_session, end_session
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["sign-in"])

DbSession = Annotated[Session, Depends(get_db)]


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value if hasattr(user.role, "value") else user.role,
        is_active=user.is_active,
        assignments=[AssignmentOut(project_id=a.project.slug, locale=a.locale) for a in user.assignments],
    )


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, response: Response, db: DbSession) -> UserOut:
    """Check email and password; on success set an HttpOnly session cookie."""
    user = authenticate(db, body.email, body.password)
    if user is None:
        # Same message for unknown email, wrong password or deactivated account.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password.")
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
def me(user: CurrentUser) -> UserOut:
    """The signed-in user and their assignments."""
    return user_out(user)
