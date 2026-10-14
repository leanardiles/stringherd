"""Quality checks on one translation, the same rules the review screen applies.

Errors block approval; warnings only inform. The rules mirror web/src/lib/qa.ts, and both
are tested against shared/qa-cases.json, so the screen and the server cannot drift apart.

Each check has a code, a default level and whether it is locked. `qa_rules()` decides the
level per project and language; today it returns the defaults, and a QA profile set by an
admin plugs in there later. Locked checks stay errors whatever a profile says, because
they break the app rather than the wording.
"""

import re
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:  # keeps this module free of database imports
    from app.models import Project

Level = Literal["error", "warning", "off"]


@dataclass(frozen=True)
class Check:
    code: str
    level: Level  # default level
    locked: bool  # always an error, whatever a profile says
    message: str  # English, for API error details


# In the order issues are reported (also the order in shared/qa-cases.json).
CHECKS: dict[str, Check] = {
    check.code: check
    for check in [
        Check("empty", "error", True, "the translation is empty"),
        Check("placeholdersMissing", "error", True, "missing placeholders"),
        Check("placeholdersExtra", "error", True, "placeholders not in the source"),
        Check("sameAsSource", "warning", False, "same as the source"),
        Check("outerSpaces", "warning", False, "spaces at the start or end differ from the source"),
        Check("numbers", "warning", False, "numbers differ from the source"),
        Check("endPunctuation", "warning", False, "ending punctuation differs from the source"),
        Check("doubleSpaces", "warning", False, "double spaces"),
        Check("unbalanced", "warning", False, "unbalanced brackets or quotes"),
    ]
}


@dataclass
class QaIssue:
    code: str
    severity: Literal["error", "warning"]
    items: list[str] = field(default_factory=list)

    def describe(self) -> str:
        text = CHECKS[self.code].message
        return f"{text}: {' '.join(self.items)}" if self.items else text


def qa_rules(project: "Project | None" = None, locale: str | None = None) -> dict[str, Level]:
    """The level of each check for one project and language. Defaults until QA profiles exist."""
    return {code: check.level for code, check in CHECKS.items()}


# ---------- Text helpers (keep in step with web/src/lib/placeholders.ts and qa.ts) ----------

# {{count}} {{count, number}} $t(key) <0>…</0> <1/> <strong> %s %d %@ %1$s {name}
PLACEHOLDER = re.compile(r"\{\{[^{}]+\}\}|\$t\([^)]*\)|</?[A-Za-z0-9]+\s*/?>|%(?:\d+\$)?[sd@]|\{[A-Za-z_]\w*\}")
TAG = re.compile(r"</?[A-Za-z0-9]+\s*/?>")
# JavaScript's \s also matches U+FEFF; Python's does not.
SPACE = r"[\s﻿]"
LETTERS = re.compile(r"[^\W\d_]{2,}")
# A number, with thousands or decimal separators: 1,000  1.000  1 000 (no-break spaces)  12.5
NUMBER = re.compile(r"\d+(?:[.,'  ]\d+| \d{3}(?!\d))*")
# Ending punctuation and its equivalents in other scripts.
ENDINGS = {".": ".", "?": "?", "!": "!", ":": ":", "…": "…", "。": ".", "？": "?", "！": "!", "：": ":", "؟": "?"}
PAIRS = [("(", ")"), ("[", "]"), ("{", "}"), ("«", "»")]
EVEN_QUOTES = ['"', "“”„"]  # straight quotes, and curly double quotes in any style (“…” „…“ „…”)


def find_placeholders(text: str) -> list[str]:
    return PLACEHOLDER.findall(text)


def _difference(a: list[str], b: list[str]) -> list[str]:
    """Items of `a` not matched one-for-one in `b` (multiset difference, order-insensitive)."""
    remaining = list(b)
    out = []
    for item in a:
        if item in remaining:
            remaining.remove(item)
        else:
            out.append(item)
    return out


def _outer_spaces(text: str) -> tuple[str, str]:
    lead = re.match(f"^{SPACE}*", text).group(0)
    trail = re.search(f"{SPACE}*$", text).group(0)
    return lead, trail


def _numbers(text: str) -> list[str]:
    return NUMBER.findall(PLACEHOLDER.sub(" ", text))


def _digits(number: str) -> str:
    return re.sub(r"\D", "", number)


def _ending(text: str) -> str | None:
    """The ending punctuation of a text, ignoring trailing tags and spaces; "..." counts as "…"."""
    stripped = re.sub(f"(?:{TAG.pattern}|{SPACE})+$", "", text)
    if stripped.endswith("..."):
        return "…"
    return ENDINGS.get(stripped[-1:]) if stripped else None


def _balanced(text: str) -> bool:
    text = PLACEHOLDER.sub(" ", text)
    for opener, closer in PAIRS:
        depth = 0
        for char in text:
            if char == opener:
                depth += 1
            elif char == closer:
                depth -= 1
                if depth < 0:
                    return False
        if depth:
            return False
    return all(sum(text.count(q) for q in quotes) % 2 == 0 for quotes in EVEN_QUOTES)


# ---------- The checks ----------

def check_translation(source: str | None, target: str, rules: dict[str, Level] | None = None) -> list[QaIssue]:
    """Issues in one translation, in a fixed order. Without a source only emptiness is checked."""
    rules = rules or qa_rules()
    found: list[tuple[str, list[str]]] = []

    if re.fullmatch(f"{SPACE}*", target):
        found.append(("empty", []))
    elif source is not None:
        missing = _difference(find_placeholders(source), find_placeholders(target))
        extra = _difference(find_placeholders(target), find_placeholders(source))
        if missing:
            found.append(("placeholdersMissing", missing))
        if extra:
            found.append(("placeholdersExtra", extra))
        # Identical text is often fine (brand names, "OK"), so it only warns, and only for real words.
        if target == source and LETTERS.search(PLACEHOLDER.sub(" ", source)):
            found.append(("sameAsSource", []))
        if _outer_spaces(source) != _outer_spaces(target):
            found.append(("outerSpaces", []))
        # Compared by digits only, so 1,000 and 1 000 or 12.5 and 12,5 count as the same number.
        numbers = _number_items(_numbers(source), _numbers(target))
        if numbers:
            found.append(("numbers", numbers))
        if _ending(source) != _ending(target):
            found.append(("endPunctuation", []))
        if "  " in target and "  " not in source:
            found.append(("doubleSpaces", []))
        if _balanced(source) and not _balanced(target):
            found.append(("unbalanced", []))

    issues = []
    for code, items in found:
        check = CHECKS[code]
        level = "error" if check.locked else rules.get(code, check.level)
        if level != "off":
            issues.append(QaIssue(code=code, severity=level, items=items))
    return issues


def _number_items(source_numbers: list[str], target_numbers: list[str]) -> list[str]:
    """The numbers that do not match: source numbers missing from the target, then extra ones."""
    source_digits = [_digits(n) for n in source_numbers]
    target_digits = [_digits(n) for n in target_numbers]
    missing = _difference(source_digits, target_digits)
    extra = _difference(target_digits, source_digits)
    items: list[str] = []
    for numbers, wanted in ((source_numbers, missing), (target_numbers, extra)):
        wanted = list(wanted)
        for number in numbers:
            if _digits(number) in wanted:
                wanted.remove(_digits(number))
                items.append(number)
    return items


def blocking(issues: list[QaIssue]) -> list[QaIssue]:
    return [issue for issue in issues if issue.severity == "error"]
