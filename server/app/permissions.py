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


def can_deliver(db: Session, user: User, project: Project, locale: str) -> bool:
    """Make a language's approved strings pullable. Anyone who reviews it, for now; an admin
    sign-off step (workflows) would change only this function."""
    return can_review(db, user, project, locale)


def can_reopen(user: User, project: Project) -> bool:
    """Unlock a delivered string so it can be corrected."""
    return is_admin(user)


def can_manage_project(user: User, project: Project) -> bool:
    """Create projects, change their languages, issue and revoke keys."""
    return is_admin(user)


def projects_visible_to(db: Session, user: User) -> list[Project]:
    """Projects a user can see: all for admins, assigned ones for reviewers.

    Every "which projects" question goes through here, so an organization filter can be
    added in one place later.
    """
    query = select(Project).order_by(Project.name)
    if not is_admin(user):
        query = query.where(
            Project.id.in_(select(ReviewerAssignment.project_id).where(ReviewerAssignment.user_id == user.id))
        )
    return list(db.scalars(query))
