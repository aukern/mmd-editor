<p align="center">
  <img src="assets/logo.png" width="96" alt="MMD Editor">
</p>

<h1 align="center">MMD Editor</h1>

<p align="center">
  <a href="https://github.com/aukern/mmd-editor/actions/workflows/release.yml"><img src="https://github.com/aukern/mmd-editor/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="https://github.com/aukern/mmd-editor/releases"><img src="https://img.shields.io/badge/download-releases-2b9348.svg" alt="Download"></a>
  <a href="package.json"><img src="https://img.shields.io/badge/desktop-Electron-47848F.svg?logo=electron&logoColor=white" alt="Electron"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-lightgrey.svg" alt="License: MIT"></a>
</p>

> A visual editor for Mermaid **workflows** that acts as a translation layer between you and your AI — you shape the diagram by hand, your AI reads the exact `.mmd` text behind it.

## The Problem

A system is far easier to *understand* as a diagram than as prose — humans navigate a picture spatially, and text is uniform wherever you look. But the moment you want an AI to help with that system, the picture becomes the problem. Models can't reliably read an image: OCR is fuzzy, and a screenshot throws away the very things that carry meaning — which line is an edge, which way an arrow points, what is grouped with what.

So people paste raw Mermaid instead. The AI reads it perfectly, but now the *human* is stuck: authoring and reasoning about a system in linear text is exactly the thing the diagram was supposed to fix. And every time you want to iterate, you re-send the whole diagram — verbose, and increasingly expensive as it grows.

The result is a gap. No tool lets a human work **visually** while handing the AI a **faithful, minimal, unambiguous** text representation to talk about. Text-with-preview editors (mermaid.live) keep you in the code. Freeform canvases (draw.io, Excalidraw) give you a picture the AI can't read. The one true visual Mermaid editor (Mermaid Chart) is closed and commercial.

MMD Editor closes that gap. It is **not a diagram-making tool and not an AI client** — it is the translation layer in between. You edit a workflow visually; the app keeps a clean `.mmd` file as the single source of truth; and when you want help, you hand your AI either the whole diagram or just *what changed* — as text it reads with zero ambiguity.

## Design principles

- **Mermaid is the source of truth, and it round-trips both ways.** The human sees the rendered diagram; the AI sees the exact source. Neither side works from a degraded copy — that only holds if the visual editor stays a faithful Mermaid mirror, which is the load-bearing invariant of the whole tool.
- **Positions are never saved.** Layout is noise for an AI and bloat in the file. The `.mmd` describes *structure* — what is grouped, what is connected — and the layout engine draws it consistently every time. It also makes diffs clean: moving a box around produces no change.
- **Workflows are what you edit; everything else you read.** Flowcharts get the full visual editor. Every other Mermaid type (ER, sequence, class, state, gantt…) opens in a live view you edit as code — because a sequence diagram and a flowchart share nothing you could meaningfully drag.
- **Talk in diffs.** After the first share, hand your AI a git-style diff against a checkpoint you control — the change, not the whole file. Since the diff is over structure (not positions), it is signal-only.
- **Local-first, one portable file.** A diagram *and its version history* live in a single `.mmd` you own. No account, no cloud, no lock-in.

## Features

- **Visual workflow editing** — drag nodes, drag from a node's edge to connect, nested groups/subgraphs with connection ports, 19 node shapes, per-node styles and `classDef`s, multi-line labels (Shift/Alt+Enter), rubber-band select, copy/paste/duplicate, undo/redo.
- **Editable Mermaid source, live and two-way** — type in the code panel and the diagram updates (position-preserving); select on the canvas and the matching source line highlights. Includes find-in-code.
- **View mode for every other diagram type** — open an `erDiagram`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `gantt`, … and it renders live; edit it as code with the same autosave, history, and diff.
- **Change-since-checkpoint diff** — a unified diff of the diagram against a checkpoint you advance yourself, so you can paste an AI *only what changed*. Undo/redo or retyping the same thing produces no diff.
- **Version history in the file** — snapshots are stored inside the `.mmd`, so history travels with the diagram; preview and restore any point.
- **Autosave**, **pan/zoom**, and **export to SVG / PNG / PDF**.
- **Desktop app** for Linux, Windows, and macOS — or run it in the browser.

## Collaboration

Because a diagram is one portable `.mmd` text file — structure, styles, and version history all inside it — collaboration is whatever your team already uses for text, no server required:

