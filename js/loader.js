import { S } from './state.js';
import { uid, fitAll, nodeSize } from './utils.js';
import { parseMermaid } from './parser.js';
import { layoutFromGraph, fitGroupsToMembers } from './layout.js';
import { extractSnapshotsFromText, stripSnapLines } from './history.js';
import { render, updateUndoRedo } from './render.js';

function parseTr(attr) {
  if (!attr) return { x: 0, y: 0 };
  const m = attr.match(/translate\(\s*([^,\s)]+)[\s,]+([^)]+)\)/);
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
}

// Use mermaid's own renderer to get correct positions, then update S.nodes + S.groups.
async function refineMermaidLayout(text) {
  if (typeof mermaid === 'undefined') return;
  const id = 'mmd-layout-probe-' + Date.now();
  let svgStr = null;
  try {
    const result = await mermaid.render(id, text);
    svgStr = (result && result.svg) ? result.svg : (typeof result === 'string' ? result : null);
  } catch(e) {
    console.warn('[MMD LAYOUT] mermaid.render failed:', e.message);
  } finally {
    const el = document.getElementById(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  if (!svgStr) return;

  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');

  // Mermaid wraps everything in a <g> with a margin translate
  const rootG = doc.querySelector('svg > g');
  const rootTr = parseTr(rootG ? rootG.getAttribute('transform') : null);

  // Update leaf/standalone node positions
  doc.querySelectorAll('g.node').forEach(el => {
    const m = (el.id || '').match(/^flowchart-(.+?)-\d+$/);
    if (!m) return;
    const nodeId = m[1];
    const node = S.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const tr = parseTr(el.getAttribute('transform'));
    node.x = rootTr.x + tr.x;
    node.y = rootTr.y + tr.y;
  });

  // Update group box positions/sizes from cluster elements
  doc.querySelectorAll('g.cluster').forEach(el => {
    const rawId = el.id || '';
    // Try "flowchart-GROUPID-N" format first, then fall back to substring match
    let grp = null;
    const m = rawId.match(/^flowchart-(.+?)-\d+$/);
    if (m) grp = S.groups.find(g => g.id === m[1]);
    if (!grp) grp = S.groups.find(g => rawId.includes(g.id) && g.id.length > 1);
    if (!grp) return;

    const tr = parseTr(el.getAttribute('transform'));
    const rect = el.querySelector('rect');
    if (!rect) return;
    const rx = parseFloat(rect.getAttribute('x') || '0');
    const ry = parseFloat(rect.getAttribute('y') || '0');
    const rw = parseFloat(rect.getAttribute('width') || '0');
    const rh = parseFloat(rect.getAttribute('height') || '0');
    if (rw < 1 || rh < 1) return;
    grp.x = rootTr.x + tr.x + rx;
    grp.y = rootTr.y + tr.y + ry;
    grp.w = rw;
    grp.h = rh;
  });

  const { render: renderFn } = window._editorRender || {};
  if (renderFn) renderFn();
  fitAll();
}

export function loadFromMermaidText(text, preserveSnapshots) {
  try {
    if (!preserveSnapshots) {
      const loaded = extractSnapshotsFromText(text);
      if (loaded.length) S.snapshots = loaded;
    }
    text = stripSnapLines(text);
    const { newNodes, newEdges, newGroups, newClassDefs, dir } = parseMermaid(text);
    const ids = [...newNodes.keys()];
    if (!ids.length) {
      document.getElementById('statusText').textContent = 'No recognizable flowchart content.';
      return;
    }
    S.direction = dir;
    document.getElementById('directionSelect').value = dir;
    const pos = layoutFromGraph(ids, newEdges, dir, newNodes, newGroups);
    S.nodes = ids.map(id => ({
      id,
      label: newNodes.get(id).label || id,
      shape: newNodes.get(id).shape || 'rect',
      x: pos[id]?.x || 160,
      y: pos[id]?.y || 120,
      parent: newNodes.get(id).parent || null,
      style: newNodes.get(id).style || null,
      classes: newNodes.get(id).classes || [],
    }));
    S.edges = newEdges.map(e => ({ id: uid('e', S.nextEdgeNum++), from: e.from, to: e.to, label: e.label, type: e.type }));
    S.groups = newGroups.map(g => ({...g}));
    S.classDefs = {...newClassDefs};
    fitGroupsToMembers();
    S.nextNodeNum = 1 + S.nodes.reduce((m,n) => { const mm=n.id.match(/^n(\d+)$/); return mm?Math.max(m,parseInt(mm[1])):m; }, 0);
    S.nextGroupNum = 1 + S.groups.reduce((m,g) => { const mm=g.id.match(/^g(\d+)$/); return mm?Math.max(m,parseInt(mm[1])):m; }, 0);
    S.selected = null; S.multiSelect.clear(); S.undoStack = []; S.redoStack = [];
    updateUndoRedo();
    render();
    fitAll();
    document.getElementById('statusText').textContent = `Loaded ${S.nodes.length} node(s), ${S.edges.length} edge(s), ${S.groups.length} group(s).`;

    // Async Mermaid refinement can fight the editor's grouped two-pass layout.
    // Keep it for simple flat diagrams, but leave grouped diagrams stable.
    if (!newGroups.length) {
      refineMermaidLayout(text).catch(e => console.warn('[MMD LAYOUT]', e));
    }
  } catch(err) {
    document.getElementById('statusText').textContent = 'Could not parse. Canvas unchanged.';
    console.error(err);
  }
}

// Apply edited Mermaid source onto the current diagram, preserving the position
// of every node/group that still exists. Only brand-new nodes get auto-layout,
// so editing labels/edges/styles never reshuffles the canvas. Returns true on
// success. Callers own undo/snapshot/save (see ui/source.js).
export function applyMermaidText(text) {
  let parsed;
  try { parsed = parseMermaid(text); }
  catch(err) { document.getElementById('statusText').textContent = 'Parse error — diagram unchanged.'; return false; }
  const { newNodes, newEdges, newGroups, newClassDefs, dir } = parsed;
  const ids = [...newNodes.keys()];
  if (!ids.length) { document.getElementById('statusText').textContent = 'No recognizable content — diagram unchanged.'; return false; }

  const oldPos = new Map(S.nodes.map(n => [n.id, {x:n.x, y:n.y}]));
  const oldGroup = new Map(S.groups.map(g => [g.id, {x:g.x, y:g.y, w:g.w, h:g.h}]));

  // Layout is only needed when genuinely new nodes appear.
  const hasNewNodes = ids.some(id => !oldPos.has(id));
  const pos = hasNewNodes ? layoutFromGraph(ids, newEdges, dir, newNodes, newGroups) : {};

  S.direction = dir;
  const dirSel = document.getElementById('directionSelect');
  if (dirSel) dirSel.value = dir;

  S.nodes = ids.map(id => {
    const meta = newNodes.get(id), keep = oldPos.get(id);
    return {
      id,
      label: meta.label || id,
      shape: meta.shape || 'rect',
      x: keep ? keep.x : (pos[id]?.x ?? 160),
      y: keep ? keep.y : (pos[id]?.y ?? 120),
      parent: meta.parent || null,
      style: meta.style || null,
      classes: meta.classes || [],
    };
  });
  S.edges = newEdges.map(e => ({ id: uid('e', S.nextEdgeNum++), from:e.from, to:e.to, label:e.label, type:e.type }));
  // Keep the existing box for surviving groups; fit only brand-new ones.
  S.groups = newGroups.map(g => oldGroup.has(g.id) ? {...g, ...oldGroup.get(g.id)} : {...g});
  newGroups.forEach(g => {
    if (oldGroup.has(g.id)) return;
    const sg = S.groups.find(x => x.id === g.id);
    const members = S.nodes.filter(n => n.parent === g.id);
    if (!members.length) return;
    let mnX=Infinity, mnY=Infinity, mxX=-Infinity, mxY=-Infinity;
    members.forEach(n => { const {w,h}=nodeSize(n); mnX=Math.min(mnX,n.x-w/2); mxX=Math.max(mxX,n.x+w/2); mnY=Math.min(mnY,n.y-h/2); mxY=Math.max(mxY,n.y+h/2); });
    const pad=30; sg.x=mnX-pad; sg.y=mnY-pad-26; sg.w=(mxX-mnX)+pad*2; sg.h=(mxY-mnY)+pad*2+26;
  });
  S.classDefs = {...newClassDefs};

  S.nextNodeNum = Math.max(S.nextNodeNum, 1 + S.nodes.reduce((m,n) => { const mm=n.id.match(/^n(\d+)$/); return mm?Math.max(m,parseInt(mm[1])):m; }, 0));
  S.nextGroupNum = Math.max(S.nextGroupNum, 1 + S.groups.reduce((m,g) => { const mm=g.id.match(/^g(\d+)$/); return mm?Math.max(m,parseInt(mm[1])):m; }, 0));
  S.selected = null; S.multiSelect.clear(); S.multiSelectEdges.clear();
  render();
  document.getElementById('statusText').textContent = `Applied source — ${S.nodes.length} node(s), ${S.edges.length} edge(s).`;
  return true;
}
