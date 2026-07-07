export const S = {
  nodes: [], edges: [], groups: [], classDefs: {}, direction: 'TD',
  undoStack: [], redoStack: [],
  zoom: 1, panX: 0, panY: 0,
  selected: null,
  multiSelect: new Set(),
  multiSelectEdges: new Set(),
  connectMode: false, connectFrom: null, connectGhost: null,
  drag: null, groupDrag: null,
  isPanning: false, panStartX: 0, panStartY: 0, panOriginX: 0, panOriginY: 0,
  nextNodeNum: 1, nextEdgeNum: 1, nextGroupNum: 1,
  hoveredNodeId: null,
  hoveredGroupId: null,
  portDrag: null,
  rubberBandStart: null, rubberBandEl: null,
  clipboard: null, pasteCount: 0,
  snapshots: [], saveTimer: null, pendingSnapshotLabel: null, snapshotTimer: null,
  portHideTimer: null,
  inlineTarget: null,
  currentShapeValue: 'rect',
  currentFilename: null,
  lastKnownMtime: null,
  fileWatchTimer: null,
  snapAlways: false,
  panMode: false,
  tabs: [],
  activeTabIdx: -1,
  previewMode: false,
  previewSaved: null,
  mutationCount: 0,
  sourceLineMap: null,
};

export function resetS() {
  S.nodes = []; S.edges = []; S.groups = []; S.classDefs = {}; S.direction = 'TD';
  S.undoStack = []; S.redoStack = [];
  S.zoom = 1; S.panX = 0; S.panY = 0;
  S.selected = null;
  S.multiSelect = new Set();
  S.multiSelectEdges = new Set();
  S.connectMode = false; S.connectFrom = null; S.connectGhost = null;
  S.drag = null; S.groupDrag = null;
  S.isPanning = false; S.panStartX = 0; S.panStartY = 0; S.panOriginX = 0; S.panOriginY = 0;
  S.nextNodeNum = 1; S.nextEdgeNum = 1; S.nextGroupNum = 1;
  S.hoveredNodeId = null;
  S.portDrag = null;
  S.rubberBandStart = null; S.rubberBandEl = null;
  S.clipboard = null; S.pasteCount = 0;
  S.snapshots = [];
  if (S.saveTimer) { clearTimeout(S.saveTimer); S.saveTimer = null; }
  S.pendingSnapshotLabel = null;
  if (S.snapshotTimer) { clearTimeout(S.snapshotTimer); S.snapshotTimer = null; }
  S.portHideTimer = null;
  S.inlineTarget = null;
  S.currentShapeValue = 'rect';
  S.snapAlways = false;
}
