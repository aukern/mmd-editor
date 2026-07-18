# Changelog

All notable changes to MMD Editor are documented here. This project follows
[Semantic Versioning](https://semver.org/) and the [Keep a Changelog](https://keepachangelog.com/) format.

## [0.8.1] — 2026-07-17

### Update notifications
- **The app now tells you when a newer version is available.** On startup (and periodically)
  it checks GitHub for the latest release; if one is newer than what you're running, a small
  dismissible banner appears in the corner with a **Download** link to the release page
  (opens in your browser). Dismissing it won't nag you again for that version. The check is
  frontend-only and fails silently when offline. *(It compares against published GitHub
  Releases, so releases must be tagged/published for it to trigger.)*

## [0.8.0] — 2026-07-17

### Sidebar & tabs — less clutter
- **The Timeline is now the top section of the right sidebar**, so version history and the
  change tools are the first thing you see.
- **Collapsed sidebar sections stay collapsed across launches.** Fold away the sections you
  don't use and they'll be that way next time you open the app.
- **Tab folder-groups can be collapsed.** Click a folder label in the tab bar to fold its
  tabs away (with a count badge); the active tab still shows so you don't lose your place.
  Which groups are collapsed is remembered between launches.
- The Timeline's **⇄ Show Old** button label was shortened so it no longer runs off the
  panel.

## [0.7.3] — 2026-07-17

### See removed items on non-flowchart diagrams (switchable New/Old view)
- **"Show changes" on view-mode diagrams (sequence, ER, state, class…) now lets you flip
  between the new and previous version.** On the new side, added elements glow green and
  changed ones amber. Press **⇄ Show Old** and the canvas flips to the previous version,
  where **removed elements are highlighted in red** — so you can actually *see* what was
  deleted, which can't be drawn on the new diagram. Flipping keeps the same comparison and
  updates automatically as you switch versions. (Flowcharts already show deletions in place
  as red ghosts, so they don't need the flip.)

## [0.7.2] — 2026-07-17

### Timeline / preview fixes — tabs are now independent
- **Preview no longer bleeds across tabs.** Preview and the "Show changes" overlay are
  transient view states, not tab content; switching or closing a tab now drops out of both
  first — so cancelling a preview can't affect a different tab, and the tab's *live* content
  (not a previewed snapshot) is what gets saved.
- **You can't preview the current version, and returning to it exits preview.** The newest
  row is the live canvas; its Preview button is disabled, and selecting it (or the version
  you're previewing) drops preview instead of leaving a stale "preview" state.
- **Comparing a version to itself is greyed out**, and selecting the version you're
  previewing cancels the preview rather than showing an empty comparison.

## [0.7.1] — 2026-07-17

### Fixes
- **A file with no stored history no longer loses its timeline on an external sync.**
  Reloading a changed-on-disk file wiped the in-memory timeline and, if the file carried
  no `%% snap:` history of its own (e.g. a fresh sequence/other view-mode diagram), left a
  single 🤖 AI entry with nothing before it — an empty diff. The reload now keeps the
  in-memory history unless the file supplies its own, so the AI change always has a
  baseline to diff against.

## [0.7.0] — 2026-07-17

### Light-git timeline (replaces snapshots, History, checkpoint diff, and the change overlay)

The four overlapping systems — inline snapshots, the History panel, the "Changes since
checkpoint" diff, and the 👁 Changes overlay — are unified into one **Timeline** panel in
the sidebar. Everything is anchored to explicit, authored snapshots, which also fixes the
old overlay's drifting-baseline flakiness.

- **Authored, rolling history.** Every version is tagged **👤 You** or **🤖 AI** and stored
  in the `.mmd` (so it travels with the file). Consecutive edits by the same author collapse
  into one rolling entry; a new entry starts when authorship flips (you ↔ AI). In-editor
  edits are **you**; content arriving from disk (an AI writing the file, or an external edit
  while the app was closed) is **the AI**. History is capped (newest ~30) to keep files light.
- **The as-opened state is preserved.** Opening a file pins an anchor so your edits since
  opening always show as a diff — they never silently merge into the version you opened.
- **Timeline panel.** Newest-at-top rows with author, relative time, and a `+a −d` stat.
  Selecting a version shows the change *that version introduced* (predecessor → it), labeled
  by its author — so your edits read as **👤 You changed this version**, the AI's as **🤖 AI**.
  The newest row (your current work) is selected by default.
- **📋 Copy for AI** copies the selected version's change as a unified diff — now
  **non-destructive** (no checkpoints to advance or undo).
- **👁 Preview** renders any past version read-only on the canvas (gold border + banner;
  restore or cancel from the banner).
- **⧉ Show changes** highlights that version's change *on the diagram* (in-place ghosts and
  outlines for flowcharts). It's anchored to the selected version — a **stable baseline** —
  and **auto-updates** as you switch versions.
- The manual 📷 snapshot button is gone (history records automatically); `Ctrl`+`S` is now
  just **Save**. The toolbar's 👁 Changes / ✓ Reviewed and 🕐 History buttons are retired —
  it all lives in the Timeline now.

## [0.6.3] — 2026-07-09

### Change-review fixes
- **Ghost boxes no longer overlap live nodes.** A deleted box with a single surviving
  neighbour was placed right on top of it; it now sits clearly beside it.
- **Switching tabs no longer wipes the other diagram's highlights.** The tab-switch
  disk-refresh only runs when the file actually changed on disk, so it stops resetting an
  untouched diagram's review baseline.
- **View-mode overlay now tells added / changed / removed apart.** Added elements get a
  green box, changed ones an amber box, and removed items are listed by name in the chip
  (they can't be drawn in place without controlling Mermaid's layout). Removed/added are
  matched by text similarity so an unrelated remove+add is no longer mislabelled as a
  change, and message labels are read correctly (no more grabbing "(diff)" out of a line).

## [0.6.2] — 2026-07-09

### Change-review fixes (this makes it actually work)
- **View-mode highlights now render.** They were being applied as a CSS class on the
  wrong element, so the count was right but nothing showed. Now a crisp highlight box is
  drawn behind each changed element — reliable on any Mermaid SVG.
- **An AI edit always shows its exact delta.** The review baseline is now snapshotted just
  before every external sync, so the overlay reflects precisely what that change did
  (previously the baseline could drift to equal the current content, leaving the flowchart
  overlay blank).
- Overlay code is wrapped in guards so a single bad case can never blank the whole thing.

## [0.6.1] — 2026-07-09

### Change-review fixes
- **Removed connections are now shown.** When a node is deleted, the edges that led into
  and out of it are drawn as dashed ghost lines to the ghost box — so you can see *where*
  the removed box sat, not just that something vanished into empty space.
- **View-mode diagrams refresh when you switch to their tab.** The live watcher only
  follows the active tab, so an AI edit to a background (e.g. sequence) diagram used to go
  unnoticed; switching to that tab now re-reads it from disk and re-applies the highlight.

## [0.6.0] — 2026-07-09

### Visual change review (new — first cut)
- A **👁 Changes** toggle in the toolbar highlights **what changed on the diagram itself**,
  so you can *see* the differences instead of re-reading everything. The baseline is the
  diagram as it was when you opened it / turned review on / hit **✓ Reviewed**; it's
  content-based, so if the AI reverts an edit the highlight simply disappears.
  - **Flowcharts:** in-place overlay — added nodes/edges get a `NEW` outline, changed ones
    get a `changed` outline with the previous label shown struck-through, and deleted nodes
    appear as red struck-through **ghosts** placed among their old neighbours (we own the
    flowchart layout, so nothing has to move).
  - **All other diagram types (sequence, ER, state, class…):** the rendered Mermaid SVG is
    hijacked and the changed/added elements are **glowed in place**, with a small
    `N changed · N removed` chip (deletions can't be drawn where they were, since we don't
    control Mermaid's layout — that's the one honest limit).
- Toggle it off anytime. This is a first version — the non-flowchart highlighting is
  best-effort (matches elements by their label text); expect it to catch most changes, not
  every last one.

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

[0.8.1]: https://github.com/aukern/mmd-editor/releases/tag/v0.8.1
[0.8.0]: https://github.com/aukern/mmd-editor/releases/tag/v0.8.0
[0.7.3]: https://github.com/aukern/mmd-editor/releases/tag/v0.7.3
[0.7.2]: https://github.com/aukern/mmd-editor/releases/tag/v0.7.2
[0.7.1]: https://github.com/aukern/mmd-editor/releases/tag/v0.7.1
[0.7.0]: https://github.com/aukern/mmd-editor/releases/tag/v0.7.0
[0.1.0]: https://github.com/aukern/mmd-editor/releases/tag/v0.1.0
