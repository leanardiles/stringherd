# Administration

How projects, machine keys and people are managed in Stringherd, and what is prepared for organizations later. The backend and the admin screens are built; admins reach them through **Projects** and **People** in the top bar.

## Roles in v1

v1 has a single organization: everyone on a server works for the same team.

| Role | Can do |
|---|---|
| `admin` | Manage projects, their languages and API keys; manage people and their assignments; review any project and language |
| `reviewer` | Review only the project and language pairs assigned to them |

The first admin is created from the command line (`python -m app.cli create-admin`). Admins create everyone else; there is no self-signup.

## Screens

| Screen | What happens there |
|---|---|
| Projects | Every project with its languages, string count and keys. **New project** suggests the id from the name |
| Project | Languages with progress and reviewers; add or remove a language. API keys: a new key is shown once, revoked keys stay listed. Setup steps to copy |
| People | Everyone with role, languages, status and last sign-in. **Add person** generates a temporary password (or takes one the admin chooses) and shows it once |
| Person | Name and role, language assignments, deactivate or reactivate, reset password |
| Change password | Everyone, from the account menu. Required right after signing in with a temporary password |

Admins cannot change their own role or deactivate themselves, so a server cannot lose its last admin by accident. Their own password changes through **Change password**, not a reset.

## Projects

A project is one localized codebase. Its id is the `tms.project_id` in the repository's `.deepl-sync.yaml`.

- **Created by an admin before the first push.** A push or source upload to an unknown project is rejected with `404 Project 'x' not found. Create it in Stringherd before the first push.` Nothing is created by accident from a typo in a config file.
- **The id never changes.** Repositories refer to it, so only the display name can be edited.
- **Source language** is set at creation. It can change only while no source strings have been uploaded.
- **Target languages** are listed per project. Admins add them up front, so reviewers can be assigned before the first push. A push in a language the project does not list yet adds it automatically, since DeepL Sync decides which languages it translates. A language can be removed only while it has no translations; its assignments go with it.
- **Assignments** must name one of the project's target languages.

## Machine keys

DeepL Sync and the source upload authenticate with an API key. Each project has its own keys.

- **Format:** `shp_` followed by 43 random characters. The prefix makes a leaked key easy to spot in logs and secret scanners.
- **Shown once.** Stringherd stores only the SHA-256 hash and the first ten characters (to recognise the key in lists). A fast hash is enough because keys are long and random; passwords use Argon2 because people pick them.
- **Scoped to one project.** A key opens only the project it belongs to:

  | Request | Answer |
  |---|---|
  | No key, or an unknown or revoked key | `401` |
  | A valid key for a different project | `403 This key belongs to project 'a', not 'b'.` |
  | The development key, for a project that does not exist | `404` with a hint to create it |

- **Revoked, not deleted.** A revoked key stops working at once and stays in the list with its label, creator and last use, as an audit trail.
- **Last used** is recorded at most once a minute per key, so busy pushes do not write to the database on every request.
- **Never in the browser.** Keys are for machines. They do not open the review or admin API, and a session cookie does not open the machine endpoints.

### The development key

`TMS_API_KEY` on the server is optional. When set, it opens every existing project. It keeps local development and the FitJournal demo working without issuing keys. Leave it unset on a shared or hosted server: projects then accept only their own keys.

## Passwords

- **Temporary passwords.** A user created by an admin gets a temporary password: either one the admin types, or one Stringherd generates and shows once. Resetting a password (`POST /api/admin/users/{id}/reset-password`) does the same and signs the user out everywhere.
- **Forced change.** While a password is temporary, every endpoint answers `403 Choose a new password before continuing.`, except `GET /api/auth/me` (so the UI can see `must_change_password`), `POST /api/auth/password` and `POST /api/auth/logout`.
- **Changing your password** needs the current one, and signs out your other browsers but keeps the current one.
- **Server operators** can still set a password with `python -m app.cli set-password`; that password is not temporary.

## Setup page

`GET /api/admin/projects/{projectId}/setup` returns what a repository needs, ready to copy:

- the `tms:` block for `.deepl-sync.yaml`, with the server address and project id;
- the commands: allow the server in DeepL Sync, set `TMS_API_KEY` from a secret store, sync, push, upload the source, pull.

The server address is `PUBLIC_URL` when set (for example `https://stringherd.example.com`), otherwise the address the admin's browser used. The real key never appears here: it is shown once, when it is created. A GitHub workflow joins this page in the pilot milestone.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` `POST` | `/api/admin/projects` | List projects with progress, reviewers and key counts; create a project |
| `GET` `PATCH` | `/api/admin/projects/{projectId}` | Project detail with its keys; rename, change the source language |
| `POST` | `/api/admin/projects/{projectId}/locales` | Add a target language |
| `DELETE` | `/api/admin/projects/{projectId}/locales/{locale}` | Remove a target language without translations |
| `GET` `POST` | `/api/admin/projects/{projectId}/keys` | List keys; issue a key (returned once) |
| `DELETE` | `/api/admin/projects/{projectId}/keys/{keyId}` | Revoke a key |
| `GET` | `/api/admin/projects/{projectId}/setup` | Config block and commands for the repository |
| `POST` | `/api/admin/users/{id}/reset-password` | New temporary password, shown once |
| `POST` | `/api/auth/password` | Change your own password |

## Prepared for organizations

Organizations (several customer teams on one hosted server) and a platform admin come with the hosted demo. v1 keeps five seams so that change stays small:

1. **Project ids are unique across the whole server**, not per organization, so a repository's `.deepl-sync.yaml` keeps working when organizations arrive.
2. **Users have no organization column.** Membership will be a separate table (user, organization, role), which also allows one person in several organizations.
3. **`admin` means customer admin.** A platform admin will be a separate flag on the user, not a third role.
4. **Every "which projects" question goes through `projects_visible_to`** in `app/permissions.py`, and every management check through `can_manage_project`. The organization filter is added there and nowhere else.
5. **Projects and keys are created only in `app/services/projects.py`**, so "this project belongs to organization X" is set in one place.

Stringherd never needs the customer's DeepL API key: DeepL Sync calls DeepL from the customer's machine or CI, and only the translations reach Stringherd.
