# Changelog

All notable changes to MMD Editor are documented here. This project follows
[Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/) format.

## [0.5.2] — 2026-07-09

### Fixes
- **"Reopen last files on startup" now actually reopens the files.** The initial empty tab
  created at launch saved an empty file list over the stored session before it could be
  read, so there was nothing left to restore. The previous session is now snapshotted at
  load, before anything can overwrite it.

## [0.5.1] — 2026-07-09

### Fixes
- **Settings now persist across launches** (fixes "reopen last files on startup" doing
  nothing). The desktop app served itself on a new random port every launch, so the page
  origin changed each time and `localStorage` — where the toggle and the saved session
  live — was wiped. The app now binds a stable loopback port, so settings and the last
  session actually survive a restart. *(You'll need to re-enable the toggle once after
  updating, since the old setting was stored under the previous origin.)*

## [0.5.0] — 2026-07-09

### Startup
- **"Reopen last files on startup"** — a toggle in the **File** menu (like a browser's
  "continue where you left off"). When on, the set of open files is remembered and
  reopened next launch, restoring the tab you were on. Off by default; the menu shows a
  ✓ when enabled. Files that were moved or deleted since last session are skipped.

## [0.4.0] — 2026-07-09

### Tabs
- **Tabs are grouped by their folder**, with the folder name as a group label, so open
  files from the same folder read as a set. Root/unsaved tabs stay ungrouped.
- **Drag to reorder tabs within a group.** Reordering is kept inside a folder (moving a
  tab across folders isn't allowed — folders are the only grouping for now).

### View mode
- **Better click highlight.** Clicking a view-only diagram now draws a crisp selection box
  around the exact label you clicked instead of a soft glow around the whole node — no more
  blurry text, and it's clear precisely what the source jumped to.

## [0.3.0] — 2026-07-09

### File picker — revamped
- **Clear folder grouping.** Root files now sit at the top; each folder is a collapsible
  section below them with a guide line enclosing its contents, so it's always obvious
  which files belong to a folder and which are in the root.
- **Scales.** Folders are collapsed by default and show a file-count badge, so the list
  stays compact whether you have five files or hundreds. Search still cuts across all of
  them.
- **Open a whole folder.** Each folder has an **Open all** button that opens every `.mmd`
  in it (recursively) as tabs — or click a single file to open just that one.

### View mode
- **Clicking a view-only diagram now highlights what you clicked** (a gold glow), so when
  the source jumps you can see exactly which element it matched — no more guessing whether
  you hit the thing you meant to.

## [0.2.2] — 2026-07-09

### Fixes
- **Diff jump arrows (▲▼) now work.** They were disabled unless the diff had two or more
  hunks (so a single change made them unresponsive), and the scroll/flash target was
  mis-anchored. The arrows are now active whenever there's a change, scroll to the target
  hunk correctly, and flash it so the jump is visible.

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
