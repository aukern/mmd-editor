import { S } from './state.js';
import { enterViewMode, exitViewMode } from './viewmode.js';

function serializeTab() {
  return {
    filename: S.currentFilename,
    nodes: JSON.parse(JSON.stringify(S.nodes)),
    edges: JSON.parse(JSON.stringify(S.edges)),
    groups: JSON.parse(JSON.stringify(S.groups)),
    classDefs: JSON.parse(JSON.stringify(S.classDefs)),
    direction: S.direction,
    undoStack: JSON.parse(JSON.stringify(S.undoStack)),
    redoStack: JSON.parse(JSON.stringify(S.redoStack)),
    zoom: S.zoom, panX: S.panX, panY: S.panY,
    selected: S.selected ? {...S.selected} : null,
    nextNodeNum: S.nextNodeNum, nextEdgeNum: S.nextEdgeNum, nextGroupNum: S.nextGroupNum,
    snapshots: JSON.parse(JSON.stringify(S.snapshots)),
    snapAlways: S.snapAlways,
    multiSelect: [...S.multiSelect],
    multiSelectEdges: [...S.multiSelectEdges],
    diffCheckpoints: S.diffCheckpoints ? [...S.diffCheckpoints] : null,
    viewMode: S.viewMode,
    rawText: S.rawText,
  };
}

export function captureTabState() {
  if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) {
    S.tabs[S.activeTabIdx] = serializeTab();
  }
}

export function syncModal() {
  const modal = document.getElementById('startupModal');
  if (!modal) return;
  const hasFile = S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx] && S.tabs[S.activeTabIdx].filename;
  modal.style.display = hasFile ? 'none' : '';
  // Modal is (re)appearing — reset the file picker so it re-fetches a fresh list.
  if (!hasFile && window._editorModal && window._editorModal.resetFilePicker) window._editorModal.resetFilePicker();
}

export function restoreTabState(tab) {
  S.currentFilename = tab.filename;
  S.nodes = tab.nodes;
  S.edges = tab.edges;
  S.groups = tab.groups;
  S.classDefs = tab.classDefs;
  S.direction = tab.direction;
  S.undoStack = tab.undoStack || [];
  S.redoStack = tab.redoStack || [];
  S.zoom = tab.zoom; S.panX = tab.panX; S.panY = tab.panY;
  S.selected = tab.selected;
  S.nextNodeNum = tab.nextNodeNum; S.nextEdgeNum = tab.nextEdgeNum; S.nextGroupNum = tab.nextGroupNum;
  S.snapshots = tab.snapshots || [];
  S.snapAlways = tab.snapAlways || false;
  S.multiSelect = new Set(tab.multiSelect || []);
  S.multiSelectEdges = new Set(tab.multiSelectEdges || []);
  S.diffCheckpoints = tab.diffCheckpoints || null;
  // Update direction select
  const dirSel = document.getElementById('directionSelect');
  if (dirSel) dirSel.value = S.direction;
  // Update filename display
  const display = document.getElementById('filenameDisplay');
  if (display) display.textContent = S.currentFilename || 'No file';
  // Start/stop file watcher
  const { startFileWatcher, stopFileWatcher } = window._editorFile || {};
  if (S.currentFilename) {
    if (startFileWatcher) startFileWatcher(S.currentFilename);
  } else {
    if (stopFileWatcher) stopFileWatcher();
  }
  syncModal();
  // Restore the canvas mode for this tab (view-only Mermaid render vs editor).
  if (tab.viewMode) enterViewMode(tab.rawText || ''); else exitViewMode();
  const { applyTransform } = window._editorUtils || {};
  if (applyTransform) applyTransform();
}

// The folder a tab belongs to (its file's directory; '' for root or unsaved tabs).
// Folders are the only tab grouping for now — no manual groups.
function tabFolder(tab) {
  if (!tab || !tab.filename) return '';
  const i = tab.filename.lastIndexOf('/');
  return i >= 0 ? tab.filename.slice(0, i) : '';
}

// Drag-reorder state (only within the same folder group).
let dragTabIdx = null, dragTabFolder = null;

