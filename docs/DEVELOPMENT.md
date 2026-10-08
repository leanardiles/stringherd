# Development Setup

How to set up Stringherd locally, and why the tooling is set up the way it is. For what Stringherd is and how it works, see the [README](../README.md).

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 24.15.0 or newer | Required by DeepL CLI v2 (uses the built-in `node:sqlite` module) |
| npm | 9 or newer | Ships with Node |
| Python | 3.12 or newer (3.13 recommended) | Backend (FastAPI) in `server/` |
| 1Password CLI (`op`) | Latest | Injects secrets at runtime; no secrets on disk |
| Git | Any recent version | |

Check versions:

```bash
node -v
npm -v
op --version
```

---

## Quick start

```bash
git clone https://github.com/leanardiles/stringherd.git
cd stringherd
npm install
npm run deepl:usage
```

`npm install` installs the DeepL CLI from `vendor/` (see below). `npm run deepl:usage` confirms your DeepL key works by printing your character usage. It does not translate anything.

---

## Secrets (1Password)

No real secrets are stored in the repo or on disk. `.env.op` holds **references** to 1Password items and is safe to commit:

```
DEEPL_API_KEY=op://Stringherd/DeepL API/credential
```

At runtime, `op run` resolves each reference and passes the real value to a single command as an environment variable:

```bash
op run --env-file=.env.op -- <command>
```

### Items

All items live in a 1Password vault named `Stringherd`:

| Item (type) | Field | Env var | Used by |
|---|---|---|---|
| `DeepL API` (API Credential) | `credential` | `DEEPL_API_KEY` | DeepL CLI |
| `Stringherd Supabase` | `url` | `DATABASE_URL` | Server (Supabase Session pooler URI) |
| `Stringherd TMS` (API Credential) | `credential` | `TMS_API_KEY` | Server (checks requests) and DeepL CLI (sends it) |
| `Stringherd Admin` (Login) | `password` | (none) | Your own sign-in to Stringherd; read once by `create-admin` |

### Setup

1. Create a 1Password vault named `Stringherd`.
2. Add an item of type **API Credential** named `DeepL API`, with the key in the `credential` field.
3. Check the reference resolves:

   ```bash
   op read "op://Stringherd/DeepL API/credential"
   ```

### Rules

- Add a line to `.env.op` only when the 1Password item exists; `op run` fails on unresolvable references.
- Do not use `deepl init` or `deepl auth set-key`. They store the key in a local config file.
- `.env` and `.env.*` are gitignored. Exceptions: `.env.example` (placeholders) and `.env.op` (references).
- CI uses GitHub repository secrets, not 1Password.

---

## Backend server

The server lives in `server/` and has its own virtual environment. Run these from `server/`.

### Setup

```bash
cd server
py -3.13 -m venv .venv            # Windows; on Linux/macOS: python3.13 -m venv .venv
source .venv/Scripts/activate     # Windows Git Bash; on Linux/macOS: .venv/bin/activate
pip install -e ".[dev]"
```

### Tests

```bash
pytest
```

Tests never touch Supabase or DeepL: each test gets a fresh in-memory SQLite database (`tests/conftest.py`).

### Database migrations (Alembic)

```bash
op run --env-file=../.env.op -- alembic upgrade head      # apply migrations
op run --env-file=../.env.op -- alembic current           # show the applied revision
```

After changing `app/models.py`, generate a migration, **read it before applying**, then upgrade:

```bash
op run --env-file=../.env.op -- alembic revision --autogenerate -m 'describe the change'
op run --env-file=../.env.op -- alembic upgrade head
```

### Running the server

```bash
op run --env-file=../.env.op -- uvicorn app.main:app --port 8100 --reload
```

Port **8100** avoids clashing with apps that use 8000 (such as the FitJournal backend). Then open:
- `http://127.0.0.1:8100/health`: should return `{"status":"ok","database":"ok"}`
- `http://127.0.0.1:8100/docs`: interactive API docs

### Users and sign-in

Machines (DeepL Sync, the upload script) use the TMS key. People sign in with email and password. There is no self-signup: the first admin is created from the command line, and admins create everyone else.

