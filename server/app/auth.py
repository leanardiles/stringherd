"""Authentication for machines (DeepL Sync, CI scripts) calling the project endpoints.

Each project has its own keys, created in Stringherd. A key only opens its own project: the
project in the address must match the project the key belongs to.

TMS_API_KEY, if set, is a server-wide development key that opens every project. It is meant
for local development and should be left unset on a shared or hosted server.
"""

import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Project
from app.services.projects import find_active_key, get_project

ACCEPTED_SCHEMES = ("apikey", "bearer")
_CHALLENGE = {"WWW-Authenticate": "ApiKey, Bearer"}
# last_used_at is informational; writing it on every one of a push's hundreds of requests
# would only add contention, so it is refreshed at most once a minute.
_LAST_USED_RESOLUTION = timedelta(minutes=1)

ProjectSlug = Annotated[str, Path(alias="projectId", pattern=r"^[A-Za-z0-9._-]{1,100}$")]


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers=_CHALLENGE)


def _credential(authorization: str | None) -> str:
    """Accept `Authorization: ApiKey <key>` or `Bearer <key>`, the two forms DeepL Sync sends."""
    if not authorization:
        raise _unauthorized("Missing Authorization header. Send 'Authorization: ApiKey <key>' or 'Bearer <key>'.")
    scheme, _, credential = authorization.partition(" ")
    if scheme.lower() not in ACCEPTED_SCHEMES or not credential.strip():
        raise _unauthorized("Unsupported Authorization scheme. Use 'ApiKey <key>' or 'Bearer <key>'.")
    return credential.strip()


def _is_server_key(credential: str) -> bool:
    expected = get_settings().tms_api_key
    # compare_digest takes the same time whether the first or last character differs,
    # so response timing cannot be used to guess the key.
    return bool(expected) and secrets.compare_digest(credential.encode(), expected.encode())


def machine_project(
    project_slug: ProjectSlug,
    db: Annotated[Session, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
) -> Project:
    """The project named in the address, if the caller's key may use it.

    401: missing or unknown key. 403: a valid key for a different project.
    404: the project does not exist (projects are created in Stringherd before the first push).
    """
    credential = _credential(authorization)

    if not _is_server_key(credential):
        key = find_active_key(db, credential)
        if key is None:
            raise _unauthorized("Invalid API key.")
        if key.project.slug != project_slug:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This key belongs to project '{key.project.slug}', not '{project_slug}'.",
            )
        now = datetime.now(UTC)
        last = key.last_used_at
        if last is None or (last if last.tzinfo else last.replace(tzinfo=UTC)) < now - _LAST_USED_RESOLUTION:
            key.last_used_at = now
            db.commit()
        return key.project

    project = get_project(db, project_slug)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_slug}' not found. Create it in Stringherd before the first push.",
        )
    return project


MachineProject = Annotated[Project, Depends(machine_project)]
