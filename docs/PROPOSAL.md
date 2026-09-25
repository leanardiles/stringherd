# Stringherd: Project Proposal

**Domain:** stringherd.dev
**Status:** Planning (stack decided, see section 7)
**Last updated:** 2026-09-24

> Open-source review server for DeepL Sync. Linguists review machine translations with screenshots showing where each string appears, then approved strings go back to your GitHub repo.

---

## 1. Summary

Stringherd is the human-review half of DeepL's developer localization workflow. DeepL's official CLI (`deepl-cli` v2.0.0, Aug 2026) ships `deepl sync`, which machine-translates i18n resource files in a repo. It delegates human review to "a TMS" through a minimal REST contract, but DeepL does not provide that TMS or any review UI.

Stringherd implements that contract and adds what reviewers actually need: a review interface with visual context (screenshots), configurable workflows, translation memory and glossary support, and regional variant handling. Approved translations flow back into the GitHub repo.

## 2. Why this project

### As a product
The general market (GitHub-connected TMS with MT + review) is saturated: Crowdin, Lokalise, Phrase, Smartling, Transifex, Localazy, SimpleLocalize, plus free open-source options (Weblate, Tolgee) and AI-first tools (Lingo.dev). Phrase and Smartling already have native GitHub connectors, so a connector to them adds no value. **Stringherd is not positioned as a startup.**

### As a portfolio project
It targets a real, specific gap in DeepL's own developer tooling and maps directly to DeepL's API Core role (Developer Experience, API platform):

| Job description asks for | Stringherd shows |
|---|---|
| Developer onboarding and self-service flows | GitHub App install, setup wizard, 5-minute quickstart |
| Starter templates for ISVs building on DeepL | Stringherd is one |
| Backend (Go/Python) + React/TypeScript dashboards | The stack |
| Clear abstractions, helpful errors, docs | OpenAPI spec, documented contract gaps |
| Tests, monitoring, reliability | CI, observability |

The differentiator: 10+ years of localization industry experience applied to a developer tool. The design decisions below (delta locales, visual TM matches, context coverage) come from knowing what reviewers need.

**Pitch:** "I built the missing human-review half of your developer workflow, against your own API contract."

**Strongest supporting move:** contribute an upstream fix or improvement to `DeepL/deepl-cli` discovered while implementing the contract.

## 3. The DeepL Sync contract

`deepl sync push` sends machine translations to a TMS; `deepl sync pull` retrieves approved ones. Config in `.deepl-sync.yaml`:

```yaml
tms:
  enabled: true
  server: https://api.stringherd.dev
  project_id: demo-app
  timeout_ms: 30000
  push_concurrency: 10
```

Endpoints the TMS must implement:

| Method | Endpoint | Purpose |
|---|---|---|
| `PUT` | `{server}/api/projects/{projectId}/keys/{keyPath}` | Receive a translation. Body: `{"locale":"de","value":"Hallo"}` |
| `GET` | `{server}/api/projects/{projectId}/keys/export?format=json&locale={locale}` | Return approved translations as a JSON object |
| `GET` | `{server}/api/projects/{projectId}` | Project status (reserved for future use) |

Auth: `Authorization: ApiKey {TMS_API_KEY}` or `Authorization: Bearer {TMS_TOKEN}`.

Relevant `deepl sync` behavior:
- Lockfile (`.deepl-sync.lock`) stores a content hash per source string; only new or changed strings are translated. Deleted keys are removed from targets.
- Lockfile tracks `review_status`: `machine_translated` or `human_reviewed`. `--flag-for-review` marks output for review.
- Extracts source-code context around `t('key')` calls and sends it to DeepL.
- Supports glossaries (by name/ID or `auto`), translation memory (`translation_memory` + threshold, requires `model_type: quality_optimized`), custom instructions, per-locale overrides (formality, glossary, TM, instructions, style_id).
- CI mode: `--frozen` fails if translations are missing. `--dry-run` estimates cost. `sync.max_characters` caps spend.
- 11 formats: JSON, YAML, TOML, PO, Android XML, iOS Strings, Xcode String Catalog, ARB, XLIFF, Java Properties, Laravel PHP.

