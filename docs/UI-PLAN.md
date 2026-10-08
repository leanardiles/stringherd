# Review UI Plan

Working plan for Stringherd's review interface. Updated as we brainstorm; nothing here is built yet. Once a section is implemented, it moves into the README and this file keeps only what is still open.

References studied: Phrase TMS (CAT web editor), Phrase Strings (software strings editor) and Lokalise (key editor). Notes in [Reference notes](#reference-notes).

---

## Decisions so far

| # | Decision | Why |
|---|---|---|
| 1 | **Expanding rows**: compact one-line rows; the active string opens in place into a card with everything about it; approving closes it and opens the next | Card focus (Lokalise, Phrase Strings) without losing grid density and the neighbouring strings |
| 2 | **Side panel for the screenshot** of the active string (and other visual context); text help lives in the open card | Images need width; text help belongs next to the target being edited |
| 3 | **Screenshot in the panel shows the whole screen**, with zoom in down to the string, and a pop-up for full size | Whole screen gives orientation; zoom gives detail; pop-up for landscape web screens |
| 4 | **Phrase keyboard shortcuts** wherever an equivalent action exists | Industry standard; reviewers already know them |
| 5 | **Character count and limit next to each string** (`18 / 25`) | Software and marketing text often has length limits; both MT and review must respect them |
| 6 | **Top bar navigation**, not a left sidebar | Width is precious with two text columns plus a panel |
| 7 | **Build only modules that have data behind them**; others appear when their feature exists | Empty panels look unfinished |
| 8 | **Character limits are always hard**: an over-limit string cannot be approved | Limits exist because the space is fixed |
| 9 | **Placeholders count as 1 character** (their guaranteed minimum); markup tags count as 0 | A hard limit must only block strings that will certainly overflow |
| 10 | **Other languages as reference**: the open card shows approved translations of the same string in languages the reviewer picks | Seeing how French or Italian solved a string helps the Spanish reviewer |
| 11 | **Subdued farm palette**: warm off-white and hay neutrals; colour only for status, progress and the main action | Familiar layout and colour meanings, with its own identity; quiet enough for long sessions |
| 12 | **Inter for the UI, a monospace font for keys and placeholders** | Highly readable at small sizes; monospace makes `{{count}}`, odd spacing and key names easy to spot |
| 13 | **Compact rows** (about 15 strings visible on a laptop screen), comfortable spacing inside the open card | Throughput like Phrase TMS; the card gets room where the work happens |
| 14 | **React, Vite and TypeScript**, with TanStack Query, React Router, Radix UI primitives and CSS Modules over CSS variables (full list in Frontend stack) | Mainstream, well-documented stack; palette maps directly onto CSS variables |
| 15 | **CodeMirror 6 for the target field, behind our own `TargetEditor` component** | Plain text with protected placeholders and custom keys; the boundary keeps a later switch to a few hundred lines |
| 16 | **Stringherd's own UI is translatable from day one** with react-i18next (i18next JSON with `_one` / `_other` plurals), `Intl` for numbers and dates, CSS logical properties, and a pseudo-locale for testing | A localization tool must be localizable; Stringherd can review its own translations as a second demo |

---

## Layout

```
┌ Stringherd │ FitJournal › French (fr) │ ▓▓▓▓░░ 112/240 approved │ / search │ user ▾ ┐
├──────────────────── string list (~65%) ─────────────────┬─── side panel (~35%) ────┤
│ 12 Home              Accueil               7/12   ✓     │                          │
│┌ 13 ───────────────────────────────────────────────┐    │  screenshot              │
││ dashboard.sets_other · common.json      14/20  MT │    │  (whole screen,          │
││ EN  {{count}} sets                                │    │   string outlined)       │
││ FR  [{{count}} séries▌                      ]     │    │  [+] [−] [fit] [⤢]       │
││ Suggestions  1 DeepL   {{count}} définit          │    │                          │
││              2 TM 92%  {{count}} séries           │    │  thumbnails when the     │
││ Other languages  ES {{count}} series (approved)   │    │  string is on several    │
││                  IT {{count}} serie  (approved)   │    │  screens                 │
││ Context  Counter under each workout card          │    │                          │
││ QA ✓                  Ctrl+Enter approve & next   │    │                          │
│└───────────────────────────────────────────────────┘    │                          │
│ 14 Sign in           Se connecter        12/10   MT ⚠   │                          │
│ 15 Log workout       Enregistrer…        21/–    MT     │                          │
├─────────────────────────────────────────────────────────┴──────────────────────────┤
│ 240 strings · 128 to review · 3 over limit · ☐ selected: [Approve] · Ctrl+/ help     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Top bar
Project and language (breadcrumb, switchable), progress bar, search (`/`), filters, user menu (sign out; for admins: users and assignments).

### Collapsed row
| Column | Content |
|---|---|
| Checkbox | Selection for bulk actions (action bar at the bottom) |
| `#` | Row number (for `Ctrl+G`) |
| Source | English text, read-only; placeholders shown as locked chips |
| Target | Current translation; placeholders as chips |
| Chars | `current / max`, or `current / –` when no limit is set. Neutral below 90% of the limit, amber from 90%, red over the limit |
| Status | `MT` untouched DeepL output · `✎` edited, not approved · `✓` approved · `⚠` QA problem |

### Open card (the active string)
Sections appear only when they have content, in this order:

| Section | Content | Phase |
|---|---|---|
| Header | Key, file, character counter, status, who approved and when | MVP |
| Source and target | Source read-only; target editable, placeholders as chips; diff against DeepL's original on demand | MVP |
| Suggestions | Numbered for `Ctrl+1…9`: DeepL's original first; TM matches with match % and source diff later | MVP (DeepL), Next (TM) |
| Other languages | Approved translations of the same string in reference languages the reviewer picks (see below) | MVP if other languages exist in the project |
| Context | Description of where and how the string is used: written by a person now; AI-generated help later | Next |
| QA | Problems for this string | MVP |
| Glossary | Terms found in the source and their approved translations | Later |
| History | Previous values, who changed them, restore | Later |

### Other languages (reference translations)
- Shows how other languages solved the same string, read-only.
- The reviewer picks reference languages once (e.g. a Spanish reviewer picks French, Portuguese and Italian); the choice is remembered per user. Default: all available.
- Approved translations only by default; a toggle shows unapproved ones, clearly marked as not reviewed.
- Labelled with the language name and code (`FR French`, `ES-AR Spanish (Argentina)`), not flags: flags stand for countries, and one language spans many (Spanish, Portuguese, English) while some countries have several.
- Copy button on each; no direct insert, since another language is a reference, not a suggestion.
- Read access: any signed-in reviewer of the project can see approved translations of other languages; editing stays limited to assignments.
- Backend: the review API returns approved values of the same key in other locales of the project.

### Side panel: screenshot viewer
- Default: the whole screen fits the panel, with the current string outlined.
- `+` / `−`: zoom in and out, centred on the string. Fully zoomed in shows just the string and a margin around it.
- **Fit to string** and **Fit to screen** buttons.
- **Full size** (`⤢`): opens a pop-up over the editor with the screenshot at full size; `Esc` closes it.
- Several screenshots per string: thumbnails under the viewer.
- No screenshot yet: a clear empty state ("No screenshot for this string yet"), not a broken image.

### Later: focus view
A toggle that shows one card filling the screen, for long strings or careful work (Phrase Strings calls it single key view).

---

## Keyboard shortcuts

Phrase bindings from the [Phrase CAT editor documentation](https://support.phrase.com/hc/en-us/articles/5709700557468) (Windows; `Cmd` replaces `Ctrl` on macOS). Web pages can take over almost every shortcut except `Ctrl+N`, `Ctrl+T` and `Ctrl+W`, which browsers reserve.

### Same as Phrase
| Shortcut | Phrase action | Stringherd action | Phase |
|---|---|---|---|
| `Ctrl+Enter` | Confirm | Approve and go to the next string to review | MVP |
| `Ctrl+Shift+Enter` | Unconfirm | Withdraw approval | MVP |
| `Ctrl+Insert` | Copy source to target | Copy source to target | MVP |
| `Ctrl+Space` | Insert selected CAT result | Insert selected suggestion (MVP: DeepL's original is suggestion 1) | MVP |
| `Ctrl+1` … `Ctrl+9` | Insert CAT result N | Insert suggestion N | MVP |
| `Ctrl+↑` / `Ctrl+↓` | Move in CAT results | Move in suggestions | MVP |
| `F8` | Insert tag | Insert the next placeholder from the source | MVP |
| `Ctrl+Shift+F8` | Insert all tags | Insert all placeholders from the source | MVP |
| `Ctrl+Home` / `Ctrl+End` | First / last segment | First / last string | MVP |
| `Ctrl+G` | Go to segment | Go to string by number or key | MVP |
| `Ctrl+Shift+F` | Filter by selected text | Filter by selected text | MVP |
| `F9` | QA check | Run QA on the visible strings | MVP |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo | Undo / redo | MVP |
| `Ctrl+Shift+Space` | Insert non-breaking space | Insert non-breaking space (French: before `! ? : ;`) | MVP |
| `Ctrl+Alt+←` / `Ctrl+Alt+→` | Switch active panel | Move focus between the string list and the side panel | MVP |
| `Alt+N` | Context note | Jump to the Context section of the open card | MVP |
| `Ctrl+H` | Find and replace | Find and replace in targets | Next |
| `Ctrl+K` / `Ctrl+Shift+K` | Search TM/TB / exact | Search TM and glossary / exact | Next |
| `Ctrl+M` / `Ctrl+Shift+M` | Open comments / new comment | Same (needs comments) | Later |
| `Alt+T` | Add term | Add glossary term | Later |

### Stringherd additions
| Shortcut | Action | Phase |
|---|---|---|
| `↑` / `↓` at the first / last line of the editor | Previous / next string | MVP |
| `Alt+↑` / `Alt+↓` | Previous / next string that still needs review | MVP |
| `Esc` | Discard unsaved edit; close pop-up | MVP |
| `+` / `-` / `0` (panel focused) | Zoom in / out / fit to screen | When screenshots exist |
| `F` (panel focused) | Open screenshot at full size | When screenshots exist |
| `Ctrl+/` | Show all shortcuts | MVP |

Phrase also has split/join segments, lock, formatting (bold, italic) and tag editing. They are left out: UI strings are single keys, not document segments, and have no rich formatting.

---

## Character limits

Goal: a developer or PM sets a maximum length for a string in advance; machine translation and review both have to respect it.

### Where the limit is set (open, decide later)
| Option | How | Pros | Cons |
|---|---|---|---|
| A. In Stringherd | Admin sets it per key in the Context panel, or in bulk by CSV | No developer work | Lives outside the repo; developers don't see it |
| B. In the repo | A limits file next to the source (e.g. `{"login.button": 12}`), sent by the source upload | Versioned, owned by developers, travels with the source | Developers must maintain it |
| C. From the screenshot | Width of the string's box on screen | Measures the real constraint (space), not a proxy | Needs screenshots and font metrics; later |

Not decided yet. B as the source of truth with A to fill gaps is one candidate; C much later.

### Counting rules
- Count characters as people see them (grapheme clusters, e.g. `é` and emoji count as 1), not bytes.
- **Placeholders** (`{{count}}`, `{{name}}`) count as **1**: whatever value they get, it renders at least one character. Counting the minimum means a blocked string is guaranteed to overflow, which is the only fair basis for a hard block.
- **Markup tags** (`<strong>`, i18next `<1>…</1>`) count as **0**: they are not rendered as text.
- The placeholder's real width is the same in every language, so the person setting the limit accounts for it once (e.g. `{{count}} sets` with counts up to 999: limit set with 3 digits in mind).
- **Close to the limit with placeholders**: the counter turns amber and its tooltip says the placeholder may render longer, so the reviewer can choose a shorter wording before it becomes a problem.
- Later: an optional expected width per placeholder in the limit definition (e.g. `{{count}}` = 3), counted instead of 1.
- Same limit for every language by default (the UI space is the same); per-locale override possible later.

### Machine translation
- DeepL's API has, to our knowledge, no hard length parameter (to verify). So Stringherd checks length when DeepL Sync pushes a translation: strings over the limit get a QA flag and sort to the top of the review queue.
- Later: ask for a shorter alternative (e.g. DeepL with a shortening instruction, if supported) as a suggestion in the panel.

### Review
- The counter updates live as the reviewer types.
- Over the limit: approving is blocked, with a clear message. Limits are always hard; there is no soft mode.
- Server enforces the same rule, so the API cannot approve an over-limit string either.

### Backend work needed
`translation_keys.max_length` (nullable), accepted by the source upload; length check on push and on approve; `max_length` and `length` in review API responses.

---

## QA checks (MVP)
| Check | Severity |
|---|---|
| Placeholder missing, extra or changed (`{{count}}`) | Error, blocks approval |
| Over the character limit | Error, blocks approval |
| Empty translation | Error |
| Target identical to source | Warning (often fine: brand names, "OK") |
| Leading or trailing spaces differ from source | Warning |
| French: missing non-breaking space before `! ? : ;` | Warning (locale-specific rule) |

---

## Frontend stack

| Area | Choice | Notes |
|---|---|---|
| Base | React, Vite, TypeScript in `web/` | npm, own `package.json` |
| Server data | TanStack Query | Caching; optimistic approve, rolled back if the server refuses |
| API types | Generated from FastAPI's OpenAPI schema with `openapi-typescript` | A changed endpoint becomes a type error in the UI |
| Target editor | CodeMirror 6 | See the editor boundary below |
| Accessible primitives | Radix UI (dialog, menus, tooltips, checkbox) | Behaviour and keyboard handling only; our own styles |
| Styling | CSS variables for the palette and sizes, CSS Modules per component | Dark mode later is a variable swap |
| Routing | React Router | Sign-in, project picker, review screen, admin |
| UI translation | react-i18next | See below |
| Fonts | Inter and JetBrains Mono, self-hosted through `@fontsource` | No external font service |
| Tests | Vitest and Testing Library; Playwright for end-to-end later | Logic (placeholders, QA, counting) tested without the browser |
| Serving | Development: Vite on its own port, proxying `/api` to the server on 8100. Production: FastAPI serves the built UI | One address in both cases, so the session cookie works without cross-origin setup |

### Editor boundary
- The rest of the app talks only to `TargetEditor`: value in, value out, plus commands (insert placeholder, insert suggestion, insert non-breaking space). Nothing else imports CodeMirror.
- Placeholder detection, QA checks and character counting are plain TypeScript functions with their own tests, independent of the editor.
- Review-screen shortcuts (`Ctrl+Enter`, `Alt+↓`, `Ctrl+G`) are handled at the app level; only typing-related keys (`F8`, `Ctrl+Space`, `Ctrl+Shift+Space`) live in the editor.

### Translating Stringherd's own UI
- Every visible text goes through `t('…')`, with keys grouped by screen (`review.approveNext`). English catalog in `web/src/locales/en/common.json`.
- i18next JSON format with `_one` / `_other` plural keys: the same format as FitJournal, already proven through DeepL Sync, the source upload and the export.
- Numbers, dates and relative times through `Intl` (`112/240`, "3 days ago"), never formatted by hand.
- CSS logical properties (`margin-inline-start`, not `margin-left`) so right-to-left languages work later.
- A pseudo-locale (accented and lengthened text, e.g. `[Àƥƥŕöṽé ẋẋ]`) switchable in development, to catch untranslated text and layouts that break with longer languages.
- MVP ships in English only. Later, Stringherd's catalog goes through DeepL Sync and is reviewed in Stringherd itself.

---

## Phases
| Phase | Scope |
|---|---|
| MVP | Sign-in screen, project and language picker, string list with expanding card, edit / approve / bulk approve, filters and search, DeepL suggestion and diff, other languages, QA, character counter (limits once the backend supports them), shortcuts marked MVP |
| Next | TM suggestions, context descriptions, find and replace, admin screens for users and assignments, character limit editing |
| Later | Screenshots in the side panel, glossary, comments, history of changes, focus view |

---

## Look and feel

Principle: familiar, not creative. Layout, density and colour meanings follow established review tools; the identity comes from a quiet farm palette. Most of the screen is warm off-white and near-black text; colour appears only where it carries meaning.

### Palette (light mode)
| Token | Colour | Hex | Use |
|---|---|---|---|
| `page` | Hay, very light | `#F6F2E9` | Page background |
| `surface` | Warm white | `#FFFDF8` | Rows, cards, panels |
| `surface-raised` | Lighter hay | `#FBF9F4` | Top bar, side panel |
| `field` | White | `#FFFFFF` | Text inputs |
| `divider` | Hay | `#E4DCCB` | Hairlines between rows (decorative) |
| `field-border` | Dry grass | `#9C907A` | Input borders (meets 3:1 for controls) |
| `text` | Dark soil | `#2E2A24` | Body text |
| `text-secondary` | Weathered wood | `#6F675B` | Keys, files, counters, labels |
| `brand` | Soil | `#5C4330` | Logo, headings |
| `primary` | Soil | `#6E4E33` | The one main action per view ("Approve and next"), white text; focus ring `#7A5638` |
| `success` | Plants | text `#3F6330` on `#E5EEDA`; bar `#557A3E` | Approved, progress |
| `warning` | Hay amber | text `#7E5A14` (pill bg `#F6EACB`) | Close to the character limit, QA warnings |
| `danger` | Barn red | text `#8C3428` on `#F4E0DA`; inline `#9A3A2E` | Over the limit, QA errors |
| `neutral` | Straw | text `#5E564A` on `#EDE6D8` | `MT` status and other neutral pills |

Contrast checked (WCAG 2.1 AA): every text pair is at least 4.5:1 (lowest: secondary text on page, 4.99:1); controls and the progress bar at least 3:1. Recheck any colour that changes.

### Rules
- One `primary` button per view; other buttons are outlined.
- Status is never colour alone: pills carry a word or symbol (`Approved`, `MT`, `Too long`).
- No gradients, textures or illustrations; flat surfaces and hairline dividers.
- Dark mode later (dark soil background, hay text); colours are defined as tokens so it is a switch, not a redesign.

### Typography
| Use | Font | Size |
|---|---|---|
| Interface and translation text | Inter (self-hosted, no external font service), falling back to the system UI font | 14px in rows and the card; 13px for secondary text; never below 12px |
| Key names, file paths, placeholder chips | JetBrains Mono, falling back to `ui-monospace` | 12 to 13px |
| Headings | Inter, medium weight | 16 to 18px; the review screen has almost none |

Two weights only (regular and medium). Numbers in counters use tabular figures so `9/12` and `10/12` stay aligned.

### Density
- Collapsed rows: about 32px high, single line, text truncated with the full value on hover; about 15 rows visible on a laptop screen.
- Open card: comfortable spacing (8 to 12px between sections), full text wrapped.
- Later: a comfortable / compact toggle if reviewers ask for it.

---

## Reference notes

### Phrase Strings
Phrase's product for software strings, separate from the document-oriented Phrase TMS. Three panes ([Strings Editor](https://support.phrase.com/hc/en-us/articles/5822638157340)):

| Pane | What it holds |
|---|---|
| Key list (left) | Search with a query language and saved queries, sort, filters (status, plurals, excluded), checkboxes for batch actions with an action bar at the bottom |
| Source and target pane (centre) | One card per key: source, target field, character count while editing, verify flag, MT provider logo, "Save & next"; optional single-key view and multilingual view |
| Sidebar (right) | Stacked sections that appear only when they have content: format annotations from the source file, screenshots and Figma previews, QA, terms, suggestions (TM and MT), tags, all languages preview, jobs, metadata, comments, change history with restore |

Worth borrowing:
- **Stacked sidebar sections instead of tabs**, so screenshot, QA and suggestions are visible together; sections hide when empty.
- **All languages preview** in the sidebar: other languages of the same key without leaving the grid (useful for `es` / `es-AR`).
- **Show non-printable characters** toggle (non-breaking spaces, line breaks).
- **Batch actions**: checkbox selection with an action bar at the bottom.
- **Character limits set in the tool**, per key and as a batch action; limits from source files (e.g. XLIFF) show up as format annotations. Relevant to where our limits are set.
- **Changes visualization**: when the source changed, the diff shows on the source text.
- **Mark as minor change**: edits such as punctuation fixes that do not reset the review status.
- `/` opens search.

Not for us: Figma previews and in-context editing (screenshots instead), jobs, key creation and deletion in the UI (keys come from the repository).

---

## Open questions
- Character limits: where they are set (A, B or C).
- Does `Ctrl+Enter` go to the next string, or to the next string that still needs review? (Phrase setting: next segment.)
- Bulk approve: by checkbox selection, by filter ("approve all visible"), or both? (Phrase Strings: checkboxes plus a bottom action bar.)
- Mark as minor change: worth having, and who may use it?
