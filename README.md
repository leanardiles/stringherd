# Stringherd

**Open-source review server for [DeepL Sync](https://github.com/DeepL/deepl-cli/blob/main/docs/SYNC.md).**

DeepL's CLI machine-translates the locale files in your repository. Stringherd is where linguists review those translations, with the context they need, before the approved versions go back into your code.

> **Status: early development.** The DeepL Sync TMS contract is implemented and verified against the real DeepL CLI. The review interface is next.

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
                           Linguists review, edit and approve
                              │
deepl sync pull  ◄───────  only approved translations are exported
   │
   ▼
Your repo: reviewed translations land in the locale files
```

DeepL Sync defines a small REST contract for a translation management system (TMS) and delegates human review to it, but does not ship one. Stringherd implements that contract and focuses on what reviewers actually need: visual context, regional variants and terminology.

## Features

| Status | Feature |
|---|---|
| ✅ Done | DeepL Sync TMS contract: push, export and project status endpoints |
| ✅ Done | API-key authentication (`ApiKey` and `Bearer`, as sent by DeepL Sync) |
| ✅ Done | Idempotent, concurrency-safe push: re-pushing unchanged strings keeps their approval; only a genuinely new machine translation goes back to review, so a reviewer's edit is never overwritten by a re-push |
| ✅ Done | Export of approved translations only |
| ✅ Done | Source upload: one request per catalog, change detection, approvals reset when the source changes |
| 🚧 Next | Review interface: source, machine translation, edit, approve |
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
| `GET` | `/api/projects/{projectId}/keys/export?format=json&locale=fr` | Approved translations as a flat `{"key": "value"}` object |
| `GET` | `/api/projects/{projectId}` | Key count and review progress per locale |

Plus one **Stringherd extension**, because the contract never sends the source text:

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/projects/{projectId}/source` | Upload a full snapshot of source strings for one catalog file. Stringherd reports what was created, updated, unchanged or removed, and sends approved translations back to review when their source changed |

And `GET /health` (server and database status), with interactive docs at `/docs`.

## Using it with a project

In the project being localized, point DeepL Sync at Stringherd in `.deepl-sync.yaml`:

```yaml
tms:
  enabled: true
  server: http://localhost:8100
  project_id: my-app
```

Then, with the same `TMS_API_KEY` set for both Stringherd and the CLI:

```bash
deepl config set tms.allowedServers localhost   # one-time: approve the destination
deepl sync --flag-for-review                    # machine-translate
deepl sync push                                 # send translations to Stringherd for review
node path/to/stringherd/scripts/upload-source.mjs \
  --project my-app --file locales/en/common.json # send the source strings
deepl sync pull                                 # bring approved translations back
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
| Review UI (planned) | React, Vite, TypeScript |
| Machine translation and sync | DeepL CLI (`deepl sync`) |
| Secrets | 1Password CLI (`op run`) |

## Development

See **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** for setup, running the server, tests, migrations and troubleshooting.

Quick check that everything works:

```bash
cd server
pip install -e ".[dev]"
pytest
```

---

Stringherd is an independent project. It is not affiliated with, or endorsed by, DeepL SE. DeepL is a trademark of DeepL SE.
