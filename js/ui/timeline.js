import { S } from '../state.js';
import { getCurrentSource } from '../render.js';
import { unifiedDiff, renderReadableDiff } from './diff.js';

// ── The "light git" timeline panel ────────────────────────────────────────────
// Replaces the old "Changes since checkpoint" diff panel. Lists the authored
// snapshots (newest at top), lets you select a base, and shows a readable diff of
// base → the live head. Preview / Show-changes are wired in a later phase.

let selectedIdx = null;   // index into S.snapshots; null = auto (newest)
let previewIdx = null;    // index currently shown read-only on the canvas (preview)
let anchors = [];         // hunk jump targets in the body
let anchorIdx = -1;

function liveSource() {
  return getCurrentSource ? getCurrentSource() : (document.getElementById('mmdOut')?.value || '');
}

// The comparison shown for a selected row. Selecting a version shows the change that
// version INTRODUCED — its predecessor → itself — so a row's changes belong to that row
// (your current edits show on the current row, not the previous one). Special cases:
//   • newest row → its content is the live head (reflects in-progress edits).
//   • oldest row → base = itself (nothing before it): the starting point, no diff.
//   • previewing a DIFFERENT row P → compare-two: selected → P.
function comparisonFor(idx) {
  const snaps = S.snapshots || [];
  const n = snaps.length;
  const s = snaps[idx];
  if (!s) return { base: '', target: '', author: 'human', mode: 'empty' };
  if (S.previewMode && previewIdx !== null && previewIdx !== idx && snaps[previewIdx]) {
    return { base: s.mmd, target: snaps[previewIdx].mmd, author: snaps[previewIdx].author, mode: 'compare' };
  }
  // Content of the selected version: live head for the newest, previewed content if
  // we're previewing exactly this row, else the stored snapshot.
  const target = (S.previewMode && previewIdx === idx) ? s.mmd
               : (idx === n - 1 ? liveSource() : s.mmd);
  const base = idx > 0 ? snaps[idx - 1].mmd : target;   // oldest: compare to self → empty
  return { base, target, author: s.author, mode: idx === 0 ? 'baseline' : 'change' };
}

// Human-friendly relative time from a "YYYY-MM-DD HH:MM:SS" stamp.
function relTime(ts) {
  const t = new Date((ts || '').replace(' ', 'T')).getTime();
  if (!t) return ts || '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return '1 min ago';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 5400) return '1 hr ago';
  if (s < 86400) return `${Math.round(s / 3600)} hr ago`;
  if (s < 172800) return 'yesterday';
  return `${Math.round(s / 86400)} days ago`;
}

function authorTag(a) {
  return (a || 'human') === 'ai' ? { icon: '🤖', name: 'AI', cls: 'tl-ai' }
                                 : { icon: '👤', name: 'You', cls: 'tl-human' };
}

// Default selection: the newest row — its change is what you're currently working on.
function defaultIdx() {
  const n = S.snapshots.length;
  return n === 0 ? -1 : n - 1;
}

function effectiveIdx() {
  const n = S.snapshots.length;
  if (selectedIdx === null || selectedIdx < 0 || selectedIdx >= n) return defaultIdx();
  return selectedIdx;
}

// Reset selection to auto — called when the active file/tab changes. Clears preview too
// so no preview/compare state leaks into another tab.
export function resetTimelineSelection() { selectedIdx = null; previewIdx = null; anchors = []; anchorIdx = -1; }

function updateJumpInfo() {
  const info = document.getElementById('tlJumpInfo');
  const n = anchors.length;
  if (info) info.textContent = n ? `${Math.max(0, anchorIdx) + 1}/${n}` : '';
  const prev = document.getElementById('tlPrevBtn'), next = document.getElementById('tlNextBtn');
  if (prev) prev.disabled = n < 1;
  if (next) next.disabled = n < 1;
}

function jump(dir) {
  const n = anchors.length;
  if (!n) return;
  if (anchorIdx < 0) anchorIdx = dir > 0 ? 0 : n - 1;
  else anchorIdx = (anchorIdx + dir + n) % n;
  const el = anchors[anchorIdx];
  const out = document.getElementById('tlOut');
  if (out && el) out.scrollTop = Math.max(0, el.offsetTop - 6);
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  updateJumpInfo();
}