- **Version control.** Commit `.mmd` files to git. They diff cleanly (positions aren't stored), so a pull-request review of a workflow change is actually readable.
- **File sync / hand-off.** Put them in a shared Drive/Dropbox folder, or just send the file. Whoever opens it gets the full diagram *and* its snapshot history.
- **Symlink anything in.** Keep files anywhere on disk and symlink a file — or a whole folder — into the diagrams folder; a shared or synced folder works out of the box (see [Where files live](#where-files-live)).
- **AI-mediated review.** The change-diff is a natural async review unit — "here's what I changed, thoughts?" — whether the reviewer is a teammate or an AI.

Real-time multiplayer editing is deliberately out of scope; collaboration here is file-based and asynchronous, which is what fits a plain-text, local-first tool.

## Architecture

A zero-build, dependency-light frontend: vanilla ES modules rendered on an SVG canvas, laid out with [dagre](https://github.com/dagrejs/dagre). Non-flowchart diagrams render via the bundled [Mermaid](https://github.com/mermaid-js/mermaid) library. The desktop build runs a tiny local file-server (a Node port of the dev `launch.py`) and points a native Electron window at `127.0.0.1` — so the frontend is byte-identical in the browser and in the app, and the app owns no build step of its own.

| Area | Role |
|------|------|
| `js/parser.js` | Parse Mermaid flowchart text into the editable model (nodes, edges, groups, styles, classes) |
| `js/render.js` | Model → SVG, and model → canonical Mermaid text (the serialization the AI reads) |
| `js/layout.js` | Dagre-based hierarchical layout, including nested subgraphs |
| `js/loader.js` | Orchestrates parse → layout → render; routes non-flowchart diagrams to view mode |
| `js/viewmode.js` | Live Mermaid render for non-flowchart types; edit-as-code; click-to-locate in source |
| `js/events.js` | All canvas interaction — drag, connect, ports, rubber-band, pan/zoom, keyboard |
| `js/history.js` | Snapshots stored in the `.mmd` (`%% snap:` lines); preview / restore |
| `js/file.js` | File-API client, debounced autosave, external-change watcher, rename |
| `js/ui/source.js` | The live, editable Mermaid-source panel, find-in-code, source-line highlight |
| `js/ui/diff.js` | Change-since-checkpoint diff engine + panel |
| `electron/` | Desktop shell: the Node file-server (`server.js`) and the window/menu (`main.js`) |

## Key decisions

**Positions are not part of the file.** The `.mmd` is re-laid-out on every open. This costs you hand-tuned pixel arrangements, but buys a file that is pure structure — smaller, diff-friendly, and free of layout noise the AI would misread as meaning. For "represent and discuss a system," that is the sharper tradeoff; for pixel-perfect presentation art, use a different tool.

**Only workflows are visually editable.** Rather than build twenty half-working editors, flowcharts get a real visual editor and every other Mermaid type gets a first-class *view + edit-as-code* mode. You lose drag-editing for those types; you gain support for *all* of them at a fraction of the effort — and the source panel + live preview is still a good way to work on them.

**The desktop app reuses the exact web frontend.** Instead of porting the UI into Electron IPC, the app runs the same file API over `localhost` (Node port of `launch.py`) and loads the same `index.html`. The frontend didn't change a line between browser and app, which keeps a single codebase honest.

**File access is confined to one folder.** A local web server that can write files is only safe if it can't write *anywhere*. Every request is validated to stay inside the diagrams folder (`../` traversal is rejected); symlinks are the intentional, explicit escape hatch.

## Download

Grab an installer from the **[Releases page](https://github.com/aukern/mmd-editor/releases)**:

| OS | Files |
|----|-------|
| **Linux** | `.AppImage` (portable — `chmod +x`, run) or `.deb` |
| **Windows** | `.exe` installer or portable `.exe` |
| **macOS** | universal `.dmg` (Intel + Apple Silicon) |

The apps are **unsigned** (this is open source — build it yourself if you'd rather), so on first launch:

- **Windows** — SmartScreen: *More info → Run anyway*.
- **macOS** — Gatekeeper: right-click the app → **Open** (not double-click), or run `xattr -cr "/Applications/MMD Editor.app"` once.

### Where files live

Diagrams are stored in **`~/Documents/MermaidEditor`** (created on first run; override with the `MMD_DIAGRAMS` env var). To use files kept elsewhere, symlink them — or a whole folder — into that directory:

```bash
# Linux / macOS
ln -s ~/projects/acme/docs/diagrams ~/Documents/MermaidEditor/acme

# Windows (real symlink, not a .lnk shortcut)
mklink /D "%USERPROFILE%\Documents\MermaidEditor\acme" "C:\path\to\diagrams"
```

## Run from source

Requires [Node.js](https://nodejs.org) (LTS).

```bash
npm install
npm start           # desktop app (Electron)
```

Prefer the browser? A zero-dependency Python launcher is kept for dev:

```bash
python3 launch.py   # serves the app and opens it at localhost:8080
```

## Build installers

```bash
npm run dist          # current OS
npm run dist:linux    # AppImage + deb
npm run dist:win      # nsis installer + portable
npm run dist:mac      # universal dmg
```

Or push a version tag and CI builds and publishes all three:

```bash
git tag v0.1.0 && git push --tags   # see .github/workflows/release.yml
```

## What I'd improve

- **Precise click-to-source in view mode.** Clicking a rendered element highlights the source line by matching its label text (first match). It's a locator, not a reliable map — decoding Mermaid's per-type element IDs would make it exact.
- **Open/Save from anywhere.** Files must live in (or be symlinked into) the diagrams folder. A native file dialog that reads an arbitrary path and autosaves back to it would remove the constraint without loosening the server's confinement.
- **Signed installers.** Unsigned means SmartScreen/Gatekeeper friction on first run. Signing is a cost/benefit call, not a technical blocker.
- **More visually-editable types.** State, ER, and class diagrams are box-and-line families that could reuse much of the flowchart editor.

## Contributing

Bug reports, feature ideas, and PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md)
for how to run it, the design invariants worth protecting, and the review process.

## License

MIT — see [LICENSE](LICENSE). Bundles Mermaid and dagre (both MIT); see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
