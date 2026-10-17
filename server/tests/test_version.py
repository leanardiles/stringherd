"""The version number is written in several files; a release changes all of them together."""

import json
import tomllib
from pathlib import Path

from app.main import app

REPO = Path(__file__).resolve().parents[2]


def package_version(path: str) -> str:
    return json.loads((REPO / path).read_text(encoding="utf-8"))["version"]


def lock_versions(path: str) -> tuple[str, str]:
    """A lockfile records the project's own version twice: at the top and for the root package."""
    lock = json.loads((REPO / path).read_text(encoding="utf-8"))
    return lock["version"], lock["packages"][""]["version"]


def test_every_file_has_the_same_version():
    server = tomllib.loads((REPO / "server" / "pyproject.toml").read_text(encoding="utf-8"))["project"]["version"]
    versions = {
        "server/pyproject.toml": server,
        "server/app/main.py": app.version,
        "package.json": package_version("package.json"),
        "web/package.json": package_version("web/package.json"),
        "package-lock.json": lock_versions("package-lock.json"),
        "web/package-lock.json": lock_versions("web/package-lock.json"),
    }
    expected = {path: (server, server) if path.endswith("lock.json") else server for path in versions}
    assert versions == expected


def test_the_changelog_has_an_entry_for_this_version():
    changelog = (REPO / "CHANGELOG.md").read_text(encoding="utf-8")
    assert f"## [{app.version}]" in changelog