export function refreshTimeline() {
  const list = document.getElementById('tlList');
  const out = document.getElementById('tlOut');
  const empty = document.getElementById('tlEmpty');
  if (!list || !out) return;

  // Preview mode is exited elsewhere (banner / Esc); keep our marker in sync.
  if (!S.previewMode) previewIdx = null;

  const snaps = S.snapshots || [];
  const idx = effectiveIdx();

  // ── Rows (newest at top) ──
  list.innerHTML = '';
  if (!snaps.length) {
    if (empty) empty.style.display = '';
    out.innerHTML = '<div class="ctx-empty">No history yet — edits and AI changes will appear here.</div>';
    anchors = []; anchorIdx = -1; updateJumpInfo();
    updateStat(0, 0);
    updateButtons();
    return;
  }
  if (empty) empty.style.display = 'none';

  for (let i = snaps.length - 1; i >= 0; i--) {
    const s = snaps[i];
    const tag = authorTag(s.author);
    const before = i > 0 ? snaps[i - 1].mmd : '';
    let stat = '';
    if (i === 0) {
      stat = 'baseline';
    } else {
      const d = unifiedDiff(before, s.mmd);
      const a = d ? d.split('\n').filter(l => l[0] === '+').length : 0;
      const r = d ? d.split('\n').filter(l => l[0] === '-').length : 0;
      stat = `+${a} −${r}`;
    }
    const row = document.createElement('div');
    row.className = 'tl-item ' + tag.cls + (i === idx ? ' selected' : '') + (i === previewIdx ? ' previewing' : '');
    row.innerHTML =
      `<span class="tl-icon">${tag.icon}</span>` +
      `<span class="tl-who">${tag.name}</span>` +
      `<span class="tl-time">${relTime(s.ts)}</span>` +
      `<span class="tl-stat">${stat}</span>` +
      (i === previewIdx ? `<span class="tl-badge">preview</span>` : '');
    row.title = s.ts;
    row.addEventListener('click', () => {
      const n = S.snapshots.length;
      const hist = window._editorHistory || {};
      selectedIdx = i;
      // Selecting the version you're previewing (comparing to itself) or the live/newest
      // version drops preview — you can't compare a version to itself, and the newest IS live.
      if (S.previewMode && (i === previewIdx || i === n - 1) && hist.exitPreview) hist.exitPreview(false);
      refreshTimeline();
    });
    list.appendChild(row);
  }

  // ── Body: the selected row's change (predecessor → this version) ──
  const cmp = comparisonFor(idx);
  const res = renderReadableDiff(out, cmp.base, cmp.target);
  anchors = res.anchors; anchorIdx = -1;
  updateJumpInfo();
  updateStat(res.adds, res.dels, cmp);
  updateButtons();
  // Keep an active "Show changes" overlay pointed at this row's base so switching rows
  // updates the highlights automatically (no need to re-toggle).
  if (window._editorReview && window._editorReview.reanchorOverlay) window._editorReview.reanchorOverlay(cmp.base);
}

// Enable/disable + relabel the Preview / Show-changes buttons for the current selection.
function updateButtons() {
  const idx = effectiveIdx();
  const cmp = comparisonFor(idx);
  const previewBtn = document.getElementById('tlPreviewBtn');
  const showBtn = document.getElementById('tlShowBtn');
  const overlayOn = !!(window._editorReview && window._editorReview.isOn && window._editorReview.isOn());

  const n = (S.snapshots || []).length;
  if (previewBtn) {
    // Can't preview the newest row (it's the live canvas) or an empty timeline.
    previewBtn.disabled = cmp.mode === 'empty' || idx === n - 1;
    previewBtn.textContent = (S.previewMode && previewIdx === idx) ? '✕ Exit preview' : '👁 Preview';
  }
  if (showBtn) {
    // Nothing to highlight when this version introduced no change (baseline / identical).
    const nothing = cmp.mode === 'empty' || cmp.base === cmp.target;
    showBtn.disabled = nothing && !overlayOn;
    showBtn.classList.toggle('active', overlayOn);
    showBtn.textContent = overlayOn ? '⧉ Hide changes' : '⧉ Show changes';
  }
}

