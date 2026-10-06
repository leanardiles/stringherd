"""Stringherd extension: source string upload.

The DeepL Sync contract never sends the source text, only translations. A review screen
needs both, so the project's own CI (or a script) uploads the source strings here.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.orm import Session

from app.auth import require_api_key
from app.db import get_db
from app.schemas import SourceUpload, SourceUploadResult
from app.services.source import (
    SourceConflictError,
    SourceLocaleMismatchError,
    store_source_strings,
)

router = APIRouter(prefix="/api/projects", tags=["stringherd extensions"], dependencies=[Depends(require_api_key)])

DbSession = Annotated[Session, Depends(get_db)]
ProjectSlug = Annotated[str, Path(alias="projectId", pattern=r"^[A-Za-z0-9._-]{1,100}$")]


@router.put("/{projectId}/source", response_model=SourceUploadResult)
def upload_source(project_slug: ProjectSlug, body: SourceUpload, db: DbSession) -> SourceUploadResult:
    """Upload a full snapshot of source strings for one catalog file.

    Send every source string each time: Stringherd compares with what it has and reports
    what was created, filled, updated, unchanged or removed. When a source string changes,
    approved translations of that key go back to review.
    """
    try:
        summary = store_source_strings(
            db,
            project_slug=project_slug,
            locale=body.locale,
            strings=body.strings,
            file=body.file,
            commit=body.commit,
        )
    except SourceLocaleMismatchError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This project's source locale is '{exc.expected}'; the upload uses '{exc.received}'.",
        ) from exc
    except SourceConflictError as exc:
        db.rollback()
        shown = dict(list(exc.conflicts.items())[:20])
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    f"{len(exc.conflicts)} key(s) already come from a different file. DeepL Sync cannot tell "
                    "files apart, so files that share key names need separate Stringherd projects."
                ),
                "conflicts": shown,
            },
        ) from exc

    return SourceUploadResult(
        project_id=project_slug,
        locale=body.locale,
        file=body.file,
        created=summary.created,
        filled=summary.filled,
        updated=summary.updated,
        unchanged=summary.unchanged,
        approvals_reset=summary.approvals_reset,
        removed=summary.removed,
    )
