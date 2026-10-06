from pydantic import BaseModel, Field, field_validator

# Same limit DeepL Sync enforces when pulling, so an oversized value fails at push time
# with a clear message instead of breaking a later pull.
MAX_VALUE_BYTES = 64 * 1024
LOCALE_PATTERN = r"^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*$"


class PushTranslation(BaseModel):
    """Body of `PUT /api/projects/{projectId}/keys/{keyPath}`, as sent by `deepl sync push`."""

    locale: str = Field(pattern=LOCALE_PATTERN, max_length=35, examples=["de"])
    value: str = Field(examples=["Speichern"])


class PushResult(BaseModel):
    key: str
    locale: str
    status: str
    changed: bool


class LocaleCounts(BaseModel):
    machine_translated: int = 0
    approved: int = 0


class ProjectStatus(BaseModel):
    project_id: str
    keys: int
    locales: dict[str, LocaleCounts]

# ---------- Stringherd extension: source upload ----------

MAX_SOURCE_KEYS = 50_000  # same ceiling DeepL Sync applies to one pull


class SourceUpload(BaseModel):
    """Body of `PUT /api/projects/{projectId}/source`: a full snapshot of one catalog file."""

    locale: str = Field(pattern=LOCALE_PATTERN, max_length=35, examples=["en"])
    file: str | None = Field(
        default=None,
        max_length=500,
        description="Repo-relative path of the catalog, e.g. web-react/src/i18n/locales/en/common.json",
    )
    commit: str | None = Field(default=None, max_length=64, description="Commit the strings were read from")
    strings: dict[str, str] = Field(
        min_length=1,
        description="Flat map of key path to source text",
        examples=[{"login.title": "Sign in and log your next workout"}],
    )

    @field_validator("file")
    @classmethod
    def normalize_file(cls, value: str | None) -> str | None:
        # Windows paths arrive with backslashes; store one canonical form.
        if value is None:
            return None
        value = value.replace("\\", "/")
        while value.startswith("./"):
            value = value[2:]
        return value or None

    @field_validator("strings")
    @classmethod
    def check_strings(cls, value: dict[str, str]) -> dict[str, str]:
        if len(value) > MAX_SOURCE_KEYS:
            raise ValueError(f"At most {MAX_SOURCE_KEYS} keys per upload.")
        for key, text in value.items():
            if not key or len(key) > 500:
                raise ValueError(f"Key must be 1 to 500 characters: '{key[:50]}'")
            if "/" in key:
                raise ValueError(f"Keys containing '/' are not supported (DeepL Sync pull rejects them): '{key}'")
            if len(text.encode("utf-8")) > MAX_VALUE_BYTES:
                raise ValueError(f"Source text for '{key}' exceeds {MAX_VALUE_BYTES // 1024} KiB.")
        return value


class SourceUploadResult(BaseModel):
    project_id: str
    locale: str
    file: str | None
    created: int
    filled: int
    updated: int
    unchanged: int
    approvals_reset: int
    removed: list[str]
