# Languages plan

How Stringherd handles languages that already have translations, regional variants, sending reviewed strings back for another pass, and translation files edited by hand. This is a design document: nothing here is built yet. It is planned for the **FitJournal in production** milestone in the [roadmap](../ROADMAP.md), with FitJournal as the first real case, and is updated as decisions are made.

---

## How DeepL Sync treats target files

These facts, checked against the DeepL CLI 2.0.0, shape every decision below.

| Fact | Consequence |
|---|---|
| The lockfile (`.deepl-sync.lock`) records a hash of each **source** string per language, not the translated text | `deepl sync` does not notice a translation edited by hand in a target file |
| A key with no lockfile entry for a language counts as missing | The first `deepl sync` on a language with existing files machine-translates every key and overwrites them |
| `deepl sync push` reads the existing target files and sends each translation | Existing translations can reach Stringherd without being retranslated |
| `deepl sync pull` writes what the export returns, keeps keys the export leaves out as they are in the file, and records pulled keys in the lockfile | After push, export and pull, the lockfile protects existing translations from the next `deepl sync` |
| The push carries only `locale` and `value`, and the export only `key: value` | Stringherd cannot tell a human translation from DeepL's, or a hand edit from a new machine translation, from the request alone |
| A target locale is also the DeepL language; there is no mapping | A language code in the repository must be one DeepL knows: Latin American Spanish is `es-419`, not `es` (DeepL's `es` is European Spanish) |
| DeepL has no `es-AR` | A variant like `es-AR` cannot be a DeepL Sync target locale; Stringherd has to produce it |

---

## Language codes match DeepL's

Decision: each language in a repository uses the DeepL code for the variety it contains. For FitJournal this means renaming `es` (Latin American Spanish) to `es-419` before Spanish goes into Stringherd, since project languages, the lockfile and file paths all key on the code. The change is in FitJournal:

- **Web app**: rename `locales/es` to `locales/es-419`; update the resource key and `LOCALE_OPTIONS`; fallbacks `es-AR` to `es-419` to `en`, and `es` to `es-419` to `en`, so a browser set to `es-MX` or `es-CL` still gets Latin American Spanish instead of English.
- **Backend**: rename `locales/es`; reverse the chain so `es` and `es-AR` fall back to `es-419`; the Accept-Language handling that reduces `es-CL` to `es` must land on the same text.
- **Saved preferences**: users with `user_locale = 'es'` are migrated to `es-419`, or `es` stays as an alias of it.

---

## Existing translations

When a language already has translations in the repository, the admin chooses per language, on the project page, before the first sync:

| Choice | What happens |
|---|---|
| **Machine-translate from scratch** | Nothing is imported. The next `deepl sync` translates every key, overwriting the files; the strings arrive for review as machine translations. Costs DeepL characters for the whole language |
| **Keep, marked as reviewed** | Import: Stringherd asks for one `deepl sync push` for that language and stores what arrives as delivered, recorded as imported from the repository with the date. Then `deepl sync pull` writes the same text back and records it in the lockfile. No review work; the repository does not change |
| **Keep, for review** | The same import, and every string also goes to the reviewer's list with its own status, **Existing** (not MT). The reviewer approves or edits and delivers |

- **The existing text is the delivered text from the moment of import**, also when it is still to be reviewed. The export returns it, so the lockfile protects the files and a `deepl sync` in CI cannot overwrite them during the review. The repository changes only when the reviewer delivers an edit. This builds on what Stringherd already does: the delivered text is kept apart from the reviewer's working text.
- **Keys the existing files lack** go through DeepL as usual and arrive as machine translations. FitJournal's Spanish has 239 of 240 keys.
- **Ending the import**: pushes come one key per request with no end signal, so the admin ends it in Stringherd, which shows how many strings arrived for each file.
- **FitJournal**: `es-419` imported for review (I review it); `nl` imported, marked as reviewed or for review when a Dutch reviewer is available.

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
| Then `deepl sync push` runs first | Stringherd takes the edit for a new machine translation: labels it MT, sends it back to review and drops the delivered text, so the edit stays in the code. If a reviewer was correcting that string after a reopen, their edit is overwritten (a bug) |
| A translated key is deleted from a target file | DeepL Sync retranslates it (billed); the next pull restores the delivered text |
| A key is added to a target file but not to the source | DeepL Sync removes it, with a warning |
| The source file is edited | The normal way strings change: DeepL retranslates, the source upload sends reviewed translations back to review. Editing without running sync is caught by `deepl sync --frozen` in CI |

### Planned

Rules: never revert silently, never mislabel, never lose a reviewer's work. A hand edit is information, often a developer's hotfix.

1. **Detect it**: DeepL only produces new text when the source changed, and Stringherd knows the source from the upload. New text with an unchanged source is **edited in the repository**; with a changed source it is a new machine translation, as today.
2. **Show it**: a status of its own, with a diff against the delivered text, in the reviewer's list. Choices: keep the edit (it becomes the delivered text), restore the delivered text, or edit. Until someone decides, the export returns the edited text, so Stringherd does not fight the code. A reviewer's unfinished edit is kept and shown as a conflict. A project setting can accept edits automatically or always restore; review is the default.
3. **Make the order safe**: the automated workflow always pushes before it pulls, so an edit is detected before anything can revert it. Optionally a pull request check comments when target files change by hand, and a CODEOWNERS rule on the locale folders makes such changes visible.

---

## Open questions

- Whether variants stay a Stringherd script or become a request to DeepL for variant support in the DeepL Sync contract.
- Whether a variant review needs the base to be delivered, or approved is enough, when both are reviewed by the same person.
- Where the import choices live after onboarding: a one-time step, or a language setting that can be run again (for example after merging a branch with translations).
