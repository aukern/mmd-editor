import { NS } from './constants.js';
import { S } from './state.js';

export function uid(p, n) { return p + n; }

export function makeSVG(tag) { return document.createElementNS(NS, tag); }

export function svgPoint(ev) {
  const rect = document.getElementById('canvasWrap').getBoundingClientRect();
  return { x: (ev.clientX - rect.left - S.panX) / S.zoom, y: (ev.clientY - rect.top - S.panY) / S.zoom };
}

export function applyTransform() {
  document.getElementById('root').setAttribute('transform', `translate(${S.panX},${S.panY}) scale(${S.zoom})`);
  document.getElementById('zoomLabel').textContent = Math.round(S.zoom * 100) + '%';
  // Grid rect lives inside #root — it gets the same transform automatically, no extra work needed.
  // In view mode the same pan/zoom drives the Mermaid-rendered SVG.
  const vp = document.getElementById('viewPan');
  if (vp) vp.style.transform = `translate(${S.panX}px,${S.panY}px) scale(${S.zoom})`;
}

export function setZoom(z, cx, cy) {
  const rect = document.getElementById('canvasWrap').getBoundingClientRect();
  const ox = cx !== undefined ? cx - rect.left : rect.width / 2;
  const oy = cy !== undefined ? cy - rect.top : rect.height / 2;
  const old = S.zoom;
  S.zoom = Math.min(4, Math.max(0.1, z));
  S.panX = ox - (ox - S.panX) * S.zoom / old;
  S.panY = oy - (oy - S.panY) * S.zoom / old;
  applyTransform();
}

export function fitAll() {
  if (S.viewMode) { window._editorViewmode?.fitViewDiagram?.(); return; }
  if (!S.nodes.length && !S.groups.length) { S.zoom = 1; S.panX = 80; S.panY = 80; applyTransform(); return; }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  S.nodes.forEach(n => { const {w,h} = nodeSize(n); minX = Math.min(minX, n.x-w/2); minY = Math.min(minY, n.y-h/2); maxX = Math.max(maxX, n.x+w/2); maxY = Math.max(maxY, n.y+h/2); });
  S.groups.forEach(g => { minX = Math.min(minX, g.x); minY = Math.min(minY, g.y); maxX = Math.max(maxX, g.x+g.w); maxY = Math.max(maxY, g.y+g.h); });
  const rect = document.getElementById('canvasWrap').getBoundingClientRect(), pad = 60;
  const scX = (rect.width - pad*2) / (maxX - minX || 1), scY = (rect.height - pad*2) / (maxY - minY || 1);
  S.zoom = Math.min(4, Math.max(0.1, Math.min(scX, scY)));
  S.panX = pad - minX * S.zoom; S.panY = pad - minY * S.zoom;
  applyTransform();
}

export function snapGrid(v) { return Math.round(v / 24) * 24; }

// Height of a group's title bar — grows to fit a multi-line title.
export function groupTitleHeight(title) {
  const lines = Math.max(1, (title || '').split('\n').length);
  return 26 + (lines - 1) * 16;
}

export function nodeSize(n) {
  if (n._w !== undefined) return { w: n._w, h: n._h };
  const lines = (n.label || '').split('\n');
  const maxLen = Math.max(...lines.map(l => l.length), 3);
  let w = Math.max(70, maxLen * 8 + 30), h = 34 + lines.length * 16;
  if (['hexagon','asymmetric','parallelogram','parallelogramAlt','trapezoid','trapezoidAlt','manualInput','display'].includes(n.shape)) w += 26;
  if (n.shape === 'rhombus') { w += 20; h += 12; }
  if (n.shape === 'cylinder') h += 16;
  if (n.shape === 'doubleCircle') { w = Math.max(w, 90); h = Math.max(h, 90); }
  if (n.shape === 'circle') { w = Math.max(w, 80); h = Math.max(h, 80); }
  if (n.shape === 'hourglass') { w = Math.max(w, 70); h = Math.max(h, 70); }
  if (n.shape === 'delay') w = Math.max(w, 80);
  return { w, h };
}

export function edgeAnchor(n, dx, dy) {
  const {w, h} = nodeSize(n); const hw = w/2, hh = h/2;
  if (dx === 0 && dy === 0) return { x: n.x, y: n.y };
  const scale = Math.min(hw / Math.abs(dx || 1e-6), hh / Math.abs(dy || 1e-6));
  return { x: n.x + dx * scale, y: n.y + dy * scale };
}

export function getPortPositions(n) {
  const {w, h} = nodeSize(n);
  const off = 14;
  return [
    {x: n.x,       y: n.y-h/2-off, dir:'N'},
    {x: n.x,       y: n.y+h/2+off, dir:'S'},
    {x: n.x+w/2+off, y: n.y,       dir:'E'},
    {x: n.x-w/2-off, y: n.y,       dir:'W'},
  ];
}

// Groups use a top-left box model (x,y,w,h) rather than a centre — ports sit on
// the midpoints of the four box edges, offset outward like node ports.
export function getGroupPortPositions(g) {
  const off = 14;
  const cx = g.x + g.w/2, cy = g.y + g.h/2;
  return [
    {x: cx,           y: g.y - off,        dir:'N'},
    {x: cx,           y: g.y + g.h + off,  dir:'S'},
    {x: g.x + g.w + off, y: cy,            dir:'E'},
    {x: g.x - off,    y: cy,               dir:'W'},
  ];
}

export function cloneState() {
  return {
    nodes: S.nodes.map(n => ({...n, style: n.style ? {...n.style} : null, classes: [...(n.classes||[])]})),
    edges: S.edges.map(e => ({...e})),
    groups: S.groups.map(g => ({...g})),
    classDefs: JSON.parse(JSON.stringify(S.classDefs)),
    direction: S.direction
  };
}

export function pushUndo() {
  if (S.previewMode) return;
  S.undoStack.push(cloneState());
  if (S.undoStack.length > 80) S.undoStack.shift();
  S.redoStack = [];
}

export function restoreStateFrom(st) {
  S.nodes = st.nodes; S.edges = st.edges; S.groups = st.groups;
  S.classDefs = st.classDefs; S.direction = st.direction;
  document.getElementById('directionSelect').value = S.direction;
}

export function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
