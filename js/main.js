import { S } from './state.js';
import { applyTransform, pushUndo, cloneState, fitAll, setZoom, svgPoint, nodeSize, uid } from './utils.js';
import { render, updateUndoRedo, updateMermaidOutput, getMermaidText, getCurrentSource } from './render.js';
import { loadFromMermaidText } from './loader.js';
import { takeSnapshot, recordSnapshot, recordFromLoad, lockHead, scheduleSnapshot, countMutation, buildFileContent, refreshHistoryPanel, initHistoryPanel, enterPreviewOf } from './history.js';
import { scheduleSave, doAutoSave, startFileWatcher, stopFileWatcher, serverMtime, serverRead, reloadActiveFromDisk, updateSaveStatus, initFilenameRename } from './file.js';
import { captureTabState, restoreTabState, renderTabBar, switchTab, closeTab, openInNewTab, newTab, loadIntoCurrentTab, syncModal } from './tabs.js';
import { initCanvasEvents, initToolbar, initKeyboard, addNode, addGroup, addEdge, deleteSelected, copySelection, pasteClipboard, duplicateSelection, getPortMousedownHandler, spawnConnectGhost, updateCanvasCursor } from './events.js';
import { initInline, activateInline, cancelInline } from './ui/inline.js';
import { buildShapeDropdown, setCurrentShape } from './ui/shapeDropdown.js';
import { initModal } from './ui/modal.js';
import { buildMenuBar, buildExportDropdown } from './ui/menu.js';
import { initSourceEditor } from './ui/source.js';
import { initDiffPanel } from './ui/diff.js';
import { initTimeline, refreshTimeline, resetTimelineSelection } from './ui/timeline.js';
import { initReview } from './ui/review.js';
import { enterViewMode, exitViewMode, renderViewDiagram, fitViewDiagram, detectDiagramType, initViewmode } from './viewmode.js';
import { autoArrange } from './layout.js';

// ── Expose globals so cross-module callbacks work without circular imports ─────
window._editorUtils = { pushUndo, cloneState, fitAll, setZoom, applyTransform, svgPoint, nodeSize };
window._editorRender = { render, updateMermaidOutput, getMermaidText, getCurrentSource };
window._editorInline = { activateInline, scheduleSnapshot };
window._editorMutations = { addEdge, takeSnapshot, addNode, deleteSelected, copySelection, pasteClipboard, duplicateSelection };
window._editorFile = { scheduleSave, doAutoSave, startFileWatcher, stopFileWatcher, serverMtime, reloadActiveFromDisk, updateSaveStatus };
window._editorLoad = { loadFromMermaidText };
window._editorHistory = { refreshHistoryPanel, takeSnapshot, recordSnapshot, recordFromLoad, lockHead, buildFileContent, countMutation, enterPreviewOf };
window._editorTabs = { captureTabState, restoreTabState, renderTabBar, switchTab, closeTab, openInNewTab, newTab, loadIntoCurrentTab, syncModal };
window._editorPortHandlers = { onPortMousedown: getPortMousedownHandler() };
window._editorEvents = { spawnConnectGhost, updateCanvasCursor };
window._editorViewmode = { enterViewMode, exitViewMode, renderViewDiagram, fitViewDiagram, detectDiagramType };

// Collapsible sidebar sections. Clicking a section header toggles it; clicks on
// interactive controls inside a header (e.g. the Expand button) are ignored.
function initCollapsibleSidebar() {
  document.querySelectorAll('#sidebar .sb-head').forEach(head => {
    head.addEventListener('click', ev => {
      if (ev.target.closest('button, input, select, textarea, a')) return;
      head.parentElement.classList.toggle('collapsed');
    });
  });
}

