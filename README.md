# Stringherd

**Open-source review server for [DeepL Sync](https://github.com/DeepL/deepl-cli/blob/main/docs/SYNC.md).**

DeepL's CLI machine-translates the locale files in your repository. Stringherd is where linguists review those translations, with the context they need, before the reviewed versions go back into your code.

> **Status: early development.** The DeepL Sync TMS contract is implemented and verified against the real DeepL CLI. Reviewer accounts, the review API and the admin screens (projects, API keys, people) are in place. The review interface is being built: sign-in, the project overview and the review screen work, with a single key view and a list view, approve and next, quality checks enforced by the server, bulk approve and withdraw in the list view, and Phrase-style keyboard shortcuts ([docs/SHORTCUTS.md](docs/SHORTCUTS.md)). Its design is in [docs/UI-PLAN.md](docs/UI-PLAN.md).

---

## How it works

```
Your repo: English source strings change
   │
   ▼
deepl sync                 machine-translates new or changed strings (DeepL API)
   │
   ▼
deepl sync push  ───────►  Stringherd       stores each translation as "machine translated"
                              │
                              ▼
                           Linguists review, edit and approve,
                           then Deliver the language
                              │
deepl sync pull  ◄───────  only delivered translations are exported
   │
   ▼
Your repo: reviewed translations land in the locale files
```

DeepL Sync defines a small REST contract for a translation management system (TMS) and delegates human review to it, but does not ship one. Stringherd implements that contract and focuses on what reviewers actually need: visual context, regional variants and terminology.

## Features

| Status | Feature |
|---|---|
| ✅ Done | DeepL Sync TMS contract: push, export and project status endpoints |
| ✅ Done | API-key authentication (`ApiKey` and `Bearer`, as sent by DeepL Sync), with keys per project, stored hashed and revocable |
| ✅ Done | Idempotent, concurrency-safe push: re-pushing unchanged strings keeps their approval; only a genuinely new machine translation goes back to review, so a reviewer's edit is never overwritten by a re-push |
| ✅ Done | Deliver: approved strings become pullable only when the reviewer delivers the language; delivered strings are locked, and an admin can reopen one to fix it |
| ✅ Done | Source upload: one request per catalog, change detection, approvals reset when the source changes |
| ✅ Done | Reviewer accounts: admins and reviewers, sign-in with a secure session cookie, temporary passwords changed at first sign-in, reviewers assigned per project and language |
| ✅ Done | Admin screens: projects and their languages, API keys shown once, setup steps per project, people with temporary passwords and language assignments |
| ✅ Done | Review API: list strings with source and machine translation, edit, approve, bulk approve; records who approved each string |
| ✅ Done | Quality checks: empty and placeholder errors block approval in the review screen and on the server; warnings for same as source, spacing, numbers, ending punctuation, double spaces, unbalanced brackets and quotes |
| ✅ Done | Review interface: sign-in, project overview, review screen with single key and list views, DeepL suggestion with diff, approve and next, status symbols, QA checks, bulk approve and withdraw, Deliver, Phrase-style keyboard shortcuts with an in-app reference ([docs/SHORTCUTS.md](docs/SHORTCUTS.md)), non-printable characters |
| 📋 Planned | Screenshots showing where each string appears in the app, captured automatically |
| 📋 Planned | Configurable workflows per locale (MT only, MT + review, MT + review + sign-off) |
| 📋 Planned | Regional variants stored as deltas (e.g. `es-AR` holds only what differs from `es`) |
| 📋 Planned | Translation memory with visual context, glossary checks |
| 📋 Planned | GitHub App: connect a repository from the UI; Stringherd opens the setup PR |

See the **[roadmap](ROADMAP.md)** for what's next and in which order.

## API

Stringherd implements the [DeepL Sync TMS contract](https://github.com/DeepL/deepl-cli/blob/main/docs/SYNC.md):

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/projects/{projectId}/keys/{keyPath}` | Receive a translation. Body: `{"locale": "fr", "value": "Enregistrer"}` |
| `GET` | `/api/projects/{projectId}/keys/export?format=json&locale=fr` | Delivered translations as a flat `{"key": "value"}` object |
| `GET` | `/api/projects/{projectId}` | Key count and review progress per locale |

Plus one **Stringherd extension**, because the contract never sends the source text:

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/projects/{projectId}/source` | Upload a full snapshot of source strings for one catalog file. Stringherd reports what was created, updated, unchanged or removed, and sends approved translations back to review when their source changed |

### Review API (for people)

People sign in with email and password and get a session cookie (`HttpOnly`, `SameSite=Lax`). API keys are for machines only and do not open these endpoints.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | Sign in. Body: `{"email": "...", "password": "..."}` |
| `POST` | `/api/auth/logout` | Sign out (ends the session on the server) |
| `GET` | `/api/auth/me` | The signed-in user, with their assignments |
| `POST` | `/api/auth/password` | Change your password (required after a temporary one) |
| `GET` | `/api/review/projects` | Projects and languages the user may review, with progress |
| `GET` | `/api/review/projects/{projectId}/locales/{locale}/strings` | Strings to review: source, current translation, DeepL's original, status, who approved. Filters: `status`, `q`; paging: `limit`, `offset` |
| `PATCH` | `/api/review/projects/{projectId}/locales/{locale}/strings/{keyPath}` | Edit and/or approve one string. Body: `{"value": "...", "approved": true}`. Approving a string with a QA error answers `422` with the reason |
| `POST` | `/api/review/projects/{projectId}/locales/{locale}/strings/approve` | Approve several strings. Body: `{"keys": ["home.title", "..."]}`. Strings with a QA error are skipped and listed with their issues |
| `POST` | `/api/review/projects/{projectId}/locales/{locale}/strings/withdraw` | Withdraw several approvals. Body: `{"keys": [...]}`. Only approved strings change; delivered ones are locked |
| `POST` | `/api/review/projects/{projectId}/locales/{locale}/deliver` | Deliver the language: its approved strings become what `deepl sync pull` exports, and are locked |
| `POST` | `/api/review/projects/{projectId}/locales/{locale}/strings/{keyPath}/reopen` | Unlock a delivered string so it can be corrected (admins). The code keeps the delivered text until the next Deliver |

Admins manage people under `/api/admin/users` (create with a temporary password, update, deactivate, reset password, assign project and language) and projects under `/api/admin/projects` (languages, API keys, setup snippet; see [docs/ADMIN-PLAN.md](docs/ADMIN-PLAN.md)). Reviewers only see and change the languages they are assigned to; admins can review any language.

And `GET /health` (server and database status), with interactive docs at `/docs`.

## Using it with a project

In Stringherd, an admin creates the project under **Projects**, then an API key on the project's page, which also shows the block and commands below with the project's values filled in. In the project being localized, point DeepL Sync at Stringherd in `.deepl-sync.yaml`, using the same project id:

```yaml
tms:
  enabled: true
  server: http://localhost:8100
  project_id: my-app
```

Then, with the project's key in `TMS_API_KEY` for the CLI and the upload script:

```bash
deepl config set tms.allowedServers localhost   # one-time: approve the destination
deepl sync --flag-for-review                    # machine-translate
deepl sync push                                 # send translations to Stringherd for review
node path/to/stringherd/scripts/upload-source.mjs \
  --project my-app --file locales/en/common.json # send the source strings
# review in Stringherd, then click Deliver for the language
deepl sync pull                                 # bring delivered translations back
```

## Notes on the DeepL Sync contract

Building against the contract surfaced a few behaviors worth knowing (the full list is in the [roadmap](ROADMAP.md#known-limitations)):

- **Push does not send the source text**, only key, locale and translation. A review interface needs the source, so Stringherd needs another way to obtain it.
- **Keys have no file dimension.** Two locale files that share key names cannot be told apart by the TMS.
- **The first sync overwrites existing translations.** Without a lockfile, every key counts as missing. Existing translations can be adopted safely by pushing them, approving them and pulling them back, which records them in the lockfile.
- **On Windows, target path resolution fails** for paths like `locales\en\common.json`. Setting `target_path_pattern` on the bucket works around it.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL (Supabase) |
| Review UI | React, Vite, TypeScript, TanStack Query, react-i18next, CodeMirror 6 |
| Machine translation and sync | DeepL CLI (`deepl sync`) |
| Secrets | 1Password CLI (`op run`) |

## Development

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for setup, running the server, tests, migrations and troubleshooting.

Quick check that everything works:

```bash
cd server && pip install -e ".[dev]" && pytest     # backend
cd web && npm install && npm test                  # review UI
```

---

Stringherd is an independent project. It is not affiliated with, or endorsed by, DeepL SE. DeepL is a trademark of DeepL SE.
