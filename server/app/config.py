from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings read from environment variables (injected by `op run`)."""

    model_config = SettingsConfigDict(extra="ignore")

    database_url: str
    tms_api_key: str | None = None

    # Browser sessions for people (reviewers and admins). Machines use tms_api_key instead.
    session_days: int = 7
    # Send the session cookie only over HTTPS. Keep False for http://localhost; set
    # COOKIE_SECURE=true when Stringherd is served over HTTPS (e.g. through the tunnel).
    cookie_secure: bool = False

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        # Supabase hands out postgresql:// URLs. SQLAlchemy needs the driver
        # named explicitly to use psycopg 3 instead of the older psycopg2.
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
