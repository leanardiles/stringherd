# Development Setup

How to set up Stringherd locally, and why the tooling is set up the way it is. For product context, read [PROPOSAL.md](PROPOSAL.md).

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 24.15.0 or newer | Required by DeepL CLI v2 (uses the built-in `node:sqlite` module) |
| npm | 9 or newer | Ships with Node |
| Python | 3.12 or newer | Backend (FastAPI), once `server/` exists |
| 1Password CLI (`op`) | Latest | Injects secrets at runtime; no secrets on disk |
| Git | Any recent version | |

Check versions:

```bash
node -v
npm -v
op --version
```

---

## Quick start

```bash
git clone https://github.com/leanardiles/stringherd.git
cd stringherd
npm install
npm run deepl:usage
```

`npm install` installs the DeepL CLI from `vendor/` (see below). `npm run deepl:usage` confirms your DeepL key works by printing your character usage. It does not translate anything.

---

## Secrets (1Password)

No real secrets are stored in the repo or on disk. `.env.op` holds **references** to 1Password items and is safe to commit:

```
DEEPL_API_KEY=op://Stringherd/DeepL API/credential
```

At runtime, `op run` resolves each reference and passes the real value to a single command as an environment variable:

```bash
op run --env-file=.env.op -- <command>
```

### Setup

1. Create a 1Password vault named `Stringherd`.
2. Add an item of type **API Credential** named `DeepL API`, with the key in the `credential` field.
3. Check the reference resolves:

   ```bash
   op read "op://Stringherd/DeepL API/credential"
   ```

### Rules

- Add a line to `.env.op` only when the 1Password item exists; `op run` fails on unresolvable references.
- Do not use `deepl init` or `deepl auth set-key`. They store the key in a local config file.
- `.env` and `.env.*` are gitignored. Exceptions: `.env.example` (placeholders) and `.env.op` (references).
- CI uses GitHub repository secrets, not 1Password.

---

## DeepL CLI

### What it is and why we need it

The DeepL CLI provides `deepl sync`, the engine on the other side of Stringherd's API:

```
Source-language files in the repo
  -> deepl sync         translates new or changed strings via the DeepL API
  -> deepl sync push    sends them to Stringherd for review
  -> linguists review in Stringherd
  -> deepl sync pull    writes approved translations back to the repo
```

It is installed **locally in the project** (not globally with `-g`) so the version is pinned. Local machines and CI run the same version, which matters because the CLI writes `.deepl-sync.lock`.

### Why it is vendored

DeepL's README says to install with `npm install @deepl/cli`, but as of 2026-09-24 **the package is not published on npm** (the registry returns 404). Version 2.0.0 exists only as source code on the `main` branch of [DeepL/deepl-cli](https://github.com/DeepL/deepl-cli): no release, no git tag, and the release workflow does not publish to npm.

So we build it from source once and commit the packaged result to `vendor/`:

- `vendor/deepl-cli-2.0.0.tgz`: the built package (~360 KB)
- `vendor/README.md`: provenance, i.e. the upstream commit it was built from

Vendoring means:
- The exact version is pinned, even if DeepL changes `main`.
- CI installs it in seconds, with no clone or compile step.
- Anyone can verify or rebuild it from the recorded commit.

`package.json` references it as a dev dependency:

```json
"devDependencies": {
  "@deepl/cli": "file:vendor/deepl-cli-2.0.0.tgz"
}
```

### How the package was built

Run from the folder that **contains** `stringherd/`, not inside it:

```bash
git clone https://github.com/DeepL/deepl-cli.git
cd deepl-cli
git log -1 --format=%h     # record this commit hash in vendor/README.md
npm ci
npx tsc
npm pack
```

| Step | What it does | Python equivalent |
|---|---|---|
| `git clone` | Downloads the CLI source (TypeScript) | Cloning a library to install from source |
| `git log -1 --format=%h` | Prints the exact commit built. With no version tag, this is the only precise identifier | Pinning to a commit |
| `npm ci` | Installs the CLI's own dependencies at the exact versions in its lock file | `pip install -r requirements.txt` with pinned versions |
| `npx tsc` | Compiles TypeScript to JavaScript in `dist/`. Node cannot run TypeScript directly; `dist/cli/index.js` is the `deepl` command | Build step |
| `npm pack` | Bundles the built CLI into `deepl-cli-2.0.0.tgz`, containing exactly what would be published to npm | `python -m build` producing a `.whl` |

