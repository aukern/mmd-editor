import { S } from './state.js';
import { buildFileContent, extractSnapshotsFromText, refreshHistoryPanel } from './history.js';

export async function serverRead(name) {
  const r = await fetch('/api/read?file=' + encodeURIComponent(name));
  if (!r.ok) throw new Error(await r.text());
  return r.text();
}

export async function serverWrite(name, content) {
  const r = await fetch('/api/write?file=' + encodeURIComponent(name), {
    method: 'POST', headers: {'Content-Type':'text/plain'}, body: content
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function serverList() {
  const r = await fetch('/api/list');
  if (!r.ok) return [];
  return r.json();
}

export async function serverRename(oldName, newName) {
  const r = await fetch(`/api/rename?from=${encodeURIComponent(oldName)}&to=${encodeURIComponent(newName)}`, { method: 'POST' });
  if (!r.ok) throw new Error(await r.text());
}

export async function serverMtime(name) {
  const r = await fetch('/api/mtime?file=' + encodeURIComponent(name));
  if (!r.ok) return null;
  const t = await r.text();
  return parseFloat(t);
}

export function updateSaveStatus(s) {
  const el = document.getElementById('saveStatus');
  if (s === 'saved') { el.textContent = '✓ Saved'; el.style.color = '#4caf50'; }
  else if (s === 'saving') { el.textContent = '○ Saving…'; el.style.color = '#9a9aa5'; }
  else { el.textContent = '! Error'; el.style.color = '#c0504d'; }
}

export function scheduleSave() {
  if (!S.currentFilename) return;
  updateSaveStatus('saving');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(doAutoSave, 900);
}

export async function doAutoSave() {
  if (!S.currentFilename) return;
  try {
    const content = buildFileContent();
    await serverWrite(S.currentFilename, content);
    // Update mtime to avoid false alarm from file watcher
    const mtime = await serverMtime(S.currentFilename);
    if (mtime !== null) S.lastKnownMtime = mtime;
    updateSaveStatus('saved');
  } catch(e) {
    updateSaveStatus('error');
    console.error('Auto-save failed:', e);
  }
}

export function stopFileWatcher() {
  if (S.fileWatchTimer) { clearInterval(S.fileWatchTimer); S.fileWatchTimer = null; }
}

export function startFileWatcher(filename) {
  stopFileWatcher();
  S.fileWatchTimer = setInterval(async () => {
    if (!S.currentFilename) return;
    try {
      const mtime = await serverMtime(filename);
      if (mtime === null) return;
      if (S.lastKnownMtime === null) { S.lastKnownMtime = mtime; return; }
      if (mtime > S.lastKnownMtime) {
        S.lastKnownMtime = mtime;
        autoReloadFromDisk(filename);
      }
    } catch(e) { /* ignore */ }
  }, 3000);
}

async function autoReloadFromDisk(filename) {
  try {
    const text = await serverRead(filename);
    const { loadFromMermaidText } = window._editorLoad || {};
    if (loadFromMermaidText) {
      S.snapshots = [];
      const snaps = extractSnapshotsFromText(text);
      if (snaps.length) S.snapshots = snaps;
      loadFromMermaidText(text, true);
    }
    const mtime = await serverMtime(filename);
    if (mtime !== null) S.lastKnownMtime = mtime;
    // This change came from OUTSIDE the editor (e.g. an AI writing the same .mmd).
    // Advance the diff baseline to it so those edits aren't attributed to the user —
    // the "Changes since checkpoint" diff must only contain what the user changed.
    const { resetBaseline } = window._editorDiff || {};
    if (resetBaseline) resetBaseline();
    document.getElementById('statusText').textContent = 'Synced external changes from disk — diff reset to here.';
  } catch(e) {
    document.getElementById('statusText').textContent = 'Sync failed: ' + e.message;
  }
}

export function setFilename(name) {
  S.currentFilename = name;
  const el = document.getElementById('filenameDisplay');
  el.textContent = name || 'No file';
}

export function initFilenameRename() {
  const display = document.getElementById('filenameDisplay');
  display.addEventListener('dblclick', () => {
    if (!S.currentFilename) return;
    const oldName = S.currentFilename;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.style.cssText = 'font-size:11px;background:#1e1f27;color:#e6e6ea;border:1px solid #ae9026;border-radius:4px;padding:2px 5px;width:160px;';
    display.replaceWith(input);
    input.focus(); input.select();
    async function commit() {
      let newName = input.value.trim();
      if (!newName) newName = oldName;
      if (!newName.endsWith('.mmd')) newName += '.mmd';
      // Restore display element
      input.replaceWith(display);
      if (newName === oldName) return;
      try {
        await serverRename(oldName, newName);
        S.currentFilename = newName;
        display.textContent = newName;
        // Update the active tab label
        if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) {
          S.tabs[S.activeTabIdx].filename = newName;
          const { renderTabBar } = window._editorTabs || {};
          if (renderTabBar) renderTabBar();
        }
        document.getElementById('statusText').textContent = `Renamed to ${newName}`;
      } catch(e) {
        display.textContent = oldName;
        document.getElementById('statusText').textContent = 'Rename failed: ' + e.message;
      }
    }
    input.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      if (ev.key === 'Escape') { input.replaceWith(display); }
    });
    input.addEventListener('blur', () => setTimeout(commit, 100));
  });
}
