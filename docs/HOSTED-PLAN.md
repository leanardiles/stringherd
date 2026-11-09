# Hosted Plan

Working plan for putting Stringherd online: first a public demo, later my own production deployment. Reference while we build it; fold what lasts into [DEVELOPMENT.md](DEVELOPMENT.md) and delete it when the work is done. Planned as the **Hosted demo** milestone in the [roadmap](../ROADMAP.md), with production following in **FitJournal in production**.

---

## The goal

Anyone can open Stringherd in the browser and try it, with nothing to install and nothing to ask for: a recruiter clicks a link and is reviewing strings a few seconds later. It costs nothing to run while it is a demo.

Done when demo.stringherd.dev shows Stringherd with a demo project, a visitor can sign in with one click as a reviewer or an admin, what visitors change disappears at the next reset, and the README links to it.

---

## Two deployments, one codebase

The demo and production run the same code from the same repository, as **two Vercel projects**, each with its own database, settings and address.

| | Demo | Production |
|---|---|---|
| Address | demo.stringherd.dev | app.stringherd.dev |
| Who uses it | Anyone, through demo accounts | Me and invited reviewers |
| Data | The Trailhead demo project, reset regularly | FitJournal's real strings, reviews and API keys, never reset |
| Settings | Demo mode on | Demo mode off |
| Database | Supabase, free plan | Supabase, Pro ($25 a month: daily backups, no pausing) |
| When | This milestone | FitJournal in production |

They stay apart because their data has opposite rules: in the demo any visitor is an admin and everything resets; production holds work people did. A bug or abuse in the demo cannot reach production, and a change can go to the demo first and to production once it has proven itself.

**stringherd.dev** redirects to the demo for now, so the link on my CV opens something that works; later it can become a small landing page. Separate subdomains also keep sign-in cookies apart: a demo session is never valid on production.

---

## Databases

Supabase's free plan allows two active projects per organization (paused projects don't count), each with a 500 MB database, and pauses a project after a week without activity. Pro costs $25 a month per organization and includes $10 of compute credits, enough for one small project; each further project adds about $10.

Both free slots were taken: `stringherd-db` and `cinematheque-categorizer`. `stringherd-db` was called the development database, but it holds FitJournal's real review history (French, Dutch and Spanish), so it is production's database in practice. It stays, and becomes production's.

1. **Backed up `stringherd-db`** (9 November 2026): `pg_dump` of the `public` schema into a file outside the repository, then restored into a throwaway local Postgres to prove it (272 to 278 translations per language, migration `b9d4e6f2a8c1`).
2. **`stringherd-db` moved into its own organization, "Stringherd", on Pro** ($25 a month: daily backups, no pausing).
3. **The demo's database, `stringherd-demo-db`**, is in the free organization next to `cinematheque-categorizer`, in the same region (`ca-central-1`). Its addresses are in 1Password (`stringherd demo database`: `url` for the session pooler, `transaction_url` for the transaction pooler), and `.env.demo.op` refers to them. Migrated and seeded with the Trailhead project.
4. **When production starts**, development moves to the local Postgres the Docker setup already runs, so no hosted database is used for development.

Database passwords use letters and digits only: they sit inside connection strings, where characters such as `@ : / ? #` would have to be encoded.

Going back is possible: an organization can downgrade from Pro to Free, or a project can move to a free organization, as long as a free slot is open. So when the demo is no longer needed, deleting it frees its slot, and production can return to the free plan if I accept losing backups.

---

## How it runs on Vercel

Vercel runs Python as functions: FastAPI is detected from the dependencies, and the app is found by its entrypoint (`app.main:app`, set in `pyproject.toml`). What matters for Stringherd:

- **Nothing in memory between requests.** Sessions are already in the database. Sign-in rate limiting will be too.
- **The database through Supabase's pooler** in transaction mode (port 6543), with SQLAlchemy's `NullPool`, as Supabase recommends for serverless. psycopg prepares statements on its own after a few repeats, which the pooler does not support, so they are turned off (`prepare_threshold=None`). Local and Docker keep today's pool.
- **Limits that matter here**: request and response bodies up to 4.5 MB (a catalog of thousands of strings is far below), 300 seconds per request, 2 GB of memory, one region. The function's region is set to the database's region.
- **Cold starts**: the first request after a quiet period starts Python. To check: a `deepl sync push` from a laptop or CI against a cold server.

**Serving the UI** is the one open technical choice, settled with a first deploy in chunk 1:

- **A: Vercel Services** (one project, two services: the Vite build and the FastAPI function, routed by path). Vercel's documented way to run a frontend and a Python backend on one domain. In beta.
- **B: the function and the CDN together**: the built UI goes in `public/`, which Vercel's CDN serves, and every other path reaches FastAPI, which already answers unknown paths with `index.html` (`app/web.py`). Closer to how Stringherd runs today, and not in beta.

