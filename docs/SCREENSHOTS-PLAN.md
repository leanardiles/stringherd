# Screenshots Plan

Working plan for automatic screenshots: showing reviewers where each string appears in the app. Updated as we brainstorm; nothing here is built yet. Related: [UI-PLAN.md](UI-PLAN.md) (the side panel that shows screenshots) and the [roadmap](../ROADMAP.md).

---

## Decisions so far

| # | Decision | Why |
|---|---|---|
| 1 | **Screenshots, not live links, are the main form of visual context** | They work for every project, need only a Stringherd account to view, and can cover unreleased strings. Live links need a test environment that reviewers can reach and that stays current |
| 2 | **"Open in app" links are an optional extra** for projects that already have a staging environment | Capture records each screen's route anyway; one project setting (the staging address) turns it into a link |
| 3 | **Screenshots show the source language** | At review time the translation is not in the app yet. Target-language screenshots come later, for visual QA (text that overflows or gets cut off) |
| 4 | **Three separate jobs**: reach the screens, identify the keys on them, store and link the results | Each job can vary per repo without changing the others; this is what makes it replicable |
| 5 | **Least invasive by default**: works with no change to the app's code; exact tagging is an opt-in | Teams rarely accept code changes for a tool they are trying out |
| 6 | **Every link records how it was found** (exact tag or text match) | Reviewers can tell a certain match from a guess |
| 7 | **Demo accounts with fake data only** | Screenshots show whatever is on screen and end up in Stringherd |

---

## The three jobs

```
for each screen                       (job 1: reach it)
    open it
    identify every key on it          (job 2: which key is each text)
    save image + "key K is in rectangle R, found by method M"   (job 3: store and link)
```

### Job 1: reaching the screens
Sources add up; a key can be captured by several.

| Source | Needs | Reaches |
|---|---|---|
| Crawler with config | App address, demo account, routes to visit | Main screens |
| Extra steps in the config | e.g. "on /routine, click Add exercise" | Dialogs, second steps |
| Storybook (if the repo has it) | Nothing extra | Every component state, including empty and error states |
| End-to-end test hook (if the repo has tests) | One helper call, e.g. `capture(page, "checkout")` | Deep flows, with sign-in and data already handled by the tests |
| Manual capture | A person | Anything, including rare states |

Without a config, a crawler can still open public pages and follow links, but cannot get past a sign-in.

Where the config lives (open): entered in Stringherd's UI (nothing in the repo), or a file in the repo (versioned, and delivered by the setup pull request once the GitHub App exists).

### Job 2: identifying the keys on a screen
Alternatives for the same job. At the start of a run the capture tool checks what the repo allows and uses the best available method:

| Priority | Method | Used when | Accuracy |
|---|---|---|---|
| 1 | **Plugin tags**: a small i18n plugin, active only in capture mode, wraps every translated string in invisible zero-width markers that encode its key | The repo includes the plugin (one line in the i18n setup) | Exact |
| 2 | **Catalog swap**: the crawler intercepts the request for the source catalog and serves a copy with the same markers | The catalog reaches the browser as its own request: catalogs loaded at runtime, or a dev server such as Vite | Exact, with no code change |
| 3 | **Code scan + text match**: Stringherd reads the repo to learn which keys each component uses, then matches visible text only against the keys of the components on that screen | Neither of the above | Good for keys written out in full (`t("nav.dashboard")`); a guess for keys built at runtime (`` t(`muscles.${m}`) ``) or passed in from outside (`t(labelKey)`) |
| 4 | **Text match only**: visible text matched against the source strings | Code not available | A guess: the same text can belong to several keys |

With markers (methods 1 and 2), the capture script finds each marker on the page, measures the rectangle of its text, and takes the screenshot; zero-width characters do not change the layout.

### Job 3: storing and linking
Generic for every project; it does not matter where a screenshot came from.

