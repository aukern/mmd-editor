import { S } from './state.js';
import { nodeSize } from './utils.js';

// Use Dagre (same engine Mermaid uses) for proper graph layout.
// nodeMeta: Map<id, {label, shape, parent}> for sizing + subgraph membership.
// groups: array of {id, title} — used for dagre compound clustering.
export function layoutFromGraph(nodeIds, edgeList, dir, nodeMeta, groups) {
  if (typeof dagre === 'undefined') return fallbackLayout(nodeIds, edgeList, dir);

  try {
    // Dagre uses 'TB' for top-to-bottom; Mermaid/this app uses 'TD'
    const rankdir = dir === 'TD' ? 'TB' : dir;

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir, ranksep: 80, nodesep: 50, edgesep: 10, marginx: 40, marginy: 40, ranker: 'longest-path' });
    g.setDefaultEdgeLabel(() => ({}));

    // Split nodes into top-level (no parent) vs children.
    // Child nodes have no edges — putting them all in dagre causes ~20 leaf nodes
    // to collapse into rank 0 alongside the real structure.
    // Only layout top-level nodes; children inherit parent's position afterward.
    const childParent = new Map();
    nodeIds.forEach(id => {
      const meta = nodeMeta ? nodeMeta.get(id) : null;
      if (meta && meta.parent) childParent.set(id, meta.parent);
    });

    const topIds = nodeIds.filter(id => !childParent.has(id));
    const topSet = new Set(topIds);

    topIds.forEach(id => {
      const meta = nodeMeta ? nodeMeta.get(id) : null;
      const { w, h } = meta ? nodeSize(meta) : { w: 120, h: 40 };
      g.setNode(id, { width: w + 16, height: h + 8 });
    });

    // Add edges only between top-level nodes
    const seen = new Set();
    edgeList.forEach(e => {
      const from = topSet.has(e.from) ? e.from : null;
      const to   = topSet.has(e.to)   ? e.to   : null;
      if (!from || !to || from === to) return;
      const key = from + '\0' + to;
      if (seen.has(key)) return;
      seen.add(key);
      try { g.setEdge(from, to); } catch(_) {}
    });

    dagre.layout(g);

    const pos = {};
    topIds.forEach(id => {
      const n = g.node(id);
      pos[id] = n ? { x: n.x, y: n.y } : { x: 80, y: 80 };
    });

    // Place child nodes at their parent proxy's position.
    // fitGroupsToMembers() will then compute group bounding boxes around them.
    nodeIds.forEach(id => {
      if (pos[id]) return;
      const parentId = childParent.get(id);
      pos[id] = pos[parentId] ? { ...pos[parentId] } : { x: 80, y: 80 };
    });

    return pos;
  } catch(err) {
    console.error('[LAYOUT CRASH]', err.message);
    return fallbackLayout(nodeIds, edgeList, dir);
  }
}

// Simple fallback when dagre is unavailable
function fallbackLayout(nodeIds, edgeList, dir) {
  const incoming = new Map(nodeIds.map(id => [id, 0]));
  edgeList.forEach(e => incoming.set(e.to, (incoming.get(e.to)||0)+1));
  const level = new Map(nodeIds.map(id => [id, 0]));
  const queue = nodeIds.filter(id => !incoming.get(id));
  if (!queue.length && nodeIds[0]) queue.push(nodeIds[0]);
  const visited = new Set();
  while (queue.length) {
    const cur = queue.shift(); if (visited.has(cur)) continue; visited.add(cur);
    edgeList.filter(e => e.from === cur).forEach(e => { level.set(e.to, Math.max(level.get(e.to)||0, (level.get(cur)||0)+1)); queue.push(e.to); });
  }
  const byLevel = {};
  nodeIds.forEach(id => { const l = level.get(id)||0; (byLevel[l]=byLevel[l]||[]).push(id); });
  const lk = Object.keys(byLevel).map(Number).sort((a,b)=>a-b);
  const maxL = lk.length ? lk[lk.length-1] : 0;
  const pos = {};
  lk.forEach(l => {
    byLevel[l].forEach((id, i) => {
      const x = dir==='LR' ? 160+l*220 : dir==='RL' ? 160+(maxL-l)*220 : 100+i*120;
      const y = dir==='BT' ? 120+(maxL-l)*180 : dir==='LR'||dir==='RL' ? 100+i*120 : 120+l*180;
      pos[id] = { x, y };
    });
  });
  return pos;
}

export function fitGroupsToMembers() {
  S.groups.forEach(g => {
    const members = S.nodes.filter(n => n.parent === g.id);
    if (!members.length) { g.w=Math.max(g.w,200); g.h=Math.max(g.h,120); return; }
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
    members.forEach(n => { const {w,h}=nodeSize(n); mnX=Math.min(mnX,n.x-w/2); mxX=Math.max(mxX,n.x+w/2); mnY=Math.min(mnY,n.y-h/2); mxY=Math.max(mxY,n.y+h/2); });
    const pad=30; g.x=mnX-pad; g.y=mnY-pad-26; g.w=(mxX-mnX)+pad*2; g.h=(mxY-mnY)+pad*2+26;
  });
}

export function autoArrange() {
  const { pushUndo, fitAll } = window._editorUtils || {};
  if (pushUndo) pushUndo();
  const nodeMeta = new Map(S.nodes.map(n => [n.id, n]));
  const pos = layoutFromGraph(S.nodes.map(n=>n.id), S.edges, S.direction, nodeMeta, S.groups);
  S.nodes.forEach(n => { if(pos[n.id]){n.x=pos[n.id].x;n.y=pos[n.id].y;} });
  fitGroupsToMembers();
  const { render } = window._editorRender || {};
  if (render) render();
  if (fitAll) fitAll();
}
