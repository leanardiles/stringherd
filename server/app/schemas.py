import re
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

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
    approved: int = 0  # approved, waiting for Deliver
    delivered: int = 0  # delivered: what deepl sync pull exports


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


# ---------- People: sign-in, users, assignments ----------

ROLE_PATTERN = r"^(admin|reviewer)$"
MIN_PASSWORD_LENGTH = 12


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=1024)


class AssignmentOut(BaseModel):
    project_id: str
    locale: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None
    assignments: list[AssignmentOut]


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(default="reviewer", pattern=ROLE_PATTERN)
    password: str | None = Field(
        default=None,
        min_length=MIN_PASSWORD_LENGTH,
        max_length=1024,
        description="Temporary password. Leave out to have Stringherd generate one.",
    )


class UserCreated(UserOut):
    """The new user, plus the temporary password when Stringherd generated it (shown once)."""

    temporary_password: str | None


class TemporaryPassword(BaseModel):
    temporary_password: str


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    new_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=1024)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = Field(default=None, pattern=ROLE_PATTERN)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=MIN_PASSWORD_LENGTH, max_length=1024)


class AssignmentIn(BaseModel):
    project_id: str = Field(pattern=r"^[A-Za-z0-9._-]{1,100}$", examples=["fitjournal"])
    locale: str = Field(pattern=LOCALE_PATTERN, max_length=35, examples=["fr"])


# ---------- Review ----------

class ReviewLocale(BaseModel):
    locale: str
    total: int
    machine_translated: int
    approved: int  # approved in the current session, waiting for Deliver
    delivered: int
    last_delivered_at: datetime | None


class ReviewProject(BaseModel):
    project_id: str
    name: str
    source_locale: str | None
    locales: list[ReviewLocale]


class ReviewString(BaseModel):
    key: str
    source_text: str | None
    source_file: str | None
    value: str
    machine_translation: str | None  # what DeepL last delivered (pushed_value)
    status: str  # machine_translated, approved or delivered
    updated_at: datetime | None
    approved_at: datetime | None
    approved_by: str | None  # name of the approver
    delivered_value: str | None  # what the repository gets on pull; differs from value only after a reopen
    delivered_at: datetime | None
    delivered_by: str | None


class ReviewStringPage(BaseModel):
    project_id: str
    locale: str
    total: int
    items: list[ReviewString]


class ReviewEdit(BaseModel):
    """Edit and/or approve one translation. Editing without approving leaves it unapproved."""

    value: str | None = None
    approved: bool | None = None

    @field_validator("value")
    @classmethod
    def check_size(cls, value: str | None) -> str | None:
        if value is not None and len(value.encode("utf-8")) > MAX_VALUE_BYTES:
            raise ValueError(f"Value exceeds {MAX_VALUE_BYTES // 1024} KiB.")
        return value


class BulkApprove(BaseModel):
    keys: list[str] = Field(min_length=1, max_length=MAX_SOURCE_KEYS)


class BulkApproveResult(BaseModel):
    approved: int
    already_approved: int  # approved or delivered already
    not_found: list[str]


class DeliveryResult(BaseModel):
    """What one Deliver sent. Strings that were not approved keep their current text in the repository."""

    locale: str
    delivered: int
    not_approved: int
    delivered_at: datetime


# ---------- Projects (administration) ----------

SLUG_PATTERN = r"^[A-Za-z0-9._-]{1,100}$"


class ProjectCreate(BaseModel):
    project_id: str = Field(pattern=SLUG_PATTERN, examples=["fitjournal"], description="The project_id in .deepl-sync.yaml")
    name: str = Field(min_length=1, max_length=200, examples=["FitJournal"])
    source_locale: str = Field(pattern=LOCALE_PATTERN, max_length=35, examples=["en"])
    target_locales: list[str] = Field(default_factory=list, max_length=100, examples=[["fr", "es"]])

    @field_validator("target_locales")
    @classmethod
    def check_locales(cls, value: list[str]) -> list[str]:
        for locale in value:
            if not re.fullmatch(LOCALE_PATTERN, locale) or len(locale) > 35:
                raise ValueError(f"'{locale}' is not a valid language code.")
        return list(dict.fromkeys(value))


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    source_locale: str | None = Field(default=None, pattern=LOCALE_PATTERN, max_length=35)


class LocaleIn(BaseModel):
    locale: str = Field(pattern=LOCALE_PATTERN, max_length=35, examples=["es"])


class ReviewerRef(BaseModel):
    id: int
    name: str


class ProjectLocaleOut(BaseModel):
    locale: str
    total: int
    approved: int  # waiting for Deliver
    delivered: int
    last_delivered_at: datetime | None
    reviewers: list[ReviewerRef]


class ApiKeyOut(BaseModel):
    id: int
    label: str
    prefix: str
    created_at: datetime | None
    created_by: str | None
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiKeyCreate(BaseModel):
    label: str = Field(default="Default", min_length=1, max_length=100, examples=["GitHub Actions"])


class ApiKeyIssued(ApiKeyOut):
    """The new key. `key` is shown only in this response; Stringherd stores just its hash."""

    key: str


class ProjectAdminOut(BaseModel):
    project_id: str
    name: str
    source_locale: str | None
    target_locales: list[str]
    strings: int
    locales: list[ProjectLocaleOut]
    active_keys: int
    created_at: datetime | None


class ProjectAdminDetail(ProjectAdminOut):
    api_keys: list[ApiKeyOut]


class ProjectSetup(BaseModel):
    """What a repository needs to connect to this project, ready to copy."""

    server_url: str
    project_id: str
    deepl_sync_yaml: str
    commands: str