function reorderTab(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const active = S.activeTabIdx >= 0 ? S.tabs[S.activeTabIdx] : null;
  const [t] = S.tabs.splice(fromIdx, 1);
  const at = toIdx > fromIdx ? toIdx - 1 : toIdx;
  S.tabs.splice(at, 0, t);
  if (active) S.activeTabIdx = S.tabs.indexOf(active);
  renderTabBar();
}

export function renderTabBar() {
  const bar = document.getElementById('tabBar');
  bar.innerHTML = '';

  // Group tabs by folder; group order follows first appearance in the tab list.
  const groups = [];
  const byFolder = new Map();
  S.tabs.forEach((tab, idx) => {
    const f = tabFolder(tab);
    let grp = byFolder.get(f);
    if (!grp) { grp = { folder: f, items: [] }; byFolder.set(f, grp); groups.push(grp); }
    grp.items.push({ tab, idx });
  });

  const clearDropMarks = () => bar.querySelectorAll('.tab.drop-before,.tab.drop-after')
    .forEach(t => t.classList.remove('drop-before', 'drop-after'));

  const makeTab = (tab, idx, folder) => {
    const el = document.createElement('div');
    el.className = 'tab' + (idx === S.activeTabIdx ? ' active' : '');
    el.draggable = true;
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.filename ? tab.filename.split('/').pop() : 'Untitled';
    label.title = tab.filename || 'Untitled';
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = 'Close tab';
    close.addEventListener('click', ev => { ev.stopPropagation(); closeTab(idx); });
    el.addEventListener('click', () => { if (idx !== S.activeTabIdx) switchTab(idx); });
    // Reorder by dragging — only within the same folder group.
    el.addEventListener('dragstart', ev => {
      dragTabIdx = idx; dragTabFolder = folder; el.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
      try { ev.dataTransfer.setData('text/plain', String(idx)); } catch (e) {}
    });
    el.addEventListener('dragend', () => { el.classList.remove('dragging'); dragTabIdx = null; dragTabFolder = null; clearDropMarks(); });
    el.addEventListener('dragover', ev => {
      if (dragTabIdx === null || folder !== dragTabFolder) return;   // same folder only
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const after = ev.clientX > r.left + r.width / 2;
      el.classList.toggle('drop-after', after);
      el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', ev => {
      if (dragTabIdx === null || folder !== dragTabFolder) return;
      ev.preventDefault();
      const r = el.getBoundingClientRect();
      const after = ev.clientX > r.left + r.width / 2;
      reorderTab(dragTabIdx, after ? idx + 1 : idx);
    });
    el.appendChild(label); el.appendChild(close);
    return el;
  };

  groups.forEach(grp => {
    const gEl = document.createElement('div');
    gEl.className = 'tab-group' + (grp.folder ? '' : ' rootgroup');
    if (grp.folder) {
      const lbl = document.createElement('span');
      lbl.className = 'tab-group-label';
      lbl.textContent = grp.folder.split('/').pop();   // leaf folder name
      lbl.title = grp.folder;
      gEl.appendChild(lbl);
    }
    grp.items.forEach(({ tab, idx }) => gEl.appendChild(makeTab(tab, idx, grp.folder)));
    bar.appendChild(gEl);
  });

  const addBtn = document.createElement('div');
  addBtn.className = 'tab-add';
  addBtn.textContent = '+';
  addBtn.title = 'New tab';
  addBtn.addEventListener('click', () => newTab());
  bar.appendChild(addBtn);
}

export function switchTab(idx) {
  if (idx === S.activeTabIdx) return;
  captureTabState();
  S.activeTabIdx = idx;
  restoreTabState(S.tabs[idx]);  // syncModal called inside restoreTabState
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
  const { refreshHistoryPanel } = window._editorHistory || {};
  if (refreshHistoryPanel) refreshHistoryPanel();
}

export function closeTab(idx) {
  if (idx === S.activeTabIdx) captureTabState();
  S.tabs.splice(idx, 1);
  if (S.tabs.length === 0) {
    S.activeTabIdx = -1;
    renderTabBar();
    syncModal();
    return;
  }
  let newIdx = idx;
  if (newIdx >= S.tabs.length) newIdx = S.tabs.length - 1;
  S.activeTabIdx = newIdx;
  restoreTabState(S.tabs[newIdx]);  // syncModal called inside
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
}

