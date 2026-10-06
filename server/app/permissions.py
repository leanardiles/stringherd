"""Every permission decision lives here, one small function per question.

Endpoints ask these functions and never check roles themselves, so changing a rule
(e.g. "admins no longer review by default") is a one-line change in one place.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Project, ReviewerAssignment, User, UserRole


def is_admin(user: User) -> bool:
    return user.role == UserRole.ADMIN


def can_manage_users(user: User) -> bool:
    """Create users, change roles, assign languages."""
    return is_admin(user)


def can_review(db: Session, user: User, project: Project, locale: str) -> bool:
    """View, edit and approve translations of one project and language."""
    if is_admin(user):
        return True  # admins review any language; remove this line to require assignments for admins too
    return (
        db.scalar(
            select(ReviewerAssignment.id).where(
                ReviewerAssignment.user_id == user.id,
                ReviewerAssignment.project_id == project.id,
                ReviewerAssignment.locale == locale,
            )
        )
        is not None
    )


def reviewable_locales(db: Session, user: User, project: Project) -> set[str] | None:
    """The languages a user may review in a project; None means all of them."""
    if is_admin(user):
        return None
    return set(
        db.scalars(
            select(ReviewerAssignment.locale).where(
                ReviewerAssignment.user_id == user.id, ReviewerAssignment.project_id == project.id
            )
        )
    )
