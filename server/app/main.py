from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db
from app.routers import tms

app = FastAPI(
    title="Stringherd",
    version="0.1.0",
    description="Open-source review server for DeepL Sync.",
)

app.include_router(tms.router)


@app.get("/health", tags=["meta"])
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