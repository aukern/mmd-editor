import { S } from './state.js';
import { nodeSize } from './utils.js';

export function layoutFromGraph(nodeIds, edgeList, dir) {
  const incoming = new Map(nodeIds.map(id => [id, 0]));
  edgeList.forEach(e => incoming.set(e.to, (incoming.get(e.to)||0)+1));
  const roots = nodeIds.filter(id => (incoming.get(id)||0) === 0);
  const level = new Map(nodeIds.map(id => [id, 0]));
  const queue = roots.length ? [...roots] : (nodeIds[0] ? [nodeIds[0]] : []);
  const visited = new Set();
  while (queue.length) {
    const cur = queue.shift(); if (visited.has(cur)) continue; visited.add(cur);
    edgeList.filter(e => e.from === cur).forEach(e => { level.set(e.to, Math.max(level.get(e.to)||0, (level.get(cur)||0)+1)); queue.push(e.to); });
  }
  nodeIds.forEach(id => { if (!visited.has(id)) level.set(id, 0); });
  const byLevel = {};
  nodeIds.forEach(id => { const l = level.get(id)||0; (byLevel[l]=byLevel[l]||[]).push(id); });
  const lk = Object.keys(byLevel).map(Number).sort((a,b)=>a-b);
  const maxL = lk.length ? lk[lk.length-1] : 0;
  const lg = 220, ll = 120; const pos = {};
  lk.forEach(l => {
    byLevel[l].forEach((id, i) => {
      let x, y;
      if (dir==='LR') {x=160+l*lg;y=100+i*ll;}
      else if (dir==='RL') {x=160+(maxL-l)*lg;y=100+i*ll;}
      else if (dir==='BT') {x=100+i*ll;y=120+(maxL-l)*lg;}
      else {x=100+i*ll;y=120+l*lg;}
      pos[id] = {x, y};
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
  const pos = layoutFromGraph(S.nodes.map(n=>n.id), S.edges, S.direction);
  S.nodes.forEach(n => { if(pos[n.id]){n.x=pos[n.id].x;n.y=pos[n.id].y;} });
  fitGroupsToMembers();
  const { render } = window._editorRender || {};
  if (render) render();
  if (fitAll) fitAll();
}
