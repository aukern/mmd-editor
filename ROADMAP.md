# Roadmap & scope

MMD Editor is a **visual editor for Mermaid diagrams** whose job is to be the bridge
between a human (who works visually) and an AI (which reads the `.mmd` text). It is
**not** an AI client — you bring your own AI; this tool just hands it clean, precise
diagram text instead of a screenshot.

## Shipped

- Visual flowchart editing — nodes, edges, groups (incl. nested subgraphs),
  connection ports, 19 shapes, styles & classDefs, multi-line labels.
- Editable Mermaid source, live two-way with the canvas, plus find-in-code.
- View mode for every other Mermaid diagram type (erDiagram, sequence, class,
  state, gantt, …): live render + edit-as-code.
- Change-since-checkpoint diff — send the AI only what changed, not the whole file.
- Version history (snapshots stored in the `.mmd`), autosave, undo/redo.
- Export SVG / PNG / PDF.
- Desktop app (Electron) with installers for Linux, Windows, and macOS.

## Maybe later (in scope)

- Native "Open/Save from anywhere" dialog. Today files live in
  `~/Documents/MermaidEditor`; symlinking files/folders in already bridges others.
- Visual editing for a few more box-and-line types (state, ER, class) — currently
  view-only.
- Compact adjacency / JSON export for very large diagrams (fewer tokens than raw
  Mermaid).
- Precise click-a-rendered-element → source mapping (currently best-effort text match).

## Non-goals (deliberately out of scope)

- Built-in LLM integration, API keys, "Connect to OpenAI/Anthropic/local model".
- In-app prompt templates, "Explain / Summarize" buttons, conversation history.
- Semantic analysis, migration-plan generation, CLI batch tooling, Docker images.

These belong in whatever AI tool you already use. The point of MMD Editor is to feed
that tool a faithful diagram — not to become one.