### Known contract gaps (document as API feedback)
- No channel for context or screenshots; Stringherd needs its own extension endpoint.
- Key-level `PUT` only, no batching.
- Project status endpoint is reserved, not defined.
- No locale inheritance (see 5.2).

Verify all of the above against a real run before designing around it.

## 4. End-to-end flow

1. Developer pushes to `main`, changing source-language files (path filter, e.g. `locales/en/**`).
2. GitHub Action runs `deepl sync --flag-for-review`, then `deepl sync push`.
3. Capture step (same Action) runs the app in context-capture mode, crawls it with Playwright, uploads screenshots + key bounding boxes to Stringherd, tied to the commit SHA.
4. Stringherd applies workflow rules per string (MT only, MT + review, etc.).
5. Linguists review in the UI with visual context, TM matches and glossary checks.
6. On approval, Stringherd opens a PR with the approved translations (via `deepl sync pull` or directly through the GitHub App).

## 5. Key design decisions

### 5.1 Change detection
- Git event decides **when** (push to `main`; PR-time trigger is a stretch goal).
- `deepl sync` lockfile hashes decide **what**: new, changed, deleted, unchanged.
- Stringherd stores every source version per key. On change, the reviewer sees old source, new source and old approved translation side by side (like a fuzzy match).
- Trivial source changes (typo, punctuation): offer "carry over existing translation" instead of full re-review.
- Renamed keys: if the new key's source exactly matches an approved segment, reuse the translation automatically.

### 5.2 Regional variants (delta locales, e.g. es-AR)
Most i18n libraries fall back by region (`es-AR` to `es` to `en`; default in i18next and Android; FormatJS requires manual merging). The `es-AR` file should contain **only the strings that differ from `es`**.

- `es` is translated and reviewed in full.
- `es-AR` is a **variant review pass** over approved `es`: reviewer confirms "OK for AR" (nothing written) or enters an override (written to `es-AR`).
- Pre-flag likely overrides: run MT with Argentine instructions (voseo, local vocabulary) and diff against `es`; strings with second-person verbs are prime candidates.
- When an `es` string changes, its `es-AR` override becomes stale and re-enters the queue.
- DeepL supports `ES-419` but not `es-AR`; rely on custom instructions.
- `deepl sync` has no locale inheritance and would write a full file, so **the delta export lives in Stringherd**. This is a differentiator.

### 5.3 Workflow configuration
- **Repo (developers):** files, locales, MT settings in `.deepl-sync.yaml`.
- **Stringherd UI (localization manager):** ordered rules, first match wins. Example:
  - `legal/*`, all locales: MT + review + sign-off
  - `marketing/*`: MT + review
  - `errors/*`, low-priority locales: MT only
  - `es-AR`: variant review
  - default: MT + review
- **Per string (optional):** key metadata such as "needs legal review" or "max 20 characters" overrides rules.
- **Auto-escalation:** MT-only strings that fail QA (glossary term, placeholder, length) are bumped into review.
- Stretch: export/import rules as YAML (config as code).

### 5.4 Visual context (screenshots)
Static, read-only screenshots with the string highlighted.

**Automated capture (primary, ~1 week):**
1. App runs in context-capture mode: the i18n function (`t()`) tags rendered strings with their key via `data-i18n-key` or invisible zero-width markers.
2. Playwright visits routes from a config file, with optional scripted steps (log in, open a modal, submit an empty form).
3. For each tagged element: bounding box + full-page screenshot, stored with key and commit SHA.
4. Fallback for untagged apps: locate by exact source text (fails on duplicates and interpolated strings).

**Not reachable by the crawler:** backend-dependent error states, conditional content (roles, plans, plural counts), transient UI (toasts, spinners), deep multi-step flows, non-web surfaces (emails, push, PDFs, tab titles), non-rendered strings (aria-labels, alt text), dead keys.

**Context status per key:**