function updateStat(adds, dels, cmp) {
  const status = document.getElementById('tlStatus');
  if (!status) return;
  if (!cmp || cmp.mode === 'empty') { status.textContent = ''; return; }

  if (cmp.mode === 'compare') {
    const t = authorTag(cmp.author);
    status.textContent = (adds || dels)
      ? `Comparing selected → ${t.name}'s previewed version · +${adds} −${dels}`
      : 'These two versions are identical.';
    return;
  }
  if (cmp.mode === 'baseline') { status.textContent = 'Starting point — nothing before this version.'; return; }
  if (!adds && !dels) { status.textContent = 'No changes in this version yet.'; return; }

  // 'change' mode: the diff IS this row's change, so attribute it to this row's author.
  const who = authorTag(cmp.author);
  status.textContent = `${who.icon} ${who.name} changed this version · +${adds} −${dels}`;
}

function copyForAI() {
  const cmp = comparisonFor(effectiveIdx());
  const diff = unifiedDiff(cmp.base, cmp.target);
  const btn = document.getElementById('tlCopyBtn');
  const status = document.getElementById('statusText');
  if (!diff) {
    const st = document.getElementById('tlStatus');
    if (st) st.textContent = 'Nothing to copy — this version has no change.';
    return;
  }
  const changes = diff.split('\n').filter(l => l[0] === '+' || l[0] === '-').length;
  const payload = '# Change to a Mermaid diagram (unified diff; `-` = before, `+` = after):\n\n' + diff;
  navigator.clipboard.writeText(payload).catch(() => {});
  if (btn) {
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => { btn.textContent = '📋 Copy for AI'; btn.classList.remove('copied'); }, 1500);
  }
  const out = document.getElementById('tlOut');
  if (out) { out.classList.remove('just-copied'); void out.offsetWidth; out.classList.add('just-copied'); }
  // Non-destructive: copying does NOT advance/mutate the timeline.
  if (status) status.textContent = `Copied ${changes} line-change(s) for the AI.`;
}

// 👁 Preview — render the selected snapshot read-only on the canvas (reuses the shared
// preview machinery + banner). Pressing again exits.
function togglePreview() {
  const idx = effectiveIdx();
  const n = S.snapshots.length;
  const s = S.snapshots[idx];
  if (!s) return;
  const hist = window._editorHistory || {};
  // The newest row IS the live canvas — nothing to preview; make sure we're live.
  if (idx === n - 1) { if (S.previewMode && hist.exitPreview) hist.exitPreview(false); return; }
  if (S.previewMode && previewIdx === idx) { if (hist.exitPreview) hist.exitPreview(false); return; }
  const tag = authorTag(s.author);
  if (hist.enterPreviewOf) hist.enterPreviewOf(s.mmd, `Previewing ${tag.name}'s version · ${s.ts} — Esc or the banner to return`);
  previewIdx = idx;
  refreshTimeline();
}

// ⧉ Show changes — highlight ON the diagram the change this version introduced
// (its predecessor → this version). Stable baseline anchored to that predecessor.
function toggleShowChanges() {
  const review = window._editorReview || {};
  if (review.isOn && review.isOn()) { if (review.hideChanges) review.hideChanges(); refreshTimeline(); return; }
  const cmp = comparisonFor(effectiveIdx());
  if (cmp.mode === 'empty') return;
  if (review.showChangesFrom) review.showChangesFrom(cmp.base);
  refreshTimeline();
}

export function initTimeline() {
  window._editorTimeline = { refresh: refreshTimeline, resetSelection: resetTimelineSelection };
  const copyBtn = document.getElementById('tlCopyBtn');
  const prevBtn = document.getElementById('tlPrevBtn');
  const nextBtn = document.getElementById('tlNextBtn');
  const previewBtn = document.getElementById('tlPreviewBtn');
  const showBtn = document.getElementById('tlShowBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyForAI);
  if (prevBtn) prevBtn.addEventListener('click', () => jump(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => jump(1));
  if (previewBtn) previewBtn.addEventListener('click', togglePreview);
  if (showBtn) showBtn.addEventListener('click', toggleShowChanges);
  refreshTimeline();
}
