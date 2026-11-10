"""The hosted demo: one-click sign-in to the shared Trailhead accounts, and the scheduled reset.

Every endpoint here answers 404 unless DEMO_MODE is on, so on any other server they do not
exist. Design: docs/HOSTED-PLAN.md.
"""

import hmac
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.demo import DEMO_ACCOUNTS, RESET_HOURS_UTC, NotDemoDatabaseError, reset_demo
from app.models import User
from app.routers.auth import start_session, user_out
from app.schemas import UserOut

DbSession = Annotated[Session, Depends(get_db)]


def demo_only() -> None:
    if not get_settings().demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


router = APIRouter(prefix="/api/demo", tags=["demo"], dependencies=[Depends(demo_only)])


class DemoInfo(BaseModel):
    # When the demo resets, as HH:MM in UTC.
    resets_utc: list[str]


class DemoSignIn(BaseModel):
    role: Literal["reviewer", "admin"]


class DemoReset(BaseModel):
    strings: int
    languages: list[str]


@router.get("", response_model=DemoInfo)
def demo_info() -> DemoInfo:
    """Tells the UI it runs as the demo: it then shows the sign-in buttons and the banner."""
    return DemoInfo(resets_utc=[f"{hour:02d}:00" for hour in RESET_HOURS_UTC])


@router.post("/sign-in", response_model=UserOut)
def demo_sign_in(body: DemoSignIn, response: Response, db: DbSession) -> UserOut:
    """Sign in as the demo's reviewer or admin, without a password."""
    user = db.scalar(select(User).where(User.email == DEMO_ACCOUNTS[body.role], User.is_active.is_(True)))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The demo is being set up. Try again in a minute.",
        )
    start_session(response, db, user)
    return user_out(user)


@router.post("/reset", response_model=DemoReset)
def demo_reset(db: DbSession, authorization: Annotated[str | None, Header()] = None) -> DemoReset:
    """Empty the demo and load Trailhead again. Called by Vercel on a schedule, with the
    CRON_SECRET in the Authorization header; closed when the secret is not set."""
    secret = get_settings().cron_secret
    if not secret:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
    if not hmac.compare_digest((authorization or "").encode(), f"Bearer {secret}".encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not allowed.")
    try:
        summary = reset_demo(db)
    except NotDemoDatabaseError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This database does not hold the demo, so it was not reset.",
        ) from None
    return DemoReset(strings=summary.strings, languages=summary.languages)
