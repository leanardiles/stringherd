from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TranslationStatus(StrEnum):
    MACHINE_TRANSLATED = "machine_translated"
    APPROVED = "approved"


class Project(Base):
    """One localized codebase. `slug` is the project_id used by DeepL Sync."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    # Locale of the source strings (e.g. "en"), set by the first source upload.
    source_locale: Mapped[str | None] = mapped_column(String(35))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    keys: Mapped[list["TranslationKey"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class TranslationKey(Base):
    """One i18n key path within a project, e.g. `settings.actions.save`."""

    __tablename__ = "translation_keys"
    __table_args__ = (UniqueConstraint("project_id", "key_path"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    key_path: Mapped[str] = mapped_column(String(500))
    # DeepL Sync push does not send source text; filled by a later extension endpoint.
    source_text: Mapped[str | None] = mapped_column(Text)
    # Repo-relative path of the catalog the source string came from, e.g.
    # "web-react/src/i18n/locales/en/common.json". Informational only: not part of the
    # key's identity (keys stay unique per project), because the DeepL Sync contract has
    # no notion of files. Used for reviewer context, links to the source and detecting
    # the same key arriving from two different files.
    source_file: Mapped[str | None] = mapped_column(String(500))
    # Commit the current source_text was uploaded from, when the uploader provides it.
    source_commit: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    project: Mapped[Project] = relationship(back_populates="keys")
    translations: Mapped[list["Translation"]] = relationship(back_populates="key", cascade="all, delete-orphan")


class Translation(Base):
    """The translation of one key into one locale, with its review status."""

    __tablename__ = "translations"
    __table_args__ = (
        UniqueConstraint("key_id", "locale"),
        CheckConstraint("status IN ('machine_translated', 'approved')", name="ck_translations_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    key_id: Mapped[int] = mapped_column(ForeignKey("translation_keys.id", ondelete="CASCADE"))
    locale: Mapped[str] = mapped_column(String(35))
    # Current text: DeepL's machine translation, or a reviewer's edit of it.
    value: Mapped[str] = mapped_column(Text)
    # The last value DeepL Sync delivered (push). A push only reopens a translation when it
    # differs from this, i.e. when DeepL produced something new because the source changed,
    # so a reviewer's edit is never overwritten by a re-push of the old machine translation.
    pushed_value: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TranslationStatus] = mapped_column(
        Enum(
            TranslationStatus,
            native_enum=False,
            length=32,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=TranslationStatus.MACHINE_TRANSLATED,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Who approved the current value. Kept (as NULL) if that user is deleted.
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    key: Mapped[TranslationKey] = relationship(back_populates="translations")
    approved_by: Mapped["User | None"] = relationship()


class UserRole(StrEnum):
    ADMIN = "admin"
    REVIEWER = "reviewer"


class User(Base):
    """A person who signs in to the review screen. Machines (CI, DeepL Sync) use the TMS key instead."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin', 'reviewer')", name="ck_users_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)  # stored lowercase
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e])
    )
    password_hash: Mapped[str] = mapped_column(String(255))  # Argon2; never the password itself
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    assignments: Mapped[list["ReviewerAssignment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class ReviewerAssignment(Base):
    """Which project and language a user reviews, e.g. (Leandro, fitjournal, fr)."""

    __tablename__ = "reviewer_assignments"
    __table_args__ = (UniqueConstraint("user_id", "project_id", "locale"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    locale: Mapped[str] = mapped_column(String(35))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="assignments")
    project: Mapped[Project] = relationship()


class UserSession(Base):
    """A signed-in browser. The cookie holds a random token; only its SHA-256 hash is stored,
    so a leaked database cannot be used to hijack sessions."""

    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()
