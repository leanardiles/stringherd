# Changelog

What changes in each release of Stringherd. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/). Plans for the next releases are in the [roadmap](ROADMAP.md).

## [Unreleased]

### Added
- Hosting on Vercel: `vercel.json` runs the UI and the server as two services on one address, in Montreal next to the database. Through Supabase's transaction pooler (port 6543), the server keeps no connection pool and no prepared statements, as serverless functions need.

## [1.1.0] - 2026-11-09

Languages that already have translations join Stringherd without being retranslated. FitJournal's Dutch and Latin American Spanish came in this way, in November 2026.

### Added
- Importing a language's existing translations, server side: an admin adds a language with an answer (translate again, keep for review, keep as reviewed); during an import, pushes are stored as the repository's text and delivered at once, so the first pull records every key in the lockfile; Finish import closes it. Each translation records its origin, DeepL or the repository.
- Importing existing translations, admin screens: **Add language** opens a dialog with DeepL's languages, searchable by name or code, and asks what to do with the repository's translations; the language's row shows the commands to run, counts the strings that arrive per file and has **Finish import**.
- Importing existing translations, review screen: an origin filter (DeepL or the repository), the origin in tooltips, the editor's suggestion and the details panel, and imported strings shown as imported rather than delivered by someone.
- `remove-language`, an operator command that removes a language with its translations, assignments and delivery history.
- A quality warning when a placeholder touches a word where the source has a space, such as `{{count}}exercices`, which shows as "5exercices".

### Changed
- Strings not reviewed yet are labeled **To review** instead of MT, since imported strings are not machine translations.
- Languages imported for review show their progress as reviewed rather than delivered, on the admin page and in Your projects, since the code already has their text.
- The setup commands on a project's page run `deepl sync` without `--flag-for-review`, which only marks the local lockfile.
- `reset-language` puts imported strings back to the repository's text, the text they arrived with.
- The mark for a space is bold and darker when non-printable characters are shown, so a missing space stands out.

### Fixed
- The web tests failed under pytest 9.
- Approving an edit with Ctrl+Enter on a string the screen stays on (the last one, or the only one a search shows) saved the edit but showed the old text, which leaving the string then saved as an unapproved edit.
- The Deliver dialog no longer offers to deliver 0 strings; it explains that nothing is approved, counting an approved string with an unsaved edit as not approved.
- The docs said a language's first `deepl sync` overwrites the translations its files already have. It keeps them; only `--force` translates them again. The dry run's estimate before a language's first pull is a worst case, now documented.

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

[Unreleased]: https://github.com/leanardiles/stringherd/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/leanardiles/stringherd/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/leanardiles/stringherd/releases/tag/v1.0.0
