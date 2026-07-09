# Changelog

All notable changes to MMD Editor are documented here. This project follows
[Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/) format.

## [0.2.1] — 2026-07-09

### Fixes
- **Groups can now be nested by dragging.** Dropping a group inside another group nests
  it — on the canvas and in the generated Mermaid (`subgraph` inside `subgraph`) — just
  like dropping a node into a group already did. Cycles are prevented (a group can't nest
  inside its own descendant), and deleting a group now promotes its child groups/nodes to
  the parent instead of orphaning them.

## [0.2.0] — 2026-07-09

### Canvas
- `Ctrl` `+` / `Ctrl` `-` now zoom the **canvas** instead of the whole app, and
  `Ctrl` `0` fits the diagram. (Removed the Electron page-zoom menu roles and pinned
  the window zoom factor to 100%.)

### Diff ("Changes since checkpoint")
- **AI edits no longer pollute your diff.** When the `.mmd` is changed from outside the
  editor (e.g. an AI writing the same file), the diff baseline now advances to that
  content, so "Changes since checkpoint" only ever contains *your* edits — the ones you
  mean to hand back to the AI.
- **Word-level highlighting** inside changed lines, a colored gutter, cleaner hunk
  separators, and **prev/next jump** buttons to navigate changes.
- **"Copy for AI" now confirms itself**: the button flashes ✓ and the diff box flashes as
  it resets, instead of the change list silently vanishing.

### Side panel
- Section headers are now distinct bands with a gold accent stripe.
- The whole side panel can be collapsed (button, `View → Toggle Sidebar`, or `Ctrl` `\`);
  the state is remembered between sessions.

### Fixes
- The Open-file list re-fetches every time the picker opens, so files added or symlinked
  while the app is running now appear.

## [0.1.0] — 2026-07-08

First public release.

### Editor
- Visual flowchart editing: nodes, edges, nested groups/subgraphs, connection ports,
  19 node shapes, per-node styles and `classDef`s, multi-line labels (Shift/Alt+Enter),
  rubber-band select, copy/paste/duplicate, undo/redo.
- Editable Mermaid source panel, live and two-way with the canvas (position-preserving),
  with find-in-code and source-line highlighting for the selected element.
- View mode for every non-flowchart Mermaid type (erDiagram, sequence, class, state,
  gantt, …): live render + edit-as-code, with click-to-locate in the source.
- Change-since-checkpoint diff for handing an AI only what changed.
- Version history stored inside the `.mmd` (snapshots), with preview/restore.
- Autosave, multi-tab, pan/zoom, and export to SVG / PNG / PDF.
- Dark gold theme.

### Desktop
- Electron desktop app with a loopback-only local file server (a Node port of the
  browser dev launcher), so the frontend is identical in the browser and the app.
- Diagrams stored in `~/Documents/MermaidEditor` (override via `MMD_DIAGRAMS`); the file
  browser follows symlinked files and folders so you can keep diagrams anywhere.
- Installers for Linux (AppImage, deb), Windows (nsis, portable), and macOS (universal dmg),
  published from a tag via GitHub Actions.

[0.1.0]: https://github.com/aukern/mmd-editor/releases/tag/v0.1.0
