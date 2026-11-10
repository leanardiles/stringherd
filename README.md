# Stringherd

**Open-source review server for [DeepL Sync](https://github.com/DeepL/deepl-cli/blob/main/docs/SYNC.md).**

DeepL's CLI machine-translates the locale files in your repository. Stringherd is where linguists review those translations, with the context they need, before the reviewed versions go back into your code.

> **Status: v1.1.0, released 9 November 2026, in use.** The full loop works, from DeepL Sync through review in Stringherd back into the code, and it shipped French to a live app ([FitJournal](https://fit-journal.com)) in October 2026. Reviewer accounts, admin screens, quality checks, bulk actions, Deliver and Phrase-style keyboard shortcuts are in place, and `docker compose up` runs a demo locally. Since 1.1.0, a language that already has translations joins without being retranslated: FitJournal's Dutch and Latin American Spanish came in this way in November 2026. **Try it online at [demo.stringherd.dev](https://demo.stringherd.dev)**, with nothing to install. Next: FitJournal in production, with the loop automated ([roadmap](ROADMAP.md), [changelog](CHANGELOG.md)).

![The review screen: a French string edited by a reviewer, with the word diff against DeepL's suggestion](docs/images/03-edited.png)

---

## Try it

### Online

Open **[demo.stringherd.dev](https://demo.stringherd.dev)** and click **Try as reviewer** or **Try as admin**. No account, nothing to install.

<p align="center"><a href="https://demo.stringherd.dev"><img src="docs/images/00-demo-sign-in.png" width="420" alt="The demo's sign-in page, with Try as reviewer and Try as admin"></a></p>

A demo project, Trailhead, is waiting: a small fictional hiking app with French partly reviewed and delivered, and Spanish just arrived from DeepL. The reviewer edits, approves and delivers translations; the admin also manages projects, languages, people and API keys. [What to look at](#what-to-look-at) suggests where to start.

The demo is shared, so other visitors see what you change, and everything resets at 07:00 and 19:00 UTC. It shows the review side: DeepL Sync, which sends strings in and pulls the reviewed ones out, runs from a repository ([how it works](#how-it-works)).

### With Docker

To try it on your own computer, with data only you see. With [Docker Desktop](https://www.docker.com/products/docker-desktop/) running, from the repository root:

```bash
docker compose up --build
```

Then open **http://localhost:8200** and sign in as `reviewer@trailhead.example` (or `admin@trailhead.example`), password `trailhead-demo`. A demo project, Trailhead, is waiting: a small fictional hiking app with French partly reviewed and delivered, and Spanish just arrived from DeepL. Nothing else to install, and no DeepL key needed.

- `Ctrl+C` stops it; `docker compose up` starts it again with your changes kept.
- `docker compose down -v` deletes the demo data, for a fresh start next time.

Runs on your computer only (`127.0.0.1`); the demo password is public, so do not expose it. Details, and how it is built: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#running-stringherd-with-docker).

### What to look at

<table>
<tr>
<td width="50%"><a href="docs/images/01-projects.png"><img src="docs/images/01-projects.png" alt="Projects page with Trailhead's languages and review progress"></a><br><sub>Your projects and languages, with review progress.</sub></td>
<td width="50%"><a href="docs/images/02-list.png"><img src="docs/images/02-list.png" alt="French strings in the list view with statuses and quality warnings"></a><br><sub>Open French and switch to <b>List</b>: status, quality warnings and character counts for every string.</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/images/04-qa-error.png"><img src="docs/images/04-qa-error.png" alt="A translation missing a placeholder, with approval blocked"></a><br><sub>Open <code>auth.welcome</code>: DeepL dropped <code>{{name}}</code>, so the quality check blocks approval until it is fixed.</sub></td>
<td width="50%"><a href="docs/images/05-bulk.png"><img src="docs/images/05-bulk.png" alt="All strings selected for bulk approval"></a><br><sub>Select all and approve: strings with errors are skipped and listed.</sub></td>
</tr>
<tr>
<td width="50%"><a href="docs/images/07-shortcuts.png"><img src="docs/images/07-shortcuts.png" alt="The keyboard shortcuts reference"></a><br><sub>Press <code>Ctrl+/</code> for the Phrase-style keyboard shortcuts.</sub></td>
<td width="50%"></td>
</tr>
</table>

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
| ✅ Done | Try it with one command: Docker Compose with its own database and a demo project |
| ✅ Done | Review interface: sign-in, project overview, review screen with single key and list views, DeepL suggestion with diff, approve and next, status symbols, QA checks, bulk approve and withdraw, Deliver, Phrase-style keyboard shortcuts with an in-app reference ([docs/SHORTCUTS.md](docs/SHORTCUTS.md)), non-printable characters |
| ✅ Done | Existing translations: a language that already has translations joins with an answer (translate again, keep for review, keep as reviewed), and the review screen shows whether each text came from DeepL or the repository |
| 📋 Planned | Screenshots showing where each string appears in the app, captured automatically |
| 📋 Planned | Configurable workflows per locale (MT only, MT + review, MT + review + sign-off) |
| 📋 Planned | Regional variants stored as overrides (e.g. `es-AR` holds only what differs from `es-419`); design in [docs/LOCALES-PLAN.md](docs/LOCALES-PLAN.md) |
| 📋 Planned | Translation memory with visual context, glossary checks |
| 📋 Planned | GitHub App: connect a repository from the UI; Stringherd opens the setup PR |

See the **[roadmap](ROADMAP.md)** for what's next and in which order.

## Using it with a project

The full loop, as it ran for [FitJournal](https://fit-journal.com)'s French in October 2026: 240 strings from DeepL, reviewed in Stringherd, delivered and live. The commands run in the project being localized. `deepl` is the DeepL CLI; it reads the DeepL key from `DEEPL_API_KEY` and the project's Stringherd key from `TMS_API_KEY` (FitJournal passes both with `op run`; any way of setting environment variables works).

### 1. Set up the project in Stringherd

An admin creates the project under **Projects**, adds its languages, creates an API key and assigns reviewers. The project's page shows the setup with its own values filled in.

In the project being localized, `.deepl-sync.yaml` points DeepL Sync at Stringherd, with the same project id:

```yaml
tms:
  enabled: true
  server: http://localhost:8100
  project_id: fitjournal
```

Once per computer, approve the destination:

```bash
deepl config set tms.allowedServers localhost
```

<a href="docs/images/08-setup.png"><img src="docs/images/08-setup.png" width="640" alt="A project's admin page: languages, API keys and setup steps"></a>

### 2. Machine-translate

```bash
deepl sync
```

DeepL translates the new and changed strings and writes them into the locale files; the lockfile (`.deepl-sync.lock`) records what was translated. A language that already has translations in the repository is added in Stringherd first ([below](#adding-a-language-that-already-has-translations)). `deepl sync --dry-run` shows what a run would bill; before a language's first pull it prices the whole language, a worst case.

### 3. Send them for review

```bash
deepl sync push
node path/to/stringherd/scripts/upload-source.mjs \
  --project fitjournal --file web-react/src/i18n/locales/en/common.json
```

```
Pushed 240 translations to TMS at http://localhost:8100
```

The push sends each translation, but not the English it came from, so the upload script sends the source strings. On later runs it reports only what changed (`unchanged: 240` when nothing did), and sends back to review any approved string whose English changed.

### 4. Review and Deliver

Reviewers work through the strings in the review screen, then click **Deliver** for the language. Approved strings wait until then, so a review in progress never reaches the code.

<a href="docs/images/06-deliver.png"><img src="docs/images/06-deliver.png" width="640" alt="The Deliver dialog, listing what the next pull will bring"></a>

### 5. Bring them back

```bash
deepl sync pull
git diff
```

The pull writes the delivered translations into the locale files and records them in the lockfile. From there it is an ordinary change: review the diff, commit, merge and deploy.

### Adding a language that already has translations

`deepl sync` keeps translations already in the files, but a push cannot say who wrote them, so Stringherd would take them for DeepL's. The admin adds the language on the project page first (**Add language**) and answers what to do with them: translate them again with DeepL, keep them for review, or keep them as reviewed.

For the two keep answers, the language's row then lists the steps, with the commands to copy: add the code to `target_locales`, run `deepl sync push --locale <code>` before any `deepl sync`, check the count of strings that arrived per file, click **Finish import**, and run `deepl sync pull --locale <code>`, which writes the same text back and records every key in the lockfile. From then on the language works like any other: the next `deepl sync` translates only the keys the files lack, and reviewers see which strings came from the repository.

FitJournal's Dutch joined this way on 1 November 2026: 254 strings imported for review, a pull that only normalized the file's formatting, and 32 characters billed, for the two keys the Dutch file lacked. Details in [docs/LOCALES-PLAN.md](docs/LOCALES-PLAN.md#existing-translations).

### On Windows

- **The `deepl` command:** `npm install` in Stringherd's repository installs the DeepL CLI it is tested with (vendored in `vendor/`). To use it from another project in Git Bash, add it to the PATH: `export PATH="/c/path/to/stringherd/node_modules/.bin:$PATH"`.
- **Permission warnings:** the CLI warns on every run that its config files are readable by other users. It is a Unix permission check that does not apply to Windows; the warnings are harmless.
- **Target paths:** path resolution fails for source paths like `locales\en\common.json`. Setting `target_path_pattern` on the bucket works around it, for example `target_path_pattern: "web-react/src/i18n/locales/{locale}/{basename}"`.

## Notes on the DeepL Sync contract

Building against the contract surfaced a few behaviors worth knowing (the full list is in the [roadmap](ROADMAP.md#known-limitations)):

- **Push does not send the source text**, only key, locale and translation. A review interface needs the source, so Stringherd needs another way to obtain it.
- **Keys have no file dimension.** Two locale files that share key names cannot be told apart by the TMS.
- **Existing translations are kept, but look like DeepL's.** `deepl sync` carries forward a translation already in a target file rather than translating it again (`--force` translates everything), but the push cannot say who wrote a text. Stringherd's import tells the two apart ([above](#adding-a-language-that-already-has-translations)).
- **The dry run prices a whole language** while any of its keys lacks a lockfile entry, even though the sync keeps what the files hold. For FitJournal's Dutch it estimated 9,650 characters, and the sync billed 32.
- **A pull records no review status in the lockfile.** The export carries only text, so DeepL Sync cannot tell a reviewed string from a machine translation, and writes the pulled strings without `review_status`.
- **On Windows**, target path resolution needs a workaround ([above](#on-windows)).

## Documentation

| Document | What's in it |
|---|---|
| [docs/API.md](docs/API.md) | Every endpoint: the DeepL Sync contract, the source upload, the review and admin API |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, running the server and the UI, Docker, tests, migrations, commands, troubleshooting |
| [docs/SHORTCUTS.md](docs/SHORTCUTS.md) | Keyboard shortcuts of the review screen |
| [docs/UI-PLAN.md](docs/UI-PLAN.md) | Design decisions for the review interface |
| [docs/ADMIN-PLAN.md](docs/ADMIN-PLAN.md) | Design of the admin screens: projects, keys, people |
| [docs/HOSTED-PLAN.md](docs/HOSTED-PLAN.md) | The hosted demo and, later, production on Vercel and Supabase: decisions and progress |
| [docs/LOCALES-PLAN.md](docs/LOCALES-PLAN.md) | Plan for existing translations, regional variants and hand edits |
| [docs/SCREENSHOTS-PLAN.md](docs/SCREENSHOTS-PLAN.md) | Plan for automatic screenshots as reviewer context (v2) |
| [ROADMAP.md](ROADMAP.md) | Milestones, what is done and what comes next, known limitations |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL (Supabase) |
| Hosting | Vercel (the UI on its CDN, the server as a Python function), Cloudflare DNS, UptimeRobot |
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

To run Stringherd itself, build the UI once with `npm run build:web`, start the server, and open `http://localhost:8100`: the server serves the UI and the API at one address ([details](docs/DEVELOPMENT.md#running-stringherd-as-one-server)).

## License

[MIT](LICENSE). The DeepL CLI vendored in `vendor/` is also MIT-licensed, by DeepL SE; its license is inside the package.

Stringherd is an independent project. It is not affiliated with, or endorsed by, DeepL SE. DeepL is a trademark of DeepL SE.
