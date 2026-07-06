import { S } from './state.js';

export function encodeSnap(s) { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); }
export function decodeSnap(b) { try { return JSON.parse(decodeURIComponent(escape(atob(b)))); } catch(e) { return null; } }

export function takeSnapshot(label) {
  clearTimeout(S.snapshotTimer); S.pendingSnapshotLabel = null;
  // Build mermaid text directly from state — no DOM dependency
  const { getMermaidText } = window._editorRender || {};
  const mmd = getMermaidText ? getMermaidText() : (document.getElementById('mmdOut')?.value || '');
  if (!mmd || !mmd.trim()) return;
  const ts = new Date().toISOString().slice(0,19).replace('T',' ');
  S.snapshots.push({ts, label, mmd});
  if (S.snapshots.length > 50) S.snapshots.shift();
  // Keep active tab's snapshots in sync
  if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) {
    S.tabs[S.activeTabIdx].snapshots = S.snapshots;
  }
  const { scheduleSave } = window._editorFile || {};
  if (scheduleSave) scheduleSave();
  refreshHistoryPanel();
}

export function scheduleSnapshot(label) {
  S.pendingSnapshotLabel = label;
  clearTimeout(S.snapshotTimer);
  S.snapshotTimer = setTimeout(() => takeSnapshot(S.pendingSnapshotLabel || label), 1500);
}

export function extractSnapshotsFromText(text) {
  const lines = text.split('\n');
  const snaps = [];
  lines.forEach(l => { const m = l.match(/^%% snap:(.+)$/); if(m){const s=decodeSnap(m[1]);if(s)snaps.push(s);} });
  return snaps;
}

export function stripSnapLines(text) {
  return text.split('\n').filter(l => !/^%% snap:/.test(l)).join('\n');
}

export function buildFileContent() {
  const snapLines = S.snapshots.map(s => `%% snap:${encodeSnap(s)}`).join('\n');
  const { getMermaidText } = window._editorRender || {};
  const diag = getMermaidText ? getMermaidText() : (document.getElementById('mmdOut')?.value || '');
  return snapLines ? (snapLines + '\n' + diag) : diag;
}

let selectedSnapIndex = -1;

export function refreshHistoryPanel() {
  const list = document.getElementById('historyList');
  const noMsg = document.getElementById('noSnapshotsMsg');
  const preview = document.getElementById('historyPreview');
  selectedSnapIndex = -1;
  preview.classList.remove('visible');
  list.innerHTML = '';
  if (!S.snapshots.length) {
    list.appendChild(noMsg); noMsg.style.display=''; return;
  }
  noMsg.style.display = 'none';
  const rev = [...S.snapshots].reverse();
  rev.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'hp-item';
    item.innerHTML = `<div class="hp-ts">${s.ts}</div><div class="hp-label">${s.label}</div><div class="hp-hint">(${s.mmd.length} chars)</div>`;
    item.addEventListener('click', () => {
      document.querySelectorAll('.hp-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedSnapIndex = S.snapshots.length - 1 - i;
      document.getElementById('historyPreviewText').value = s.mmd;
      preview.classList.add('visible');
    });
    list.appendChild(item);
  });
}

export function initHistoryPanel() {
  document.getElementById('historyBtn').addEventListener('click', ev => {
    ev.stopPropagation();
    const panel = document.getElementById('historyPanel');
    const isOpen = panel.classList.toggle('open');
    if (isOpen) refreshHistoryPanel();
  });
  document.getElementById('historyCloseBtn').addEventListener('click', () => {
    document.getElementById('historyPanel').classList.remove('open');
  });
  document.getElementById('historyRestoreBtn').addEventListener('click', () => {
    if (selectedSnapIndex < 0 || selectedSnapIndex >= S.snapshots.length) return;
    const snap = S.snapshots[selectedSnapIndex];
    if (!confirm(`Restore to version "${snap.label}" from ${snap.ts}?\n\nCurrent state will be snapshotted first.`)) return;
    takeSnapshot('Before restore');
    const { loadFromMermaidText } = window._editorLoad || {};
    if (loadFromMermaidText) loadFromMermaidText(snap.mmd, true);
    document.getElementById('historyPanel').classList.remove('open');
    document.getElementById('statusText').textContent = `Restored: ${snap.label}`;
    const { scheduleSave } = window._editorFile || {};
    if (scheduleSave) scheduleSave();
  });
  document.addEventListener('click', ev => {
    const panel = document.getElementById('historyPanel');
    if (panel.classList.contains('open') && !panel.contains(ev.target) && ev.target.id !== 'historyBtn') {
      panel.classList.remove('open');
    }
  });
  // Snapshot button — take snapshot and open the history panel to confirm
  document.getElementById('snapshotBtn').addEventListener('click', () => {
    takeSnapshot('Manual');
    document.getElementById('statusText').textContent = 'Snapshot saved.';
    document.getElementById('historyPanel').classList.add('open');
  });
}
