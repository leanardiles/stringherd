from pydantic import BaseModel, Field

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