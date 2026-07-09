import { S } from './state.js';
import { makeSVG, nodeSize, edgeAnchor, getPortPositions, getGroupPortPositions, groupTitleHeight, applyTransform } from './utils.js';
import { edgeStyles, edgeTokens } from './constants.js';

// ── Shape element builder ─────────────────────────────────────────────────────
function poly(pts) {
  const el = makeSVG('polygon');
  el.setAttribute('points', pts.map(p => p.join(',')).join(' '));
  el.setAttribute('class', 'shape'); return el;
}

export function shapeEl(n, w, h) {
  const hw = w/2, hh = h/2; let el, g;
  switch (n.shape) {
    case 'rect': el = makeSVG('rect'); el.setAttribute('x',-hw); el.setAttribute('y',-hh); el.setAttribute('width',w); el.setAttribute('height',h); el.setAttribute('class','shape'); return el;
    case 'rounded': el = makeSVG('rect'); el.setAttribute('x',-hw); el.setAttribute('y',-hh); el.setAttribute('width',w); el.setAttribute('height',h); el.setAttribute('rx',8); el.setAttribute('class','shape'); return el;
    case 'stadium': el = makeSVG('rect'); el.setAttribute('x',-hw); el.setAttribute('y',-hh); el.setAttribute('width',w); el.setAttribute('height',h); el.setAttribute('rx',hh); el.setAttribute('class','shape'); return el;
    case 'subroutine': { g = makeSVG('g'); const r = makeSVG('rect'); r.setAttribute('x',-hw); r.setAttribute('y',-hh); r.setAttribute('width',w); r.setAttribute('height',h); r.setAttribute('class','shape'); g.appendChild(r); [-hw+8, hw-8].forEach(lx=>{ const ln=makeSVG('line'); ln.setAttribute('x1',lx); ln.setAttribute('y1',-hh); ln.setAttribute('x2',lx); ln.setAttribute('y2',hh); ln.setAttribute('stroke','#ae9026'); ln.setAttribute('stroke-width','1.5'); g.appendChild(ln); }); return g; }
    case 'cylinder': { const capH=10; g=makeSVG('g'); const path=makeSVG('path'); path.setAttribute('d',`M${-hw},${-hh+capH} A${hw},${capH} 0 0 1 ${hw},${-hh+capH} L${hw},${hh-capH} A${hw},${capH} 0 0 1 ${-hw},${hh-capH} Z`); path.setAttribute('class','shape'); g.appendChild(path); const cap=makeSVG('ellipse'); cap.setAttribute('cx',0); cap.setAttribute('cy',-hh+capH); cap.setAttribute('rx',hw); cap.setAttribute('ry',capH); cap.setAttribute('fill','none'); cap.setAttribute('stroke','#ae9026'); cap.setAttribute('stroke-width','1.5'); g.appendChild(cap); return g; }
    case 'circle': el = makeSVG('ellipse'); el.setAttribute('cx',0); el.setAttribute('cy',0); el.setAttribute('rx',hw); el.setAttribute('ry',hh); el.setAttribute('class','shape'); return el;
    case 'doubleCircle': { g=makeSVG('g'); const oc=makeSVG('ellipse'); oc.setAttribute('cx',0); oc.setAttribute('cy',0); oc.setAttribute('rx',hw); oc.setAttribute('ry',hh); oc.setAttribute('class','shape'); g.appendChild(oc); const ic=makeSVG('ellipse'); ic.setAttribute('cx',0); ic.setAttribute('cy',0); ic.setAttribute('rx',hw-6); ic.setAttribute('ry',hh-6); ic.setAttribute('fill','none'); ic.setAttribute('stroke','#ae9026'); ic.setAttribute('stroke-width','1.5'); g.appendChild(ic); return g; }
    case 'asymmetric': return poly([[-hw,-hh],[hw-10,-hh],[hw,0],[hw-10,hh],[-hw,hh]]);
    case 'rhombus': return poly([[0,-hh],[hw,0],[0,hh],[-hw,0]]);
    case 'hexagon': return poly([[-hw+10,-hh],[hw-10,-hh],[hw,0],[hw-10,hh],[-hw+10,hh],[-hw,0]]);
    case 'parallelogram': return poly([[-hw+14,-hh],[hw,-hh],[hw-14,hh],[-hw,hh]]);
    case 'parallelogramAlt': return poly([[-hw,-hh],[hw-14,-hh],[hw,hh],[-hw+14,hh]]);
    case 'trapezoid': return poly([[-hw+14,-hh],[hw-14,-hh],[hw,hh],[-hw,hh]]);
    case 'trapezoidAlt': return poly([[-hw,-hh],[hw,-hh],[hw-14,hh],[-hw+14,hh]]);
    case 'delay': { const r2=hh*0.85; el=makeSVG('path'); el.setAttribute('d',`M${-hw},${-hh} L${hw-r2},${-hh} A${r2},${hh} 0 0 1 ${hw-r2},${hh} L${-hw},${hh} Z`); el.setAttribute('class','shape'); return el; }
    case 'manualInput': return poly([[-hw,-hh+14],[hw,-hh],[hw,hh],[-hw,hh]]);
    case 'doc': { g=makeSVG('g'); el=makeSVG('path'); const wH=10; el.setAttribute('d',`M${-hw},${-hh} L${hw},${-hh} L${hw},${hh-wH} Q${hw*0.5},${hh+wH} 0,${hh-wH} Q${-hw*0.5},${hh-wH*2.5} ${-hw},${hh-wH} Z`); el.setAttribute('class','shape'); g.appendChild(el); return g; }
    case 'display': { const arc=hh*0.8; el=makeSVG('path'); el.setAttribute('d',`M${-hw},${-hh} L${hw-arc},${-hh} A${arc},${hh} 0 0 1 ${hw-arc},${hh} L${-hw},${hh} L${-hw+12},0 Z`); el.setAttribute('class','shape'); return el; }
    case 'hourglass': return poly([[-hw,-hh],[hw,-hh],[0,0],[hw,hh],[-hw,hh],[0,0]]);
    default: el = makeSVG('rect'); el.setAttribute('x',-hw); el.setAttribute('y',-hh); el.setAttribute('width',w); el.setAttribute('height',h); el.setAttribute('class','shape'); return el;
  }
}

