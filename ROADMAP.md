# Roadmap

Where Stringherd is headed, as a sequence of milestones. Concrete tasks live in [GitHub Issues](https://github.com/leanardiles/stringherd/issues); this page is the big picture and is updated when a milestone changes.

Legend: ✅ done · 🚧 in progress · 📋 planned

| Milestone | Goal |
|---|---|
| ✅ Foundation | DeepL Sync contract, reviewer accounts, review screen; full loop verified on a real app |
| 🚧 v1 (local) | A complete review tool someone else can run and use without the API docs |
| 📋 Hosted demo | A public instance anyone can try in the browser |
| 📋 FitJournal in production | My own app localized end to end through Stringherd, including existing translations and a regional variant |
| 📋 Pilot | Stringherd on a live repository that is not mine, reviewing English to Spanish |
| 📋 v2: Screenshots | Reviewers see where each string appears in the app |
| 📋 Later | Zero-config onboarding through a GitHub App, workflows, TM, glossary |

---

## ✅ Foundation

**DeepL Sync TMS contract**
- Push, export and project status endpoints, verified end to end against the real DeepL CLI (push, re-push, pull, auth errors)
- API-key authentication accepting both forms DeepL Sync sends (`ApiKey` and `Bearer`)
- Keys per project, stored as hashes, shown once, revocable; a key opens only its own project. A server-wide development key stays optional
- Idempotent, concurrency-safe push: re-pushing unchanged strings keeps their approval; parallel pushes are handled atomically
- Reviewer edits are protected: a push only reopens a translation when DeepL delivers something new (because the source changed), the same rule CAT tools follow when a source file is updated
- Export of delivered translations only

**Source strings**
- Source upload: one request carries all source strings of a catalog (with file and commit); detects new, changed and removed keys and sends approved translations back to review when their source changes
- Upload script for JSON catalogs (`scripts/upload-source.mjs`)

**People**
- Admin and reviewer roles, email and password sign-in (Argon2 hashes, server-side sessions in a secure cookie), assignments per project and language, a `create-admin` command, no self-signup
- Review API: list, edit, approve, withdraw, bulk approve; each approval records who made it
- Temporary passwords (generated or chosen by the admin) that must be changed at first sign-in; admin password reset
- Project administration API: projects created before the first push, target languages, API keys, a setup snippet with the `.deepl-sync.yaml` block and commands ([docs/ADMIN-PLAN.md](docs/ADMIN-PLAN.md))

**Review interface** (design: [docs/UI-PLAN.md](docs/UI-PLAN.md))
- Sign-in, project overview with progress per language
- Single key view (key list, editor, context panel) and list view, toggled in the toolbar
- Editor with placeholders as locked chips, DeepL's original as a suggestion with a word diff, approve and next, withdraw, autosave on leave
- Phrase-style keyboard shortcuts from one list that also drives the in-app reference (`Ctrl+/`, `?`, toolbar icon, account menu) and [docs/SHORTCUTS.md](docs/SHORTCUTS.md): placeholders (`F8`), non-breaking space, copy source, suggestions, go to string, pane focus; non-printable characters shown on request
- Status symbols per string; quality checks, enforced by the server too: empty and placeholder mismatch block approval; same as source, outer spaces, numbers, ending punctuation, double spaces and unbalanced brackets or quotes warn. One shared set of cases tests the UI and the server
- Bulk approve and withdraw in the list view: checkboxes, select all shown, Shift+click ranges, an action bar; strings with QA errors are skipped, reported and stay selected
- The interface itself is translatable (react-i18next, pseudo-locale for testing), with a palette checked against WCAG AA
- Admin screens: projects with their languages, API keys (shown once, revocable) and setup steps; people with roles, temporary passwords, deactivation and language assignments; change password, required after a temporary one
- Deliver: approved strings become pullable only when the reviewer delivers the language, so approved strings can still change during a session. Delivered strings leave the working list, stay searchable read-only under Delivered, and are locked; an admin can reopen one, and the code keeps the delivered text until the next Deliver. A source change or a new machine translation sends a delivered string back to review

**Running it**
- One server at one address: the server also serves the built UI (`npm run build:web`), so reloads and bookmarks open the right page; bundles are cached for a year and the page itself is revalidated; API routes always take priority. Without a build it runs the API only
- Docker for local trial and self-hosting: `docker compose up` starts Stringherd with its own Postgres and the Trailhead demo project (`seed-demo`) on port 8200, with nothing else to install. Two-stage image running as an ordinary user, migrations on every start, demo data only on request, an allow-list of what goes into a build

**Verified end to end on FitJournal**: English source, French machine translation by DeepL, review and edits in Stringherd, `deepl sync pull` writes the reviewed strings into the repository and the app shows them.

---

## 🚧 v1 (local)

Goal: a complete review tool someone else can run locally and use without opening the API docs. Ends with a `v1.0.0` tag.

**Needed**
- **FitJournal French in production**: review the whole French catalog with the local server, deliver, pull on a branch, merge and deploy, so French goes live on fit-journal.com. Only `fr` is a target, so `es`, `nl` and `es-AR` stay untouched. What feels wrong while reviewing becomes a fix before the tag
- **README walkthrough**: screenshots or a short recording of Stringherd itself, and the DeepL Sync loop step by step, using the FitJournal French flow and the demo project
- **`v1.0.0` tag and a changelog**

**In v1 if time allows, otherwise v1.x**
- **Other languages as reference** in the context panel
- **Character limits** (hard limits; placeholders count as one character)
- **Translation memory** suggestions from approved strings
- **Bulk actions in the single key view**: a "Show translations" option adds the target text to each row of the key list, so it can be scanned and multi-selected like the list view

---

## 📋 Hosted demo

Goal: anyone can open Stringherd in the browser and try it, with nothing to install, at the lowest possible cost: Vercel's free Hobby plan and Supabase's free plan.

- **Vercel** (stringherd.dev): the built UI on Vercel's CDN and the server as a Python function, in one project on one domain (Vercel Services), so the session cookie works as it does locally. The function runs with `WEB_DIST=` because the CDN serves the UI. HTTPS, `COOKIE_SECURE=true` and `PUBLIC_URL`
- **Serverless fit**: Supabase through its connection pooler, the function region set to the database's region, nothing kept in memory between requests. Check that a DeepL Sync push from CI survives a cold start. Request and response bodies are limited to 4.5 MB, far above a typical catalog
- **Deploys**: migrations run before each deploy (`alembic upgrade head` with `op run`, later from a GitHub Action); secrets live in Vercel's environment variables, copied from 1Password
- A seeded demo project and a demo account that resets regularly
- Account hardening: sign-in rate limiting (counted in the database, since functions keep no memory); password reset and invitations as needed
- Monitoring basics: health check, error logging

---

## 📋 FitJournal in production

Goal: a source change in FitJournal flows through DeepL, review in Stringherd, Deliver and a pull request to a merge, with me only reviewing and merging. Every feature a pilot needs is built and proven here first, on my own repository, where a mistake costs only me. Runs on the hosted demo server. Design for languages: [docs/LOCALES-PLAN.md](docs/LOCALES-PLAN.md).

- **FitJournal's Spanish renamed to `es-419`** first (a change in FitJournal), so the language code matches DeepL's Latin American Spanish
- **GitHub workflow** that runs `deepl sync` and the source upload on every push to the source files, shown on the setup page next to the `.deepl-sync.yaml` block, with the two repository secrets to add
- **Deliver opens a pull request**: Deliver also starts the repository's workflow, which runs `deepl sync pull` and opens or updates a pull request with the delivered strings. Developers merge it; the merge is the release
- **Existing translations**, chosen per language before the first sync: machine-translate from scratch, keep them marked as reviewed, or keep them for review (status Existing). Imported text counts as delivered at once, so the lockfile protects the files during the review. Proven on FitJournal's `es-419` and `nl`
- **Send back to review**: an admin returns a language or a selection of delivered strings to the reviewer's list without new machine translation; the code keeps the delivered text until the next Deliver
- **Hand edits in the repository**: a translation edited in a target file is detected (new text with an unchanged source), shown to the reviewer with a diff and kept, restored or edited; the workflow pushes before it pulls so nothing is reverted silently. Fixes today's behavior, where a push labels the edit as machine translation and can overwrite a reviewer's unfinished correction
- **Regional variant `es-AR`** from the delivered `es-419`: the reviewer confirms or amends each string, and a Stringherd script writes only the overrides. Low priority; may move to Later

---

## 📋 Pilot

Goal: Stringherd on a live repository that is not mine, with me reviewing English to Spanish. The core features are proven on FitJournal by then, so the pilot tests someone else's stack and setup experience. The repository is not chosen yet; its stack (framework, i18n library, file format, number of locale files) will decide part of this list.

- **Onboarding with the team**: the GitHub workflow and secrets (about 15 minutes of copy and paste), and the existing translations choice for each of their languages
- **Source upload for the pilot's file format**, if it is not JSON
- **Hosting**: pilot projects use the hosted demo server, each with its own key. A pilot on an employer's codebase would self-host with Docker instead (its strings stay in its own infrastructure, and commercial use is outside Vercel's Hobby plan)
- **Pilot notes**: what was hard to set up, what reviewers missed, what broke; feeds the next milestones

