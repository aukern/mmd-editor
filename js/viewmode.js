import { S } from './state.js';
import { applyTransform } from './utils.js';

// Non-flowchart Mermaid diagrams (erDiagram, sequenceDiagram, classDiagram, …)
// open in "view mode": the canvas is a live, read-only Mermaid render; editing
// happens through the Mermaid Source panel (see ui/source.js). The flowchart
// visual editor is untouched.

// Best-effort: from a click on the rendered SVG, pull the most specific label
// text, then find the first source line containing it (or one of its words).
function tokenFromEvent(ev) {
  let el = ev.target;
  if (el.tagName === 'text' || el.tagName === 'tspan') { const t = el.textContent.trim(); if (t) return t; }
  const g = el.closest && el.closest('g');
  if (g) {
    const lbl = g.querySelector('text, tspan, .nodeLabel, foreignObject span, foreignObject div');
    if (lbl) { const t = lbl.textContent.trim(); if (t) return t; }
  }
  const t = (el.textContent || '').trim();
  return (t && t.length <= 80) ? t : null;
}

function findSourceLine(token) {
  const lines = (S.rawText || '').split('\n');
  const cands = [token.trim(), ...token.trim().split(/\s+/)].filter(t => t && t.length >= 2);
  for (const c of cands) {
    const cl = c.toLowerCase();
    const idx = lines.findIndex(l => l.toLowerCase().includes(cl));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Attach the click-to-locate handler once (the #viewPan element persists across
// re-renders; only its innerHTML changes).
export function initViewmode() {
  const pan = document.getElementById('viewPan');
  if (!pan) return;
  pan.addEventListener('click', ev => {
    if (!S.viewMode) return;
    const tok = tokenFromEvent(ev);
    if (!tok) return;
    const line = findSourceLine(tok);
    if (line >= 0 && window._editorSource && window._editorSource.highlightSourceLine) {
      window._editorSource.highlightSourceLine(line);
      document.getElementById('statusText').textContent = `Source line ${line + 1}: "${tok.slice(0, 40)}"`;
    }
  });
}

export function detectDiagramType(text) {
  const first = (text || '').split('\n').map(l => l.trim()).find(l => l && !l.startsWith('%%')) || '';
  const kw = first.split(/[\s{]/)[0].toLowerCase();
  return (kw === 'flowchart' || kw === 'graph') ? 'flowchart' : (kw || 'unknown');
}

// Toolbar controls that only make sense for the flowchart editor.
const LOCK_IDS = ['addNodeBtn', 'addGroupBtn', 'connectBtn', 'arrowSelect', 'directionSelect',
                  'snapGridBtn', 'deleteBtn', 'arrangeBtn', 'undoBtn', 'redoBtn', 'shapeDropdownBtn'];

function applyModeUI(on) {
  LOCK_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('vm-disabled', on); });
  // Pan is the only navigation for view diagrams (rubber-band select is N/A), so
  // force the Pan toggle on and lock it while in view mode.
  const panBtn = document.getElementById('panModeBtn');
  if (panBtn) {
    panBtn.classList.toggle('vm-locked', on);
    if (on) panBtn.classList.add('active');
    else panBtn.classList.toggle('active', !!S.panMode);
  }
  // Class-definitions section is flowchart-only — hide it.
  const cdSec = document.getElementById('cdAddBtn')?.closest('.sb-section');
  if (cdSec) cdSec.style.display = on ? 'none' : '';
  if (on) {
    ['nodeProps', 'edgeProps', 'groupProps'].forEach(id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    const propTitle = document.getElementById('propTitle'); if (propTitle) propTitle.textContent = 'Properties';
    const noSel = document.getElementById('noSelMsg');
    if (noSel) { noSel.style.display = 'block'; noSel.textContent = `View-only diagram (${detectDiagramType(S.rawText)}) — edit via Mermaid source.`; }
  }
}

let renderSeq = 0;

export async function renderViewDiagram(text) {
  const pan = document.getElementById('viewPan');
  if (!pan) return;
  const seq = ++renderSeq;
  if (typeof mermaid === 'undefined') { pan.innerHTML = '<div class="vm-error">Mermaid library not loaded.</div>'; return; }
  const probeId = 'vm-' + Date.now() + '-' + seq;
  let svg = null, err = null;
  try {
    const res = await mermaid.render(probeId, text);
    svg = (res && res.svg) ? res.svg : (typeof res === 'string' ? res : null);
  } catch (e) {
    err = (e && e.message) ? e.message : String(e);
  } finally {
    const probe = document.getElementById(probeId);
    if (probe && probe.parentNode) probe.parentNode.removeChild(probe);
  }
  if (seq !== renderSeq) return;             // a newer render superseded this one
  if (err || !svg) { pan.innerHTML = `<div class="vm-error">Diagram error:\n${err || 'empty render'}</div>`; return; }
  pan.innerHTML = svg;
  fitViewDiagram();
}

export function fitViewDiagram() {
  const pan = document.getElementById('viewPan');
  const svg = pan && pan.querySelector('svg');
  const wrap = document.getElementById('canvasWrap');
  if (!svg || !wrap) return;
  let w = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width;
  let h = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height;
  if ((!w || !h) && svg.getBBox) { try { const bb = svg.getBBox(); w = bb.width; h = bb.height; } catch (_) {} }
  if (!w || !h) return;
  // Pin the SVG to its natural pixel size so our scale transform is predictable.
  svg.removeAttribute('width'); svg.removeAttribute('height');
  svg.style.width = w + 'px'; svg.style.height = h + 'px';
  const r = wrap.getBoundingClientRect(), pad = 40;
  const z = Math.min(4, Math.max(0.1, Math.min((r.width - pad * 2) / w, (r.height - pad * 2) / h)));
  S.zoom = z; S.panX = (r.width - w * z) / 2; S.panY = (r.height - h * z) / 2;
  applyTransform();
}

export function enterViewMode(text) {
  S.viewMode = true;
  S.rawText = text || '';
  S.nodes = []; S.edges = []; S.groups = []; S.classDefs = {};
  S.selected = null; S.multiSelect.clear(); S.multiSelectEdges.clear();
  S.undoStack = []; S.redoStack = [];
  document.getElementById('canvasWrap').classList.add('view-mode');
  applyModeUI(true);
  const out = document.getElementById('mmdOut'); if (out) out.value = S.rawText;
  renderViewDiagram(S.rawText);
  window._editorEvents?.updateCanvasCursor?.();
}

export function exitViewMode() {
  const wasView = S.viewMode;
  S.viewMode = false;
  S.rawText = '';
  document.getElementById('canvasWrap').classList.remove('view-mode');
  const pan = document.getElementById('viewPan'); if (pan) pan.innerHTML = '';
  if (wasView) applyModeUI(false);
  window._editorEvents?.updateCanvasCursor?.();
}
