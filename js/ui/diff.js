import { S } from '../state.js';
import { getMermaidText, getCurrentSource } from '../render.js';

// ── Line diff (LCS) → unified-diff hunks ──────────────────────────────────────
// Content-based, like git: identical content (e.g. after undo) yields no diff.
function diffOps(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: ' ', s: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: '-', s: a[i] }); i++; }
    else { ops.push({ t: '+', s: b[j] }); j++; }
  }
  while (i < n) ops.push({ t: '-', s: a[i++] });
  while (j < m) ops.push({ t: '+', s: b[j++] });
  return ops;
}

export function unifiedDiff(beforeText, afterText, context = 3) {
  const ops = diffOps(beforeText.split('\n'), afterText.split('\n'));
  if (!ops.some(o => o.t !== ' ')) return '';                 // identical
  let al = 0, bl = 0;
  ops.forEach(o => { if (o.t !== '+') o.a = ++al; if (o.t !== '-') o.b = ++bl; });
  const ranges = [];
  ops.forEach((o, i) => {
    if (o.t === ' ') return;
    const s = Math.max(0, i - context), e = Math.min(ops.length - 1, i + context);
    const last = ranges[ranges.length - 1];
    if (last && s <= last.e + 1) last.e = e; else ranges.push({ s, e });
  });
  const out = [];
  ranges.forEach(r => {
    let aStart = 0, bStart = 0, aCount = 0, bCount = 0;
    for (let k = r.s; k <= r.e; k++) {
      const o = ops[k];
      if (o.t !== '+') { if (!aStart) aStart = o.a; aCount++; }
      if (o.t !== '-') { if (!bStart) bStart = o.b; bCount++; }
    }
    out.push(`@@ -${aStart || 0},${aCount} +${bStart || 0},${bCount} @@`);
    for (let k = r.s; k <= r.e; k++) out.push(ops[k].t + ops[k].s);
  });
  return out.join('\n');
}

// ── Checkpoint stack + panel ──────────────────────────────────────────────────
let lastDiffText = '';
let cacheCur = null, cacheBase = null;

function baseline() {
  return (S.diffCheckpoints && S.diffCheckpoints.length) ? S.diffCheckpoints[S.diffCheckpoints.length - 1] : null;
}

// Set the baseline to the current content (called when a diagram is loaded).
export function resetDiffBaseline() {
  S.diffCheckpoints = [getCurrentSource()];
  cacheCur = cacheBase = null;
  updateDiffPanel();
}

export function updateDiffPanel() {
  const out = document.getElementById('diffOut');
  if (!out) return;
  const cur = S.viewMode ? (S.rawText || '') : ((S.lastMmd != null) ? S.lastMmd : getMermaidText());
  if (!S.diffCheckpoints || !S.diffCheckpoints.length) S.diffCheckpoints = [cur];
  const base = baseline();
  if (cur === cacheCur && base === cacheBase) return;         // nothing changed
  cacheCur = cur; cacheBase = base;

  const diff = unifiedDiff(base, cur);
  lastDiffText = diff;
  out.innerHTML = '';
  if (!diff) {
    const el = document.createElement('div'); el.className = 'ctx'; el.textContent = 'No changes since checkpoint.'; out.appendChild(el);
  } else {
    const frag = document.createDocumentFragment();
    diff.split('\n').forEach(line => {
      const c = line[0];
      const el = document.createElement('div');
      el.className = c === '+' ? 'add' : c === '-' ? 'del' : c === '@' ? 'hunk' : 'ctx';
      el.textContent = line;
      frag.appendChild(el);
    });
    out.appendChild(frag);
  }
  const status = document.getElementById('diffStatus');
  if (status) {
    const cps = (S.diffCheckpoints.length || 1) - 1;
    if (diff) {
      const adds = diff.split('\n').filter(l => l[0] === '+').length;
      const dels = diff.split('\n').filter(l => l[0] === '-').length;
      status.textContent = `+${adds} −${dels} since checkpoint · ${cps} checkpoint(s) made`;
    } else {
      status.textContent = `No changes · ${cps} checkpoint(s) made`;
    }
  }
}

function copyForAI() {
  const status = document.getElementById('statusText');
  if (!lastDiffText) { document.getElementById('diffStatus').textContent = 'Nothing to copy — no changes since checkpoint.'; return; }
  const payload = '# Change to a Mermaid flowchart (unified diff; `-` = before edit, `+` = after edit):\n\n' + lastDiffText;
  navigator.clipboard.writeText(payload).catch(() => {});
  S.diffCheckpoints.push(getCurrentSource());                 // advance baseline to now
  cacheCur = cacheBase = null;
  updateDiffPanel();
  if (status) status.textContent = 'Diff copied — checkpoint advanced.';
}

function undoCheckpoint() {
  const status = document.getElementById('statusText');
  if (S.diffCheckpoints && S.diffCheckpoints.length > 1) {
    S.diffCheckpoints.pop();
    cacheCur = cacheBase = null;
    updateDiffPanel();
    if (status) status.textContent = 'Checkpoint reverted — diff restored.';
  } else if (status) {
    status.textContent = 'No earlier checkpoint.';
  }
}

export function initDiffPanel() {
  window._editorDiff = { update: updateDiffPanel, resetBaseline: resetDiffBaseline };
  const copyBtn = document.getElementById('diffCopyBtn');
  const undoBtn = document.getElementById('diffUndoBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyForAI);
  if (undoBtn) undoBtn.addEventListener('click', undoCheckpoint);
}