Create the first admin, reading the password straight from 1Password so it never appears in your shell history:

```bash
op read "op://Stringherd/Stringherd Admin/password" | \
  op run --env-file=../.env.op -- python -m app.cli create-admin --email you@example.com --name "Your Name"
```

Without the pipe, the command asks for the password twice. Passwords need at least 12 characters. To change a password later (this also signs that user out everywhere):

```bash
op read "op://Stringherd/Stringherd Admin/password" | \
  op run --env-file=../.env.op -- python -m app.cli set-password --email you@example.com
```

Then, in `/docs`: call `POST /api/auth/login`. The browser keeps the session cookie, so the other endpoints work from the same page. Create reviewers with `POST /api/admin/users` and give them a language with `POST /api/admin/users/{id}/assignments`.

| Role | Can do |
|---|---|
| `admin` | Manage users and assignments; review any project and language |
| `reviewer` | Review only the project and language pairs assigned to them |

Whether admins may review is decided in one place, `can_review` in `app/permissions.py`.

Settings (environment variables, optional):

| Variable | Default | Meaning |
|---|---|---|
| `SESSION_DAYS` | `7` | How long a sign-in lasts |
| `COOKIE_SECURE` | `false` | Set to `true` when Stringherd is served over HTTPS, so the browser only sends the cookie over HTTPS |

Passwords are stored as Argon2 hashes. The session cookie holds a random token; the database stores only its SHA-256 hash.

### Uploading source strings

DeepL Sync push sends translations but never the source text, so the source strings are uploaded separately with `scripts/upload-source.mjs`. Run it from the root of the project being localized:

```bash
op run --env-file=.env.l10n.op -- node C:/Users/leand/Documents/Apps/stringherd/scripts/upload-source.mjs \
  --project fitjournal \
  --file web-react/src/i18n/locales/en/common.json
```

Options: `--server` (default `http://localhost:8100`), `--locale` (default `en`), `--commit` (default: the current git commit), `--dry-run`.

It sends **every** source string each time; the server compares with what it has. The summary shows `created` (new keys), `filled` (keys that existed without source text, e.g. after a translation push), `updated` (source changed), `unchanged`, approvals sent back to review, and keys no longer in the file (reported, never deleted). For now it reads JSON catalogs only.

### Supabase notes

- Use the **Session pooler** connection string (port 5432, IPv4). The direct connection is IPv6-only on the free plan.
- Free projects **pause after 7 days of inactivity**. If `/health` reports the database as unreachable, open the Supabase dashboard and click **Resume project**.

---

## Review UI

The review interface lives in `web/` (React, Vite, TypeScript). Design decisions are in [UI-PLAN.md](UI-PLAN.md). Run these from `web/`.

### Setup and running

```bash
cd web
npm install
npm run dev
```

Then open `http://localhost:5180`. The backend server must be running on port 8100 (see above). Vite forwards every `/api` request to it, so the browser sees one address and the sign-in cookie works without any cross-origin setup. To use another server address: `STRINGHERD_SERVER=http://127.0.0.1:9000 npm run dev`.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload |
| `npm test` | Unit and component tests (Vitest); no server needed, API calls are faked |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | Linting (oxlint) |
| `npm run build` | Production build into `web/dist/` |
| `npm run api:types` | Regenerates `src/api/schema.d.ts` from the running server's OpenAPI schema |

Run `npm run api:types` after changing an endpoint or schema in the backend, with the server running. A field the UI uses that changed or disappeared then shows up as a type error.

### Translating the interface

All interface text lives in `src/locales/en/common.json` and is used through `t('…')`; nothing visible is hard-coded. Plurals use i18next keys with `_one` / `_other`. Numbers, dates and language names come from `Intl`. Product names (Stringherd) stay out of the catalog.

To check for hard-coded text and layouts that break with longer languages, open the UI with `?lang=pseudo` (development only): every translated text appears accented and about 35% longer, like `[Ŕéṽîéŵ ~~~]`. Anything still in plain English is not going through the catalog.

### Colours

