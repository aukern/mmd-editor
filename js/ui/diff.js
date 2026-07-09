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

// ── Word-level diff for a changed line pair ───────────────────────────────────
// A flowchart edit usually rewrites a whole line (e.g. a node label), so a plain
// -/+ pair looks nearly identical. Highlight only the tokens that actually differ.
function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

function tokenize(s) { return s.match(/\s+|[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []; }

function wordDiff(aLine, bLine) {
  const A = tokenize(aLine), B = tokenize(bLine);
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, aOut = '', bOut = '';
  const mark = t => '<span class="wd">' + esc(t) + '</span>';
  while (i < n && j < m) {
    if (A[i] === B[j]) { aOut += esc(A[i]); bOut += esc(B[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { aOut += mark(A[i]); i++; }
    else { bOut += mark(B[j]); j++; }
  }
  while (i < n) aOut += mark(A[i++]);
  while (j < m) bOut += mark(B[j++]);
  return { a: aOut, b: bOut };
}

// ── Checkpoint stack + panel ──────────────────────────────────────────────────
let lastDiffText = '';
let cacheCur = null, cacheBase = null;
let diffAnchors = [];     // hunk-start elements, for prev/next jump
let diffAnchorIdx = -1;

function baseline() {
  return (S.diffCheckpoints && S.diffCheckpoints.length) ? S.diffCheckpoints[S.diffCheckpoints.length - 1] : null;
}

// Set the baseline to the current content (called when a diagram is loaded, or
// when an external/AI change is synced from disk — so those edits aren't shown).
export function resetDiffBaseline() {
  S.diffCheckpoints = [getCurrentSource()];
  cacheCur = cacheBase = null;
  updateDiffPanel();
}

// Render the unified diff into the panel with a gutter, word-level highlights and
// clean hunk separators. Returns the list of hunk anchors (for jump navigation).
function renderDiff(container, diffText) {
  container.innerHTML = '';
  const anchors = [];       // one wrapper element per hunk (a jump target)
  let block = null;
  let delBuf = [], addBuf = [];

  const row = (cls, prefix, html) => {
    const el = document.createElement('div');
    el.className = 'dl ' + cls;
    el.innerHTML = `<span class="pfx">${prefix}</span>${html}`;
    (block || container).appendChild(el);
  };

  const flush = () => {
    if (!delBuf.length && !addBuf.length) return;
    const pairs = Math.min(delBuf.length, addBuf.length);
    const dels = delBuf.map(l => esc(l));
    const adds = addBuf.map(l => esc(l));
    for (let k = 0; k < pairs; k++) { const wd = wordDiff(delBuf[k], addBuf[k]); dels[k] = wd.a; adds[k] = wd.b; }
    dels.forEach(h => row('del', '-', h));
    adds.forEach(h => row('add', '+', h));
    delBuf = []; addBuf = [];
  };

  diffText.split('\n').forEach(line => {
    const c = line[0];
    if (c === '@') {                       // hunk boundary → start a new hunk block (jump target)
      flush();
      block = document.createElement('div');
      block.className = 'hunk' + (anchors.length === 0 ? ' first' : '');
      container.appendChild(block);
      anchors.push(block);
    } else if (c === '-') { delBuf.push(line.slice(1)); }
    else if (c === '+') { addBuf.push(line.slice(1)); }
    else { flush(); row('ctx', ' ', esc(line.slice(1))); }
  });
  flush();
  return anchors;
}

function updateJumpInfo() {
  const info = document.getElementById('diffJumpInfo');
  const n = diffAnchors.length;
  if (info) info.textContent = n ? `${Math.max(0, diffAnchorIdx) + 1}/${n}` : '';
  const prev = document.getElementById('diffPrevBtn'), next = document.getElementById('diffNextBtn');
  if (prev) prev.disabled = n < 1;       // enabled whenever there's at least one change
  if (next) next.disabled = n < 1;
}

function jump(dir) {
  const n = diffAnchors.length;
  if (!n) return;
  if (diffAnchorIdx < 0) diffAnchorIdx = dir > 0 ? 0 : n - 1;
  else diffAnchorIdx = (diffAnchorIdx + dir + n) % n;
  const el = diffAnchors[diffAnchorIdx];
  const out = document.getElementById('diffOut');
  if (out && el) out.scrollTop = Math.max(0, el.offsetTop - 6);
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  updateJumpInfo();
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
  if (!diff) {
    out.innerHTML = '<div class="ctx-empty">No changes since checkpoint.</div>';
    diffAnchors = []; diffAnchorIdx = -1;
  } else {
    diffAnchors = renderDiff(out, diff);
    diffAnchorIdx = -1;
  }
  updateJumpInfo();

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
  const btn = document.getElementById('diffCopyBtn');
  if (!lastDiffText) { document.getElementById('diffStatus').textContent = 'Nothing to copy — no changes since checkpoint.'; return; }
  const changes = lastDiffText.split('\n').filter(l => l[0] === '+' || l[0] === '-').length;
  const payload = '# Change to a Mermaid flowchart (unified diff; `-` = before edit, `+` = after edit):\n\n' + lastDiffText;
  navigator.clipboard.writeText(payload).catch(() => {});

  // Legible confirmation: the diff is about to reset to empty, which otherwise looks
  // like nothing happened. Flash the button and the diff box so the copy registers.
  if (btn) {
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => { btn.textContent = 'Copy for AI'; btn.classList.remove('copied'); }, 1500);
  }
  const out = document.getElementById('diffOut');
  if (out) { out.classList.remove('just-copied'); void out.offsetWidth; out.classList.add('just-copied'); }

  S.diffCheckpoints.push(getCurrentSource());                 // advance baseline to now
  cacheCur = cacheBase = null;
  updateDiffPanel();
  if (status) status.textContent = `Copied ${changes} line-change(s) for the AI — checkpoint advanced.`;
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
  const prevBtn = document.getElementById('diffPrevBtn');
  const nextBtn = document.getElementById('diffNextBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyForAI);
  if (undoBtn) undoBtn.addEventListener('click', undoCheckpoint);
  if (prevBtn) prevBtn.addEventListener('click', () => jump(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => jump(1));
}
