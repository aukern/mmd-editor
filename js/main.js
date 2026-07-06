import { S } from './state.js';
import { applyTransform, pushUndo, cloneState, fitAll, setZoom, svgPoint, nodeSize, uid } from './utils.js';
import { render, updateUndoRedo } from './render.js';
import { loadFromMermaidText } from './loader.js';
import { takeSnapshot, scheduleSnapshot, buildFileContent, refreshHistoryPanel, initHistoryPanel } from './history.js';
import { scheduleSave, doAutoSave, startFileWatcher, serverMtime, initFilenameRename } from './file.js';
import { captureTabState, restoreTabState, renderTabBar, switchTab, closeTab, openInNewTab, newTab } from './tabs.js';
import { initCanvasEvents, initToolbar, initKeyboard, addNode, addGroup, addEdge, deleteSelected, copySelection, pasteClipboard, duplicateSelection, getPortMousedownHandler, spawnConnectGhost } from './events.js';
import { initInline, activateInline, cancelInline } from './ui/inline.js';
import { buildShapeDropdown, setCurrentShape } from './ui/shapeDropdown.js';
import { initModal } from './ui/modal.js';
import { buildMenuBar, buildExportDropdown } from './ui/menu.js';
import { autoArrange, fitGroupsToMembers } from './layout.js';

// ── Expose globals so cross-module callbacks work without circular imports ─────
window._editorUtils = { pushUndo, cloneState, fitAll, setZoom, applyTransform, svgPoint, nodeSize };
window._editorRender = { render };
window._editorInline = { activateInline, scheduleSnapshot };
window._editorMutations = { addEdge, takeSnapshot, addNode, deleteSelected, copySelection, pasteClipboard, duplicateSelection };
window._editorFile = { scheduleSave, doAutoSave, startFileWatcher, serverMtime };
window._editorLoad = { loadFromMermaidText };
window._editorHistory = { refreshHistoryPanel, takeSnapshot, buildFileContent };
window._editorTabs = { captureTabState, restoreTabState, renderTabBar, switchTab, closeTab, openInNewTab, newTab };
window._editorPortHandlers = { onPortMousedown: getPortMousedownHandler() };
window._editorEvents = { spawnConnectGhost };

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

  // Close shape/export dropdowns on outside click
  document.addEventListener('click', () => {
    document.getElementById('shapeDropdownPanel').classList.remove('open');
    const ep = document.getElementById('exportDropdownPanel');
    if (ep) ep.classList.remove('open');
  });

  // Seed example (same as original)
  const gid = addGroup(70, 70);
  const foundGroup = S.groups.find(g => g.id === gid);
  if (foundGroup) foundGroup.title = 'Validation';
  const na = addNode(160, 130, 'Start', 'stadium');
  const nb = addNode(160, 240, 'Valid?', 'rhombus');
  const nbNode = S.nodes.find(n => n.id === nb);
  const naNode = S.nodes.find(n => n.id === na);
  if (nbNode) nbNode.parent = gid;
  if (naNode) naNode.parent = gid;
  const nc = addNode(500, 130, 'Process', 'rect');
  const nd = addNode(500, 240, 'Error log', 'cylinder');
  const ndNode = S.nodes.find(n => n.id === nd);
  if (ndNode) ndNode.style = { fill: '#4a2222', stroke: '#c0504d' };
  const ne = addNode(820, 130, 'Done', 'doubleCircle');
  const nf = addNode(500, 370, 'Retry', 'delay');
  addEdge(na, nb, '', 'arrow');
  addEdge(nb, nc, 'Yes', 'arrow');
  addEdge(nb, nd, 'No', 'dotted-arrow');
  addEdge(nc, ne, '', 'thick-arrow');
  addEdge(nd, nf, '', 'dotted-bidir');
  fitGroupsToMembers();
  S.undoStack = []; S.redoStack = []; updateUndoRedo();
  S.snapshots = []; clearTimeout(S.snapshotTimer);
  S.zoom = 1; S.panX = 40; S.panY = 40;
  render();

  // Create initial tab for this seed state
  const seedTab = {
    filename: null,
    nodes: JSON.parse(JSON.stringify(S.nodes)),
    edges: JSON.parse(JSON.stringify(S.edges)),
    groups: JSON.parse(JSON.stringify(S.groups)),
    classDefs: JSON.parse(JSON.stringify(S.classDefs)),
    direction: S.direction,
    undoStack: [], redoStack: [],
    zoom: S.zoom, panX: S.panX, panY: S.panY,
    selected: null,
    nextNodeNum: S.nextNodeNum, nextEdgeNum: S.nextEdgeNum, nextGroupNum: S.nextGroupNum,
    snapshots: [], snapAlways: false,
    multiSelect: [], multiSelectEdges: [],
  };
  S.tabs.push(seedTab);
  S.activeTabIdx = 0;
  renderTabBar();

  // Server lifecycle ping
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setInterval(() => fetch('/ping').catch(() => {}), 20000);
    window.addEventListener('beforeunload', () => navigator.sendBeacon('/shutdown'));
  }
}

init();
