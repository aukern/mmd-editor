import { S } from './state.js';

export function encodeSnap(s) { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); }
export function decodeSnap(b) { try { return JSON.parse(decodeURIComponent(escape(atob(b)))); } catch(e) { return null; } }

export function takeSnapshot(label) {
  if (S.previewMode) return;
  clearTimeout(S.snapshotTimer); S.pendingSnapshotLabel = null;
  const { getMermaidText } = window._editorRender || {};
  const mmd = getMermaidText ? getMermaidText() : (document.getElementById('mmdOut')?.value || '');
  if (!mmd || !mmd.trim()) return;
  // Skip duplicate: if content identical to last snapshot, just update its label/ts instead of adding
  if (S.snapshots.length > 0 && S.snapshots[S.snapshots.length - 1].mmd === mmd) return;
  const ts = new Date().toISOString().slice(0,19).replace('T',' ');
  S.snapshots.push({ts, label, mmd});
  if (S.snapshots.length > 50) S.snapshots.shift();
  if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) {
    S.tabs[S.activeTabIdx].snapshots = S.snapshots;
  }
  const { scheduleSave } = window._editorFile || {};
  if (scheduleSave) scheduleSave();
  refreshHistoryPanel();
}

export function scheduleSnapshot(label) {
  if (S.previewMode) return;
  S.pendingSnapshotLabel = label;
  clearTimeout(S.snapshotTimer);
  S.snapshotTimer = setTimeout(() => takeSnapshot(S.pendingSnapshotLabel || label), 1500);
}

const SNAPSHOT_EVERY = 20; // mutations before auto-snapshot

export function countMutation() {
  if (S.previewMode) return;
  S.mutationCount = (S.mutationCount || 0) + 1;
  if (S.mutationCount >= SNAPSHOT_EVERY) {
    S.mutationCount = 0;
    takeSnapshot('Auto');
  }
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
  if (!list || !preview) return;
  selectedSnapIndex = -1;
  if (!S.previewMode) preview.classList.remove('visible');
  list.querySelectorAll('.hp-item').forEach(el => el.remove());
  if (!S.snapshots.length) {
    if (noMsg) noMsg.style.display = '';
    return;
  }
  if (noMsg) noMsg.style.display = 'none';
  const rev = [...S.snapshots].reverse();
  rev.forEach((s, i) => {
    const item = document.createElement('div');
    item.className = 'hp-item';
    item.innerHTML = `<div class="hp-ts">${s.ts}</div><div class="hp-label">${s.label}</div><div class="hp-hint">(${s.mmd.length} chars)</div>`;
    item.addEventListener('click', () => {
      document.querySelectorAll('.hp-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedSnapIndex = S.snapshots.length - 1 - i;
      // Save state only on first preview entry; switching snapshots reuses saved state
      if (!S.previewMode) {
        S.previewSaved = {
          nodes: S.nodes.map(n => ({...n, style: n.style ? {...n.style} : null, classes: [...(n.classes||[])]})),
          edges: S.edges.map(e => ({...e})),
          groups: S.groups.map(g => ({...g})),
          classDefs: JSON.parse(JSON.stringify(S.classDefs)),
          direction: S.direction,
          zoom: S.zoom, panX: S.panX, panY: S.panY,
        };
        S.previewMode = true;
        document.getElementById('canvasWrap').classList.add('preview-mode');
        document.getElementById('previewBanner').style.display = 'flex';
      }
      // Load snapshot onto canvas
      const { loadFromMermaidText } = window._editorLoad || {};
      if (loadFromMermaidText) loadFromMermaidText(s.mmd, true);
      document.getElementById('statusText').textContent = `Preview: "${s.label}" — restore or cancel via banner`;
    });
    list.appendChild(item);
  });
}

function exitPreview(accept) {
  if (!S.previewMode) return;
  S.previewMode = false;
  document.getElementById('canvasWrap').classList.remove('preview-mode');
  document.getElementById('previewBanner').style.display = 'none';
  if (!accept && S.previewSaved) {
    const saved = S.previewSaved;
    S.nodes = saved.nodes; S.edges = saved.edges; S.groups = saved.groups;
    S.classDefs = saved.classDefs; S.direction = saved.direction;
    S.zoom = saved.zoom; S.panX = saved.panX; S.panY = saved.panY;
    const dirSel = document.getElementById('directionSelect');
    if (dirSel) dirSel.value = S.direction;
  }
  S.previewSaved = null;
  S.selected = null; S.multiSelect.clear(); S.multiSelectEdges.clear();
  const { render } = window._editorRender || {};
  if (render) render();
  const { applyTransform } = window._editorUtils || {};
  if (applyTransform) applyTransform();
  document.getElementById('historyPreview').classList.remove('visible');
  document.getElementById('historyPanel').classList.remove('open');
  if (accept) {
    takeSnapshot('Restored');
    const { scheduleSave } = window._editorFile || {};
    if (scheduleSave) scheduleSave();
    document.getElementById('statusText').textContent = 'Version restored.';
  } else {
    document.getElementById('statusText').textContent = 'Preview cancelled.';
  }
}

export function initHistoryPanel() {
  window._editorHistory.exitPreview = exitPreview;

  function positionPanel() {
    const panel = document.getElementById('historyPanel');
    const btnRect = document.getElementById('historyBtn').getBoundingClientRect();
    panel.style.top = (btnRect.bottom + 4) + 'px';
    panel.style.left = Math.max(4, btnRect.right - 320) + 'px';
  }

  document.getElementById('historyBtn').addEventListener('click', ev => {
    ev.stopPropagation();
    const panel = document.getElementById('historyPanel');
    const isOpen = panel.classList.toggle('open');
    if (isOpen) { positionPanel(); refreshHistoryPanel(); }
  });

  document.getElementById('historyCloseBtn').addEventListener('click', () => {
    document.getElementById('historyPanel').classList.remove('open');
  });

  // Accept/Cancel in panel (visible when panel is open during preview)
  document.getElementById('historyRestoreBtn').addEventListener('click', () => exitPreview(true));
  document.getElementById('historyCancelBtn').addEventListener('click', () => exitPreview(false));

  // Accept/Cancel in floating banner (primary controls when panel is closed)
  document.getElementById('previewAcceptBtn').addEventListener('click', () => exitPreview(true));
  document.getElementById('previewCancelBtn').addEventListener('click', () => exitPreview(false));

  document.addEventListener('click', ev => {
    const panel = document.getElementById('historyPanel');
    if (!panel.classList.contains('open')) return;
    if (panel.contains(ev.target) || ev.target.id === 'historyBtn') return;
    panel.classList.remove('open');
  });

  document.getElementById('snapshotBtn').addEventListener('click', ev => {
    ev.stopPropagation();
    if (S.previewMode) return;
    takeSnapshot('Manual');
    document.getElementById('statusText').textContent = '📷 Snapshot saved.';
  });
}