function markerUrl(type, sel) {
  if (type === 'none') return 'none';
  const s = sel ? '-sel' : '';
  if (type === 'arrow') return `url(#mk-arrow${s})`;
  if (type === 'circle') return `url(#mk-circle${s})`;
  if (type === 'cross') return `url(#mk-cross${s})`;
  return 'none';
}

function renderTextLines(parent, label, lineH) {
  const lines = (label || 'Node').split('\n');
  if (lines.length === 1) {
    const t = makeSVG('text'); t.setAttribute('dominant-baseline','middle'); t.textContent = label; parent.appendChild(t);
  } else {
    const startY = -(lines.length - 1) * lineH / 2;
    lines.forEach((ln, i) => { const t = makeSVG('text'); t.setAttribute('y', startY + i * lineH); t.setAttribute('dominant-baseline','middle'); t.textContent = ln; parent.appendChild(t); });
  }
}

export function clearPorts() {
  const p = document.getElementById('portsLayer'); if (p) p.innerHTML = '';
}

// A port belongs to a node OR a group — the id is opaque to the drag machinery,
// so the same circle handler drives both (see events.js handlePortMousedown).
function drawPort(pos, id, onPortMousedown) {
  const c = makeSVG('circle');
  c.setAttribute('cx', pos.x); c.setAttribute('cy', pos.y); c.setAttribute('r', 9);
  c.setAttribute('class', 'port-handle');
  c.addEventListener('mouseenter', () => clearTimeout(S.portHideTimer));
  c.addEventListener('mouseleave', () => {
    if (!S.portDrag) { S.portHideTimer = setTimeout(hoverPortTimeout, 300); }
  });
  if (onPortMousedown) c.addEventListener('mousedown', ev => onPortMousedown(ev, id, pos));
  document.getElementById('portsLayer').appendChild(c);
}

export function renderPorts(nodeId, { onPortMousedown } = {}) {
  clearPorts();
  if (!nodeId || S.connectMode) return;
  const n = S.nodes.find(x => x.id === nodeId); if (!n) return;
  getPortPositions(n).forEach(pos => drawPort(pos, nodeId, onPortMousedown));
}

