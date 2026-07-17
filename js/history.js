import { S } from './state.js';

export function encodeSnap(s) { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); }
export function decodeSnap(b) { try { return JSON.parse(decodeURIComponent(escape(atob(b)))); } catch(e) { return null; } }

// Keep the stored timeline light. Each entry is a full copy of the .mmd, so we cap the
// number of retained points and drop the oldest once over the cap.
const SNAP_CAP = 30;

function currentMmd() {
  const { getCurrentSource } = window._editorRender || {};
  return getCurrentSource ? getCurrentSource() : (document.getElementById('mmdOut')?.value || '');
}

function persistSnaps() {
  if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) {
    S.tabs[S.activeTabIdx].snapshots = S.snapshots;
  }
  const { scheduleSave } = window._editorFile || {};
  if (scheduleSave) scheduleSave();
  refreshHistoryPanel();
  if (window._editorTimeline && window._editorTimeline.refresh) window._editorTimeline.refresh();
}

// One-shot lock: when set, the current head is an "as-opened / as-loaded" anchor and the
// NEXT real change must start a fresh entry instead of rolling into it. This is what
// preserves the state you opened with so your edits since open are always diff-able —
// even human→(reopen)→human produces a separate entry rather than silently merging.
let headLocked = false;
export function lockHead() { headLocked = true; }

// The heart of the "light git" timeline: rolling-head-by-author.
//
//   • The LAST snapshot is a rolling head that updates IN PLACE while the same author
//     keeps editing. Consecutive same-author edits collapse into one entry.
//   • A new entry is appended when authorship flips (human <-> ai) OR when the head is
//     a locked "as-opened" anchor.
//   • Idempotent: identical content to the head is a no-op (and keeps the lock, so the
//     first genuine edit after opening still starts a fresh entry).
//
// author: 'human' (edits made inside the editor) | 'ai' (content arriving from disk).
export function recordSnapshot(author) {
  if (S.previewMode) return;
  const mmd = currentMmd();
  if (!mmd || !mmd.trim()) return;
  const head = S.snapshots[S.snapshots.length - 1];
  if (head && head.mmd === mmd) return;            // no real change since head
  const ts = new Date().toISOString().slice(0,19).replace('T',' ');
  if (head && (head.author || 'human') === author && !headLocked) {
    head.mmd = mmd; head.ts = ts;                  // roll the head forward
  } else {
    S.snapshots.push({ ts, author, mmd });         // flip, locked anchor, or very first
    while (S.snapshots.length > SNAP_CAP) S.snapshots.shift();
  }
  headLocked = false;                              // a real change consumes the lock
  persistSnaps();
}

// Called right after a file's content is (re)loaded from disk. Seeds the baseline for a
// file that has no history yet, otherwise attributes any delta to the AI — anything that
// arrives via disk that differs from our head was authored outside the editor (an AI
// writing the file, or an external edit made while the app was closed). Either way the
// resulting head is pinned as the "as-opened" anchor for this session.
export function recordFromLoad() {
  if (S.previewMode) return;
  headLocked = false;                              // the load itself decides the anchor
  if (!S.snapshots.length) recordSnapshot('human');// starting point for a fresh file
  else recordSnapshot('ai');
  headLocked = true;                               // pin it: next edit starts fresh
}

// Back-compat alias: every legacy call site that took a manual/auto snapshot was a
// human action (open/new/restore/edit). Routed through the rolling-head recorder.
export function takeSnapshot(_label) { recordSnapshot('human'); }

export function scheduleSnapshot() {
  if (S.previewMode) return;
  clearTimeout(S.snapshotTimer);
  S.snapshotTimer = setTimeout(() => recordSnapshot('human'), 1200);
}

export function countMutation() {
  if (S.previewMode) return;
  // Every counted mutation is a real human change (add/delete/edit). Record it IMMEDIATELY
  // (not debounced) so the current "You" row exists at once and your edits attach to it —
  // not to the previous (e.g. AI) version. The rolling head keeps a burst as one entry.
  const { scheduleSave } = window._editorFile || {};
  if (scheduleSave) scheduleSave();
  recordSnapshot('human');
}

export function extractSnapshotsFromText(text) {
  const lines = text.split('\n');
  const snaps = [];
  lines.forEach(l => {
    const m = l.match(/^%% snap:(.+)$/);
    if (m) { const s = decodeSnap(m[1]); if (s) { if (!s.author) s.author = 'human'; snaps.push(s); } }
  });
  return snaps;
}

export function stripSnapLines(text) {
  return text.split('\n').filter(l => !/^%% snap:/.test(l)).join('\n');
}

export function buildFileContent() {
  const snapLines = S.snapshots.map(s => `%% snap:${encodeSnap(s)}`).join('\n');
  const { getCurrentSource } = window._editorRender || {};
  const diag = getCurrentSource ? getCurrentSource() : (document.getElementById('mmdOut')?.value || '');
  return snapLines ? (snapLines + '\n' + diag) : diag;
}

let selectedSnapIndex = -1;

// Render a snapshot onto the canvas read-only, entering preview mode (saving the live
// state so it can be restored). Switching between snapshots while already previewing
// reuses the saved state. Used by both the History panel and the Timeline panel.
export function enterPreviewOf(mmd, labelText) {
  if (!S.previewMode) {
    S.previewSaved = {
      nodes: S.nodes.map(n => ({...n, style: n.style ? {...n.style} : null, classes: [...(n.classes||[])]})),
      edges: S.edges.map(e => ({...e})),
      groups: S.groups.map(g => ({...g})),
      classDefs: JSON.parse(JSON.stringify(S.classDefs)),
      direction: S.direction,
      zoom: S.zoom, panX: S.panX, panY: S.panY,
      viewMode: S.viewMode, rawText: S.rawText,
    };
    S.previewMode = true;
    document.getElementById('canvasWrap').classList.add('preview-mode');
    document.getElementById('previewBanner').style.display = 'flex';
  }
  const { loadFromMermaidText } = window._editorLoad || {};
  if (loadFromMermaidText) loadFromMermaidText(mmd, true);
  if (labelText) document.getElementById('statusText').textContent = labelText;
}

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
    const who = (s.author || 'human') === 'ai' ? '🤖 AI' : '👤 You';
    item.innerHTML = `<div class="hp-ts">${s.ts}</div><div class="hp-label">${who}</div><div class="hp-hint">(${s.mmd.length} chars)</div>`;
    item.addEventListener('click', () => {
      document.querySelectorAll('.hp-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedSnapIndex = S.snapshots.length - 1 - i;
      const who = (s.author || 'human') === 'ai' ? 'AI' : 'You';
      enterPreviewOf(s.mmd, `Preview: ${who} · ${s.ts} — restore or cancel via banner`);
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
    // Restore the canvas mode (view-only Mermaid vs editor) active before preview.
    const { enterViewMode, exitViewMode } = window._editorViewmode || {};
    if (saved.viewMode) { if (enterViewMode) enterViewMode(saved.rawText || ''); }
    else { if (exitViewMode) exitViewMode(); }
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
}
