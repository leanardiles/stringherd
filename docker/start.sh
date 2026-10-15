#!/bin/sh
# What the Stringherd container runs when it starts (see the Dockerfile).
# Stops at the first failure: the server never starts on a half-migrated database.
set -e

# Bring the database up to date. Does nothing when it already is, so every restart is safe.
alembic upgrade head

# Demo data only when asked for: docker-compose.yml sets this for the local trial. Someone
# self-hosting starts with an empty database too, and must not get demo accounts.
if [ "$STRINGHERD_SEED_DEMO" = "true" ]; then
  python -m app.cli seed-demo
fi

# exec hands the process over to the server, so the stop signal from Docker reaches it
# directly and it shuts down at once. 0.0.0.0: inside a container, 127.0.0.1 would only
# accept connections from the container itself; docker-compose.yml decides what reaches it.
exec uvicorn app.main:app --host 0.0.0.0 --port 8100
