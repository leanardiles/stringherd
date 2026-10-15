# Stringherd as one container: the server with the built review UI, for trying it locally and
# for self-hosting. Used by docker-compose.yml, which adds the database. See docs/DEVELOPMENT.md.

# ---------- Stage 1: build the review UI ----------
# Only its output (web/dist) is kept; Node and the build tools never reach the final image.
FROM node:24-slim AS web
WORKDIR /repo/web

# Dependencies first, on their own layer: changing UI code does not reinstall them.
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
# The build type-checks the tests too, and the QA test reads the cases it shares with the
# server from here, the same relative place as in the repository.
COPY shared/ /repo/shared/
RUN npm run build

# ---------- Stage 2: the server, which is what runs ----------
FROM python:3.13-slim

# Logs reach `docker compose logs` at once instead of waiting in a buffer; no .pyc files
# written at run time.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/server
COPY server/pyproject.toml ./
COPY server/app ./app
RUN pip install --no-cache-dir .

# What the server needs at run time besides its code: the migrations, the built UI and the
# start-up script.
COPY server/alembic.ini ./
COPY server/migrations ./migrations
COPY --from=web /repo/web/dist /app/web/dist
ENV WEB_DIST=/app/web/dist
COPY docker/start.sh /app/start.sh

# Run as an ordinary user, not root.
RUN useradd --create-home stringherd
USER stringherd

EXPOSE 8100
# Run with sh rather than as an executable: Windows checkouts do not keep the execute flag.
CMD ["sh", "/app/start.sh"]
