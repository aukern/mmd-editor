import { S } from './state.js';
import { uid, fitAll } from './utils.js';
import { parseMermaid } from './parser.js';
import { layoutFromGraph, fitGroupsToMembers } from './layout.js';
import { extractSnapshotsFromText, stripSnapLines } from './history.js';
import { render, updateUndoRedo } from './render.js';

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
    const pos = layoutFromGraph(ids, newEdges, dir);
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
  } catch(err) {
    document.getElementById('statusText').textContent = 'Could not parse. Canvas unchanged.';
    console.error(err);
  }
}
