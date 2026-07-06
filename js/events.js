import { S } from './state.js';
import { svgPoint, pushUndo, cloneState, restoreStateFrom, setZoom, fitAll, snapGrid, uid, nodeSize, makeSVG, applyTransform } from './utils.js';
import { render, renderPorts, updateUndoRedo } from './render.js';
import { scheduleSnapshot, takeSnapshot } from './history.js';
import { scheduleSave, doAutoSave } from './file.js';
import { loadFromMermaidText } from './loader.js';
import { autoArrange, fitGroupsToMembers } from './layout.js';
import { cancelInline } from './ui/inline.js';
import { setCurrentShape } from './ui/shapeDropdown.js';

// ── Mutations ─────────────────────────────────────────────────────────────────
export function addNode(x, y, label, shape) {
  const id = uid('n', S.nextNodeNum++);
  S.nodes.push({ id, label: label||'Node', shape: shape||'rect', x: x||160, y: y||120, parent: null, style: null, classes: [] });
  render(); return id;
}

export function addGroup(x, y) {
  const id = uid('g', S.nextGroupNum++);
  S.groups.push({ id, title: 'Group', x: x||100, y: y||100, w: 260, h: 160, parent: null, direction: '' });
  render(); return id;
}

export function addEdge(from, to, label, type) {
  if (from === to) return;
  const id = uid('e', S.nextEdgeNum++);
  S.edges.push({ id, from, to, label: label||'', type: type||document.getElementById('arrowSelect').value });
  render();
}

function getSelectedNodeIds() {
  if (S.multiSelect.size > 0) return new Set(S.multiSelect);
  if (S.selected && S.selected.type === 'node') return new Set([S.selected.id]);
  return new Set();
}

export function deleteSelected() {
  const ids = getSelectedNodeIds();
  if (ids.size > 0 || S.multiSelectEdges.size > 0) {
    pushUndo();
    S.nodes = S.nodes.filter(n => !ids.has(n.id));
    S.edges = S.edges.filter(e => !ids.has(e.from) && !ids.has(e.to) && !S.multiSelectEdges.has(e.id));
    S.multiSelect.clear(); S.multiSelectEdges.clear(); S.selected = null;
    render(); takeSnapshot('Deleted elements'); return;
  }
  if (!S.selected) return;
  pushUndo();
  if (S.selected.type === 'edge') { S.edges = S.edges.filter(e => e.id !== S.selected.id); }
  else if (S.selected.type === 'group') { S.nodes.forEach(n => { if(n.parent===S.selected.id)n.parent=null; }); S.groups=S.groups.filter(g=>g.id!==S.selected.id); }
  const label = 'Deleted ' + (S.selected ? S.selected.type : 'element');
  S.selected = null; render(); takeSnapshot(label);
}

export function copySelection() {
  const ids = getSelectedNodeIds(); if (!ids.size) return;
  S.clipboard = {
    nodes: S.nodes.filter(n=>ids.has(n.id)).map(n=>({...n,style:n.style?{...n.style}:null,classes:[...(n.classes||[])]})),
    edges: S.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).map(e=>({...e}))
  };
  S.pasteCount = 0;
  document.getElementById('statusText').textContent = `Copied ${S.clipboard.nodes.length} node(s).`;
}

export function pasteClipboard() {
  if (!S.clipboard || !S.clipboard.nodes.length) return;
  pushUndo(); S.pasteCount++;
  const off = S.pasteCount * 60;
  const idMap = new Map();
  S.clipboard.nodes.forEach(n => {
    const newId = uid('n', S.nextNodeNum++);
    idMap.set(n.id, newId);
    S.nodes.push({...n, id:newId, x:n.x+off, y:n.y+off, style:n.style?{...n.style}:null, classes:[...(n.classes||[])]});
  });
  S.clipboard.edges.forEach(e => {
    const nf=idMap.get(e.from),nt=idMap.get(e.to);
    if(nf&&nt) S.edges.push({id:uid('e',S.nextEdgeNum++),from:nf,to:nt,label:e.label,type:e.type});
  });
  S.multiSelect.clear(); idMap.forEach(id=>S.multiSelect.add(id)); S.selected=null;
  render(); takeSnapshot('Pasted nodes');
}

