import { S } from './state.js';
import { applyTransform, pushUndo, cloneState, fitAll, setZoom, svgPoint, nodeSize, uid } from './utils.js';
import { render, updateUndoRedo, updateMermaidOutput, getMermaidText } from './render.js';
import { loadFromMermaidText } from './loader.js';
import { takeSnapshot, scheduleSnapshot, countMutation, buildFileContent, refreshHistoryPanel, initHistoryPanel } from './history.js';
import { scheduleSave, doAutoSave, startFileWatcher, stopFileWatcher, serverMtime, updateSaveStatus, initFilenameRename } from './file.js';
import { captureTabState, restoreTabState, renderTabBar, switchTab, closeTab, openInNewTab, newTab, loadIntoCurrentTab, syncModal } from './tabs.js';
import { initCanvasEvents, initToolbar, initKeyboard, addNode, addGroup, addEdge, deleteSelected, copySelection, pasteClipboard, duplicateSelection, getPortMousedownHandler, spawnConnectGhost } from './events.js';
import { initInline, activateInline, cancelInline } from './ui/inline.js';
import { buildShapeDropdown, setCurrentShape } from './ui/shapeDropdown.js';
import { initModal } from './ui/modal.js';
import { buildMenuBar, buildExportDropdown } from './ui/menu.js';
import { initSourceEditor } from './ui/source.js';
import { autoArrange } from './layout.js';

// ── Expose globals so cross-module callbacks work without circular imports ─────
window._editorUtils = { pushUndo, cloneState, fitAll, setZoom, applyTransform, svgPoint, nodeSize };
window._editorRender = { render, updateMermaidOutput, getMermaidText };
window._editorInline = { activateInline, scheduleSnapshot };
window._editorMutations = { addEdge, takeSnapshot, addNode, deleteSelected, copySelection, pasteClipboard, duplicateSelection };
window._editorFile = { scheduleSave, doAutoSave, startFileWatcher, stopFileWatcher, serverMtime, updateSaveStatus };
window._editorLoad = { loadFromMermaidText };
window._editorHistory = { refreshHistoryPanel, takeSnapshot, buildFileContent, countMutation };
window._editorTabs = { captureTabState, restoreTabState, renderTabBar, switchTab, closeTab, openInNewTab, newTab, loadIntoCurrentTab, syncModal };
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
  initSourceEditor();

  // Close shape/export dropdowns on outside click
  document.addEventListener('click', () => {
    document.getElementById('shapeDropdownPanel').classList.remove('open');
    const ep = document.getElementById('exportDropdownPanel');
    if (ep) ep.classList.remove('open');
  });

  // Create initial no-file tab so the modal has a tab to attach to
  newTab();
  renderTabBar();

  // Snapshots are mutation-count based — no timer needed here

  // Server lifecycle ping
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setInterval(() => fetch('/ping').catch(() => {}), 20000);
    window.addEventListener('beforeunload', () => navigator.sendBeacon('/shutdown'));
  }
}

init();