// Whole-sidebar collapse — hides the panel and shows a slim re-open tab. Persisted.
function initSidebarCollapse() {
  const KEY = 'mmd.sidebarCollapsed';
  const apply = c => document.body.classList.toggle('sidebar-collapsed', c);
  const set = c => { apply(c); try { localStorage.setItem(KEY, c ? '1' : '0'); } catch (e) {} };
  const toggle = () => set(!document.body.classList.contains('sidebar-collapsed'));
  let initial = false;
  try { initial = localStorage.getItem(KEY) === '1'; } catch (e) {}
  apply(initial);
  document.getElementById('sidebarCollapseBtn')?.addEventListener('click', () => set(true));
  document.getElementById('sidebarReopenBtn')?.addEventListener('click', () => set(false));
  window._editorUI = { toggleSidebar: toggle };
}

// ── Session restore ("reopen last files on startup") ──────────────────────────
// When enabled, the set of open files is remembered and reopened next launch.
const SESSION_KEY = 'mmd.session';
const RESTORE_KEY = 'mmd.restoreSession';

function sessionEnabled() { try { return localStorage.getItem(RESTORE_KEY) === '1'; } catch (e) { return false; } }

// Snapshot the previous session at module load — BEFORE the initial empty tab renders
// and saveSession() overwrites it with an empty list. restoreSession() reads this.
let bootSession = null;
try { bootSession = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { bootSession = null; }

function saveSession() {
  if (!sessionEnabled()) return;
  try {
    const files = S.tabs.map(t => t.filename).filter(Boolean);
    const active = (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) ? S.tabs[S.activeTabIdx].filename : null;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ files, active }));
  } catch (e) {}
}

function setSessionEnabled(on) {
  try { localStorage.setItem(RESTORE_KEY, on ? '1' : '0'); } catch (e) {}
  if (on) saveSession();
  else { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  const st = document.getElementById('statusText');
  if (st) st.textContent = on
    ? 'Reopen last files on startup: ON — this session will be remembered.'
    : 'Reopen last files on startup: OFF.';
}

async function restoreSession() {
  if (!sessionEnabled()) return;
  const data = bootSession;   // captured at load, before the empty tab overwrote it
  if (!data || !Array.isArray(data.files) || !data.files.length) return;
  let opened = 0;
  for (const name of data.files) {
    try { const text = await serverRead(name); loadIntoCurrentTab(name, text); opened++; }
    catch (e) { /* file was moved/deleted since last session — skip it */ }
  }
  if (data.active) {
    const idx = S.tabs.findIndex(t => t.filename === data.active);
    if (idx >= 0 && idx !== S.activeTabIdx) switchTab(idx);
  }
  if (opened) document.getElementById('statusText').textContent = `Reopened ${opened} file(s) from last session.`;
}

window._editorSession = { save: saveSession, enabled: sessionEnabled, toggle: () => setSessionEnabled(!sessionEnabled()) };

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  // Build UI components
  buildShapeDropdown();
  buildMenuBar();
  buildExportDropdown();
  initInline();
  initModal();
  initHistoryPanel();
  initFilenameRename();
  initCanvasEvents();
  initToolbar();
  initKeyboard();
  initSourceEditor();
  initDiffPanel();
  initTimeline();
  initReview();
  initViewmode();
  initCollapsibleSidebar();
  initSidebarCollapse();

  // Close shape/export dropdowns on outside click
  document.addEventListener('click', () => {
    document.getElementById('shapeDropdownPanel').classList.remove('open');
    const ep = document.getElementById('exportDropdownPanel');
    if (ep) ep.classList.remove('open');
  });

  // Create initial no-file tab so the modal has a tab to attach to
  newTab();
  renderTabBar();

  // If "reopen last files on startup" is on, restore the previous session's files
  // (this adopts the empty tab and hides the startup modal). No-op when disabled.
  restoreSession();

  // Snapshots are mutation-count based — no timer needed here

  // Server lifecycle ping
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setInterval(() => fetch('/ping').catch(() => {}), 20000);
    window.addEventListener('beforeunload', () => navigator.sendBeacon('/shutdown'));
  }
}

init();
