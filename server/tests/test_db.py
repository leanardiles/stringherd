"""How Stringherd connects, depending on the database address."""

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool, QueuePool

from app.db import engine_options

SESSION_POOLER = "postgresql+psycopg://postgres.abc:secret@aws-1-ca-central-1.pooler.supabase.com:5432/postgres"
TRANSACTION_POOLER = "postgresql+psycopg://postgres.abc:secret@aws-1-ca-central-1.pooler.supabase.com:6543/postgres"
LOCAL = "postgresql+psycopg://sh:sh@localhost/stringherd"


def test_the_transaction_pooler_gets_no_pool_and_no_prepared_statements():
    options = engine_options(TRANSACTION_POOLER)
    assert options == {"poolclass": NullPool, "connect_args": {"prepare_threshold": None}}
    # Creating the engine does not connect, so this checks the options are valid together.
    assert isinstance(create_engine(TRANSACTION_POOLER, **options).pool, NullPool)


def test_other_addresses_keep_a_checked_pool():
    for url in (SESSION_POOLER, LOCAL):
        options = engine_options(url)
        assert options == {"pool_pre_ping": True}
        assert isinstance(create_engine(url, **options).pool, QueuePool)