| Status | Meaning | Reviewer sees |
|---|---|---|
| Auto-captured | Found by crawler on latest commit | Screenshot + highlight |
| Manual | Uploaded and tagged by admin | Screenshot + "uploaded manually" label |
| Stale | Source changed since screenshot | Screenshot + warning |
| Missing | Nothing captured | Code snippet + GitHub link + "no visual context" badge |
| Not visual | Marked as email, aria-label, etc. | Code snippet + admin note |

**Manual flow (~3-4 days):** coverage dashboard (e.g. 212/260 keys, 82%), grouped missing keys, upload + draw box + pick key, one screenshot tagged with several keys, OCR key suggestions (Tesseract.js, stretch), stale detection by source version, "Request context" button for linguists.

**Stretch: visual QA.** Re-run capture with the target-language build and flag overflow/truncation (`scrollWidth > clientWidth`).

### 5.5 Translation memory and glossary
- **Glossary:** import TBX/CSV, highlight terms in source, QA check that target uses approved term, push to DeepL (multilingual glossaries supported).
- **TM:** every approved segment stored with source, target, locale, key, commit. Fuzzy matching via Postgres `pg_trgm` or Levenshtein. TMX import/export.
- **TM matches with screenshots (headline feature):** TM entries created in Stringherd link back to their key, and keys have screenshots. The reviewer sees not just "Save = Guardar" but that it was a button in Settings, while the current "Save" is a menu heading. Visual equivalent of ICE (in-context exact) matching. Imported TMX entries show no image.
- **TMX interchange:** the database is the source of truth; TMX is only for import/export. Carry context as custom properties, never embedded images:

```xml
<tu tuid="tm-8812" creationdate="20260924T101500Z">
  <prop type="x-key">settings.actions.save</prop>
  <prop type="x-commit">a1b2c3d</prop>
  <prop type="x-context-id">ctx-4471</prop>
  <prop type="x-context-bbox">412,96,88,32</prop>
  <note>Button, Settings page</note>
  <tuv xml:lang="en"><seg>Save</seg></tuv>
  <tuv xml:lang="es"><seg>Guardar</seg></tuv>
</tu>
```

  Use stable context IDs, not expiring URLs. Offline option: zip bundle of `.tmx` + `screenshots/`. Other CAT tools may drop `x-` props; re-link on import by key, or exact source + locale.

## 6. Scope

### MVP (the spine, days 1-4)
1. Demo app: React + Vite + react-i18next, 3-4 screens including a form and a modal.
2. `deepl sync` running in a GitHub Action.
3. Minimal server implementing the 3 contract endpoints with API keys.
4. Bare review list: source, MT, approve. Loop closed via `deepl sync pull`.

Demo: push English, German appears for review, approve, it lands in the repo.

### Phase 2
- Full review UI: source, MT, key path, code snippet with GitHub permalink, glossary highlighting, placeholder/ICU validation, approve/edit/reject.
- Workflow rules (5.3).
- GitHub App: opens PR on approval.
- Automated screenshot capture (5.4).

### Phase 3
- Manual screenshot upload, context status, coverage dashboard.
- TM with visual matches, glossary import, TMX export.
- Delta locales (5.2).

### Stretch
- PR-time trigger, visual QA for overflow, OCR key suggestions, config as code, upstream contribution to `deepl-cli`.

### Out of scope
- Live in-app (editable) in-context editing.
- Mobile app screenshot capture.
- Connectors to Phrase, Smartling or other TMSs.

## 7. Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend (Stringherd server) | Python + FastAPI + SQLAlchemy | Implements the TMS contract, workflows, TM, glossary, GitHub integration |
| Database | PostgreSQL (Supabase, free tier) | Session pooler connection (IPv4). `pg_trgm` for TM fuzzy matching. Free projects pause after 7 days of inactivity |
| Review UI | React + Vite + TypeScript | Static build, no Node server in production |
| Demo app | React + Vite + react-i18next | The app being localized, 3-4 screens |
| Screenshot capture | Playwright (Node) | Runs in GitHub Actions next to the demo app |
| MT and sync | `@deepl/cli` (`deepl sync`) | Installed as a local dev dependency, run with `npx` |
| File storage | Cloudflare R2 | Screenshots |
| Secrets | 1Password | `op run --env-file=.env.op` locally; GitHub repository secrets in CI |
| Hosting | TBD | AWS Lambda (as in FitJournal) or a container on Fly/Render |