export function renderGroupPorts(groupId, { onPortMousedown } = {}) {
  clearPorts();
  if (!groupId || S.connectMode) return;
  const g = S.groups.find(x => x.id === groupId); if (!g) return;
  getGroupPortPositions(g).forEach(pos => drawPort(pos, groupId, onPortMousedown));
}

// Shared hover-out: clear hover state, but keep a selected group's ports up so
// its side/bottom ports stay grabbable (the box interior is click-through, so
// pure hover can't hold them while the cursor crosses child nodes).
function hoverPortTimeout() {
  S.hoveredNodeId = null; S.hoveredGroupId = null;
  if (S.selected && S.selected.type === 'group' && !S.portDrag && !S.connectMode) {
    const { onPortMousedown } = window._editorPortHandlers || {};
    renderGroupPorts(S.selected.id, { onPortMousedown });
  } else {
    clearPorts();
  }
}

// Shared click-to-connect handler used by both node and group mousedown in
// connect mode. `center` supplies the ghost-line origin ({x,y}).
function connectModeClick(id, label, center) {
  const { addEdge } = window._editorMutations || {};
  if (!S.connectFrom) {
    S.connectFrom = id;
    document.getElementById('statusText').textContent = `Click target (from: "${label}")`;
    const { spawnConnectGhost } = window._editorEvents || {};
    if (spawnConnectGhost) spawnConnectGhost(center);
  } else if (S.connectFrom !== id) {
    const { pushUndo } = window._editorUtils || {};
    if (pushUndo) pushUndo();
    if (addEdge) addEdge(S.connectFrom, id, '', document.getElementById('arrowSelect').value);
    if (S.connectGhost && S.connectGhost.parentNode) S.connectGhost.parentNode.removeChild(S.connectGhost);
    S.connectGhost = null;
    S.connectFrom = null;
    S.connectMode = false;
    document.getElementById('connectBtn').classList.remove('active');
    document.getElementById('statusText').textContent = 'Connected.';
    render();
  }
}

// ── Mermaid output ────────────────────────────────────────────────────────────
function labelForMmd(lbl) { return (lbl || '').replace(/\n/g, '<br/>'); }
function shapeToken(n) {
  const L = labelForMmd(n.label);
  switch (n.shape) {
    case 'rect': return `${n.id}["${L}"]`; case 'rounded': return `${n.id}("${L}")`;
    case 'stadium': return `${n.id}(["${L}"])`; case 'subroutine': return `${n.id}[["${L}"]]`;
    case 'cylinder': return `${n.id}[("${L}")]`; case 'circle': return `${n.id}(("${L}"))`;
    case 'doubleCircle': return `${n.id}((("${L}")))`; case 'asymmetric': return `${n.id}>"${L}"]`;
    case 'rhombus': return `${n.id}{"${L}"}`; case 'hexagon': return `${n.id}{{"${L}"}}`;
    case 'parallelogram': return `${n.id}[/"${L}"/]`; case 'parallelogramAlt': return `${n.id}[\\"${L}"\\]`;
    case 'trapezoid': return `${n.id}[/"${L}"\\]`; case 'trapezoidAlt': return `${n.id}[\\"${L}"/]`;
    case 'delay': return `${n.id}@{ shape: delay, label: "${L}" }`;
    case 'manualInput': return `${n.id}@{ shape: manual-input, label: "${L}" }`;
    case 'doc': return `${n.id}@{ shape: doc, label: "${L}" }`;
    case 'display': return `${n.id}@{ shape: display, label: "${L}" }`;
    case 'hourglass': return `${n.id}@{ shape: hourglass, label: "${L}" }`;
    default: return `${n.id}["${L}"]`;
  }
}

