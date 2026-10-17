# Changelog

What changes in each release of Stringherd. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Plans for the next releases are in the [roadmap](ROADMAP.md).

## [Unreleased]

## [1.0.0] - 2026-10-17

The first release: a complete review server for DeepL Sync that someone else can run locally. In use on [FitJournal](https://fit-journal.com), whose French went through Stringherd and is live.

### Added

**DeepL Sync contract**
- Push, export and project status endpoints, verified end to end against the DeepL CLI 2.0.0.
- API keys per project, stored as hashes, shown once and revocable, accepted in both forms DeepL Sync sends (`ApiKey` and `Bearer`).
- Push that is safe to repeat and to run in parallel: unchanged strings keep their review state, and only a new machine translation sends a string back to review.
- Export of delivered translations only.

**Source strings**
- Source upload: one request per catalog, with file and commit, detecting new, changed and removed keys. Approved translations go back to review when their English changes.
- An upload script for JSON catalogs (`scripts/upload-source.mjs`).

**Review**
- Sign-in for admins and reviewers, with secure session cookies, temporary passwords changed at first sign-in, and reviewers assigned per project and language.
- Project overview with progress per language.
- Review screen with a single key view and a list view; placeholders as locked chips; DeepL's suggestion with a word diff; approve and next; withdraw.
- Quality checks, enforced by the server too: an empty translation or a placeholder mismatch blocks approval; same as source, outer spaces, numbers, ending punctuation, double spaces and unbalanced brackets or quotes are warnings.
- Bulk approve and withdraw in the list view; strings with errors are skipped and reported.
- Deliver: approved strings become pullable only when a reviewer delivers the language. Delivered strings are locked; an admin can reopen one.
- Phrase-style keyboard shortcuts with an in-app reference ([docs/SHORTCUTS.md](docs/SHORTCUTS.md)), and non-printable characters on request.
- Languages shown by name and code, with the region on a line of its own.
- An interface ready for translation (react-i18next), with colors checked against WCAG AA.

**Administration**
- Projects with their languages, API keys and setup steps filled in with the project's values.
- People: roles, temporary passwords, deactivation and language assignments.

**Running it**
- One server for the API and the review interface, at one address.
- Docker Compose for local trial: `docker compose up` starts Stringherd with its own Postgres and Trailhead, a demo project, on port 8200.
- Operator commands: `create-admin`, `set-password`, `seed-demo` and `reset-language`.
- A script that captures the README screenshots from the demo (`npm run screenshots`).
- Documentation: the API reference ([docs/API.md](docs/API.md)), development and Docker setup ([docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)), and a walkthrough of the DeepL Sync loop in the README.
- MIT license.

[Unreleased]: https://github.com/leanardiles/stringherd/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/leanardiles/stringherd/releases/tag/v1.0.0
