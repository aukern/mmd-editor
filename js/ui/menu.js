import { S } from '../state.js';
import { exportSVG, exportPNG, exportPDF } from '../export.js';
import { takeSnapshot } from '../history.js';
import { doAutoSave } from '../file.js';

function closeAllMenus() {
  document.querySelectorAll('.menu-panel').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('open'));
}

function openMenu(itemId, panelId) {
  closeAllMenus();
  const item = document.getElementById(itemId);
  const panel = document.getElementById(panelId);
  if (!item || !panel) return;
  item.classList.add('open');
  panel.classList.add('open');
  // Sync any checkable entries to their current state before the menu is shown.
  panel.querySelectorAll('.menu-entry').forEach(el => { if (el._refreshCheck) el._refreshCheck(); });
  const r = item.getBoundingClientRect();
  panel.style.left = r.left + 'px';
  panel.style.top = r.bottom + 'px';
}

function menuEntry(label, shortcut, action, disabled, check) {
  if (label === '-') {
    const sep = document.createElement('div'); sep.className = 'menu-sep'; return sep;
  }
  const el = document.createElement('div');
  el.className = 'menu-entry' + (disabled ? ' disabled' : '');
  el.innerHTML =
    `<span class="menu-lead">${check ? '<span class="menu-check"></span>' : ''}<span>${label}</span></span>` +
    `${shortcut ? `<span class="menu-kbd">${shortcut}</span>` : ''}`;
  if (check) {
    el._refreshCheck = () => { const c = el.querySelector('.menu-check'); if (c) c.textContent = check() ? '✓' : ''; };
    el._refreshCheck();
  }
  if (!disabled && action) {
    el.addEventListener('click', () => { closeAllMenus(); action(); });
  }
  return el;
}

export function buildMenuBar() {
  const menus = [
    {
      id: 'menuFile', label: 'File', panelId: 'menuFilePanel',
      entries: [
        { label: 'New Tab', action: () => {
          const { newTab } = window._editorTabs || {};
          if (newTab) newTab(null);
          document.getElementById('startupModal').style.display = 'flex';
        }},
        { label: 'Open File…', action: () => {
          document.getElementById('startupModal').style.display = 'flex';
          if (window._editorModal && window._editorModal.resetFilePicker) window._editorModal.resetFilePicker();
          document.getElementById('modalOpenBtn').click();
        }},
        { label: 'Save Snapshot', shortcut: 'Ctrl+S', action: () => { takeSnapshot('Manual'); doAutoSave(); document.getElementById('statusText').textContent='Snapshot saved.'; }},
        { label: 'Rename File', action: () => { document.getElementById('filenameDisplay').dispatchEvent(new MouseEvent('dblclick')); }},
        { label: '-' },
        { label: 'Close Tab', action: () => { const { closeTab } = window._editorTabs||{}; if(closeTab && S.activeTabIdx>=0) closeTab(S.activeTabIdx); }},
        { label: '-' },
        { label: 'Reopen last files on startup',
          check: () => (window._editorSession && window._editorSession.enabled) ? window._editorSession.enabled() : false,
          action: () => { if (window._editorSession && window._editorSession.toggle) window._editorSession.toggle(); }},
      ]
    },
    {
      id: 'menuEdit', label: 'Edit', panelId: 'menuEditPanel',
      entries: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => { const btn=document.getElementById('undoBtn'); if(!btn.disabled)btn.click(); }},
        { label: 'Redo', shortcut: 'Ctrl+Y', action: () => { const btn=document.getElementById('redoBtn'); if(!btn.disabled)btn.click(); }},
        { label: '-' },
        { label: 'Cut', shortcut: 'Ctrl+X', action: () => {
          const { copySelection, deleteSelected } = window._editorMutations||{};
          if (copySelection) copySelection();
          if (deleteSelected) deleteSelected();
        }},
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => { const { copySelection } = window._editorMutations||{}; if(copySelection)copySelection(); }},
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => { const { pasteClipboard } = window._editorMutations||{}; if(pasteClipboard)pasteClipboard(); }},
        { label: 'Duplicate', shortcut: 'Ctrl+D', action: () => { const { duplicateSelection } = window._editorMutations||{}; if(duplicateSelection)duplicateSelection(); }},
        { label: 'Select All', shortcut: 'Ctrl+A', action: () => {
          S.multiSelect = new Set(S.nodes.map(n=>n.id)); S.selected=null;
          const { render } = window._editorRender||{}; if(render)render();
          document.getElementById('statusText').textContent=`Selected all ${S.multiSelect.size} node(s).`;
        }},
        { label: '-' },
        { label: 'Delete', shortcut: 'Del', action: () => { const { deleteSelected } = window._editorMutations||{}; if(deleteSelected)deleteSelected(); }},
      ]
    },
    {
      id: 'menuView', label: 'View', panelId: 'menuViewPanel',
      entries: [
        { label: 'Zoom In', shortcut: 'Ctrl +', action: () => { const { setZoom } = window._editorUtils||{}; if(setZoom)setZoom(S.zoom*1.2); }},
        { label: 'Zoom Out', shortcut: 'Ctrl -', action: () => { const { setZoom } = window._editorUtils||{}; if(setZoom)setZoom(S.zoom/1.2); }},
        { label: 'Fit', shortcut: 'Ctrl 0', action: () => { const { fitAll } = window._editorUtils||{}; if(fitAll)fitAll(); }},
        { label: '-' },
        { label: 'Toggle Pan / Select Mode', action: () => { document.getElementById('panModeBtn').click(); }},
        { label: 'Toggle Grid Snap', action: () => {
          S.snapAlways = !S.snapAlways;
          document.getElementById('snapGridBtn').classList.toggle('active', S.snapAlways);
        }},
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+\\', action: () => {
          if (window._editorUI && window._editorUI.toggleSidebar) window._editorUI.toggleSidebar();
        }},
      ]
    },
    {
      id: 'menuExport', label: 'Export', panelId: 'menuExportPanel',
      entries: [
        { label: 'Export SVG', action: exportSVG },
        { label: 'Export PNG', action: exportPNG },
        { label: 'Export PDF (print)', action: exportPDF },
      ]
    },
  ];

  const bar = document.getElementById('menuBar');
  menus.forEach(m => {
    const item = document.createElement('div');
    item.className = 'menu-item'; item.id = m.id; item.textContent = m.label + ' ▾';
    item.addEventListener('click', ev => { ev.stopPropagation(); openMenu(m.id, m.panelId); });
    bar.appendChild(item);

    const panel = document.createElement('div');
    panel.className = 'menu-panel'; panel.id = m.panelId;
    m.entries.forEach(e => panel.appendChild(menuEntry(e.label, e.shortcut, e.action, e.disabled, e.check)));
    document.body.appendChild(panel);
  });

  document.addEventListener('click', closeAllMenus);
}

export function buildExportDropdown() {
  const btn = document.getElementById('exportDropdownBtn');
  const panel = document.getElementById('exportDropdownPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const open = panel.classList.toggle('open');
    if (open) {
      const r = btn.getBoundingClientRect();
      panel.style.left = r.left + 'px';
      panel.style.top = (r.bottom + 2) + 'px';
    }
  });
  panel.querySelectorAll('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
      panel.classList.remove('open');
      const action = opt.dataset.action;
      if (action === 'svg') exportSVG();
      else if (action === 'png') exportPNG();
      else if (action === 'pdf') exportPDF();
    });
  });
  document.addEventListener('click', () => panel.classList.remove('open'));
}
