import os

# Tests never touch the Supabase database. They use TEST_DATABASE_URL if set,
# otherwise an in-memory SQLite database. This must run before `app` is
# imported, because the engine is created at import time.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite+pysqlite:///:memory:")