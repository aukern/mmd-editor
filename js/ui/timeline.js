import { S } from '../state.js';
import { getCurrentSource } from '../render.js';
import { unifiedDiff, renderReadableDiff } from './diff.js';

// ── The "light git" timeline panel ────────────────────────────────────────────
// Replaces the old "Changes since checkpoint" diff panel. Lists the authored
// snapshots (newest at top), lets you select a base, and shows a readable diff of
// base → the live head. Preview / Show-changes are wired in a later phase.

let selectedIdx = null;   // index into S.snapshots; null = auto (newest)
let previewIdx = null;    // index currently shown read-only on the canvas (plain preview)
let anchors = [];         // hunk jump targets in the body
let anchorIdx = -1;

// "Show changes" compare mode. When active, overlayPair freezes the {old,new} being
// compared so flipping the canvas between the two sides can't corrupt it. showOld = the
// canvas is currently on the OLD side (where removed items are drawn in red).
let overlayPair = null;   // { old, new } or null
let showOld = false;

function liveSource() {
  return getCurrentSource ? getCurrentSource() : (document.getElementById('mmdOut')?.value || '');
}

// The change a selected version INTRODUCED — its predecessor → itself — so a row's changes
// belong to that row (your current edits show on the current row, not the previous one).
//   • newest row → its content is the live head (reflects in-progress edits).
//   • oldest row → base = itself (nothing before it): the starting point, no diff.
function rawComparisonFor(idx) {
  const snaps = S.snapshots || [];
  const n = snaps.length;
  const s = snaps[idx];
  if (!s) return { base: '', target: '', author: 'human', mode: 'empty' };
  // While flipping sides in compare mode the canvas shows an old version, so never read
  // liveSource() here for the newest row — use the stored snapshot unless we're truly live.
  const isLiveNewest = idx === n - 1 && !overlayPair && !(S.previewMode && previewIdx === idx);
  const target = isLiveNewest ? liveSource() : s.mmd;
  const base = idx > 0 ? snaps[idx - 1].mmd : target;   // oldest: compare to self → empty
  return { base, target, author: s.author, mode: idx === 0 ? 'baseline' : 'change' };
}

// The active comparison. In compare mode it's the frozen pair (stable across flips);
// otherwise it's the selected row's own change.
function comparisonFor(idx) {
  if (overlayPair) {
    const s = (S.snapshots || [])[idx];
    return { base: overlayPair.old, target: overlayPair.new, author: s ? s.author : 'human', mode: 'change' };
  }
  return rawComparisonFor(idx);
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
export function resetTimelineSelection() {
  selectedIdx = null; previewIdx = null; overlayPair = null; showOld = false; anchors = []; anchorIdx = -1;
}

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

  // Preview mode is exited elsewhere (banner / Esc); keep our markers in sync.
  if (!S.previewMode) previewIdx = null;
  // Leaving preview while comparing means we're back on the live/new side.
  if (overlayPair && !S.previewMode) showOld = false;

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
      const review = window._editorReview || {};
      selectedIdx = i;
      if (overlayPair && review.isOn && review.isOn()) {
        // Keep "Show changes" on, re-anchored to the newly selected version (auto-update).
        const raw = rawComparisonFor(i);
        if (raw.mode === 'empty' || raw.base === raw.target) { endShowChanges(); }
        else {
          overlayPair = { old: raw.base, new: raw.target };
          if (review.showChangesFrom) review.showChangesFrom(overlayPair.old, overlayPair.new);
          ensureSideCanvas();
        }
      } else if (S.previewMode && (i === previewIdx || i === n - 1) && hist.exitPreview) {
        // Selecting the previewed row (compare-to-self) or the live/newest row drops preview.
        hist.exitPreview(false);
      }
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
  // Keep an active "Show changes" overlay pointed at this comparison so switching rows or
  // flipping sides updates the highlights automatically (no need to re-toggle).
  if (window._editorReview && window._editorReview.reanchorOverlay) window._editorReview.reanchorOverlay(cmp.base, cmp.target);
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
  // Flip New/Old is only meaningful for view-mode diagrams (flowcharts draw removed items
  // in place as ghosts, so there's nothing to flip to).
  const flipBtn = document.getElementById('tlFlipBtn');
  if (flipBtn) {
    const canFlip = overlayOn && !!overlayPair && S.viewMode;
    flipBtn.style.display = canFlip ? '' : 'none';
    flipBtn.classList.toggle('active', showOld);
    flipBtn.textContent = showOld ? '⇄ Show New' : '⇄ Show Old';
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

// Put the correct side of the frozen comparison on the canvas. New side = added/changed;
// Old side = the previous version, where removed items are drawn in red.
function ensureSideCanvas() {
  if (!overlayPair) return;
  const hist = window._editorHistory || {};
  const idx = effectiveIdx();
  const n = S.snapshots.length;
  if (showOld) {
    if (hist.enterPreviewOf) hist.enterPreviewOf(overlayPair.old, 'Comparing — PREVIOUS version · removed items in red. Flip to New (or Esc) to return.');
  } else if (idx === n - 1) {
    // New side of the newest row IS the live canvas — no preview needed.
    if (S.previewMode && hist.exitPreview) hist.exitPreview(false);
  } else if (hist.enterPreviewOf) {
    hist.enterPreviewOf(overlayPair.new, 'Comparing — this version · added in green. Flip to Old to see removed in red.');
  }
}

function endShowChanges() {
  const review = window._editorReview || {};
  const hist = window._editorHistory || {};
  if (review.hideChanges) review.hideChanges();
  overlayPair = null; showOld = false;
  if (S.previewMode && hist.exitPreview) hist.exitPreview(false);
}

// ⧉ Show changes — highlight ON the diagram the change the selected version introduced
// (predecessor → this version). Freezes the pair so the New/Old flip stays stable.
function toggleShowChanges() {
  const review = window._editorReview || {};
  if (review.isOn && review.isOn()) { endShowChanges(); refreshTimeline(); return; }
  const cmp = rawComparisonFor(effectiveIdx());
  if (cmp.mode === 'empty' || cmp.base === cmp.target) return;
  overlayPair = { old: cmp.base, new: cmp.target };
  showOld = false;
  if (review.showChangesFrom) review.showChangesFrom(overlayPair.old, overlayPair.new);
  ensureSideCanvas();
  refreshTimeline();
}

// ⇄ Flip the canvas between the New and Old sides of the comparison (view mode only).
function flipShowSide() {
  if (!overlayPair) return;
  showOld = !showOld;
  ensureSideCanvas();
  refreshTimeline();
}

export function initTimeline() {
  window._editorTimeline = { refresh: refreshTimeline, resetSelection: resetTimelineSelection };
  const copyBtn = document.getElementById('tlCopyBtn');
  const prevBtn = document.getElementById('tlPrevBtn');
  const nextBtn = document.getElementById('tlNextBtn');
  const previewBtn = document.getElementById('tlPreviewBtn');
  const showBtn = document.getElementById('tlShowBtn');
  const flipBtn = document.getElementById('tlFlipBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyForAI);
  if (prevBtn) prevBtn.addEventListener('click', () => jump(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => jump(1));
  if (previewBtn) previewBtn.addEventListener('click', togglePreview);
  if (showBtn) showBtn.addEventListener('click', toggleShowChanges);
  if (flipBtn) flipBtn.addEventListener('click', flipShowSide);
  refreshTimeline();
}
