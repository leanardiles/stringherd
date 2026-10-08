# Roadmap

Where Stringherd is headed, in phases. Concrete tasks live in [GitHub Issues](https://github.com/leanardiles/stringherd/issues); this page is the big picture and is updated when a phase changes.

Legend: ✅ done · 🚧 in progress · 📋 planned

---

## ✅ Done

- **DeepL Sync TMS contract**: push, export and project status endpoints
- **API-key authentication** accepting both forms DeepL Sync sends (`ApiKey` and `Bearer`)
- **Idempotent, concurrency-safe push**: re-pushing unchanged strings keeps their approval; changed strings go back to review; parallel pushes to a new project are handled atomically
- **Export of approved translations only**
- **Reviewer edits are protected**: a push only reopens a translation when DeepL delivers something new (because the source changed), the same rule CAT tools follow when a source file is updated
- **Source upload**: one request carries all source strings of a catalog (with file and commit); detects new, changed and removed keys and sends approved translations back to review when their source changes
- **Upload script** for JSON catalogs (`scripts/upload-source.mjs`)
- Database schema and migrations (PostgreSQL, Alembic), health check, test suite
- Verified end to end against the real DeepL CLI (push, re-push, pull, auth errors)
- Optional `source_file` on each key, recording which catalog file a string comes from
- **Reviewer accounts**: admin and reviewer roles, email and password sign-in (Argon2 hashes, server-side sessions in a secure cookie), assignments per project and language, a `create-admin` command, no self-signup
- **Review API**: list strings with source and DeepL's original, edit, approve, withdraw approval, bulk approve; each approval records who made it

## 🚧 Now: MVP

The goal: a complete loop on a real app, from machine translation to reviewed strings back in the repository.

- **Review screen** (the API is done): source and machine translation side by side, edit, approve, bulk approve, filter by status. Design starts with a brainstorming session
- **End-to-end demo** on a real app (FitJournal): English source, French machine translation, review in Stringherd, approved French pulled back into the repository

## 📋 Next

- **Automation**: a GitHub Action runs `deepl sync` and the uploads on every push to the source files (least-privilege permissions); a Cloudflare Tunnel lets GitHub reach a locally running Stringherd
- **Audit log**: full history of who changed and approved what (today only the latest approver is kept)
- **Account hardening**: sign-in rate limiting, password reset by email, invitations, CSRF tokens once the UI is served from another origin
- **Workflows per locale and path**: MT only, MT + review, MT + review + sign-off, configured as ordered rules
- **Source change handling**: show old and new source next to the previous translation; send changed strings back to review; option to carry over translations when only punctuation or typos changed
- **Quality checks**: broken placeholders, length expansion warnings, strings identical to the source
- **Existing translations policy** when onboarding a project, per locale: adopt as approved, adopt for review, or retranslate
- **Screenshots** showing where each string appears (design: [docs/SCREENSHOTS-PLAN.md](docs/SCREENSHOTS-PLAN.md)):
  - automated capture with Playwright and a React (i18next) adapter that tags rendered strings with their keys
  - manual upload and tagging for screens a crawler cannot reach
  - context status per key (captured, manual, stale, missing, not visual) and a coverage dashboard

## 📋 Later

- **GitHub App with zero-config onboarding**: connect a repository from the Stringherd UI; Stringherd opens a setup pull request containing `.deepl-sync.yaml` and the CI workflow; approved translations come back as pull requests
- **Adding and releasing languages**: add a language from Stringherd (setup pull request); keep it hidden until review is complete; release it with one deliberate step
- **Regional variants as deltas**: e.g. `es-AR` stores only what differs from `es`; a variant review pass marks each string as "same as base" or provides an override
- **Translation memory** with fuzzy matching, showing each match with the screenshot of its original context
- **Glossary**: import (TBX, CSV), term highlighting, consistency checks, sync to DeepL glossaries
- **Visual QA**: capture the translated build and flag text that overflows or gets cut off
- **Per-project API keys** and a hosted instance

## 📋 Interoperability

- **XLIFF 2.0 export and import**, so linguists can work in their CAT tools (Trados, memoQ) and QA tools: placeholders as protected `<ph>` tags, segment states mapped to workflow steps, key and context carried as notes
- **TMX import and export** for translation memory, with references to the original context
- **ICU MessageFormat support**: placeholders and plural branches shown as protected chips in the editor, a check that the syntax is still valid, and a preview of each plural form
- **Source upload for every format DeepL Sync supports** (YAML, PO, Android XML, iOS, ARB, XLIFF and more), not only JSON
- **Screenshot adapters** for more frameworks (Vue, Angular)

## Known limitations

These come from the DeepL Sync contract or CLI as of version 2.0.0:

- **Plurals in PO and Android files are not pulled.** The contract carries one string per key, which cannot fill multiple plural forms. Formats that store plurals as separate keys (e.g. i18next's `_one` / `_other`) are not affected.
- **No file dimension.** Two catalog files that share key names cannot be told apart by a TMS; use one Stringherd project per group of files.
- **Push does not include source text**, hence the separate source upload.
- **The first sync overwrites existing translations** when there is no lockfile. Use the adoption flow (push, approve, pull) before the first sync on a project that already has translations.
- **On Windows**, target path resolution needs `target_path_pattern` on the bucket.

## Not planned

- Live, editable in-context translation inside the running app (screenshots are read-only context)
- Connectors to other TMS platforms (Phrase, Smartling and similar already integrate with GitHub)
- Screenshot capture for native mobile apps (for now)