export function duplicateSelection() {
  const ids = getSelectedNodeIds(); if (!ids.size) return;
  pushUndo(); const idMap = new Map();
  [...ids].forEach(id => {
    const n=S.nodes.find(x=>x.id===id); if(!n)return;
    const newId=uid('n',S.nextNodeNum++);
    idMap.set(id,newId);
    S.nodes.push({...n,id:newId,x:n.x+80,y:n.y+80,style:n.style?{...n.style}:null,classes:[...(n.classes||[])]});
  });
  S.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)).forEach(e=>{
    const nf=idMap.get(e.from),nt=idMap.get(e.to);
    if(nf&&nt)S.edges.push({id:uid('e',S.nextEdgeNum++),from:nf,to:nt,label:e.label,type:e.type});
  });
  S.multiSelect.clear(); idMap.forEach(id=>S.multiSelect.add(id)); S.selected=null;
  render(); takeSnapshot('Duplicated nodes');
}

function renameNodeId(oldId, newId) {
  newId = newId.trim();
  if (!newId || newId === oldId) return;
  if (S.nodes.find(n=>n.id===newId)) { document.getElementById('statusText').textContent='ID already in use.'; return; }
  pushUndo();
  S.nodes.forEach(n=>{if(n.id===oldId)n.id=newId;});
  S.edges.forEach(e=>{if(e.from===oldId)e.from=newId;if(e.to===oldId)e.to=newId;});
  if(S.selected&&S.selected.id===oldId)S.selected.id=newId;
  render(); scheduleSave();
}

// ── Rubber band ───────────────────────────────────────────────────────────────
function startRubberBand(pt) {
  S.rubberBandStart = pt;
  const overlayLayer = document.getElementById('overlayLayer');
  if (!S.rubberBandEl) {
    S.rubberBandEl = makeSVG('rect');
    S.rubberBandEl.setAttribute('class','rubber-band');
    S.rubberBandEl.style.pointerEvents='none';
    overlayLayer.appendChild(S.rubberBandEl);
  }
  S.rubberBandEl.setAttribute('x',pt.x); S.rubberBandEl.setAttribute('y',pt.y);
  S.rubberBandEl.setAttribute('width',0); S.rubberBandEl.setAttribute('height',0);
  S.rubberBandEl.style.display='block';
}

function updateRubberBand(pt) {
  if (!S.rubberBandStart || !S.rubberBandEl) return;
  const x=Math.min(pt.x,S.rubberBandStart.x), y=Math.min(pt.y,S.rubberBandStart.y);
  S.rubberBandEl.setAttribute('x',x); S.rubberBandEl.setAttribute('y',y);
  S.rubberBandEl.setAttribute('width',Math.abs(pt.x-S.rubberBandStart.x));
  S.rubberBandEl.setAttribute('height',Math.abs(pt.y-S.rubberBandStart.y));
}

function endRubberBand(pt) {
  if (!S.rubberBandStart) return;
  const x1=Math.min(pt.x,S.rubberBandStart.x), y1=Math.min(pt.y,S.rubberBandStart.y);
  const x2=Math.max(pt.x,S.rubberBandStart.x), y2=Math.max(pt.y,S.rubberBandStart.y);
  if (x2-x1>6||y2-y1>6) {
    S.multiSelect.clear(); S.multiSelectEdges.clear();
    S.nodes.forEach(n=>{
      const{w,h}=nodeSize(n);
      if(n.x-w/2>=x1&&n.x+w/2<=x2&&n.y-h/2>=y1&&n.y+h/2<=y2)S.multiSelect.add(n.id);
    });
    S.edges.forEach(e=>{
      const fn=S.nodes.find(n=>n.id===e.from), tn=S.nodes.find(n=>n.id===e.to);
      if(!fn||!tn)return;
      const mx=(fn.x+tn.x)/2, my=(fn.y+tn.y)/2;
      if(mx>=x1&&mx<=x2&&my>=y1&&my<=y2)S.multiSelectEdges.add(e.id);
    });
    const total=S.multiSelect.size+S.multiSelectEdges.size;
    if(total)document.getElementById('statusText').textContent=`Selected ${S.multiSelect.size} node(s), ${S.multiSelectEdges.size} arrow(s). Del to delete.`;
    render();
  }
  S.rubberBandStart = null;
  if (S.rubberBandEl) S.rubberBandEl.style.display='none';
}