export function openInNewTab(filename, mmdText) {
  captureTabState();
  const tab = {
    filename,
    nodes: [], edges: [], groups: [], classDefs: {}, direction: 'TD',
    undoStack: [], redoStack: [],
    zoom: 1, panX: 80, panY: 80,
    selected: null,
    nextNodeNum: 1, nextEdgeNum: 1, nextGroupNum: 1,
    snapshots: [], snapAlways: false,
    multiSelect: [], multiSelectEdges: [],
  };
  S.tabs.push(tab);
  S.activeTabIdx = S.tabs.length - 1;
  restoreTabState(tab);
  const { loadFromMermaidText } = window._editorLoad || {};
  if (loadFromMermaidText && mmdText) loadFromMermaidText(mmdText, false);
  // Keep tab.snapshots in sync after loadFromMermaidText may have replaced S.snapshots
  S.tabs[S.activeTabIdx].snapshots = S.snapshots;
  const { takeSnapshot } = window._editorHistory || {};
  if (takeSnapshot) takeSnapshot('Opened file');
  const { resetBaseline } = window._editorDiff || {};
  if (resetBaseline) resetBaseline();   // diff baseline = the file we just opened
  // Opening a file must NOT trigger autosave — the regenerated mermaid text may differ
  // from the original (parser lossy round-trip), which would silently corrupt the file.
  // Only user mutations should save.
  clearTimeout(S.saveTimer); S.saveTimer = null;
  if (filename) {
    const { serverMtime, startFileWatcher, updateSaveStatus } = window._editorFile || {};
    if (serverMtime) serverMtime(filename).then(m => { if (m !== null) S.lastKnownMtime = m; });
    if (startFileWatcher) startFileWatcher(filename);
    if (updateSaveStatus) updateSaveStatus('saved');
  }
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
  syncModal();
}

export function newTab(filename) {
  captureTabState();
  const tab = {
    filename: filename || null,
    nodes: [], edges: [], groups: [], classDefs: {}, direction: 'TD',
    undoStack: [], redoStack: [],
    zoom: 1, panX: 80, panY: 80,
    selected: null,
    nextNodeNum: 1, nextEdgeNum: 1, nextGroupNum: 1,
    snapshots: [], snapAlways: false,
    multiSelect: [], multiSelectEdges: [],
  };
  S.tabs.push(tab);
  S.activeTabIdx = S.tabs.length - 1;
  restoreTabState(tab);  // syncModal called inside
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
  const { takeSnapshot } = window._editorHistory || {};
  if (takeSnapshot && filename) takeSnapshot('New file');
}

// Load a file into the current no-file tab, or create a new tab if none exists.
export function loadIntoCurrentTab(filename, mmdText) {
  const currentTab = S.tabs[S.activeTabIdx];
  if (!currentTab || currentTab.filename) {
    // No pending tab — open in a new tab instead
    openInNewTab(filename, mmdText);
    return;
  }
  // Adopt the pending tab
  currentTab.filename = filename;
  S.currentFilename = filename;
  const display = document.getElementById('filenameDisplay');
  if (display) display.textContent = filename;

  const { loadFromMermaidText } = window._editorLoad || {};
  if (loadFromMermaidText && mmdText) loadFromMermaidText(mmdText, false);
  // loadFromMermaidText may replace S.snapshots with a new array; keep tab in sync
  currentTab.snapshots = S.snapshots;

  const { takeSnapshot } = window._editorHistory || {};
  if (takeSnapshot) takeSnapshot('Opened file');
  const { resetBaseline } = window._editorDiff || {};
  if (resetBaseline) resetBaseline();   // diff baseline = the file we just opened
  // Opening a file must NOT trigger autosave — cancel any save the snapshot scheduled.
  clearTimeout(S.saveTimer); S.saveTimer = null;

  if (filename) {
    const { serverMtime, startFileWatcher, updateSaveStatus } = window._editorFile || {};
    if (serverMtime) serverMtime(filename).then(m => { if (m !== null) S.lastKnownMtime = m; });
    if (startFileWatcher) startFileWatcher(filename);
    if (updateSaveStatus) updateSaveStatus('saved');
  }

  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
  syncModal();
}
