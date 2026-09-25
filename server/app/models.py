from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint, func
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
    value: Mapped[str] = mapped_column(Text)
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

    key: Mapped[TranslationKey] = relationship(back_populates="translations")