"""Settings errors people actually run into get a readable message."""

import pytest

from app.config import MISSING_DATABASE_URL, get_settings


@pytest.fixture
def fresh_settings():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_missing_database_url_is_one_sentence(monkeypatch, fresh_settings):
    monkeypatch.delenv("DATABASE_URL")
    with pytest.raises(SystemExit) as stopped:
        get_settings()
    assert str(stopped.value) == MISSING_DATABASE_URL


def test_other_setting_errors_are_unchanged(monkeypatch, fresh_settings):
    monkeypatch.setenv("SESSION_DAYS", "not a number")
    with pytest.raises(Exception) as error:
        get_settings()
    assert not isinstance(error.value, SystemExit)
