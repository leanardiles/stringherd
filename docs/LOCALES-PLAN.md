# Languages plan

How Stringherd handles languages that already have translations, regional variants, sending reviewed strings back for another pass, and translation files edited by hand. This is a design document, updated as decisions are made. Existing translations are built (**v1.1**; FitJournal's Dutch went through them in November 2026, Spanish is next); the rest is planned for the **FitJournal in production** milestone in the [roadmap](../ROADMAP.md), with FitJournal as the first real case.

---

## How DeepL Sync treats target files

These facts, checked against the DeepL CLI 2.0.0, shape every decision below.

| Fact | Consequence |
|---|---|
| The lockfile (`.deepl-sync.lock`) records a hash of each **source** string per language, not the translated text | `deepl sync` does not notice a translation edited by hand in a target file |
| A key with no lockfile entry for a language counts as new, but a translation already in the target file is carried forward instead of translated, unless it is empty or equal to the source. Only `--force` translates every key again | A bare `deepl sync` on a language with existing files keeps them. It translates only the keys the files lack, those whose text equals the source, and, when the lockfile has the key, those whose source changed. This holds with no lockfile at all |
| `deepl sync --dry-run` prices every key of a language while any of them lacks a lockfile entry for it | Before a language's first pull the estimate is a worst case: for FitJournal's Dutch it showed 9,650 characters, and the sync billed 32 |
| `deepl sync push` reads the existing target files and sends each translation | Existing translations can reach Stringherd without being retranslated |
| The push says nothing about keys a target file lacks | Stringherd's import shows them, as the count of strings that arrived per file against its keys |
| `deepl sync pull` writes what the export returns, keeps keys the export leaves out as they are in the file, and records pulled keys in the lockfile | After push, export and pull, every key has a lockfile entry for the language: the next `deepl sync` and its dry run treat it as up to date |
| The push carries only `locale` and `value`, and the export only `key: value` | Stringherd cannot tell a human translation from DeepL's, or a hand edit from a new machine translation, from the request alone |
| A target locale is also the DeepL language; there is no mapping | A language code in the repository must be one DeepL knows: Latin American Spanish is `es-419`, not `es` (DeepL's `es` is European Spanish) |
| DeepL has no `es-AR` | A variant like `es-AR` cannot be a DeepL Sync target locale; Stringherd has to produce it |

---

## Language codes match DeepL's

Decision: each language in a repository uses the DeepL code for the variety it contains. For FitJournal this meant renaming `es` (Latin American Spanish) to `es-419` before Spanish goes into Stringherd, since project languages, the lockfile and file paths all key on the code. **Done in October 2026**; the checklist it followed:

- **Web app**: rename `locales/es` to `locales/es-419`; update the resource key and `LOCALE_OPTIONS`; fallbacks `es-AR` to `es-419` to `en`, and `es` to `es-419` to `en`, so a browser set to `es-MX` or `es-CL` still gets Latin American Spanish instead of English.
- **Backend**: rename `locales/es`; reverse the chain so `es` and `es-AR` fall back to `es-419`; the Accept-Language handling that reduces `es-CL` to `es` must land on the same text.
- **Saved preferences**: users with `user_locale = 'es'` are migrated to `es-419`, or `es` stays as an alias of it.

---

## Existing translations

DeepL Sync keeps the translations a repository already has, but a push cannot say who wrote them, so Stringherd would take them for DeepL's. The admin therefore adds the language in Stringherd before its first push (**Add language**) and answers what the translations are:

| Answer | In Stringherd | In the repository |
|---|---|---|
| No existing translations | DeepL translates, strings arrive to review | DeepL writes the file |
| Translate again with DeepL | Nothing imported. The row shows `deepl sync --force --locale <code>` with a character estimate, then the push | DeepL overwrites the file; strings arrive to review |
| Keep them for review | Imported, to review, marked as coming from the repository | Unchanged until a reviewer edits and delivers |
| Keep them as reviewed | Imported and delivered at once | Unchanged |

### The admin's steps

For the two keep answers an import opens at once, and the language's row lists the steps, with the commands to copy:

1. Add the code to `target_locales` in `.deepl-sync.yaml`.
2. `deepl sync push --locale <code>`, before any `deepl sync`: a sync fills the keys the files lack with DeepL's text, and the push would then import that text as the repository's.
3. Check what arrived: the row counts the strings per file against the file's keys, and refreshes by itself.
4. **Finish import**. From then on, that language's pushes are DeepL's again.
5. `deepl sync pull --locale <code>`: it writes the same text back and records every key in the lockfile.

Keys the files lack then go through DeepL with the next `deepl sync`, as usual.

### How it works

- **Per language** (`project_locales`): `import_mode` (`retranslate`, `review`, `reviewed`, or empty), `import_started_at`, `import_finished_at`. An import is open between the two dates. The answer can change only while the language has no strings, and Finish import refuses until a string has arrived.
- **Per string** (`translations`): `origin` (`deepl` or `repository`) and `imported_at`. Origin is a field of its own, apart from the review status; `pushed_value` keeps the pushed text whatever its origin.
- **Imported text counts as delivered from the start**, also when it is still to review, so the export returns it and the first pull records every key in the lockfile. The repository changes only when a reviewer delivers an edit.
- **When DeepL later sends new text** for an imported string (its source changed), the string's origin becomes DeepL.
- An import adds no entry to the delivery history; the language's row shows the import's own dates. `reset-language` puts imported strings back to the repository's text, and `remove-language` removes a language with its strings, to start over.
- A push for a language added without an answer works as before: its strings arrive as DeepL's.
- **Review screen**: every unreviewed string is labeled **To review**, whatever its origin. The origin shows in the tooltips, the editor's suggestion ("Repository" instead of "DeepL") and the details panel, and an origin filter shows for every language.

### On FitJournal

- **Dutch** (`nl`), 1 November 2026, kept for review: 254 strings imported, and the pull only normalized the file's formatting. The dry run estimated 9,650 characters; the sync billed 32, for the two keys the Dutch file lacked.
- **Latin American Spanish** (`es-419`), next, kept for review.

---

## Regional variants

A variant is a language with a **base** and a **policy**. It stays outside DeepL Sync (DeepL cannot produce it, and DeepL Sync expects complete files), and a small Stringherd script writes its files, like the source upload script; later the delivery workflow runs it.

| Setting | Options |
|---|---|
| Base | Any project language, or the source language |
| When the variant review starts | After the base is delivered, or in parallel with the base review |
| What the reviewer sees | Every string, or only strings new or changed in the base since the last variant review |
| Per string | **Same as base** (`Ctrl+Enter`) or an edit, which makes it an **override** |
| What goes into the repository | **Overrides only** (the app falls back to the base), or a **full file** with inherited text copied in |
| When the base changes later | An override is flagged "base changed, check"; a "same as base" string goes back to the list if the policy says so |

**FitJournal**: `es-AR`, base `es-419`, starts after `es-419` is delivered, every string the first time and then only new or changed ones, overrides only (the file holds 35 keys today and the app falls back). Low priority within the milestone.

### Cases to account for

1. **Apps without fallback to the base language**: some i18n setups need a complete file per language; the full file output covers them.
2. **Varieties DeepL supports** (`pt-BR` and `pt-PT`, `en-GB` and `en-US`, simplified and traditional Chinese, `es` and `es-419`): the admin chooses two independent languages, each translated and reviewed in full, or a variant. A variant suits `es-AR` from `es-419`, not `pt-PT` from `pt-BR`.
3. **Mechanical variants**: `en-GB` from `en-US` (spelling), `de-CH` from `de-DE` (no ß), traditional from simplified Chinese (script conversion). Automatic rules, then review only what changed. Later.
4. **A variant of the source language**: `en-GB` when the source is `en-US`; nothing to translate, only to adapt.
5. **Chains**: `es-AR` from `es-419` from `es`. One level first; the data model allows more.
6. **A base that is never shipped**: an app ships `es-MX` and `es-AR` only, with a shared base that exists only in Stringherd.
7. **Overrides equal to the base**: 3 of FitJournal's 35 `es-AR` keys equal the base. Leftovers, or deliberate pins that stay fixed when the base changes; the import asks which.
8. **Separate reviewers and separate Deliver** for base and variant (per-language assignments already exist).

---

## Sending reviewed strings back

Today an admin can reopen one delivered string at a time. Re-translating is only possible with `deepl sync --force`, which re-bills the whole language, writes raw machine translation straight into the repository files (a deploy at that moment ships unreviewed text) and cannot target specific strings. Two admin actions replace it, both for a whole language or a selection in the list view (filtered by date, reviewer or search):

1. **Send back to review**, without new machine translation: the strings return to the reviewer's list with their current text; the export keeps the delivered text, so the code does not change until the next Deliver. Planned with this milestone.
2. **Re-translate with DeepL**: Stringherd calls DeepL for the selected strings and shows the result as the suggestion, with the word diff; the repository never sees raw machine translation. Needs a DeepL key on the server (a secret, never in the browser), the same settings as `.deepl-sync.yaml` (formality, glossary, instructions) and a character estimate before confirming. Later.

Both are admin only and record who triggered them.

---

## Translation files edited by hand

### Today

| What happens | Result |
|---|---|
| A translation is edited in a target file, then `deepl sync` runs | Not noticed (the lockfile tracks the source) |
| Then `deepl sync pull` runs before any push | The export overwrites the edit; the only trace is the replaced count in the pull summary |
| Then `deepl sync push` runs first | Stringherd takes the edit for a new machine translation: marks its origin DeepL, sends it back to review and drops the delivered text, so the edit stays in the code. If a reviewer was correcting that string after a reopen, their edit is overwritten (a bug) |
| A translated key is deleted from a target file | DeepL Sync retranslates it (billed); the next pull restores the delivered text |
| A key is added to a target file but not to the source | DeepL Sync removes it, with a warning |
| The source file is edited | The normal way strings change: DeepL retranslates, the source upload sends reviewed translations back to review. Editing without running sync is caught by `deepl sync --frozen` in CI |

The first real case came in November 2026: 10 French strings fixed by hand in FitJournal since the October delivery arrived with the next push as machine translations to review, mixed with strings that were really new. Nothing in Stringherd told them apart; the git history did.

### Planned

Rules: never revert silently, never mislabel, never lose a reviewer's work. A hand edit is information, often a developer's hotfix.

1. **Detect it**: DeepL only produces new text when the source changed, and Stringherd knows the source from the upload. New text with an unchanged source is **edited in the repository**; with a changed source it is a new machine translation, as today.
2. **Show it**: a status of its own, with a diff against the delivered text, in the reviewer's list. Choices: keep the edit (it becomes the delivered text), restore the delivered text, or edit. Until someone decides, the export returns the edited text, so Stringherd does not fight the code. A reviewer's unfinished edit is kept and shown as a conflict. A project setting can accept edits automatically or always restore; review is the default.
3. **Make the order safe**: the automated workflow always pushes before it pulls, so an edit is detected before anything can revert it. Optionally a pull request check comments when target files change by hand, and a CODEOWNERS rule on the locale folders makes such changes visible.

---

## Open questions

- Whether variants stay a Stringherd script or become a request to DeepL for variant support in the DeepL Sync contract.
- Whether a variant review needs the base to be delivered, or approved is enough, when both are reviewed by the same person.
- Running an import again later, for example after merging a branch with new translations, and turning a language that arrived without an answer into an import.
- The source upload script could report which language folders the repository has, so Add language can pre-answer the question and warn about a language the app doesn't have.