Either way the browser, the API and DeepL Sync use one address, as locally.

**Settings per deployment**, in Vercel's environment variables (copied from 1Password; nothing secret in the repository): `DATABASE_URL` (the pooler address), `COOKIE_SECURE=true`, `PUBLIC_URL`, and `DEMO_MODE` on the demo only. `TMS_API_KEY`, the server-wide development key, stays unset on both: projects only accept their own keys.

**Migrations** run before a deploy that needs them: `alembic upgrade head` from my machine with `op run`, against the direct database address (port 5432) rather than the pooler. Later from a GitHub Action.

The Vercel Hobby plan is free and limited to personal, non-commercial use: the demo and my own FitJournal fit. A pilot for someone else's company would need the Pro plan.

---

## The demo

- **Data**: the Trailhead demo project that `seed-demo` already creates for Docker (a fictional hiking app in French and Latin American Spanish), with an admin and a reviewer account.
- **One-click sign-in**: on the sign-in page, **Try as reviewer** and **Try as admin** sign the visitor in to the demo accounts without a password. Only with `DEMO_MODE` on; on production the buttons and the endpoint behind them do not exist.
- **A banner** on every page: this is a demo, shared with other visitors, and it resets at a stated time.
- **Guardrails**: the demo accounts cannot be deactivated, demoted or given a new password, so one visitor cannot lock out the next. Everything else is allowed, since the reset undoes it.
- **Reset**: a Vercel cron job calls a reset endpoint, protected by a secret, that empties the database and runs the seed again. Daily to start; Hobby allows down to every 15 minutes, if visitors often find the demo already reviewed.
- **Shared, not per visitor**: everyone sees the same data between resets. A copy per visitor is possible later if it matters.

---

## Hardening

Both deployments, built once:

- **Sign-in rate limiting**: failed attempts counted in the database per account and per address, with a short lockout after too many.
- **Cookies and headers**: `Secure` and `HttpOnly` session cookies (`SameSite=Lax`, as today), HTTPS only, and basic security headers (no framing by other sites).
- **No development key**: `TMS_API_KEY` unset, so DeepL Sync needs a project key.
- **Monitoring**: `/health` (server and database) checked by a free uptime service, and errors visible in Vercel's logs.

Password reset by email and invitations wait for production, where real reviewers need them; in the demo there are no real accounts.

---

## Chunks

| | Chunk | What | Status |
|---|---|---|---|
| 0 | Preparation (mine) | Back up `stringherd-db`; `stringherd-db` on Pro in its own organization; the demo's database, migrated and seeded; the Vercel project, created at the start of chunk 1 | Done |
| 1 | Serverless fit | Pooler settings and `NullPool`; the entrypoint; the UI served by A or B, decided by a first deploy to a `.vercel.app` address; the region; a cold-start push | To do |
| 2 | Demo mode | `DEMO_MODE`, one-click sign-in, the banner, guardrails, the reset endpoint and its cron job | To do |
| 3 | Hardening | Sign-in rate limiting, security headers, health monitoring | To do |
| 4 | Launch | demo.stringherd.dev and the stringherd.dev redirect; a "Try it" section in the README; docs; release `1.2.0` | To do |

Production (later, in FitJournal in production): app.stringherd.dev as a second Vercel project; `stringherd-db` on Pro; development on local Postgres; FitJournal's `.deepl-sync.yaml` pointing at app.stringherd.dev with a project key instead of the development key.

---

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | Demo and production are two Vercel projects from one repository, each with its own database and settings | Agreed |
| 2 | Addresses: demo.stringherd.dev, app.stringherd.dev, and stringherd.dev redirecting to the demo for now | Proposed |
| 3 | `stringherd-db` becomes production's database, on Pro in its own organization; the demo's database stays on the free plan | Done |
| 4 | Development moves to local Postgres when production starts | Agreed |
| 5 | One-click demo sign-in (Try as reviewer, Try as admin), only with `DEMO_MODE` | Proposed |
| 6 | One shared demo, reset daily by a cron job | Proposed |
| 7 | How the UI is served (Vercel Services or `public/` with the function), settled by the first deploy | Open |
| 8 | Migrations from my machine at first, from a GitHub Action later | Proposed |
| 9 | `TMS_API_KEY` unset on both deployments | Proposed |

---

## Open questions

- How often to reset the demo: daily, or more often if visitors keep finding it already reviewed.
- Whether the demo should also show the DeepL Sync side, for example a page that sends a sample push, since visitors cannot run the CLI against it.
- An uptime service for the health check (several have free plans).