export function getMermaidText() {
  const lines = ['flowchart ' + S.direction];
  // Records the 0-based line range each element occupies, so the source panel
  // can highlight the selected node/edge/group (see ui/source.js).
  const map = {};
  Object.entries(S.classDefs).forEach(([name, cd]) => {
    const props = []; if (cd.fill) props.push('fill:'+cd.fill); if (cd.stroke) props.push('stroke:'+cd.stroke); if (cd.color) props.push('color:'+cd.color);
    lines.push(`    classDef ${name} ${props.join(',')}`);
  });
  // Emit subgraphs recursively so nested groups round-trip as nested subgraphs.
  const emitGroup = (g, depth) => {
    const ind = '    '.repeat(depth);
    const start = lines.length;
    lines.push(`${ind}subgraph ${g.id}["${labelForMmd(g.title)}"]`);
    if (g.direction) lines.push(`${ind}    direction ${g.direction}`);
    S.nodes.filter(n => n.parent === g.id).forEach(n => { map['node:'+n.id] = [lines.length, lines.length]; lines.push(`${ind}    ` + shapeToken(n)); });
    S.groups.filter(cg => (cg.parent || null) === g.id).forEach(cg => emitGroup(cg, depth + 1));
    lines.push(`${ind}end`);
    map['group:'+g.id] = [start, lines.length - 1];
  };
  S.groups.filter(g => !g.parent).forEach(g => emitGroup(g, 1));
  S.nodes.filter(n => !n.parent).forEach(n => { map['node:'+n.id] = [lines.length, lines.length]; lines.push('    ' + shapeToken(n)); });
  S.edges.forEach(e => {
    const tok = edgeTokens[e.type] || '-->';
    map['edge:'+e.id] = [lines.length, lines.length];
    lines.push(e.label ? `    ${e.from} ${tok}|${labelForMmd(e.label)}| ${e.to}` : `    ${e.from} ${tok} ${e.to}`);
  });
  S.nodes.forEach(n => {
    if (n.style) { const props = []; if (n.style.fill) props.push('fill:'+n.style.fill); if (n.style.stroke) props.push('stroke:'+n.style.stroke); if (n.style.color) props.push('color:'+n.style.color); if (props.length) lines.push(`    style ${n.id} ${props.join(',')}`); }
  });
  S.nodes.forEach(n => { (n.classes||[]).forEach(cls => lines.push(`    class ${n.id} ${cls}`)); });
  S.sourceLineMap = map;
  return lines.join('\n');
}

// The authoritative source text: raw diagram in view mode, else the serialized
// flowchart model. Used by autosave, snapshots, and the diff panel.
export function getCurrentSource() {
  return S.viewMode ? (S.rawText || '') : getMermaidText();
}

export function updateMermaidOutput() {
  if (S.viewMode) return;   // in view mode the textarea holds the raw source; don't overwrite it
  // The source panel is now editable — never clobber a textarea the user is
  // actively typing in. Keep both the sidebar and the expanded editor in sync.
  const txt = getMermaidText();
  S.lastMmd = txt;
  const out = document.getElementById('mmdOut');
  if (out && document.activeElement !== out) out.value = txt;
  const big = document.getElementById('mmdOutBig');
  const modal = document.getElementById('sourceModal');
  if (big && modal && modal.classList.contains('open') && document.activeElement !== big) big.value = txt;
}

