# Import Plan

Working plan for importing a language's existing translations, without DeepL translating them again. Reference while we build it; delete it, or fold what lasts into [LOCALES-PLAN.md](LOCALES-PLAN.md), when the work is done. Planned as **v1.1** in the [roadmap](../ROADMAP.md). First case: FitJournal's Dutch (`nl`).

---

## The goal

An admin adds a language that already has translations in the repository and chooses, in Stringherd, what happens to them:

| Answer | In Stringherd | In the repository |
|---|---|---|
| No existing translations | As today: DeepL translates, strings arrive to review | DeepL writes the file |
| Translate again with DeepL | Nothing imported. Stringherd shows `deepl sync --locale <code>` with a character estimate, then the push | DeepL overwrites the file; strings arrive to review as machine translations |
| Keep them for review | Imported. Strings go to the reviewer's list, marked as coming from the repository | Unchanged until a reviewer edits and delivers |
| Keep them as reviewed | Imported and delivered at once | Unchanged |

Tested from the admin's side: setting up, running the commands Stringherd shows, and seeing the result.

---

## Why Stringherd has to be told first

Checked against the DeepL CLI 2.0.0 (details in [LOCALES-PLAN.md](LOCALES-PLAN.md)):

- The first bare `deepl sync` on a language translates every key that has no lockfile entry for it, and overwrites the file. Editing `.deepl-sync.yaml` does nothing by itself; only that command translates.
- `deepl sync push` reads the existing target file and sends each translation as it is. That is the import.
- A push carries only key, language and text. DeepL Sync has no review states (the lockfile `review_status` never leaves the developer's machine), so Stringherd cannot tell a human translation from DeepL's.
- `deepl sync pull` writes what Stringherd exports and records each pulled key in the lockfile. From then on, `deepl sync` only translates keys that are missing or whose English changed.

So the admin sets the language up in Stringherd before the push, and Stringherd treats that language's pushes as an import until the admin finishes it. Imported text counts as delivered from the start (both keep answers), so the export returns it and the first pull protects the file, even while a review takes weeks.

---

## The admin's flow

1. **Add language** on the project page. The dialog asks whether the repository already has translations, with the four answers above.
2. For a keep answer, the language row says **Waiting for import**, shows `deepl sync push --locale <code>`, and warns not to run `deepl sync` before the import is done.
3. While the push runs, the row counts what arrives, per file.
4. **Finish import.** The row shows `deepl sync pull --locale <code>`: it writes the same text back and records the keys in the lockfile.
5. The row reads "Imported 239 strings from the repository" with the date.

Keys the files lack (FitJournal's Dutch has 239 of 240) go through DeepL afterwards, as usual.

---

## Data

- **Per language** (`project_locales`): the import answer, when the import started, when it was finished.
- **Per string** (`translations`): its **origin**, DeepL or the repository, and when it was imported. Origin is its own field, not a status.
- **Status stays as it is**: to review, approved, delivered. "Edited" is still worked out on screen, comparing the text with the origin's text.
- An import is only allowed for a language with no strings in Stringherd yet.
- The DeepL Sync contract does not change.

---

## Reviewer UI (proposal, judged live when we build it)

One symbol per row, for the status only; the origin appears where the reviewer acts on it.

| Where | What changes |
|---|---|
| Row icon | Nothing. Imported strings to review use the open circle; the tooltip says "From the repository, not reviewed yet" |
| List view status column | "MT" becomes **To review**, whatever the origin |
| Language summary line | Only when the language has imports: "239 from the repository · 1 from DeepL" |
| Filters | An origin filter (DeepL, Repository), only when the language has both |
| Editor | The suggestion is labeled "Repository, imported 17 Oct" instead of "DeepL"; the diff reads "Changes from the repository" |
| Delivered imported string | History: "Imported from the repository, 17 Oct" instead of "Approved by…" |

Alternative, if the proposal falls short: a fifth row shape for imported strings to review.

---

## Chunks

| | Chunk | What | Status |
|---|---|---|---|
| A | Data | Import state per language, origin and import date per string; one migration; tests | To do |
| B | Server | Pushes during an import stored as imports; Finish import; counts per file; `remove-language` command | To do |
| C | Admin UI | The question in Add language, the language row's states, commands and Finish | To do |
| D | Reviewer UI | The table above; bulk approve and `reset-language` handle imported strings | To do |
| E | Docs and test | LOCALES-PLAN, roadmap, API notes; the FitJournal run | To do |

---

## Decisions

| # | Decision | Status |
|---|---|---|
| 1 | The choice is made in the Add language dialog, before any push | Proposed |
| 2 | Origin is a field of its own; status keeps its three values | Agreed |
| 3 | An operator command, `remove-language`, removes a language with its strings (with confirmation), to reset between tests | Proposed |
| 4 | A push for a language never set up behaves as today: created, strings arrive as DeepL's | Proposed |
| 5 | Stringherd work stays on `main`; FitJournal works on branch `stringherd-nl-import` | Agreed |

---

## The FitJournal test

On `stringherd-nl-import`, after updating it from `main` (`git merge main`):

1. Add `nl` to `target_locales` in `.deepl-sync.yaml`. Then run `deepl sync --dry-run`, which should list about 240 `nl` keys: proof that a bare sync would overwrite them.
2. Try each answer in Stringherd and run the commands it shows. After each run, check `git diff` on the Dutch file (expected empty for both keep answers) and `deepl sync --dry-run` (expected: only `login.passwordPlaceholder`).
3. To reset between answers: `git checkout -- web-react/src/i18n/locales/nl .deepl-sync.lock` in FitJournal, `remove-language` in Stringherd.
4. Try **Translate again** last: it is the only answer that costs DeepL characters (about 4,500) and changes the file.
5. Finish with the answer to keep, then the About page: new English keys, sync, push, upload the source, review, Deliver, pull. `git diff` should show only additions.

Done when all four answers work as the table says and Dutch is merged into FitJournal's `main`.

---

## Open questions

- Converting a language that arrived without setup (answer 4) into an import afterwards.
- Running an import again later, for example after merging a branch with new translations.
- Whether `es-419` follows the same path right after `nl`.