---

## 📋 v2: Screenshots

Goal: reviewers see where each string appears in the app, without changes to the app's code by default. Design: [docs/SCREENSHOTS-PLAN.md](docs/SCREENSHOTS-PLAN.md).

- **Proof of concept** on FitJournal: crawler with four routes and a demo account, catalog swap to identify keys, results shown in the side panel
- **Capture tool**: Node CLI with Playwright; crawler config with routes and steps; key identification chosen automatically from exact tags down to text matching
- **Screenshots API and storage**: screens, images stored once per content hash, occurrences with rectangles and the method that found them. Capture runs in the repository's CI, not on the server; on Vercel the images go to object storage (Supabase Storage), since functions have no lasting disk
- **Statuses and coverage** per key: captured, stale, missing, manual, not visual
- **Side panel viewer**: whole screen, string outlined, zoom, fit to string, full size
- **Then**: i18next plugin, Storybook and end-to-end test drivers, code scan for apps without an exact method, capture in CI, several viewports, "Open in app" links for projects with a staging environment

---

## 📋 Later

- **GitHub App with zero-config onboarding**: connect a repository from the Stringherd UI; Stringherd reads the source strings directly (no upload script), opens a setup pull request with `.deepl-sync.yaml` and the workflow, and sends approved translations back as pull requests
- **Adding and releasing languages**: add a language from Stringherd (setup pull request); keep it hidden until review is complete; release it with one deliberate step
- **Workflows per locale and path**: MT only, MT + review, MT + review + sign-off, configured as ordered rules. With sign-off, the reviewer's Deliver sends the strings to an admin, and only the admin's sign-off makes them pullable
- **Source change handling**: show old and new source next to the previous translation; option to carry over translations when only punctuation or typos changed
- **QA profiles**: admins set each check to error, warning or off per project and language; empty and placeholder checks stay locked as errors. Custom pattern rules and forbidden terms; reviewers mark a warning as a false positive, with their name recorded
- **More quality checks** (warnings by default): URLs and emails that differ, length expansion, French spacing before `! ? : ;`, glossary terms not used, inconsistency (the same source translated differently in a project), and a 100% TM match that was changed
- **Glossary**: import (TBX, CSV), term highlighting, consistency checks, sync to DeepL glossaries
- **Translation memory** with fuzzy matching across projects, each match shown with the screenshot of its original context
- **Translation memory lookup**: reviewers search how a term or string was translated before (concordance search across delivered strings), and see the same string in the project's other languages next to each result. Grows out of the read-only Delivered view in the review screen
- **Regional variants in general** (after `es-AR` on FitJournal): a base and a policy per variant (when review starts, what the reviewer sees, overrides only or full files), variants of the source language, chains, and mechanical variants such as `en-GB` spelling or `de-CH` without ß ([docs/LOCALES-PLAN.md](docs/LOCALES-PLAN.md))
- **Re-translate with DeepL from Stringherd**: an admin re-translates a language or selected strings; the result appears as the suggestion with a diff, and the repository never sees raw machine translation. Needs a server-side DeepL key and the project's DeepL settings
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
- **The first sync overwrites existing translations** when there is no lockfile. Use the adoption flow (push, approve, pull) before the first sync on a project that already has translations; the planned import makes this a choice per language.
- **A target locale is also the DeepL language**, with no mapping between them: a repository's language codes must be DeepL's (`es-419` for Latin American Spanish). Varieties DeepL lacks, such as `es-AR`, are planned as Stringherd variants.
- **On Windows**, target path resolution needs `target_path_pattern` on the bucket, and the CLI warns about file permissions on every run (Unix permission checks that Windows does not use).
- **The CLI is not published on npm**; Stringherd vendors a build from source (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).

## Not planned

- Live, editable in-context translation inside the running app (screenshots are read-only context)
- Connectors to other TMS platforms (Phrase, Smartling and similar already integrate with GitHub)
- Screenshot capture for native mobile apps (for now)