export function updatePropsPanel() {
  // The Properties panel is now a persistent, collapsible section — its
  // collapsed/expanded state is user-controlled, so we only update its contents
  // here (never show/hide the whole section based on selection).
  const nodeProps = document.getElementById('nodeProps');
  const edgeProps = document.getElementById('edgeProps');
  const groupProps = document.getElementById('groupProps');
  const noSel = document.getElementById('noSelMsg');
  const propTitle = document.getElementById('propTitle');
  if (!nodeProps || !edgeProps || !groupProps) return;
  nodeProps.style.display = 'none'; edgeProps.style.display = 'none'; groupProps.style.display = 'none';
  if (noSel) noSel.style.display = 'none';
  if (S.selected && S.selected.type === 'node') {
    const n = S.nodes.find(x => x.id === S.selected.id); if (!n) return;
    if (propTitle) propTitle.textContent = 'Node';
    nodeProps.style.display = 'block';
    document.getElementById('propNodeId').value = n.id;
    document.getElementById('propNodeLabel').value = n.label.replace(/\n/g, '\\n');
    document.getElementById('propShapeSelect').value = n.shape;
    document.getElementById('propFill').value = (n.style && n.style.fill) || '#33343d';
    document.getElementById('propStroke').value = (n.style && n.style.stroke) || '#ae9026';
    document.getElementById('propTextColor').value = (n.style && n.style.color) || '#e6e6ea';
    const cdKeys = Object.keys(S.classDefs);
    const checks = document.getElementById('classChecks'), list = document.getElementById('classCheckList');
    if (cdKeys.length) {
      checks.style.display = 'block'; list.innerHTML = '';
      cdKeys.forEach(cls => {
        const row = document.createElement('div'); row.className = 'class-check-row';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = (n.classes||[]).includes(cls);
        cb.addEventListener('change', () => {
          const { pushUndo } = window._editorUtils || {};
          if (pushUndo) pushUndo();
          n.classes = n.classes || [];
          if (cb.checked) { if (!n.classes.includes(cls)) n.classes.push(cls); } else n.classes = n.classes.filter(c => c !== cls);
          render();
        });
        row.appendChild(cb); const lbl = document.createElement('span'); lbl.textContent = cls; row.appendChild(lbl); list.appendChild(row);
      });
    } else checks.style.display = 'none';
  } else if (S.selected && S.selected.type === 'edge') {
    const e = S.edges.find(x => x.id === S.selected.id); if (!e) return;
    if (propTitle) propTitle.textContent = 'Edge'; edgeProps.style.display = 'block';
    document.getElementById('propEdgeType').value = e.type; document.getElementById('propEdgeLabel').value = e.label;
  } else if (S.selected && S.selected.type === 'group') {
    const g = S.groups.find(x => x.id === S.selected.id); if (!g) return;
    if (propTitle) propTitle.textContent = 'Group'; groupProps.style.display = 'block';
    document.getElementById('propGroupTitle').value = g.title; document.getElementById('propGroupDir').value = g.direction || '';
  } else if (S.multiSelect.size > 0) {
    if (propTitle) propTitle.textContent = 'Properties';
    if (noSel) { noSel.style.display = 'block'; noSel.textContent = `${S.multiSelect.size} nodes selected.`; }
  } else {
    if (propTitle) propTitle.textContent = 'Properties';
    if (noSel) { noSel.style.display = 'block'; noSel.textContent = 'No selection.'; }
  }
}

export function updateClassDefList() {
  const list = document.getElementById('classDefList'); list.innerHTML = '';
  Object.entries(S.classDefs).forEach(([name, cd]) => {
    const row = document.createElement('div'); row.className = 'classdef-item';
    const sw = document.createElement('div'); sw.className = 'cd-swatch'; sw.style.background = cd.fill||'#444'; sw.style.borderColor = cd.stroke||'#888'; row.appendChild(sw);
    const nm = document.createElement('span'); nm.className = 'cd-name'; nm.textContent = name; row.appendChild(nm);
    const del = document.createElement('button'); del.textContent = '✕';
    del.addEventListener('click', () => {
      const { pushUndo } = window._editorUtils || {};
      if (pushUndo) pushUndo();
      delete S.classDefs[name];
      S.nodes.forEach(n => { n.classes = (n.classes||[]).filter(c => c !== name); });
      render();
    });
    row.appendChild(del); list.appendChild(row);
  });
}

export function updateUndoRedo() {
  document.getElementById('undoBtn').disabled = !S.undoStack.length;
  document.getElementById('redoBtn').disabled = !S.redoStack.length;
}

