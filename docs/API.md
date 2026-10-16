# API reference

The HTTP endpoints Stringherd offers. Interactive docs with every request and response schema are at `/docs` on a running server. For what Stringherd is and how it works, see the [README](../README.md).

## DeepL Sync contract

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

## Review API (for people)

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

Admins manage people under `/api/admin/users` (create with a temporary password, update, deactivate, reset password, assign project and language) and projects under `/api/admin/projects` (languages, API keys, setup snippet; see [docs/ADMIN-PLAN.md](ADMIN-PLAN.md)). Reviewers only see and change the languages they are assigned to; admins can review any language.

And `GET /health` (server and database status), with interactive docs at `/docs`.
