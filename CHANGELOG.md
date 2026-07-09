# Changelog

All notable changes to MMD Editor are documented here. This project follows
[Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/) format.

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
