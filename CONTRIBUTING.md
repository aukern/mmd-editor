# Contributing

Thanks for wanting to help. MMD Editor is a small, **zero-build** vanilla-JS + Electron
project — no framework, no bundler, no test harness to fight. This guide covers how to
run it, how it's laid out, the invariants worth protecting, and how to get a change merged.

## Getting started

```bash
git clone https://github.com/aukern/mmd-editor.git
cd mmd-editor
npm install        # Electron + electron-builder (dev dependencies only)
npm start          # launches the desktop app
```

There is no build step — the frontend is plain ES modules the browser loads directly.
For a fast loop with no Electron, use the browser dev server:

```bash
python3 launch.py  # serves the app at http://localhost:8080 and opens it
```

Diagrams live in `~/Documents/MermaidEditor` (override with `MMD_DIAGRAMS`), so during
development you can point that wherever you like:

```bash
MMD_DIAGRAMS=./diagrams npm start
```

## Project layout

| Path | What it is |
|------|-----------|
| `index.html`, `css/`, `js/` | The frontend — vanilla ES modules on an SVG canvas |
| `js/vendor/` | Bundled dagre + Mermaid; don't hand-edit — re-vendor from upstream |
| `electron/` | Desktop shell: `server.js` (local file server) + `main.js` (window/menu) |
| `launch.py` | Browser dev server (Python stdlib) — mirrors `electron/server.js` |
| `build/` | App icon (electron-builder `buildResources`) |
| `assets/` | In-app assets (the logo) |

Cross-module calls that would otherwise be circular go through `window._editor*` handles
wired in `js/main.js`. Follow that pattern instead of introducing import cycles. See the
component table in the [README](README.md#architecture) for what each module does.

## How changes are verified

There is no unit-test suite yet. What *is* run before committing anything non-trivial:

- `node --check <file>` on every changed JS file (syntax).
- A **module link check** — dynamically `import()` each `js/` module — to catch
  missing/renamed exports and accidental import cycles.
- A **standalone run of `electron/server.js`** hitting each route (list / read / write /
  rename / mtime) plus a path-traversal case.
- The pure logic (parser, layout, diff engine, type detection) is DOM-free and testable
  headlessly with Node — prefer adding a small headless check when you touch it.
- A **manual pass in the running app** for anything with a UI or runtime surface.

If you add a genuinely testable pure function, a tiny Node check script is welcome. A real
test runner is on the wish list.

## Design invariants — please don't break these

These are load-bearing. A change that violates one needs a very good reason:

1. **Mermaid round-trips.** Loading a `.mmd` and re-serializing it (`getMermaidText`) must
   preserve structure. The visual editor is only trustworthy because the picture and the
   text never diverge.
2. **Positions are not saved.** Never add `x`/`y` to the serialized `.mmd`. Layout is
   derived on load, not stored.
3. **Only flowcharts are visually editable.** Every other diagram type goes through view
   mode (live Mermaid render + edit-as-code). Don't wire the drag editor to non-flowchart
   types.
4. **The frontend is identical in browser and app.** Electron just serves the same files
   over `localhost`. Keep desktop concerns in `electron/`; don't add Electron-only branches
   to the frontend.
5. **The file server stays confined.** All file I/O is validated to stay inside the
   diagrams folder — don't loosen `safePath`.

## Making changes

**Branches:** `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `chore/…`, `ci/…`

**Commits — [Conventional Commits](https://www.conventionalcommits.org/)** (the history
already uses them):

```
<type>(<scope>): <short summary>

<why, not what>
```

Types: `feat` | `fix` | `docs` | `refactor` | `chore` | `ci`.
Example: `fix(view-mode): scroll-zoom works without Ctrl`.

## Reporting a bug

Open an issue with:

- **What you expected** and **what actually happened** (exact message if any).
- **Minimal steps to reproduce** — the shorter, the faster the fix.
- **Environment** — your OS and how you're running it (installed app / `npm start` / browser).

Search existing issues first.

## Suggesting a feature

Open a **Discussion**, not an issue. Describe the pain point it solves and how you imagine
it working. Check the [ROADMAP](ROADMAP.md) first — some things are deliberate **non-goals**
(built-in LLM integration, in-app prompt templates, real-time collaboration). Features land
when they fit the tool's purpose: a translation layer between a human and an AI for workflows.

## Pull requests

- One focused change per PR; keep the diff readable.
- Syntax + link checks pass; a manual smoke-test is done for UI changes.
- Update the README / ROADMAP if behavior or scope changed.
- Don't commit `node_modules/`, `dist/`, or `diagrams/` (all gitignored).
- Releases are cut by pushing a `v*` tag (maintainers) — see
  [`.github/workflows/release.yml`](.github/workflows/release.yml).

## Security

MMD Editor is a local tool: it holds no secrets and makes no network calls (Mermaid and
dagre are bundled for offline use). The desktop app runs a **loopback-only** (`127.0.0.1`)
file server confined to the diagrams folder. Installers are intentionally unsigned.

If you find a security issue, please use GitHub's **private vulnerability reporting**
(repo **Security** tab → *Report a vulnerability*) rather than opening a public issue.
