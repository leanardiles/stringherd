# Roadmap

Where Stringherd is headed, as a sequence of milestones. Concrete tasks live in [GitHub Issues](https://github.com/leanardiles/stringherd/issues); this page is the big picture and is updated when a milestone changes.

Legend: ✅ done · 🚧 in progress · 📋 planned

| Milestone | Goal |
|---|---|
| ✅ Foundation | DeepL Sync contract, reviewer accounts, review screen; full loop verified on a real app |
| 🚧 v1 (local) | A complete review tool someone else can run and use without the API docs |
| 📋 Hosted demo | A public instance anyone can try in the browser |
| 📋 Pilot | Stringherd on a live repository that is not mine, reviewing English to Spanish |
| 📋 v2: Screenshots | Reviewers see where each string appears in the app |
| 📋 Later | Zero-config onboarding through a GitHub App, workflows, TM, glossary |

---

## ✅ Foundation

**DeepL Sync TMS contract**
- Push, export and project status endpoints, verified end to end against the real DeepL CLI (push, re-push, pull, auth errors)
- API-key authentication accepting both forms DeepL Sync sends (`ApiKey` and `Bearer`)
- Idempotent, concurrency-safe push: re-pushing unchanged strings keeps their approval; parallel pushes to a new project are handled atomically
- Reviewer edits are protected: a push only reopens a translation when DeepL delivers something new (because the source changed), the same rule CAT tools follow when a source file is updated
- Export of approved translations only

**Source strings**
- Source upload: one request carries all source strings of a catalog (with file and commit); detects new, changed and removed keys and sends approved translations back to review when their source changes
- Upload script for JSON catalogs (`scripts/upload-source.mjs`)

**People**
- Admin and reviewer roles, email and password sign-in (Argon2 hashes, server-side sessions in a secure cookie), assignments per project and language, a `create-admin` command, no self-signup
- Review API: list, edit, approve, withdraw, bulk approve; each approval records who made it

**Review interface** (design: [docs/UI-PLAN.md](docs/UI-PLAN.md))
- Sign-in, project overview with progress per language
- Single key view (key list, editor, context panel) and list view, toggled in the toolbar
- Editor with placeholders as locked chips, DeepL's original as a suggestion with a word diff, approve and next, withdraw, autosave on leave, Phrase-style shortcuts
- Status symbols per string; basic QA (placeholder mismatch and empty translation block approval; same as source and outer spaces warn)
- The interface itself is translatable (react-i18next, pseudo-locale for testing), with a palette checked against WCAG AA

**Verified end to end on FitJournal**: English source, French machine translation by DeepL, review and edits in Stringherd, `deepl sync pull` writes the approved strings into the repository and the app shows them.

---

## 🚧 v1 (local)

Goal: a complete review tool someone else can run locally and use without opening the API docs. Ends with a `v1.0.0` tag.

**Needed**
- **Review screen, rest of the MVP**: bulk approve (checkboxes and an action bar), `F8` to insert placeholders, `Ctrl+G` to go to a string, `Ctrl+Shift+Space` for a non-breaking space, show non-printable characters
- **Admin screens**: create reviewers and assign projects and languages from the UI
- **QA enforced on the server**: the API refuses to approve a translation with a broken placeholder or empty text, as the UI already does
- **One process to run**: FastAPI serves the built UI, so Stringherd is a single server at a single address
- **README walkthrough**: screenshots or a short recording of Stringherd itself, and the DeepL Sync loop step by step
- **`v1.0.0` tag and a changelog**

**In v1 if time allows, otherwise v1.x**
- **Other languages as reference** in the context panel
- **Character limits** (hard limits; placeholders count as one character)
- **Translation memory** suggestions from approved strings
- **GitHub Action** that runs `deepl sync` and the source upload on every push to the source files

---

## 📋 Hosted demo

Goal: anyone can open Stringherd in the browser and try it, with nothing to install.

- Hosting for the server and the UI (stringherd.dev), with HTTPS and `COOKIE_SECURE=true`
- A seeded demo project and a demo account that resets regularly
- Account hardening: sign-in rate limiting; password reset and invitations as needed
- Monitoring basics: health check, error logging

---

## 📋 Pilot

Goal: Stringherd on a live repository that is not mine, with me reviewing English to Spanish. The repository is not chosen yet; its stack (framework, i18n library, file format, number of locale files) will decide part of this list.

- **Per-project API keys**, created in the UI, instead of one key for the whole server
- **Setup page per project**: a ready-made `.deepl-sync.yaml` and GitHub workflow, plus the two repository secrets to add; about 15 minutes of copy and paste for the team
- **Existing translations policy** when onboarding, per locale: adopt as approved, adopt for review, or retranslate (needed because the first sync without a lockfile overwrites existing translations)
- **Source upload for the pilot's file format**, if it is not JSON
- **Pilot notes**: what was hard to set up, what reviewers missed, what broke; feeds the next milestones

---

## 📋 v2: Screenshots

Goal: reviewers see where each string appears in the app, without changes to the app's code by default. Design: [docs/SCREENSHOTS-PLAN.md](docs/SCREENSHOTS-PLAN.md).

- **Proof of concept** on FitJournal: crawler with four routes and a demo account, catalog swap to identify keys, results shown in the side panel
- **Capture tool**: Node CLI with Playwright; crawler config with routes and steps; key identification chosen automatically from exact tags down to text matching
- **Screenshots API and storage**: screens, images stored once per content hash, occurrences with rectangles and the method that found them
- **Statuses and coverage** per key: captured, stale, missing, manual, not visual
- **Side panel viewer**: whole screen, string outlined, zoom, fit to string, full size
- **Then**: i18next plugin, Storybook and end-to-end test drivers, code scan for apps without an exact method, capture in CI, several viewports, "Open in app" links for projects with a staging environment

---

## 📋 Later

- **GitHub App with zero-config onboarding**: connect a repository from the Stringherd UI; Stringherd reads the source strings directly (no upload script), opens a setup pull request with `.deepl-sync.yaml` and the workflow, and sends approved translations back as pull requests
- **Adding and releasing languages**: add a language from Stringherd (setup pull request); keep it hidden until review is complete; release it with one deliberate step
- **Workflows per locale and path**: MT only, MT + review, MT + review + sign-off, configured as ordered rules
- **Source change handling**: show old and new source next to the previous translation; option to carry over translations when only punctuation or typos changed
- **More quality checks**: length expansion warnings, French spacing before `! ? : ;`, glossary terms not used
- **Glossary**: import (TBX, CSV), term highlighting, consistency checks, sync to DeepL glossaries
- **Translation memory** with fuzzy matching across projects, each match shown with the screenshot of its original context
- **Regional variants as deltas**: e.g. `es-AR` stores only what differs from `es`; a variant review pass marks each string as "same as base" or provides an override
- **Visual QA**: capture the translated build and flag text that overflows or gets cut off
- **Audit log**: full history of who changed and approved what (today only the latest approver is kept)
- **Comments** on strings, and mark as minor change

## 📋 Interoperability

- **XLIFF 2.0 export and import**, so linguists can work in their CAT tools (Trados, memoQ) and QA tools: placeholders as protected `<ph>` tags, segment states mapped to workflow steps, key and context carried as notes
- **TMX import and export** for translation memory, with references to the original context
- **ICU MessageFormat support**: placeholders and plural branches shown as protected chips in the editor, a check that the syntax is still valid, and a preview of each plural form
- **Source upload for every format DeepL Sync supports** (YAML, PO, Android XML, iOS, ARB, XLIFF and more), not only JSON
- **Screenshot adapters** for more i18n libraries (vue-i18n, FormatJS, ngx-translate)

## Known limitations

These come from the DeepL Sync contract or CLI as of version 2.0.0:

- **Plurals in PO and Android files are not pulled.** The contract carries one string per key, which cannot fill multiple plural forms. Formats that store plurals as separate keys (e.g. i18next's `_one` / `_other`) are not affected.
- **No file dimension.** Two catalog files that share key names cannot be told apart by a TMS; use one Stringherd project per group of files.
- **Push does not include source text**, hence the separate source upload.
- **The first sync overwrites existing translations** when there is no lockfile. Use the adoption flow (push, approve, pull) before the first sync on a project that already has translations.
- **On Windows**, target path resolution needs `target_path_pattern` on the bucket, and the CLI warns about file permissions on every run (Unix permission checks that Windows does not use).
- **The CLI is not published on npm**; Stringherd vendors a build from source (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).

## Not planned

- Live, editable in-context translation inside the running app (screenshots are read-only context)
- Connectors to other TMS platforms (Phrase, Smartling and similar already integrate with GitHub)
- Screenshot capture for native mobile apps (for now)
