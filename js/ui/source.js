import { S } from '../state.js';
import { applyMermaidText } from '../loader.js';
import { pushUndo } from '../utils.js';
import { getMermaidText, updateUndoRedo } from '../render.js';
import { countMutation } from '../history.js';
import { scheduleSave } from '../file.js';
import { renderViewDiagram } from '../viewmode.js';

// The Mermaid source panel is a live, editable view of the diagram. Edits are
// debounced, then applied via applyMermaidText (which preserves node positions).
// Each applied burst is one undo step and counts toward the snapshot cadence.
let applyTimer = null;
let lastApplied = null;

function scheduleApply(text) {
  clearTimeout(applyTimer);
  applyTimer = setTimeout(() => applyNow(text), 500);
}

function applyNow(text) {
  if (S.previewMode) { document.getElementById('statusText').textContent = 'Exit preview mode first (Accept or Cancel).'; return; }
  // View mode: the raw text IS the diagram — re-render via Mermaid, autosave, diff.
  if (S.viewMode) {
    if (text === S.rawText) return;
    S.rawText = text;
    renderViewDiagram(text);
    countMutation();                 // schedules autosave + snapshot cadence (uses raw text)
    if (window._editorDiff && window._editorDiff.update) window._editorDiff.update();
    return;
  }
  // Skip if unchanged since the last apply, or already matching canonical output.
  if (lastApplied !== null && text.trim() === lastApplied.trim()) return;
  if (text.trim() === getMermaidText().trim()) { lastApplied = text; return; }
  pushUndo();
  const ok = applyMermaidText(text);
  if (ok) { lastApplied = text; countMutation(); scheduleSave(); }
  else { S.undoStack.pop(); updateUndoRedo(); }   // invalid intermediate text — drop the undo entry
}

// ── DevTools-style highlight: show which source line(s) the selected canvas
// element occupies. Relies on the line map getMermaidText writes to S.sourceLineMap
// and on the source textarea being non-wrapping (one statement = one row).
const LINE_H = 16, PAD_TOP = 8;
let activeRange = null;
let lastKey = null;

function positionHighlightBar() {
  const bar = document.getElementById('mmdOutHiBar');
  const ta = document.getElementById('mmdOut');
  if (!bar || !ta) return;
  if (!activeRange) { bar.style.display = 'none'; return; }
  const [a, b] = activeRange;
  bar.style.display = 'block';
  bar.style.top = (PAD_TOP + a * LINE_H - ta.scrollTop) + 'px';
  bar.style.height = ((b - a + 1) * LINE_H) + 'px';
}

function syncHighlight() {
  const ta = document.getElementById('mmdOut');
  const map = S.sourceLineMap || {};
  const key = (S.selected && S.selected.type) ? (S.selected.type + ':' + S.selected.id) : null;
  activeRange = key ? (map[key] || null) : null;
  // Scroll into view only when the selection changes (not every render, so
  // dragging a selected element doesn't yank the panel), and not while typing.
  if (activeRange && ta && key !== lastKey && document.activeElement !== ta) {
    const [a, b] = activeRange;
    const top = a * LINE_H, bottom = (b + 1) * LINE_H;
    const viewTop = ta.scrollTop, viewH = ta.clientHeight - PAD_TOP * 2;
    if (top < viewTop) ta.scrollTop = top;
    else if (bottom > viewTop + viewH) ta.scrollTop = Math.min(bottom - viewH, top);
  }
  lastKey = key;
  positionHighlightBar();
}

export function initSourceEditor() {
  window._editorSource = { syncHighlight };
  const outEl = document.getElementById('mmdOut');
  if (outEl) outEl.addEventListener('scroll', positionHighlightBar);

  const out = document.getElementById('mmdOut');
  const big = document.getElementById('mmdOutBig');
  const modal = document.getElementById('sourceModal');
  const expandBtn = document.getElementById('expandSourceBtn');
  const closeBtn = document.getElementById('sourceModalClose');
  const bigCopy = document.getElementById('sourceModalCopy');

  const onInput = (srcEl, otherEl) => () => {
    if (otherEl && document.activeElement !== otherEl) otherEl.value = srcEl.value;
    scheduleApply(srcEl.value);
  };
  if (out) out.addEventListener('input', onInput(out, big));
  if (big) big.addEventListener('input', onInput(big, out));

  if (expandBtn && modal && big) {
    expandBtn.addEventListener('click', () => {
      big.value = out ? out.value : getMermaidText();
      modal.classList.add('open');
      setTimeout(() => big.focus(), 0);
    });
  }
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('open');
      if (out && big) out.value = big.value;
    });
  }
  if (modal) {
    modal.addEventListener('mousedown', ev => { if (ev.target === modal) { modal.classList.remove('open'); if (out && big) out.value = big.value; } });
  }
  if (bigCopy && big) {
    bigCopy.addEventListener('click', () => {
      navigator.clipboard.writeText(big.value).catch(() => { big.select(); document.execCommand('copy'); });
      document.getElementById('statusText').textContent = 'Copied!';
    });
  }
}
