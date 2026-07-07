import { S } from './state.js';
import { nodeSize, groupTitleHeight } from './utils.js';

// Use Dagre (same engine Mermaid uses) for proper graph layout.
// nodeMeta: Map<id, {label, shape, parent}> for sizing + subgraph membership.
// groups: array of {id, title} — used for dagre compound clustering.
export function layoutFromGraph(nodeIds, edgeList, dir, nodeMeta, groups) {
  if (typeof dagre === 'undefined') return fallbackLayout(nodeIds, edgeList, dir);

  try {
    const groupList = groups || [];
    const groupIds = new Set(groupList.map(g => g.id));
    const groupById = new Map(groupList.map(g => [g.id, g]));
    const pos = {};
    const containerRel = new Map();          // containerId (or null for root) -> Map<childId,{x,y}>
    const PAD = 30;

    // Parent of any id: a node's parent group, or a group's parent group (nesting).
    const parentOf = (id) => {
      if (groupById.has(id)) return groupById.get(id).parent || null;
      const meta = nodeMeta ? nodeMeta.get(id) : null;
      return (meta && meta.parent && groupIds.has(meta.parent)) ? meta.parent : null;
    };
    const isDescOrSelf = (id, anc) => { let c = id; while (c != null) { if (c === anc) return true; c = parentOf(c); } return false; };
    // The direct child of `containerId` that contains `id` (or id itself), else null.
    const childOfContainer = (id, containerId) => { let c = id; while (c != null) { const p = parentOf(c); if (p === containerId) return c; c = p; } return null; };
    const sizeOf = (id) => {
      if (groupIds.has(id)) { const g = groupById.get(id); return { w: g.w || 200, h: g.h || 120 }; }
      const meta = nodeMeta ? nodeMeta.get(id) : null;
      const { w, h } = meta ? nodeSize(meta) : { w: 120, h: 40 };
      return { w: w + 16, h: h + 8 };
    };

    function runDagre(ids, edges, thisRankdir, sizeForId, spacing) {
      const g = new dagre.graphlib.Graph();
      g.setGraph({
        rankdir: thisRankdir,
        ranksep: spacing?.ranksep || 80,
        nodesep: spacing?.nodesep || 50,
        edgesep: 10,
        marginx: spacing?.marginx || 40,
        marginy: spacing?.marginy || 40,
        ranker: 'longest-path'
      });
      g.setDefaultEdgeLabel(() => ({}));
      ids.forEach(id => { const { w, h } = sizeForId(id); g.setNode(id, { width: w, height: h }); });
      const idSet = new Set(ids), seen = new Set();
      edges.forEach(e => {
        if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to) return;
        const key = e.from + '\0' + e.to; if (seen.has(key)) return; seen.add(key);
        g.setEdge(e.from, e.to);
      });
      dagre.layout(g);
      const out = {};
      ids.forEach(id => { const n = g.node(id); out[id] = n ? { x: n.x, y: n.y } : { x: 80, y: 80 }; });
      return out;
    }

    // Bottom-up sizing: lay out a container's direct children (nodes + child
    // group boxes), sizing nested groups first. Records child centres relative
    // to the container's top-left and sets the container group's w/h.
    function layoutContainer(containerId) {
      const TITLE_H = containerId === null ? 26 : groupTitleHeight(groupById.get(containerId).title);
      const childNodes = nodeIds.filter(id => parentOf(id) === containerId);
      const childGroups = groupList.filter(g => (g.parent || null) === containerId);
      childGroups.forEach(cg => layoutContainer(cg.id));   // size children first

      const layoutIds = [...childNodes, ...childGroups.map(g => g.id)];
      if (!layoutIds.length) {
        containerRel.set(containerId, new Map());
        if (containerId !== null) { const g = groupById.get(containerId); const titleW = Math.max(200, (g.title || g.id).length * 8 + 60); g.w = Math.max(g.w || 0, titleW); g.h = Math.max(g.h || 0, 120); }
        return;
      }

      // Edges between direct children (remapping deep endpoints up to this level).
      const seen = new Set();
      let edges = [];
      edgeList.forEach(e => {
        const f = childOfContainer(e.from, containerId), t = childOfContainer(e.to, containerId);
        if (!f || !t || f === t) return;
        const key = f + '\0' + t; if (seen.has(key)) return; seen.add(key);
        edges.push({ from: f, to: t });
      });
      // Inside a subgraph with no internal edges, chain children so they stack.
      if (!edges.length && containerId !== null && layoutIds.length > 1) {
        edges = layoutIds.slice(0, -1).map((id, i) => ({ from: id, to: layoutIds[i + 1] }));
      }

      // Mermaid ignores a subgraph's own `direction` when it connects to anything
      // outside itself — then it inherits the parent direction.
      let containerDir;
      if (containerId === null) containerDir = dir;
      else {
        const g = groupById.get(containerId);
        const crosses = edgeList.some(e => isDescOrSelf(e.from, containerId) !== isDescOrSelf(e.to, containerId));
        containerDir = crosses ? dir : (g.direction || dir);
      }
      const rankdir = containerDir === 'TD' ? 'TB' : containerDir;
      const spacing = containerId === null ? {} : { ranksep: 55, nodesep: 35, marginx: 20, marginy: 20 };

      const p = runDagre(layoutIds, edges, rankdir, sizeOf, spacing);

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      layoutIds.forEach(id => { const { w, h } = sizeOf(id); const c = p[id]; minX = Math.min(minX, c.x - w / 2); maxX = Math.max(maxX, c.x + w / 2); minY = Math.min(minY, c.y - h / 2); maxY = Math.max(maxY, c.y + h / 2); });

      const rel = new Map();
      layoutIds.forEach(id => { const c = p[id]; rel.set(id, { x: (c.x - minX) + PAD, y: (c.y - minY) + PAD + TITLE_H }); });
      containerRel.set(containerId, rel);

      if (containerId !== null) {
        const g = groupById.get(containerId);
        const titleW = Math.max(200, (g.title || g.id).length * 8 + 60);
        g.w = Math.max(titleW, (maxX - minX) + PAD * 2);
        g.h = Math.max(120, (maxY - minY) + PAD * 2 + TITLE_H);
      }
    }

    layoutContainer(null);

    // Top-down placement: resolve relative centres to absolute, positioning each
    // group box then recursing into its content.
    function place(containerId, originX, originY) {
      const rel = containerRel.get(containerId);
      if (!rel) return;
      rel.forEach((r, id) => {
        const cx = originX + r.x, cy = originY + r.y;
        if (groupIds.has(id)) {
          const g = groupById.get(id);
          g.x = cx - g.w / 2; g.y = cy - g.h / 2;
          place(id, g.x, g.y);
        } else {
          pos[id] = { x: cx, y: cy };
        }
      });
    }
    place(null, 0, 0);

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
  const byId = new Map(S.groups.map(g => [g.id, g]));
  const depth = (g) => { let d = 0, cur = g.parent; while (cur) { d++; cur = byId.get(cur)?.parent; } return d; };
  // Fit deepest groups first so a parent sees its children's final boxes.
  const ordered = [...S.groups].sort((a, b) => depth(b) - depth(a));
  const pad = 30;
  ordered.forEach(g => {
    const titleH = groupTitleHeight(g.title);
    const memberNodes = S.nodes.filter(n => n.parent === g.id);
    const childGroups = S.groups.filter(x => x.parent === g.id);
    if (!memberNodes.length && !childGroups.length) { g.w = Math.max(g.w, 200); g.h = Math.max(g.h, 120); return; }
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    memberNodes.forEach(n => { const { w, h } = nodeSize(n); mnX = Math.min(mnX, n.x - w/2); mxX = Math.max(mxX, n.x + w/2); mnY = Math.min(mnY, n.y - h/2); mxY = Math.max(mxY, n.y + h/2); });
    childGroups.forEach(cg => { mnX = Math.min(mnX, cg.x); mxX = Math.max(mxX, cg.x + cg.w); mnY = Math.min(mnY, cg.y); mxY = Math.max(mxY, cg.y + cg.h); });
    g.x = mnX - pad; g.y = mnY - pad - titleH; g.w = (mxX - mnX) + pad*2; g.h = (mxY - mnY) + pad*2 + titleH;
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
