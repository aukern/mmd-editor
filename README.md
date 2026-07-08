# ⬡ MMD Editor

A visual editor for **[Mermaid](https://mermaid.js.org) flowcharts**, with a live
read-only view for **every other Mermaid diagram type** — built so you can shape a
diagram visually while handing an AI the reliable `.mmd` text to talk about it.

The `.mmd` file is the single source of truth: you edit the picture, the AI reads
the code. No screenshots, no OCR.

- **Repo:** https://github.com/aukern/mmd-editor
- **License:** MIT (bundles Mermaid + dagre, both MIT — see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md))

## Features

- **Visual flowchart editing** — drag nodes, drag-from-edge to connect, groups
  (incl. nested subgraphs) with connection ports, 19 shapes, styles & classDefs,
  multi-line labels (Shift/Alt+Enter), rubber-band select, copy/paste, undo/redo.
- **Editable Mermaid source** — the code panel is live and two-way: edit the text
  and the diagram updates (position-preserving), with a find-in-code box.
- **View mode for all other diagram types** — open an `erDiagram`, `sequenceDiagram`,
  `classDiagram`, `gantt`, etc. and it renders live (dark theme); edit it as code
  with autosave, history, and export.
- **AI change-diff** — a git-style diff of the diagram against a checkpoint you
  control, so you can paste just *what changed* to an AI instead of the whole file.
- **Version history** — snapshots stored inside the `.mmd` file; preview & restore.
- **Export** — SVG, PNG, PDF (print).
- Positions are intentionally **not** saved — the `.mmd` stays a clean semantic
  description that round-trips and diffs cleanly.

## Download

Grab an installer for your OS from the
**[Releases page](https://github.com/aukern/mmd-editor/releases)**:

| OS | File |
|----|------|
| Linux | `.AppImage` (portable) or `.deb` |
| Windows | `.exe` installer or portable `.exe` |
| macOS | `.dmg` |

> The apps are unsigned (open-source, build it yourself if you prefer), so Windows
> SmartScreen / macOS Gatekeeper may warn on first launch — allow it through.

Diagrams are stored in **`~/Documents/MermaidEditor`** (created on first run).

## Run from source

Requires [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm start          # opens the desktop app (Electron)
```

Prefer the browser? A zero-dependency Python launcher is kept for dev:

```bash
python3 launch.py  # serves the app and opens your browser at localhost:8080
```

## Build installers

```bash
npm run dist          # build for the current OS
npm run dist:linux    # AppImage + deb
npm run dist:win      # nsis installer + portable
npm run dist:mac      # dmg
```

Output lands in `dist/`.

## Releasing

Push a version tag and CI builds + publishes installers for all three OSes to a
draft GitHub Release:

```bash
git tag v0.1.0
git push --tags
```

See [`.github/workflows/release.yml`](.github/workflows/release.yml).

## Architecture

Zero-build vanilla ES-module frontend (`index.html`, `css/`, `js/`) rendered on an
SVG canvas, laid out with [dagre](https://github.com/dagrejs/dagre). Non-flowchart
diagrams render via the bundled [Mermaid](https://github.com/mermaid-js/mermaid).
The desktop build ([`electron/`](electron/)) runs a tiny local file-server (a Node
port of `launch.py`) and points a native window at it, so the frontend is identical
in the browser and the app.