**Windows note:** use `npx tsc`, not `npm run build`. The build script uses `rm -rf` and `chmod`, and on Windows npm runs scripts in `cmd.exe`, where those commands fail even inside Git Bash. `tsc` is the part that does the actual build.

Then install it into Stringherd:

```bash
mkdir -p ../stringherd/vendor
cp deepl-cli-2.0.0.tgz ../stringherd/vendor/
cd ../stringherd
npm install -D ./vendor/deepl-cli-2.0.0.tgz
```

This installs the CLI into `node_modules/@deepl/cli/`, records it in `package.json` and `package-lock.json`, and creates the `deepl`, `deepl.cmd` and `deepl.ps1` launchers in `node_modules/.bin/`. (Python equivalent: `pip install ./package.whl` into a venv.)

### Running it

Through npm scripts (preferred):

```bash
npm run deepl:usage
```

What happens:
1. npm finds `deepl:usage` in `package.json` and runs `op run --env-file=.env.op -- deepl usage`.
2. npm temporarily adds `node_modules/.bin` to `PATH`, so `deepl` resolves to the project's copy without `npx`.
3. `op run` fetches the key from 1Password and sets `DEEPL_API_KEY` for that one command only.
4. `deepl usage` calls the DeepL API and prints the character count.
5. The command exits; the key was never written to disk.

Outside npm scripts, use `npx`:

```bash
op run --env-file=.env.op -- npx deepl --version
```

### Updating the vendored CLI

When DeepL pushes changes to `main`:

```bash
cd ../deepl-cli
git pull
git log -1 --format=%h
npm ci
npx tsc
npm pack
cp deepl-cli-2.0.0.tgz ../stringherd/vendor/
cd ../stringherd
npm install -D ./vendor/deepl-cli-2.0.0.tgz
```

Update the commit hash in `vendor/README.md`. If the version number in the filename changes, update the `package.json` reference too.

### When DeepL publishes to npm

Switch to the registry and remove the vendored copy:

```bash
npm uninstall @deepl/cli
npm install -D @deepl/cli
rm -rf vendor/
```

Then remove the "Why it is vendored" and build sections from this document.

### The local `deepl-cli` clone

The clone next to `stringherd/` is not needed to run the project. Keep it for:
- rebuilding when DeepL updates `main`
- reading the source, e.g. to see exactly what `sync push` sends to the TMS contract
- contributing upstream

---

## DeepL API usage and cost

The free Developer plan gives **1 million characters in total, one time** (not monthly). Protect it:

- Set `sync.max_characters` in `.deepl-sync.yaml` to cap each run.
- Use `deepl sync --dry-run` to see the character count before a real run.
- Never call the DeepL API from Stringherd's tests. The server only implements the TMS contract; test it with fake pushes.
- Limit the GitHub Action to source-language file changes on `main`.
- Start with 2-3 target locales.

---

## Repository layout

Current:

```
stringherd/
├── docs/
│   ├── PROPOSAL.md       product context and design decisions
│   └── DEVELOPMENT.md    this file
├── vendor/
│   ├── deepl-cli-2.0.0.tgz
│   └── README.md         provenance of the vendored CLI
├── .env.op               1Password secret references (committed)
├── .gitignore
├── CLAUDE.md             points coding sessions to PROPOSAL.md
├── package.json          JS tooling root
├── package-lock.json
└── README.md
```

Planned (see PROPOSAL.md, section 7):

```
server/      Python + FastAPI backend (own pyproject.toml)
web/         React + Vite + TypeScript review UI
demo-app/    React + Vite + react-i18next sample app being localized
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `npm error 404 ... @deepl/cli` | Package not on npm | Install from `vendor/` (see above) |
| `deepl requires Node.js >= 24.15.0` | Node too old | `nvm install 24` |
| `op` cannot resolve a reference | Vault, item or field name mismatch, or 1Password locked | Compare `.env.op` with 1Password; run `op read "op://..."` |
| `rm` or `chmod` not recognized during build | npm runs scripts in `cmd.exe` on Windows | Use `npx tsc` instead of `npm run build` |
| Git says another git process is running | Stale `.git/index.lock` | Make sure no git process is running, then delete `.git/index.lock` |
