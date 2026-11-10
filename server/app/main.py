from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.routers import admin, admin_projects, auth, demo, review, source, tms
from app.security_headers import SecurityHeaders
from app.web import serve_ui

app = FastAPI(
    title="Stringherd",
    version="1.1.0",
    description="Open-source review server for DeepL Sync.",
)

# Security headers on every response. COOKIE_SECURE means the server is reached over HTTPS,
# which is when browsers should be told to insist on it.
app.add_middleware(SecurityHeaders, https=get_settings().cookie_secure)

app.include_router(tms.router)
app.include_router(source.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin_projects.router)
app.include_router(review.router)
app.include_router(demo.router)


# Uptime services check with HEAD unless told otherwise (UptimeRobot's free plan can't be),
# so HEAD gets the same answer without a body instead of 405.
@app.get("/health", tags=["meta"])
@app.head("/health", include_in_schema=False)
def health(db: Annotated[Session, Depends(get_db)]):
    """Liveness check that also confirms the database is reachable."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content={"status": "degraded", "database": "unreachable"},
        )
    return {"status": "ok", "database": "ok"}


# Last, so it only sees requests that no endpoint above claimed.
serve_ui(app, get_settings().web_dist)