The palette is defined once in `src/styles/tokens.css`; components use the variables, never hex values. `src/styles/contrast.test.ts` checks every text and control colour pair against WCAG 2.1 AA, so a colour change that hurts readability fails the tests.

---

## DeepL CLI

### What it is and why we need it

The DeepL CLI provides `deepl sync`, the engine on the other side of Stringherd's API:

```
Source-language files in the repo
  -> deepl sync         translates new or changed strings via the DeepL API
  -> deepl sync push    sends them to Stringherd for review
  -> linguists review in Stringherd
  -> deepl sync pull    writes approved translations back to the repo
```

It is installed **locally in the project** (not globally with `-g`) so the version is pinned. Local machines and CI run the same version, which matters because the CLI writes `.deepl-sync.lock`.

### Why it is vendored

DeepL's README says to install with `npm install @deepl/cli`, but as of 2026-09-24 **the package is not published on npm** (the registry returns 404). Version 2.0.0 exists only as source code on the `main` branch of [DeepL/deepl-cli](https://github.com/DeepL/deepl-cli): no release, no git tag, and the release workflow does not publish to npm.

So we build it from source once and commit the packaged result to `vendor/`:

- `vendor/deepl-cli-2.0.0.tgz`: the built package (~360 KB)
- `vendor/README.md`: provenance, i.e. the upstream commit it was built from

Vendoring means:
- The exact version is pinned, even if DeepL changes `main`.
- CI installs it in seconds, with no clone or compile step.
- Anyone can verify or rebuild it from the recorded commit.

`package.json` references it as a dev dependency:

```json
"devDependencies": {
  "@deepl/cli": "file:vendor/deepl-cli-2.0.0.tgz"
}
```

### How the package was built

Run from the folder that **contains** `stringherd/`, not inside it:

```bash
git clone https://github.com/DeepL/deepl-cli.git
cd deepl-cli
git log -1 --format=%h     # record this commit hash in vendor/README.md
npm ci
npx tsc
npm pack
```

| Step | What it does | Python equivalent |
|---|---|---|
| `git clone` | Downloads the CLI source (TypeScript) | Cloning a library to install from source |
| `git log -1 --format=%h` | Prints the exact commit built. With no version tag, this is the only precise identifier | Pinning to a commit |
| `npm ci` | Installs the CLI's own dependencies at the exact versions in its lock file | `pip install -r requirements.txt` with pinned versions |
| `npx tsc` | Compiles TypeScript to JavaScript in `dist/`. Node cannot run TypeScript directly; `dist/cli/index.js` is the `deepl` command | Build step |
| `npm pack` | Bundles the built CLI into `deepl-cli-2.0.0.tgz`, containing exactly what would be published to npm | `python -m build` producing a `.whl` |

**Windows note:** use `npx tsc`, not `npm run build`. The build script uses `rm -rf` and `chmod`, and on Windows npm runs scripts in `cmd.exe`, where those commands fail even inside Git Bash. `tsc` is the part that does the actual build.

Then install it into Stringherd:

```bash
mkdir -p ../stringherd/vendor
cp deepl-cli-2.0.0.tgz ../stringherd/vendor/
cd ../stringherd
npm install -D ./vendor/deepl-cli-2.0.0.tgz
```

This installs the CLI into `node_modules/@deepl/cli/`, records it in `package.json` and `package-lock.json`, and creates the `deepl`, `deepl.cmd` and `deepl.ps1` launchers in `node_modules/.bin/`. (Python equivalent: `pip install ./package.whl` into a venv.)

### Running it

Through npm scripts (preferred):

```bash
npm run deepl:usage
```

What happens:
1. npm finds `deepl:usage` in `package.json` and runs `op run --env-file=.env.op -- deepl usage`.
2. npm temporarily adds `node_modules/.bin` to `PATH`, so `deepl` resolves to the project's copy without `npx`.
3. `op run` fetches the key from 1Password and sets `DEEPL_API_KEY` for that one command only.
4. `deepl usage` calls the DeepL API and prints the character count.
5. The command exits; the key was never written to disk.

Outside npm scripts, use `npx`:

```bash
op run --env-file=.env.op -- npx deepl --version
```

### Updating the vendored CLI

When DeepL pushes changes to `main`:

```bash
cd ../deepl-cli
git pull
git log -1 --format=%h
npm ci
npx tsc
npm pack
cp deepl-cli-2.0.0.tgz ../stringherd/vendor/
cd ../stringherd
npm install -D ./vendor/deepl-cli-2.0.0.tgz
```

Update the commit hash in `vendor/README.md`. If the version number in the filename changes, update the `package.json` reference too.

### When DeepL publishes to npm

Switch to the registry and remove the vendored copy:

```bash
npm uninstall @deepl/cli
npm install -D @deepl/cli
rm -rf vendor/
```

Then remove the "Why it is vendored" and build sections from this document.

### The local `deepl-cli` clone

The clone next to `stringherd/` is not needed to run the project. Keep it for:
- rebuilding when DeepL updates `main`
- reading the source, e.g. to see exactly what `sync push` sends to the TMS contract
- contributing upstream

---

## DeepL API usage and cost

The free Developer plan gives **1 million characters in total, one time** (not monthly). Protect it:

- Set `sync.max_characters` in `.deepl-sync.yaml` to cap each run.
- Use `deepl sync --dry-run` to see the character count before a real run.
- Never call the DeepL API from Stringherd's tests. The server only implements the TMS contract; test it with fake pushes.
- Limit the GitHub Action to source-language file changes on `main`.
- Start with 2-3 target locales.

---

## Repository layout

```
stringherd/
├── docs/
│   ├── DEVELOPMENT.md    this file
│   └── UI-PLAN.md        review UI design decisions
├── server/               Python + FastAPI backend (own pyproject.toml)
│   ├── app/              endpoints (routers/), storage logic (services/), sign-in (security.py), permissions, CLI, models, settings
│   ├── migrations/       Alembic database migrations
│   └── tests/            pytest suite (in-memory SQLite, no network)
├── web/                  review UI: React + Vite + TypeScript (own package.json)
│   └── src/              api/ (client, generated types), components/, pages/, locales/, styles/
├── scripts/
│   └── upload-source.mjs source string upload (Node, no dependencies)
├── vendor/
│   ├── deepl-cli-2.0.0.tgz
│   └── README.md         provenance of the vendored CLI
├── .env.op               1Password secret references (committed)
├── .gitattributes        LF line endings for all text files
├── .gitignore
├── CLAUDE.md             instructions for coding sessions
├── package.json          JS tooling root
├── package-lock.json
└── README.md
```

The demo target is a separate repository (FitJournal), localized through DeepL Sync.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm error 404 ... @deepl/cli` | Package not on npm | Install from `vendor/` (see above) |
| `deepl requires Node.js >= 24.15.0` | Node too old | `nvm install 24` |
| `op` cannot resolve a reference | Vault, item or field name mismatch, or 1Password locked | Compare `.env.op` with 1Password; run `op read "op://..."` |
| `rm` or `chmod` not recognized during build | npm runs scripts in `cmd.exe` on Windows | Use `npx tsc` instead of `npm run build` |
| Git says another git process is running | Stale `.git/index.lock` | Make sure no git process is running, then delete `.git/index.lock` |
| `/health` reports `database: unreachable` | Supabase project paused after 7 days of inactivity | Resume the project in the Supabase dashboard |
| `password authentication failed for user "postgres"` | Password in the `url` field does not match Supabase (often leftover `[ ]` from the placeholder) | Rebuild the URL from the 1Password password field |
| pytest: `import file mismatch` | Stale `__pycache__` after renaming a test file | `rm -rf tests/__pycache__ .pytest_cache` |
| `401 Not signed in.` in `/docs` | No session cookie, or it expired | Call `POST /api/auth/login` first, on the same host you use for `/docs` (`127.0.0.1` and `localhost` keep separate cookies) |
| `op run`: `exec: "deepl": executable file not found` | `deepl` defined as a shell function; `op` only finds real executables | Use `npx deepl` inside this repo, or add `stringherd/node_modules/.bin` to `PATH` to call `deepl` from another project |
