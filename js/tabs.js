import { S } from './state.js';

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
  };
}

export function captureTabState() {
  if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) {
    S.tabs[S.activeTabIdx] = serializeTab();
  }
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
  // Update direction select
  const dirSel = document.getElementById('directionSelect');
  if (dirSel) dirSel.value = S.direction;
  // Update filename display
  const display = document.getElementById('filenameDisplay');
  if (display) display.textContent = S.currentFilename || 'No file';
  // Start file watcher for this tab's file
  if (S.currentFilename) {
    const { startFileWatcher } = window._editorFile || {};
    if (startFileWatcher) startFileWatcher(S.currentFilename);
  }
}

export function renderTabBar() {
  const bar = document.getElementById('tabBar');
  bar.innerHTML = '';
  S.tabs.forEach((tab, idx) => {
    const el = document.createElement('div');
    el.className = 'tab' + (idx === S.activeTabIdx ? ' active' : '');
    const label = document.createElement('span');
    label.className = 'tab-label';
    label.textContent = tab.filename || 'Untitled';
    label.title = tab.filename || 'Untitled';
    const close = document.createElement('span');
    close.className = 'tab-close';
    close.textContent = '×';
    close.title = 'Close tab';
    close.addEventListener('click', ev => { ev.stopPropagation(); closeTab(idx); });
    el.addEventListener('click', () => { if (idx !== S.activeTabIdx) switchTab(idx); });
    el.appendChild(label); el.appendChild(close);
    bar.appendChild(el);
  });
}

export function switchTab(idx) {
  if (idx === S.activeTabIdx) return;
  captureTabState();
  S.activeTabIdx = idx;
  restoreTabState(S.tabs[idx]);
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
  const { refreshHistoryPanel } = window._editorHistory || {};
  if (refreshHistoryPanel) refreshHistoryPanel();
}

export function closeTab(idx) {
  // Capture current state before closing
  if (idx === S.activeTabIdx) captureTabState();
  S.tabs.splice(idx, 1);
  if (S.tabs.length === 0) {
    S.activeTabIdx = -1;
    // Show startup modal
    const modal = document.getElementById('startupModal');
    if (modal) modal.style.display = 'flex';
    renderTabBar();
    return;
  }
  // Determine which tab to switch to
  let newIdx = idx;
  if (newIdx >= S.tabs.length) newIdx = S.tabs.length - 1;
  S.activeTabIdx = newIdx;
  restoreTabState(S.tabs[newIdx]);
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
}

export function openInNewTab(filename, mmdText) {
  // Capture current tab state first
  captureTabState();
  // Create new tab state
  const newTab = {
    filename,
    nodes: [], edges: [], groups: [], classDefs: {}, direction: 'TD',
    undoStack: [], redoStack: [],
    zoom: 1, panX: 80, panY: 80,
    selected: null,
    nextNodeNum: 1, nextEdgeNum: 1, nextGroupNum: 1,
    snapshots: [], snapAlways: false,
    multiSelect: [], multiSelectEdges: [],
  };
  S.tabs.push(newTab);
  S.activeTabIdx = S.tabs.length - 1;
  restoreTabState(newTab);
  // Load content
  const { loadFromMermaidText } = window._editorLoad || {};
  if (loadFromMermaidText && mmdText) {
    loadFromMermaidText(mmdText, false);
  }
  const { takeSnapshot } = window._editorHistory || {};
  if (takeSnapshot) takeSnapshot('Opened file');
  // Update mtime
  if (filename) {
    const { serverMtime, startFileWatcher } = window._editorFile || {};
    if (serverMtime) {
      serverMtime(filename).then(m => { if (m !== null) S.lastKnownMtime = m; });
    }
    if (startFileWatcher) startFileWatcher(filename);
  }
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
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
  restoreTabState(tab);
  const { render } = window._editorRender || {};
  if (render) render();
  renderTabBar();
  const { takeSnapshot } = window._editorHistory || {};
  if (takeSnapshot) takeSnapshot('New file');
}
