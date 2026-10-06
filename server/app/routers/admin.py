"""User administration: create users, change roles, assign projects and languages. Admins only."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Project, ReviewerAssignment, User, UserRole
from app.routers.auth import user_out
from app.schemas import AssignmentIn, UserCreate, UserOut, UserUpdate
from app.security import AdminUser, end_all_sessions, hash_password

router = APIRouter(prefix="/api/admin", tags=["administration"])

DbSession = Annotated[Session, Depends(get_db)]


def _get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(admin: AdminUser, db: DbSession) -> list[UserOut]:
    return [user_out(u) for u in db.scalars(select(User).order_by(User.name))]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, admin: AdminUser, db: DbSession) -> UserOut:
    """Create a user with a temporary password the admin shares with them."""
    user = User(
        email=body.email.lower(),
        name=body.name,
        role=UserRole(body.role),
        password_hash=hash_password(body.password),
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists.")
    db.refresh(user)
    return user_out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: Annotated[int, Path()], body: UserUpdate, admin: AdminUser, db: DbSession) -> UserOut:
    """Change name, role, active state or password. A password change or deactivation signs the user out."""
    user = _get_user(db, user_id)
    if user.id == admin.id and (body.role == "reviewer" or body.is_active is False):
        # Prevents locking yourself (and possibly everyone) out of administration.
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot demote or deactivate yourself.")
    if body.name is not None:
        user.name = body.name
    if body.role is not None:
        user.role = UserRole(body.role)
    if body.is_active is not None:
        user.is_active = body.is_active
        if not body.is_active:
            end_all_sessions(db, user.id)
    if body.password is not None:
        user.password_hash = hash_password(body.password)
        end_all_sessions(db, user.id)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.post("/users/{user_id}/assignments", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def add_assignment(user_id: Annotated[int, Path()], body: AssignmentIn, admin: AdminUser, db: DbSession) -> UserOut:
    """Let a user review one language of one project."""
    user = _get_user(db, user_id)
    project = db.scalar(select(Project).where(Project.slug == body.project_id))
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{body.project_id}' not found.")
    exists = db.scalar(
        select(ReviewerAssignment.id).where(
            ReviewerAssignment.user_id == user.id,
            ReviewerAssignment.project_id == project.id,
            ReviewerAssignment.locale == body.locale,
        )
    )
    if exists is None:
        db.add(ReviewerAssignment(user_id=user.id, project_id=project.id, locale=body.locale))
        db.commit()
    db.refresh(user)
    return user_out(user)


@router.delete("/users/{user_id}/assignments/{project_id}/{locale}", response_model=UserOut)
def remove_assignment(
    user_id: Annotated[int, Path()],
    project_id: Annotated[str, Path()],
    locale: Annotated[str, Path()],
    admin: AdminUser,
    db: DbSession,
) -> UserOut:
    user = _get_user(db, user_id)
    for assignment in list(user.assignments):
        if assignment.project.slug == project_id and assignment.locale == locale:
            db.delete(assignment)
    db.commit()
    db.refresh(user)
    return user_out(user)