```
Screen       name "dashboard", route, viewport (e.g. 1280x800), commit, captured at, source (crawler, storybook, test, manual)
  Image      the file, stored once per content hash (WebP)
  Occurrence key, rectangle (x, y, w, h), source text at capture, method (tag | text match), confidence
```

A key can occur on many screens; a screen holds many keys. The side panel shows the screens where the open key occurs, outlined by its rectangle (zoom, fit to string, full size: see UI-PLAN).

---

## Keeping screenshots current

| Change | What happens |
|---|---|
| Next capture run (e.g. on each push to `main`) | Each screen is identified by name and viewport; its image and occurrences are replaced. An identical image is not stored again |
| A source string is edited (the source upload reports it as `updated`) | Its occurrences no longer match the current text and become **stale**: still shown, with a note that the screenshot shows an older version of the text, until the next run |
| A string moves to another screen | The next run finds it there; the old occurrence goes with the old run |
| A string is not found on any screen | Status **missing** |
| A key is removed from the source | Its occurrences are hidden, and removed with the next run |

### Statuses per key
`captured` · `stale` · `missing` · `manual` (captured by a person) · `not visual` (marked by a person: email subjects, server messages)

### Coverage and filling the gaps
After each run Stringherd reports coverage, e.g. `240 keys · 188 captured (78%) · 52 missing`. Gaps are filled in this order:
1. Add a route or a step to the config (cheap, automatic from then on)
2. Add another source if the repo has one (Storybook, end-to-end tests)
3. Capture manually what is left
4. Mark strings that never appear on screen as `not visual`

When several sources capture the same key, the panel shows exact methods before guesses and newer captures before older ones.

---

## What works where

| Kind of app | Job 1 | Job 2 |
|---|---|---|
| Web app with i18next (FitJournal) | Crawler, Storybook, tests | Catalog swap or plugin: exact |
| Web app with another JS library (vue-i18n, FormatJS, ngx-translate) | Same | Text match + code scan from day one; exact once that library has an adapter |
| Server-rendered web app (Django, Rails, Laravel) | Same | Text match + code scan; exact only with a server-side adapter |
| Native mobile or desktop app | Not covered | Manual or imported screenshots only |

Job 1 and job 3 work for any web app. Only the exact methods of job 2 depend on the i18n library: one small adapter (plugin, catalog converter, code-scan patterns) per library, added by popularity.

---

## Costs and privacy
- DeepL: none, capture never translates
- Compute: a few minutes of browser time per run, locally or in GitHub Actions
- Storage: about 50 to 200 KB per screenshot as WebP; identical images stored once
- Privacy: demo accounts with fake data only; screenshots are visible to every reviewer of the project

---

## Proof of concept (first step)
Goal: real screenshots of FitJournal in Stringherd's side panel, with each string outlined.

| Item | Scope |
|---|---|
| App | FitJournal web app on its dev server (`localhost:5173`), English |
| Job 1 | Crawler config with four routes; sign-in with a demo account (credentials from 1Password) |
| Job 2 | Catalog swap (method 2): no change to FitJournal's code |
| Job 3 | Capture results saved locally first (images + JSON of occurrences); then uploaded to a new Stringherd endpoint and shown in the side panel |
| Tool | A Node CLI in the Stringherd repo (e.g. `packages/capture`), using Playwright |

Needed from FitJournal (not code): a demo account with realistic fake data on the local backend.

---

## Later
- Plugin adapter for i18next (method 1), for builds where catalog swap is not possible
- Storybook and end-to-end test drivers
- Code scan and text match for apps without an exact method
- Capture in CI on each push to `main`
- Several viewports (desktop, mobile width)
- Target-language capture for visual QA
- "Open in app" links for projects with a staging environment

---

## Open questions
- Where the crawler config lives: Stringherd UI or a file in the repo
- Storage for images: Supabase Storage or the server's disk
- How to keep dynamic content (dates, counters) from producing a new image on every run: masking regions, or comparing occurrences instead of pixels
- How long to keep old screenshots: only the latest per screen, or a history