Rationale: FastAPI is the strongest existing skill, Python is listed in the DeepL job description, and it is the fastest path to a demo. Go was considered and set aside to limit new learning. The DeepL signal comes from building on their contract and CLI, not from the backend language.

Repo layout (planned): root `package.json` as tooling and JS workspace root; `server/` with its own `pyproject.toml`; `web/` for the review UI; `demo-app/` for the localized sample app.

Node version: 24.15.0 or newer (required by DeepL CLI v2).

## 8. Costs

- **DeepL API:** current plans are Developer (free, 1M characters **one time, not monthly**) and Growth (about $26-30/month, ~1M/month plus overage). Old API Free/Pro plans are retired.
- Demo estimate: 300 strings x 40 chars x 5 locales = ~60k characters for the first full sync; incremental syncs are tiny.
- Protect the allowance: `sync.max_characters`, `--dry-run`, no DeepL calls in server tests, Action limited to source-file changes on `main`, start with 2-3 locales.
- **To verify on day one:** whether the Developer plan includes translation memory, custom instructions and style rules. If not, one month of Growth covers the demo.
- **Hosting:** ~$0. GitHub Actions free for public repos, Postgres free tier (Supabase), Cloudflare R2 free up to 10 GB, app server free or ~$5/month.
- **Domain:** stringherd.dev on Cloudflare Registrar.

## 9. Name and branding

- **Stringherd** = string + shepherd: herds strings through the workflow.
- Availability checked 2026-09-24: no existing product; GitHub org, npm, PyPI, crates.io free; no USPTO results. EU trademark (TMview) not yet checked.
- Avoid "Deep" in the name (DeepL trademark, reads as an official product). Reference DeepL only descriptively: "a review server for DeepL Sync".
- Repo topics: `localization`, `i18n`, `deepl`, `translation-management`, `github-actions`.

## 10. Future project: i18n audit agent

Separate repo, same portfolio story: the audit gets a repo ready to localize, Stringherd localizes it.

- Goes beyond lint rules (`eslint-plugin-i18next` already catches literal strings): string concatenation, hand-rolled plurals, hardcoded date/number/currency formats, text in images, fixed-width layouts, RTL assumptions, locale-unaware sorting.
- Ranks findings by severity and effort, and opens a fix PR (wrap strings in `t()`, extract keys).
- DeepL angle: onboarding friction, "your repo isn't ready, here's the PR that fixes it".
- Baseline: LILT's i18n audit (public spec not found; source document needed).
- Name TBD. "Polygoat" is taken (PolyGOAT language app, Polygoat Studio, and Polygot localization tool).

## 11. Open questions

- Hosting target (AWS Lambda vs container).
- Developer plan feature availability (TM, custom instructions, style rules).
- EU trademark check for "Stringherd".
- Confirm contract behavior with a real `deepl sync push/pull` run.

## 12. Sources

- [DeepL CLI](https://github.com/DeepL/deepl-cli)
- [DeepL Sync docs](https://github.com/DeepL/deepl-cli/blob/main/docs/SYNC.md)
- [DeepL CLI changelog](https://github.com/DeepL/deepl-cli/blob/main/CHANGELOG.md)
- [DeepL API changelog](https://developers.deepl.com/docs/resources/roadmap-and-release-notes)
- [DeepL API pricing 2026 (Langbly)](https://langbly.com/blog/deepl-api-pricing-guide/)
- [Phrase Strings GitHub sync](https://support.phrase.com/hc/en-us/articles/5784125562012-GitHub-Strings)
- [Smartling GitHub Connector](https://help.smartling.com/hc/en-us/articles/360008152513-GitHub-Connector-Overview)
- [Lingo.dev GitHub Actions](https://lingo.dev/en/docs/integrations/github)
- [Tolgee](https://github.com/tolgee/tolgee-platform)