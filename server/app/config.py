from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings read from environment variables (injected by `op run`)."""

    model_config = SettingsConfigDict(extra="ignore")

    database_url: str
    # Optional server-wide development key that opens every project. Leave unset on a shared or
    # hosted server: projects then accept only their own keys, created in Stringherd.
    tms_api_key: str | None = None

    # Browser sessions for people (reviewers and admins). Machines use tms_api_key instead.
    session_days: int = 7
    # Send the session cookie only over HTTPS. Keep False for http://localhost; set
    # COOKIE_SECURE=true when Stringherd is served over HTTPS (e.g. through the tunnel).
    cookie_secure: bool = False

    # The address repositories use to reach this server, shown on each project's setup page
    # (e.g. https://stringherd.example.com). Defaults to the address the admin's browser used.
    public_url: str | None = None

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