// ── Main render ───────────────────────────────────────────────────────────────
export function render() {
  if (S.viewMode) return;   // view mode renders via Mermaid (viewmode.js), not the editable canvas
  const groupsLayer = document.getElementById('groupsLayer');
  const edgesLayer = document.getElementById('edgesLayer');
  const nodesLayer = document.getElementById('nodesLayer');
  const portsLayer = document.getElementById('portsLayer');
  const overlayLayer = document.getElementById('overlayLayer');
  groupsLayer.innerHTML = ''; edgesLayer.innerHTML = ''; nodesLayer.innerHTML = ''; portsLayer.innerHTML = '';

  // GROUPS
  S.groups.forEach(g => {
    const grp = makeSVG('g');
    const rect = makeSVG('rect');
    rect.setAttribute('x',g.x); rect.setAttribute('y',g.y); rect.setAttribute('width',g.w); rect.setAttribute('height',g.h); rect.setAttribute('rx',8);
    rect.setAttribute('class','group-rect'+(S.selected && S.selected.type==='group' && S.selected.id===g.id ? ' selected' : ''));
    rect.style.pointerEvents = 'none'; grp.appendChild(rect);
    const tb = makeSVG('rect');
    tb.setAttribute('x',g.x); tb.setAttribute('y',g.y); tb.setAttribute('width',g.w); tb.setAttribute('height',groupTitleHeight(g.title)); tb.setAttribute('rx',8);
    tb.setAttribute('class','group-title-bar');
    tb.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      if (ev.detail >= 2) return;
      if (S.connectMode) { connectModeClick(g.id, g.title, {x: g.x+g.w/2, y: g.y+g.h/2}); return; }
      const { pushUndo, svgPoint: sp } = window._editorUtils || {};
      if (pushUndo) pushUndo();
      S.selected = {type:'group', id:g.id};
      const pt = sp ? sp(ev) : {x:0,y:0};
      // Moving a group carries all descendant groups and their nodes with it.
      const descGroupIds = new Set();
      const stack = [g.id];
      while (stack.length) { const cur = stack.pop(); S.groups.forEach(x => { if ((x.parent||null)===cur && !descGroupIds.has(x.id)) { descGroupIds.add(x.id); stack.push(x.id); } }); }
      const groupOrig = [...descGroupIds].map(id => { const cg = S.groups.find(x=>x.id===id); return {id, x:cg.x, y:cg.y}; });
      const containerIds = new Set([g.id, ...descGroupIds]);
      const members = S.nodes.filter(n => containerIds.has(n.parent)).map(n => ({id:n.id, x:n.x, y:n.y}));
      S.groupDrag = {id:g.id, mode:'move', startPX:pt.x, startPY:pt.y, orig:{x:g.x,y:g.y,w:g.w,h:g.h}, memberOrig:members, groupOrig};
      render();
    });
    // Hovering the title bar reveals connection ports around the whole group box
    // (the box interior stays click-through so child nodes remain interactive).
    tb.addEventListener('mouseenter', () => {
      clearTimeout(S.portHideTimer);
      if (!S.drag && !S.portDrag && !S.groupDrag && !S.connectMode) {
        S.hoveredGroupId = g.id; S.hoveredNodeId = null;
        const { onPortMousedown } = window._editorPortHandlers || {};
        renderGroupPorts(g.id, { onPortMousedown });
      }
    });
    tb.addEventListener('mouseleave', () => {
      if (S.portDrag) return;
      S.portHideTimer = setTimeout(hoverPortTimeout, 300);
    });
    tb.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      const { activateInline, scheduleSnapshot } = window._editorInline || {};
      if (activateInline) activateInline(g.x*S.zoom+S.panX+g.w*S.zoom/2, g.y*S.zoom+S.panY+14*S.zoom, g.title, g.w*S.zoom, val => {
        if (val.trim()) { const { pushUndo } = window._editorUtils||{}; if(pushUndo)pushUndo(); g.title=val.trim(); render(); const { countMutation } = window._editorHistory||{}; if(countMutation)countMutation(); }
      });
    });
    grp.appendChild(tb);
    (g.title || '').split('\n').forEach((ln, i) => { const ttxt = makeSVG('text'); ttxt.setAttribute('x',g.x+10); ttxt.setAttribute('y',g.y+16+i*16); ttxt.setAttribute('class','group-title-text'); ttxt.textContent = ln; grp.appendChild(ttxt); });
    const handle = makeSVG('rect');
    handle.setAttribute('x',g.x+g.w-12); handle.setAttribute('y',g.y+g.h-12); handle.setAttribute('width',12); handle.setAttribute('height',12); handle.setAttribute('class','group-resize');
    handle.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      const { pushUndo, svgPoint: sp } = window._editorUtils || {};
      if (pushUndo) pushUndo();
      S.selected = {type:'group', id:g.id};
      const pt = sp ? sp(ev) : {x:0,y:0};
      S.groupDrag = {id:g.id, mode:'resize', startPX:pt.x, startPY:pt.y, orig:{x:g.x,y:g.y,w:g.w,h:g.h}, memberOrig:[]};
      render();
    });
    grp.appendChild(handle);
    grp.addEventListener('click', ev => { ev.stopPropagation(); if (S.connectMode) return; S.selected={type:'group',id:g.id}; render(); });
    groupsLayer.appendChild(grp);
  });

  // EDGES
  S.edges.forEach(e => {
    let from = S.nodes.find(n => n.id === e.from);
    let to   = S.nodes.find(n => n.id === e.to);
    // Fall back to group box center when endpoint is a subgraph, not a leaf node
    if (!from) { const g = S.groups.find(g => g.id === e.from); if (g) from = { x: g.x+g.w/2, y: g.y+g.h/2, label: g.title||'', shape: 'rect', _w: g.w, _h: g.h }; }
    if (!to)   { const g = S.groups.find(g => g.id === e.to);   if (g) to   = { x: g.x+g.w/2, y: g.y+g.h/2, label: g.title||'', shape: 'rect', _w: g.w, _h: g.h }; }
    if (!from || !to) return;
    const style = edgeStyles[e.type] || edgeStyles['arrow'];
    const isSel = (S.selected && S.selected.type==='edge' && S.selected.id===e.id) || S.multiSelectEdges.has(e.id);
    const dx = to.x-from.x, dy = to.y-from.y;
    const p1 = edgeAnchor(from,dx,dy), p2 = edgeAnchor(to,-dx,-dy);
    const hit = makeSVG('line');
    hit.setAttribute('x1',p1.x); hit.setAttribute('y1',p1.y); hit.setAttribute('x2',p2.x); hit.setAttribute('y2',p2.y);
    hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width',14); hit.style.cursor='pointer';
    hit.addEventListener('mousedown', ev => ev.stopPropagation());
    hit.addEventListener('click', ev => {
      ev.stopPropagation();
      if (ev.detail >= 2) return;
      if (ev.shiftKey) {
        if (S.multiSelectEdges.has(e.id)) S.multiSelectEdges.delete(e.id);
        else S.multiSelectEdges.add(e.id);
        S.selected = null; render(); return;
      }
      S.selected = {type:'edge', id:e.id}; S.multiSelect.clear(); S.multiSelectEdges.clear(); render();
    });
    hit.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
      const screenX = mx*S.zoom+S.panX, screenY = my*S.zoom+S.panY;
      const { activateInline, scheduleSnapshot } = window._editorInline || {};
      if (activateInline) activateInline(screenX, screenY, e.label, 140, val => {
        const { pushUndo } = window._editorUtils||{}; if(pushUndo)pushUndo();
        e.label = val; render(); const { countMutation: cm2 } = window._editorHistory||{}; if(cm2)cm2();
      });
    });
    edgesLayer.appendChild(hit);
    const line = makeSVG('line');
    line.setAttribute('x1',p1.x); line.setAttribute('y1',p1.y); line.setAttribute('x2',p2.x); line.setAttribute('y2',p2.y);
    line.setAttribute('stroke', isSel ? '#d2b74d' : '#c7c7d1');
    line.setAttribute('stroke-width', style.thick ? (isSel?5:4) : (isSel?2.5:1.5));
    if (style.dash) line.setAttribute('stroke-dasharray','6,4');
    if (style.mEnd !== 'none') line.setAttribute('marker-end', markerUrl(style.mEnd, isSel));
    if (style.mStart !== 'none') line.setAttribute('marker-start', markerUrl(style.mStart, isSel));
    line.style.pointerEvents = 'none';
    edgesLayer.appendChild(line);
    if (e.label) {
      const mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2;
      const elines = e.label.split('\n'), lineH = 14;
      const maxLen = Math.max(...elines.map(l => l.length));
      const bw = maxLen*6.5+10, bh = elines.length*lineH + 4;
      const bg = makeSVG('rect'); bg.setAttribute('x',mx-bw/2); bg.setAttribute('y',my-bh/2); bg.setAttribute('width',bw); bg.setAttribute('height',bh); bg.setAttribute('rx',3); bg.setAttribute('class','edge-label-bg'); bg.style.pointerEvents='none'; edgesLayer.appendChild(bg);
      const startY = my - (elines.length-1)*lineH/2;
      elines.forEach((ln,i) => { const txt = makeSVG('text'); txt.setAttribute('x',mx); txt.setAttribute('y',startY+i*lineH); txt.setAttribute('class','edge-label-text'); txt.textContent=ln; edgesLayer.appendChild(txt); });
    }
  });

  // NODES
  S.nodes.forEach(n => {
    const {w,h} = nodeSize(n);
    const isSel = (S.selected && S.selected.type==='node' && S.selected.id===n.id) || S.multiSelect.has(n.id);
    const g = makeSVG('g');
    g.setAttribute('class', 'node' + (isSel ? ' selected' : ''));
    g.setAttribute('transform', `translate(${n.x},${n.y})`);
    g.style.cursor = S.connectMode ? 'crosshair' : 'grab';
    const sp = shapeEl(n,w,h); g.appendChild(sp);
    let fillV=null, strokeV=null, colorV=null;
    (n.classes||[]).forEach(cls => { const cd=S.classDefs[cls]; if(cd){if(!fillV&&cd.fill)fillV=cd.fill;if(!strokeV&&cd.stroke)strokeV=cd.stroke;if(!colorV&&cd.color)colorV=cd.color;} });
    if (n.style) { if(n.style.fill)fillV=n.style.fill; if(n.style.stroke)strokeV=n.style.stroke; if(n.style.color)colorV=n.style.color; }
    if (fillV || strokeV) { g.querySelectorAll('.shape').forEach(el => { if(fillV)el.style.fill=fillV; if(strokeV)el.style.stroke=strokeV; }); }
    const tg = makeSVG('g'); renderTextLines(tg, n.label, 16);
    if (colorV) tg.querySelectorAll('text').forEach(t => t.style.fill=colorV);
    g.appendChild(tg);

    g.addEventListener('mouseenter', () => {
      clearTimeout(S.portHideTimer);
      if (!S.drag && !S.portDrag && !S.connectMode) {
        S.hoveredNodeId = n.id;
        const { onPortMousedown } = window._editorPortHandlers || {};
        renderPorts(n.id, { onPortMousedown });
      }
    });
    g.addEventListener('mouseleave', () => {
      if (S.portDrag) return;
      S.portHideTimer = setTimeout(hoverPortTimeout, 300);
    });

    g.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      if (ev.detail >= 2) return;
      if (S.connectMode) { connectModeClick(n.id, n.label, n); return; }
      if (ev.shiftKey) {
        if (S.multiSelect.has(n.id)) S.multiSelect.delete(n.id); else S.multiSelect.add(n.id);
        S.selected = null; render(); return;
      }
      if (!S.multiSelect.has(n.id)) { S.multiSelect.clear(); S.multiSelectEdges.clear(); S.selected={type:'node',id:n.id}; }
      const { svgPoint: sp2 } = window._editorUtils||{};
      const pt = sp2 ? sp2(ev) : {x:0,y:0};
      const idsForDrag = new Set([...S.multiSelect, ...(S.selected&&S.selected.type==='node'?[S.selected.id]:[])]);
      const multiOrig = new Map([...idsForDrag].map(id => { const mn=S.nodes.find(x=>x.id===id); return [id,mn?{x:mn.x,y:mn.y}:null]; }));
      S.drag = {id:n.id, offX:pt.x-n.x, offY:pt.y-n.y, moved:false, multiOrig};
      render();
    });

    g.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      const { activateInline, scheduleSnapshot } = window._editorInline || {};
      if (activateInline) activateInline(n.x*S.zoom+S.panX, n.y*S.zoom+S.panY, n.label, w*S.zoom+40, val => {
        if (val.trim()) { const { pushUndo } = window._editorUtils||{}; if(pushUndo)pushUndo(); n.label=val.trim(); render(); const { countMutation: cm3 } = window._editorHistory||{}; if(cm3)cm3(); }
      });
    });

    nodesLayer.appendChild(g);
  });

  if (S.hoveredNodeId && !S.portDrag && !S.connectMode) {
    const { onPortMousedown } = window._editorPortHandlers || {};
    renderPorts(S.hoveredNodeId, { onPortMousedown });
  } else if (S.hoveredGroupId && !S.portDrag && !S.connectMode) {
    const { onPortMousedown } = window._editorPortHandlers || {};
    renderGroupPorts(S.hoveredGroupId, { onPortMousedown });
  } else if (S.selected && S.selected.type === 'group' && !S.portDrag && !S.connectMode) {
    // A selected group keeps its ports up so they stay easy to grab.
    const { onPortMousedown } = window._editorPortHandlers || {};
    renderGroupPorts(S.selected.id, { onPortMousedown });
  }

  updatePropsPanel();
  updateMermaidOutput();
  updateClassDefList();
  updateUndoRedo();
  applyTransform();
  if (window._editorSource && window._editorSource.syncHighlight) window._editorSource.syncHighlight();
  if (window._editorDiff && window._editorDiff.update) window._editorDiff.update();
}