// ── Port drag handler (called from render.js via window._editorPortHandlers) ──
function handlePortMousedown(ev, nodeId, pos) {
  ev.stopPropagation(); ev.preventDefault();
  const ghost = makeSVG('line');
  ghost.setAttribute('x1',pos.x); ghost.setAttribute('y1',pos.y);
  ghost.setAttribute('x2',pos.x); ghost.setAttribute('y2',pos.y);
  ghost.setAttribute('stroke','#6c8cff'); ghost.setAttribute('stroke-width','1.5');
  ghost.setAttribute('stroke-dasharray','6,3'); ghost.style.pointerEvents='none';
  document.getElementById('overlayLayer').appendChild(ghost);
  S.portDrag = {fromNodeId:nodeId, startPos:{x:pos.x,y:pos.y}, ghostLine:ghost, targetNodeId:null};
}

// ── Canvas mouse events ───────────────────────────────────────────────────────
export function initCanvasEvents() {
  const canvasWrap = document.getElementById('canvasWrap');

  window.addEventListener('keydown', ev => { if(ev.key==='Control')canvasWrap.classList.add('ctrl-hover'); });
  window.addEventListener('keyup', ev => { if(ev.key==='Control')canvasWrap.classList.remove('ctrl-hover'); });

  canvasWrap.addEventListener('wheel', ev => {
    if (ev.ctrlKey) {
      ev.preventDefault();
      const delta = ev.deltaY>0 ? 0.9 : 1/0.9;
      setZoom(S.zoom*delta, ev.clientX, ev.clientY);
    }
  }, {passive:false});

  let canvasMousedownPt = null;
  let isRubberBanding = false;

  canvasWrap.addEventListener('mousedown', ev => {
    if (ev.button===0 && ev.ctrlKey) {
      ev.preventDefault();
      S.isPanning=true; S.panStartX=ev.clientX; S.panStartY=ev.clientY; S.panOriginX=S.panX; S.panOriginY=S.panY;
      canvasWrap.classList.add('pan-cursor'); return;
    }
    if (ev.button===1) {
      ev.preventDefault();
      S.isPanning=true; S.panStartX=ev.clientX; S.panStartY=ev.clientY; S.panOriginX=S.panX; S.panOriginY=S.panY;
      canvasWrap.classList.add('pan-cursor'); return;
    }
    if (ev.button===0) {
      if (S.connectMode) {
        // Remove ghost if clicking empty space
        if (S.connectGhost && S.connectGhost.parentNode) { S.connectGhost.parentNode.removeChild(S.connectGhost); S.connectGhost=null; }
        S.connectFrom = null;
        return;
      }
      const pt = svgPoint(ev);
      canvasMousedownPt = pt;
      isRubberBanding = false;
      S.selected=null; S.multiSelect.clear(); S.multiSelectEdges.clear(); render();
    }
  });

  window.addEventListener('mousemove', ev => {
    if (S.isPanning) {
      S.panX=S.panOriginX+(ev.clientX-S.panStartX); S.panY=S.panOriginY+(ev.clientY-S.panStartY);
      applyTransform();
      return;
    }
    if (S.portDrag) {
      const pt = svgPoint(ev);
      S.portDrag.ghostLine.setAttribute('x2',pt.x); S.portDrag.ghostLine.setAttribute('y2',pt.y);
      S.portDrag.targetNodeId = null;
      const target = S.nodes.find(n=>{ const{w,h}=nodeSize(n); return Math.abs(pt.x-n.x)<w/2+10&&Math.abs(pt.y-n.y)<h/2+10&&n.id!==S.portDrag.fromNodeId; });
      S.portDrag.targetNodeId = target ? target.id : null;
      return;
    }
    if (S.drag) {
      const pt = svgPoint(ev);
      const n = S.nodes.find(x=>x.id===S.drag.id); if(!n)return;
      let newX = pt.x-S.drag.offX, newY = pt.y-S.drag.offY;
      if (ev.altKey || S.snapAlways) { newX=snapGrid(newX); newY=snapGrid(newY); }
      const dx=newX-n.x, dy=newY-n.y;
      n.x=newX; n.y=newY;
      if (S.drag.multiOrig && S.multiSelect.size>1) {
        [...S.multiSelect].forEach(id=>{ if(id===S.drag.id)return; const mn=S.nodes.find(x=>x.id===id); if(mn){mn.x+=dx;mn.y+=dy;} });
      }
      S.drag.moved=true; render(); return;
    }
    if (S.groupDrag) {
      const pt = svgPoint(ev);
      const g = S.groups.find(x=>x.id===S.groupDrag.id); if(!g)return;
      const dx=pt.x-S.groupDrag.startPX, dy=pt.y-S.groupDrag.startPY;
      if (S.groupDrag.mode==='move') {
        g.x=S.groupDrag.orig.x+dx; g.y=S.groupDrag.orig.y+dy;
        S.groupDrag.memberOrig.forEach(m=>{ const n=S.nodes.find(x=>x.id===m.id); if(n){n.x=m.x+dx;n.y=m.y+dy;} });
      } else { g.w=Math.max(120,S.groupDrag.orig.w+dx); g.h=Math.max(80,S.groupDrag.orig.h+dy); }
      render(); return;
    }
    // Connect mode ghost line update
    if (S.connectMode && S.connectFrom && S.connectGhost) {
      const pt = svgPoint(ev);
      S.connectGhost.setAttribute('x2',pt.x);
      S.connectGhost.setAttribute('y2',pt.y);
      return;
    }
    // Rubber band
    if (canvasMousedownPt && ev.buttons===1 && !S.connectMode) {
      const pt = svgPoint(ev);
      const dist = Math.hypot(pt.x-canvasMousedownPt.x, pt.y-canvasMousedownPt.y);
      if (!isRubberBanding && dist>8) { isRubberBanding=true; S.multiSelect.clear(); startRubberBand(canvasMousedownPt); }
      if (isRubberBanding) updateRubberBand(pt);
    }
  });

  window.addEventListener('mouseup', ev => {
    if (S.isPanning) { S.isPanning=false; document.getElementById('canvasWrap').classList.remove('pan-cursor'); return; }
    if (S.portDrag) {
      const ghost = S.portDrag.ghostLine;
      if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      if (S.portDrag.targetNodeId) {
        pushUndo();
        addEdge(S.portDrag.fromNodeId, S.portDrag.targetNodeId, '', document.getElementById('arrowSelect').value);
        takeSnapshot('Connected nodes');
        scheduleSave();
      }
      S.portDrag=null; renderPorts(S.hoveredNodeId, { onPortMousedown: handlePortMousedown }); return;
    }
    if (S.drag) {
      const n = S.nodes.find(x=>x.id===S.drag.id);
      if (n) { const hit=S.groups.find(g=>n.x>=g.x&&n.x<=g.x+g.w&&n.y>=g.y&&n.y<=g.y+g.h); n.parent=hit?hit.id:null; }
      if (S.drag.moved) scheduleSnapshot('Moved nodes');
      S.drag=null; render(); return;
    }
    if (S.groupDrag) { S.groupDrag=null; render(); return; }
    if (isRubberBanding) { endRubberBand(svgPoint(ev)); isRubberBanding=false; }
    canvasMousedownPt=null;
  });
}

