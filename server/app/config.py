from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError, field_validator
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

    # The built review UI (npm run build in web/), served by this server at the same address.
    # Defaults to web/dist in the repository. Without a build the server runs the API only, which
    # is also how a host that serves the UI itself (such as a CDN) runs it. WEB_DIST= turns it off.
    web_dist: Path | None = Path(__file__).resolve().parents[2] / "web" / "dist"

    @field_validator("web_dist", mode="before")
    @classmethod
    def empty_means_none(cls, value: object) -> object:
        # An empty WEB_DIST would otherwise become Path(""), the current directory.
        return None if value == "" else value

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        # Supabase hands out postgresql:// URLs. SQLAlchemy needs the driver
        # named explicitly to use psycopg 3 instead of the older psycopg2.
        for prefix in ("postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value[len(prefix):]
        return value


MISSING_DATABASE_URL = (
    "DATABASE_URL is not set: Stringherd needs the address of its Postgres database. "
    "Locally, run the command through op run (see docs/DEVELOPMENT.md); in Docker, docker-compose.yml sets it."
)


@lru_cache
def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as error:
        # The usual first-run mistake; one sentence instead of a validation traceback.
        if any(e["loc"] == ("database_url",) and e["type"] == "missing" for e in error.errors()):
            raise SystemExit(MISSING_DATABASE_URL) from None
        raise
