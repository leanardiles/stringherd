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
| `Stringherd TMS` (API Credential) | `credential` | `TMS_API_KEY` | Development key: the server accepts it for every project, and the DeepL CLI sends it. Optional; projects also have their own keys (see [Projects and API keys](#projects-and-api-keys)) |
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
- `http://127.0.0.1:8100`: the review UI, once it is built (see [Running Stringherd as one server](#running-stringherd-as-one-server))

### Users and sign-in

Machines (DeepL Sync, the upload script) use API keys. People sign in with email and password. There is no self-signup: the first admin is created from the command line, and admins create everyone else.

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

Then sign in to the review UI (see [Review UI](#review-ui)) and open **People** in the top bar to add reviewers and assign them languages (a language must be one of the project's target languages). Everything is also available in `/docs`: call `POST /api/auth/login` first, and the browser keeps the session cookie for the other endpoints.

Passwords set by an admin are temporary: Stringherd generates one and shows it once (`temporary_password` in the API), or the admin chooses one. At first sign-in the user is taken to a page to choose their own (`POST /api/auth/password`); until then every other endpoint answers `403 Choose a new password before continuing.` An admin can issue a new temporary password from the person's page (`POST /api/admin/users/{id}/reset-password`). Passwords set with `set-password` on the command line are not temporary.

| Role | Can do |
|---|---|
| `admin` | Manage projects, their languages and API keys; manage users and assignments; review and deliver any project and language; reopen delivered strings |
| `reviewer` | Review and deliver only the project and language pairs assigned to them |

Whether admins may review is decided in one place, `can_review` in `app/permissions.py`.

Settings (environment variables, optional):

| Variable | Default | Meaning |
|---|---|---|
| `SESSION_DAYS` | `7` | How long a sign-in lasts |
| `COOKIE_SECURE` | `false` | Set to `true` when Stringherd is served over HTTPS, so the browser only sends the cookie over HTTPS |
| `PUBLIC_URL` | (none) | The address repositories use to reach Stringherd, shown on each project's setup page. Without it, the setup page uses the address of the admin's browser |
| `TMS_API_KEY` | (none) | Development key that opens every project. Leave it unset on a shared server, so only project keys work |

Passwords are stored as Argon2 hashes. The session cookie holds a random token; the database stores only its SHA-256 hash.

### Demo data

`seed-demo` fills an **empty** database with a demo project, Trailhead, a small fictional hiking app: 22 English strings translated into French and Latin American Spanish (`es-419`). It is what the Docker setup loads on its first start, and what the README walkthrough shows.

```bash
python -m app.cli seed-demo     # against a local database; add op run for one from .env.op
```

- **People**: `admin@trailhead.example` and `reviewer@trailhead.example`, both with the password `trailhead-demo`, printed by the command. The `.example` domain is reserved and can never belong to anyone, so these addresses never reach a real inbox. Use the demo only on your own computer.
- **French** has a review session behind it: 4 strings delivered, 3 approved since (one edited by the reviewer, so the editor shows a word diff), the rest to review. One string misses its `{{name}}` placeholder, so it cannot be approved; two carry quality warnings.
- **Spanish** has just arrived from DeepL: all 22 strings to review.
- It refuses to run when any user or project exists, so it never mixes with real data; running it again changes nothing. The data lives in `server/app/demo.py` and goes through the same functions as real data (project creation, source upload, Deliver).

### Projects and API keys

A project must exist before DeepL Sync pushes to it; a push to an unknown project answers `404 Project 'x' not found`. Its id is the `tms.project_id` in the repository's `.deepl-sync.yaml`. As an admin, open **Projects** in the top bar:

1. **New project**: name, project id, source language and target languages.
2. On the project's page, **New key**. The key (`shp_...`) is shown **once**: save it in 1Password right away. Stringherd stores only its hash.
3. **Connect a repository**, on the same page, shows the `.deepl-sync.yaml` block and the commands for the repository.

The same steps work in `/docs` with `POST /api/admin/projects`, `POST /api/admin/projects/{projectId}/keys` and `GET /api/admin/projects/{projectId}/setup`.

The repository then sends that key as `TMS_API_KEY`. A project key opens only its own project (`403` for another one); revoke it on the project's page. The server-wide `TMS_API_KEY` keeps working for every existing project, which is how FitJournal is set up locally. Design and rules: [ADMIN-PLAN.md](ADMIN-PLAN.md).

### Delivering reviewed strings

`deepl sync pull` exports only **delivered** strings. Approving a string is not enough: the reviewer clicks **Deliver** in the review screen when done with a session, and only then does the next pull bring that language's approved strings into the code. Until then, approved strings can still be changed.

Delivered strings leave the reviewer's working list and are locked. They stay searchable, read-only, under the **Delivered** filter. An admin can **Reopen** one to fix it; the code keeps the delivered text until the language is delivered again. A changed source string, or a new machine translation from DeepL, sends a delivered string back to review and drops its delivered text, so a pull never writes a translation of the old source.

Strings approved before Deliver existed were marked as delivered by the migration, so the first pull after upgrading returns the same as before.

To start a language's review over, `reset-language` puts it back to DeepL's machine translation: edits are undone, approvals removed, delivered text cleared, and every string is to review again. It first shows what will change and asks you to type the language code; `--dry-run` only shows it.

```bash
op run --env-file=../.env.op -- python -m app.cli reset-language --project fitjournal --locale fr --dry-run
op run --env-file=../.env.op -- python -m app.cli reset-language --project fitjournal --locale fr
```

Nothing is pullable afterwards until the next Deliver, so the repository keeps what it has. Past deliveries stay recorded, and other languages are not touched. Strings with no DeepL text on record (pushed before Stringherd kept it) are listed and left as they are.

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

## Running Stringherd as one server

To use Stringherd rather than work on its UI, the server also serves the built review UI, so everything runs at one address: the browser and DeepL Sync both use `http://localhost:8100`. No Node process runs alongside.

```bash
cd web && npm install && cd ..      # once, and again when web/package.json changes
npm run build:web                   # from the repository root: builds the UI into web/dist/
cd server
op run --env-file=../.env.op -- uvicorn app.main:app --port 8100
```

Then open `http://localhost:8100`. After pulling UI changes, run `npm run build:web` again and reload the page; the server does not need a restart.

### Which setup to use

| Doing | Use |
|---|---|
| Changing UI code | The development setup: Vite on 5180 and the server on 8100 ([Review UI](#review-ui)). Each save shows up in the browser at once; a build takes 10 to 20 seconds |
| Changing only backend code | Either; the one server is simpler |
| Checking the real build before a release | One server |
| Trying Stringherd, demos, screenshots, self-hosting | Docker ([below](#running-stringherd-with-docker)), or one server against your own database |

If `web/dist/` exists while you use the development setup, port 8100 serves that older build. Work on 5180.

### How it works

`server/app/web.py` answers only the requests no endpoint claims, so the UI can never shadow the API:
- `/api/...`, `/health` and `/docs` behave exactly as without a UI. An unknown `/api` path still gets a JSON 404, which DeepL Sync and the UI rely on.
- A file that exists in the build is served as is: the bundles in `/assets`, the logo, the favicon.
- Any other address gets `index.html`, and the React app opens the page itself. Reloading a page or opening a bookmark works.
- Bundles have a content hash in their names, so browsers keep them for a year. `index.html` is revalidated on every load, so a new build shows up at once.
- Without a build, the server runs the API only, and opening a page shows how to build the UI.

`WEB_DIST` points the server to another build folder. `WEB_DIST=` (empty) turns the UI off, for hosts that serve `web/dist` themselves from a CDN (the plan for Vercel, see the [roadmap](../ROADMAP.md)).

---

## Running Stringherd with Docker

The quickest way to try Stringherd, and the way to self-host it: one command starts Stringherd with its own Postgres database and the Trailhead demo project ([Demo data](#demo-data)). No Python, Node, Supabase, 1Password or DeepL key is needed, only [Docker Desktop](https://www.docker.com/products/docker-desktop/) (no Docker account needed).

From the repository root:

```bash
docker compose up --build
```

Then open `http://localhost:8200` and sign in as `reviewer@trailhead.example` or `admin@trailhead.example`, password `trailhead-demo`.

Port **8200** on purpose: the development server keeps 8100, so both run side by side, each with its own database. `localhost:8100` is development (Supabase), `localhost:8200` is the Docker demo.

### Commands

Run them from the repository root.

| Command | What it does |
|---|---|
| `docker compose up --build` | Builds the image if the code changed, starts the database and Stringherd, shows their logs. Ctrl+C stops both |
| `docker compose up` | Starts again without rebuilding; your data is still there |
| `docker compose up -d` | The same, in the background; follow the logs with `docker compose logs -f app` |
| `docker compose down` | Stops and removes the containers. The data stays, in a Docker volume |
| `docker compose down -v` | Also deletes the data. The next start creates a fresh demo |

**When to use which**:
- After pulling or changing code: `docker compose up --build`. Unchanged steps come from Docker's cache, so a rebuild usually takes seconds.
- To start the demo over (after trying things out, or when `server/app/demo.py` changed): `docker compose down -v`, then `docker compose up --build`. A changed demo only appears in an empty database, since `seed-demo` never touches one that has data.

### What a start looks like

1. The first time only, Docker downloads the Node, Python and Postgres base images (a few hundred MB) and builds the image: `npm ci`, `npm run build`, `pip install`.
2. `db-1` ends with `database system is ready to accept connections`; Stringherd waits for this (the health check in `docker-compose.yml`).
3. `app-1` runs the migrations (`Running upgrade ...` lines, only for what is new), creates the demo on the first start (`Demo project Trailhead created`, later `Nothing changed`), then shows `Uvicorn running on http://0.0.0.0:8100`. That is the port inside the container; the browser uses 8200.

### How it is built

| File | Role |
|---|---|
| `Dockerfile` | Two stages: Node builds the UI, then a slim Python image installs the server and takes only the built UI across. Runs as an ordinary user, not root |
| `docker/start.sh` | What the container runs: migrations, the demo data when `STRINGHERD_SEED_DEMO=true`, then the server. Stops at the first failure, so the server never starts on a half-migrated database |
| `docker-compose.yml` | The database and Stringherd together: a volume for the data, a health check so Stringherd waits for Postgres, the port on `127.0.0.1` only |
| `.dockerignore` | An allow-list of what Docker may copy into a build: only what the Dockerfile uses. Secrets, `node_modules`, `.venv`, `.git` and private documents stay out, including files added later |

**For local trial only as configured.** The demo password is public, so Stringherd only listens on this computer (`127.0.0.1`), and the database has no port outside the containers. The image itself has no secrets and no demo data unless `STRINGHERD_SEED_DEMO=true`, so it can also run against a real database; hosting it publicly would need HTTPS, `COOKIE_SECURE=true` and real accounts. The hosted demo runs on Vercel instead (see the [roadmap](../ROADMAP.md)).

### README screenshots

The screenshots in `docs/images/` come from the Docker demo, captured by `scripts/screenshots.mjs` (Playwright): it signs in as the demo reviewer and admin, opens each screen at 1440 by 900 (at twice the pixels, so they stay sharp) and saves them. It only looks, it never approves or delivers, so it can run any number of times.

```bash
npm install                          # once, from the repository root: installs Playwright
npx playwright install chromium      # once: the browser Playwright drives
docker compose down -v && docker compose up --build -d   # a fresh demo, so the screens match the README
npm run screenshots                  # writes docs/images/01-projects.png ... 08-setup.png
```

Run it again after a UI change and commit the images that changed. Options: `--url` (default `http://localhost:8200`), `--out` (default `docs/images`), `--chromium` (a browser already installed, instead of Playwright's own).

---

## DeepL CLI

### What it is and why we need it

The DeepL CLI provides `deepl sync`, the engine on the other side of Stringherd's API:

```
Source-language files in the repo
  -> deepl sync         translates new or changed strings via the DeepL API
  -> deepl sync push    sends them to Stringherd for review
  -> linguists review in Stringherd, then Deliver the language
  -> deepl sync pull    writes delivered translations back to the repo
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
│   ├── API.md            every HTTP endpoint (interactive docs at /docs on a running server)
│   ├── DEVELOPMENT.md    this file
│   ├── SHORTCUTS.md      keyboard shortcuts (kept in step with web/src/lib/shortcuts.ts by a test)
│   ├── UI-PLAN.md        review UI design decisions
│   ├── images/           README screenshots (npm run screenshots)
│   └── *-PLAN.md         design plans: admin screens, languages, screenshots
├── server/               Python + FastAPI backend (own pyproject.toml)
│   ├── app/              endpoints (routers/), storage logic (services/), sign-in (security.py), permissions, built UI serving (web.py), demo data (demo.py), CLI, models, settings
│   ├── migrations/       Alembic database migrations
│   └── tests/            pytest suite (in-memory SQLite, no network)
├── web/                  review UI: React + Vite + TypeScript (own package.json)
│   ├── src/              api/ (client, generated types), components/, pages/, locales/, styles/
│   └── dist/             the built UI (npm run build:web), served by the server; not committed
├── shared/
│   └── qa-cases.json     quality check cases tested by both the server and the UI
├── docker/
│   └── start.sh          what the Stringherd container runs: migrations, demo data, server
├── scripts/
│   ├── upload-source.mjs source string upload (Node, no dependencies)
│   └── screenshots.mjs   README screenshots from the Docker demo (Playwright)
├── vendor/
│   ├── deepl-cli-2.0.0.tgz
│   └── README.md         provenance of the vendored CLI
├── .dockerignore         what Docker may copy into a build (an allow-list)
├── .env.op               1Password secret references (committed)
├── .gitattributes        LF line endings for all text files
├── .gitignore
├── CLAUDE.md             instructions for coding sessions
├── Dockerfile            the Stringherd image: builds the UI, runs the server
├── docker-compose.yml    Stringherd and its database, with the demo project, on port 8200
├── package.json          JS tooling root (DeepL CLI, npm run build:web)
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
| `localhost:8100` says the review UI is not built | No `web/dist/` yet | Run `npm run build:web` from the repository root, then reload |
| `DATABASE_URL is not set` | A command run without `op run` | Run it through `op run --env-file=../.env.op -- ...` |
| Docker: `error during connect` or `Cannot connect to the Docker daemon` | Docker Desktop is not running | Start Docker Desktop and wait until it says it is running |
| Docker: `port is already allocated` for 8200 | Another program, or an earlier Stringherd container, uses 8200 | `docker compose down`, or change the left number in `127.0.0.1:8200:8100` in `docker-compose.yml` |
| Docker: the demo does not show a change to `demo.py` | The demo is only created in an empty database | `docker compose down -v`, then `docker compose up --build` |
| Docker: the app exits right after `Running upgrade` or with a database error | The database was not ready, or its data is from an incompatible version | `docker compose logs db`; for a demo, reset with `docker compose down -v` |
| `/health` reports `database: unreachable` | Supabase project paused after 7 days of inactivity | Resume the project in the Supabase dashboard |
| `password authentication failed for user "postgres"` | Password in the `url` field does not match Supabase (often leftover `[ ]` from the placeholder) | Rebuild the URL from the 1Password password field |
| pytest: `import file mismatch` | Stale `__pycache__` after renaming a test file | `rm -rf tests/__pycache__ .pytest_cache` |
| `404 Project 'x' not found` on push or upload | The project does not exist in Stringherd yet, or `project_id` has a typo | Create it under **Projects**, using the same id as `tms.project_id` |
| `403 This key belongs to project ...` | The key was issued for another project | Use that project's key, or issue one for this project |
| `403 Choose a new password before continuing.` | The account still has a temporary password | Sign in to the review UI and choose a new password (or call `POST /api/auth/password`) |
| `deepl sync pull` brings back nothing, or not the latest edits | Strings are approved but not delivered yet | Click **Deliver** for the language in the review screen, then pull again |
| `409 This string is delivered and locked.` | The string was delivered | An admin opens it in the review screen (Delivered filter) and clicks **Reopen** |
| `401 Not signed in.` in `/docs` | No session cookie, or it expired | Call `POST /api/auth/login` first, on the same host you use for `/docs` (`127.0.0.1` and `localhost` keep separate cookies) |
| `op run`: `exec: "deepl": executable file not found` | `deepl` defined as a shell function; `op` only finds real executables | Use `npx deepl` inside this repo, or add `stringherd/node_modules/.bin` to `PATH` to call `deepl` from another project |