// ── Toolbar buttons ───────────────────────────────────────────────────────────
export function initToolbar() {
  document.getElementById('newBtn').addEventListener('click', () => {
    if ((S.nodes.length||S.edges.length) && !confirm('Clear the current diagram?')) return;
    S.nodes=[]; S.edges=[]; S.groups=[]; S.classDefs={}; S.selected=null; S.multiSelect.clear();
    S.nextNodeNum=1; S.nextEdgeNum=1; S.nextGroupNum=1; S.snapshots=[];
    S.undoStack=[]; S.redoStack=[]; updateUndoRedo();
    S.zoom=1; S.panX=80; S.panY=80; render(); scheduleSave();
  });

  document.getElementById('addNodeBtn').addEventListener('click', () => {
    pushUndo();
    const rect = document.getElementById('canvasWrap').getBoundingClientRect();
    const cx=(rect.width/2-S.panX)/S.zoom, cy=(rect.height/2-S.panY)/S.zoom;
    addNode(cx+Math.random()*40-20, cy+Math.random()*40-20, 'Node '+S.nextNodeNum, S.currentShapeValue);
    takeSnapshot('Added node');
    document.getElementById('statusText').textContent='Node added. Drag from its edge to connect.';
  });

  document.getElementById('addGroupBtn').addEventListener('click', () => {
    pushUndo();
    const rect = document.getElementById('canvasWrap').getBoundingClientRect();
    const cx=(rect.width/2-S.panX)/S.zoom-130, cy=(rect.height/2-S.panY)/S.zoom-80;
    addGroup(cx,cy); takeSnapshot('Added group');
  });

  document.getElementById('connectBtn').addEventListener('click', ev => {
    S.connectMode = !S.connectMode;
    S.connectFrom = null;
    // Remove ghost if toggling off
    if (!S.connectMode && S.connectGhost) {
      if (S.connectGhost.parentNode) S.connectGhost.parentNode.removeChild(S.connectGhost);
      S.connectGhost = null;
    }
    ev.target.classList.toggle('active', S.connectMode);
    document.getElementById('statusText').textContent = S.connectMode ? 'Connect mode: click source, then target node.' : 'Connect mode off.';
    document.getElementById('portsLayer').innerHTML = '';
    render();
  });

  document.getElementById('snapGridBtn').addEventListener('click', ev => {
    S.snapAlways = !S.snapAlways;
    ev.target.classList.toggle('active', S.snapAlways);
  });

  document.getElementById('deleteBtn').addEventListener('click', () => deleteSelected());
  document.getElementById('arrangeBtn').addEventListener('click', () => { autoArrange(); document.getElementById('statusText').textContent='Re-arranged.'; });

  document.getElementById('undoBtn').addEventListener('click', () => {
    if (S.undoStack.length) { S.redoStack.push(cloneState()); restoreStateFrom(S.undoStack.pop()); updateUndoRedo(); render(); }
  });
  document.getElementById('redoBtn').addEventListener('click', () => {
    if (S.redoStack.length) { S.undoStack.push(cloneState()); restoreStateFrom(S.redoStack.pop()); updateUndoRedo(); render(); }
  });

  document.getElementById('zoomInBtn').addEventListener('click', () => setZoom(S.zoom*1.2));
  document.getElementById('zoomOutBtn').addEventListener('click', () => setZoom(S.zoom/1.2));
  document.getElementById('fitBtn').addEventListener('click', fitAll);

  document.getElementById('arrowSelect').addEventListener('change', () => {
    if (S.selected && S.selected.type==='edge') {
      const e=S.edges.find(x=>x.id===S.selected.id);
      if(e){ pushUndo(); e.type=document.getElementById('arrowSelect').value; document.getElementById('propEdgeType').value=e.type; render(); scheduleSave(); }
    }
  });
  document.getElementById('directionSelect').addEventListener('change', () => {
    pushUndo(); S.direction=document.getElementById('directionSelect').value; autoArrange();
    document.getElementById('statusText').textContent='Direction: '+S.direction; scheduleSave();
  });

  // Props panel wiring
  document.getElementById('propNodeId').addEventListener('change', ev => {
    if(S.selected&&S.selected.type==='node')renameNodeId(S.selected.id,ev.target.value);
  });
  document.getElementById('propNodeLabel').addEventListener('input', ev => {
    if(S.selected&&S.selected.type==='node'){const n=S.nodes.find(x=>x.id===S.selected.id);if(n){n.label=ev.target.value.replace(/\\n/g,'\n');render();scheduleSave();}}
  });
  document.getElementById('propShapeSelect').addEventListener('change', ev => {
    if(S.selected&&S.selected.type==='node'){const n=S.nodes.find(x=>x.id===S.selected.id);if(n){pushUndo();n.shape=ev.target.value;setCurrentShape(ev.target.value);render();scheduleSave();}}
  });
  document.getElementById('propFill').addEventListener('input', ev => {
    if(S.selected&&S.selected.type==='node'){const n=S.nodes.find(x=>x.id===S.selected.id);if(n){n.style=n.style||{};n.style.fill=ev.target.value;render();scheduleSave();}}
  });
  document.getElementById('propStroke').addEventListener('input', ev => {
    if(S.selected&&S.selected.type==='node'){const n=S.nodes.find(x=>x.id===S.selected.id);if(n){n.style=n.style||{};n.style.stroke=ev.target.value;render();scheduleSave();}}
  });
  document.getElementById('propTextColor').addEventListener('input', ev => {
    if(S.selected&&S.selected.type==='node'){const n=S.nodes.find(x=>x.id===S.selected.id);if(n){n.style=n.style||{};n.style.color=ev.target.value;render();scheduleSave();}}
  });
  document.getElementById('propClearStyle').addEventListener('click', () => {
    if(S.selected&&S.selected.type==='node'){const n=S.nodes.find(x=>x.id===S.selected.id);if(n){pushUndo();n.style=null;render();scheduleSave();}}
  });
  document.getElementById('propEdgeType').addEventListener('change', ev => {
    if(S.selected&&S.selected.type==='edge'){const e=S.edges.find(x=>x.id===S.selected.id);if(e){pushUndo();e.type=ev.target.value;document.getElementById('arrowSelect').value=e.type;render();scheduleSave();}}
  });
  document.getElementById('propEdgeLabel').addEventListener('input', ev => {
    if(S.selected&&S.selected.type==='edge'){const e=S.edges.find(x=>x.id===S.selected.id);if(e){e.label=ev.target.value;render();scheduleSave();}}
  });
  document.getElementById('propGroupTitle').addEventListener('input', ev => {
    if(S.selected&&S.selected.type==='group'){const g=S.groups.find(x=>x.id===S.selected.id);if(g){g.title=ev.target.value;render();scheduleSave();}}
  });
  document.getElementById('propGroupDir').addEventListener('change', ev => {
    if(S.selected&&S.selected.type==='group'){const g=S.groups.find(x=>x.id===S.selected.id);if(g){pushUndo();g.direction=ev.target.value;render();scheduleSave();}}
  });

  // ClassDef panel
  document.getElementById('cdAddBtn').addEventListener('click', () => {
    const name = document.getElementById('cdName').value.trim();
    if (!name) { document.getElementById('statusText').textContent='Enter a class name.'; return; }
    pushUndo();
    S.classDefs[name] = {fill:document.getElementById('cdFill').value, stroke:document.getElementById('cdStroke').value, color:document.getElementById('cdText').value};
    document.getElementById('cdName').value=''; render();
  });

  // Save/Load buttons
  document.getElementById('copyBtn').addEventListener('click', () => {
    const ta = document.getElementById('mmdOut');
    navigator.clipboard.writeText(ta.value).then(()=>document.getElementById('statusText').textContent='Copied!').catch(()=>{ta.select();document.execCommand('copy');document.getElementById('statusText').textContent='Copied!';});
  });
  document.getElementById('saveAsBtn').addEventListener('click', () => {
    const { buildFileContent } = window._editorHistory||{};
    const content = buildFileContent ? buildFileContent() : document.getElementById('mmdOut').value;
    const blob = new Blob([content],{type:'text/plain'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='diagram.mmd'; a.click(); URL.revokeObjectURL(url);
    document.getElementById('statusText').textContent='Downloaded.';
  });
  document.getElementById('downloadBtn').addEventListener('click', () => {
    const blob=new Blob([document.getElementById('mmdOut').value],{type:'text/plain'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='diagram.mmd'; a.click(); URL.revokeObjectURL(url);
  });
  document.getElementById('loadBtn').addEventListener('click', () => {
    const t=document.getElementById('mmdIn').value; if(t.trim())loadFromMermaidText(t);
  });
  document.getElementById('uploadBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', ev => {
    const file=ev.target.files[0]; if(!file)return;
    const r=new FileReader();
    r.onload=()=>{ document.getElementById('mmdIn').value=r.result; loadFromMermaidText(r.result); };
    r.readAsText(file); ev.target.value='';
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
export function initKeyboard() {
  window.addEventListener('keydown', ev => {
    const tag = document.activeElement.tagName;
    if (tag==='INPUT'||tag==='TEXTAREA') return;
    if (ev.key==='Delete'||ev.key==='Backspace') { ev.preventDefault(); deleteSelected(); }
    if (ev.key==='Escape') {
      cancelInline();
      // Remove connect ghost
      if (S.connectGhost && S.connectGhost.parentNode) { S.connectGhost.parentNode.removeChild(S.connectGhost); S.connectGhost=null; }
      S.connectMode=false; S.connectFrom=null;
      document.getElementById('connectBtn').classList.remove('active');
      S.selected=null; S.multiSelect.clear(); S.multiSelectEdges.clear(); S.portDrag=null; render();
      document.getElementById('statusText').textContent='';
    }
    if (!ev.ctrlKey && !ev.metaKey && (ev.key==='c'||ev.key==='C')) {
      const btn = document.getElementById('connectBtn');
      S.connectMode = !S.connectMode; S.connectFrom=null;
      // Toggle ghost
      if (!S.connectMode && S.connectGhost) { if(S.connectGhost.parentNode)S.connectGhost.parentNode.removeChild(S.connectGhost); S.connectGhost=null; }
      btn.classList.toggle('active', S.connectMode);
      document.getElementById('statusText').textContent = S.connectMode ? 'Connect mode ON' : 'Connect mode off.';
      render();
    }
    if ((ev.ctrlKey||ev.metaKey) && ev.key==='z') {
      ev.preventDefault();
      if(S.undoStack.length){S.redoStack.push(cloneState());restoreStateFrom(S.undoStack.pop());updateUndoRedo();render();}
    }
    if ((ev.ctrlKey||ev.metaKey) && (ev.key==='y'||(ev.shiftKey&&ev.key==='Z'))) {
      ev.preventDefault();
      if(S.redoStack.length){S.undoStack.push(cloneState());restoreStateFrom(S.redoStack.pop());updateUndoRedo();render();}
    }
    if ((ev.ctrlKey||ev.metaKey) && ev.key==='c' && !ev.shiftKey) { ev.preventDefault(); copySelection(); }
    if ((ev.ctrlKey||ev.metaKey) && ev.key==='x') { ev.preventDefault(); copySelection(); deleteSelected(); }
    if ((ev.ctrlKey||ev.metaKey) && ev.key==='v') { ev.preventDefault(); pasteClipboard(); }
    if ((ev.ctrlKey||ev.metaKey) && ev.key==='d') { ev.preventDefault(); duplicateSelection(); }
    if ((ev.ctrlKey||ev.metaKey) && ev.key==='a') {
      ev.preventDefault();
      S.multiSelect=new Set(S.nodes.map(n=>n.id)); S.selected=null; render();
      document.getElementById('statusText').textContent=`Selected all ${S.multiSelect.size} node(s).`;
    }
    if ((ev.ctrlKey||ev.metaKey) && ev.key==='s') {
      ev.preventDefault();
      takeSnapshot('Manual');
      doAutoSave();
      document.getElementById('statusText').textContent='Snapshot saved.';
    }
  });
}

// ── Connect mode: create ghost when first node clicked ────────────────────────
// This is called by render.js node mousedown handler (connect mode branch)
// We expose the handler via window._editorPortHandlers
export function getPortMousedownHandler() {
  return handlePortMousedown;
}

// ── Connect ghost spawner (called from render.js node mousedown) ──────────────
export function spawnConnectGhost(fromNode) {
  if (S.connectGhost && S.connectGhost.parentNode) S.connectGhost.parentNode.removeChild(S.connectGhost);
  const ghost = makeSVG('line');
  ghost.setAttribute('x1', fromNode.x); ghost.setAttribute('y1', fromNode.y);
  ghost.setAttribute('x2', fromNode.x); ghost.setAttribute('y2', fromNode.y);
  ghost.setAttribute('stroke','#6c8cff'); ghost.setAttribute('stroke-width','1.5');
  ghost.setAttribute('stroke-dasharray','6,3'); ghost.style.pointerEvents='none';
  document.getElementById('overlayLayer').appendChild(ghost);
  S.connectGhost = ghost;
}
