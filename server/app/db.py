from collections.abc import Iterator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings

# Supabase's transaction pooler (Supavisor) listens on this port. Serverless hosts such as
# Vercel connect through it, because each function instance opens its own short connections.
TRANSACTION_POOLER_PORT = 6543


class Base(DeclarativeBase):
    """Base class for all ORM models. Alembic reads Base.metadata."""


def engine_options(url: str) -> dict[str, Any]:
    """How to connect, from the database address.

    Through the transaction pooler, the pooler keeps the connections: Stringherd keeps none
    between requests (NullPool), and psycopg does not prepare statements, which a transaction
    pooler cannot carry from one transaction to the next. Anywhere else (local Postgres, Docker,
    Supabase's session pooler) Stringherd keeps its own pool, checking a connection before use
    because the pooler may have closed an idle one.
    """
    if make_url(url).port == TRANSACTION_POOLER_PORT:
        return {"poolclass": NullPool, "connect_args": {"prepare_threshold": None}}
    return {"pool_pre_ping": True}


_url = get_settings().database_url
engine = create_engine(_url, **engine_options(_url))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed afterwards."""
    with SessionLocal() as session:
        yield session
