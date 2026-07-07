import { tokenToType } from './constants.js';
import { escapeRe } from './utils.js';

const shapeAliasMap = {
  'rect':'rect','process':'rect','square':'rect','rounded':'rounded','round-rect':'rounded',
  'stadium':'stadium','pill':'stadium','terminal':'stadium','subroutine':'subroutine','predefined-process':'subroutine',
  'cylinder':'cylinder','database':'cylinder','db':'cylinder','circle':'circle','event':'circle',
  'doublecircle':'doubleCircle','double-circle':'doubleCircle','asymmetric':'asymmetric','odd':'asymmetric','flag':'asymmetric',
  'rhombus':'rhombus','diamond':'rhombus','decision':'rhombus','diam':'rhombus',
  'hexagon':'hexagon','hex':'hexagon','prepare':'hexagon',
  'parallelogram':'parallelogram','lean-right':'parallelogram','data':'parallelogram',
  'parallelogram-alt':'parallelogramAlt','lean-left':'parallelogramAlt',
  'trapezoid':'trapezoid','trap-b':'trapezoid','inv-trapezoid':'trapezoidAlt','trap-t':'trapezoidAlt','trapezoid-alt':'trapezoidAlt',
  'delay':'delay','manual-input':'manualInput','doc':'doc','document':'doc','display':'display','hourglass':'hourglass'
};

const shapeDelims = [
  {open:'(((', close:')))', shape:'doubleCircle'},{open:'((', close:'))', shape:'circle'},
  {open:'([', close:'])', shape:'stadium'},{open:'[[', close:']]', shape:'subroutine'},
  {open:'[(', close:')]', shape:'cylinder'},{open:'{{', close:'}}', shape:'hexagon'},
  {open:'[/', close:'/]', shape:'parallelogram'},{open:'[\\', close:'\\]', shape:'parallelogramAlt'},
  {open:'[/', close:'\\]', shape:'trapezoid'},{open:'[\\', close:'/]', shape:'trapezoidAlt'},
  {open:'>', close:']', shape:'asymmetric'},{open:'{', close:'}', shape:'rhombus'},
  {open:'[', close:']', shape:'rect'},{open:'(', close:')', shape:'rounded'}
];

function mmdLabelToInternal(s) { return (s||'').replace(/<br\/>/gi,'\n').replace(/<br>/gi,'\n').replace(/&#10;/g,'\n'); }

function parseStyleProps(str) {
  const out = {};
  str.split(',').forEach(pair => {
    const idx = pair.indexOf(':'); if (idx < 0) return;
    const k = pair.slice(0,idx).trim(), v = pair.slice(idx+1).trim();
    if (k==='fill') out.fill=v; else if (k==='stroke') out.stroke=v; else if (k==='color') out.color=v;
  });
  return out;
}

export function normalizeInlineEdgeText(line) {
  line = line.replace(/==\s+([^=|]+?)\s+==>/g, '==>|$1|');
  line = line.replace(/-\.\s+([^.|]+?)\s+\.->/g, '-.->|$1|');
  line = line.replace(/--\s+([^-|]+?)\s+-->/g, '-->|$1|');
  return line;
}

export function splitEdgeLine(line) {
  const patterns = [
    {tok:'<==>', re:/<==>/},{tok:'<-.->', re:/<-\.->/},{tok:'<-->', re:/<-->/},
    {tok:'o--o', re:/o--o/},{tok:'x--x', re:/x--x/},{tok:'===', re:/===/},
    {tok:'==>', re:/==>/},{tok:'-.->',re:/-\.->/},{tok:'-.-',re:/-\.-/},
    {tok:'-->', re:/-->/},{tok:'---', re:/---/},{tok:'--o', re:/--o/},{tok:'--x', re:/--x/}
  ];
  const found = [];
  patterns.forEach(p => { const gr = new RegExp(p.re.source,'g'); let m; while((m=gr.exec(line))!==null) found.push({tok:p.tok,index:m.index,len:m[0].length}); });
  if (!found.length) return null;
  found.sort((a,b)=>a.index-b.index);
  const deduped = []; let lastEnd = -1;
  found.forEach(f => { if(f.index>=lastEnd){deduped.push(f);lastEnd=f.index+f.len;} });
  if (!deduped.length) return null;
  const segments = []; let prev = 0;
  deduped.forEach(m => { segments.push(line.slice(prev,m.index)); prev=m.index+m.len; });
  segments.push(line.slice(prev));
  return {segments, arrows:deduped.map(m=>m.tok)};
}

export function extractNodeToken(token) {
  token = token.trim(); if (!token) return null;
  const atMatch = token.match(/^([A-Za-z0-9_]+)@\{\s*shape:\s*([\w-]+)(?:,\s*label:\s*"([^"]*)")?\s*\}/);
  if (atMatch) { const rawShape = atMatch[2].toLowerCase(); return {id:atMatch[1],label:atMatch[3]||atMatch[1],shape:shapeAliasMap[rawShape]||'rect',cssClass:null}; }
  let cssClass = null;
  const ccMatch = token.match(/^(.*?):::(\w+)(.*)$/);
  if (ccMatch) { token = (ccMatch[1]+ccMatch[3]).trim(); cssClass = ccMatch[2]; }
  const idMatch = token.match(/^([A-Za-z0-9_]+)/); if (!idMatch) return null;
  const id = idMatch[1], rest = token.slice(id.length).trim();
  if (!rest) return {id, label:null, shape:null, cssClass};
  for (const sd of shapeDelims) {
    const openRe = escapeRe(sd.open), closeRe = escapeRe(sd.close);
    const quoted = rest.match(new RegExp('^'+openRe+'\\s*"(.*)"\\s*'+closeRe+'$'));
    if (quoted) return {id, label:mmdLabelToInternal(quoted[1]), shape:sd.shape, cssClass};
    const plain = rest.match(new RegExp('^'+openRe+'(.*)'+closeRe+'$'));
    if (plain) return {id, label:mmdLabelToInternal(plain[1]), shape:sd.shape, cssClass};
  }
  return {id, label:null, shape:null, cssClass};
}

export function parseMermaid(text) {
  const newNodes = new Map(), newEdges = [], newGroups = [], newClassDefs = {}, classAssignments = [], directStyles = [];
  const groupIdSet = new Set(); // track subgraph IDs so proxy re-declarations are skipped
  let dir = 'TD';
  const rawLines = text.split('\n').map(l=>l.trim()).filter(l=>l&&!/^%%/.test(l));
  const firstLine = rawLines[0];
  if (firstLine && /^(flowchart|graph)\s+/i.test(firstLine)) {
    const m = firstLine.match(/^(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)/i);
    if (m) dir = m[1].toUpperCase()==='TB'?'TD':m[1].toUpperCase();
    rawLines.shift();
  }
  function mergeNode(tok) {
    if (!tok) return;
    if (groupIdSet.has(tok.id)) return; // subgraph proxy — never create a standalone node
    const ex = newNodes.get(tok.id) || {label:tok.id,shape:'rect',parent:null,classes:[]};
    if (tok.label != null) ex.label = tok.label;
    if (tok.shape) ex.shape = tok.shape;
    if (tok.cssClass && !ex.classes.includes(tok.cssClass)) ex.classes.push(tok.cssClass);
    newNodes.set(tok.id, ex);
  }
  function ensureNode(id) { if (!newNodes.has(id)) newNodes.set(id,{label:id,shape:'rect',parent:null,classes:[]}); }
  const groupStack = [];
  rawLines.forEach(line => {
    const sgMatch = line.match(/^subgraph\s+(.+)$/i);
    if (sgMatch) { let rest=sgMatch[1].trim(); let gid,title; const m=rest.match(/^([A-Za-z0-9_]+)\s*\[\s*"?(.*?)"?\s*\]$/); if(m){gid=m[1];title=m[2];}else{gid=rest.replace(/\s+/g,'_');title=rest;} newGroups.push({id:gid,title,x:0,y:0,w:260,h:160,direction:''}); groupIdSet.add(gid); groupStack.push(gid); return; }
    if (/^end$/i.test(line)) { groupStack.pop(); return; }
    if (/^direction\s+(TD|TB|LR|BT|RL)$/i.test(line)) { const dm=line.match(/^direction\s+(TD|TB|LR|BT|RL)$/i); const cg=groupStack[groupStack.length-1]; if(dm&&cg){const grp=newGroups.find(g=>g.id===cg);if(grp)grp.direction=dm[1].toUpperCase();} return; }
    const cdm = line.match(/^classDef\s+(\S+)\s+(.+)$/i); if(cdm){newClassDefs[cdm[1]]=parseStyleProps(cdm[2]);return;}
    const clm = line.match(/^class\s+([\w,\s]+)\s+(\S+)$/i); if(clm){classAssignments.push({ids:clm[1].split(',').map(s=>s.trim()).filter(Boolean),name:clm[2]});return;}
    const stm = line.match(/^style\s+(\S+)\s+(.+)$/i); if(stm){directStyles.push({id:stm[1],props:parseStyleProps(stm[2])});return;}
    if (/^(click|linkStyle)\b/i.test(line)) return;
    const nline = normalizeInlineEdgeText(line);
    const split = splitEdgeLine(nline);
    if (split) {
      const cg = groupStack[groupStack.length-1]||null;
      for (let i=0;i<split.arrows.length;i++) {
        let rightRaw = split.segments[i+1]; let label='';
        const lm = rightRaw.match(/^\s*\|(.*?)\|/); if(lm){label=lm[1];rightRaw=rightRaw.slice(lm[0].length);}
        split.segments[i+1] = rightRaw;
        const leftToks = split.segments[i].split('&').map(s=>s.trim()).filter(Boolean);
        const rightToks = rightRaw.split('&').map(s=>s.trim()).filter(Boolean);
        const typeKey = tokenToType[split.arrows[i]]||'arrow';
        leftToks.forEach(lt => { rightToks.forEach(rt => {
          const l=extractNodeToken(lt), r=extractNodeToken(rt);
          mergeNode(l); mergeNode(r);
          if(l&&r){newEdges.push({from:l.id,to:r.id,label,type:typeKey});if(cg){const ln=newNodes.get(l.id),rn=newNodes.get(r.id);if(ln&&!ln.parent)ln.parent=cg;if(rn&&!rn.parent)rn.parent=cg;}}
        }); });
      }
    } else { const tok=extractNodeToken(nline); if(tok&&tok.label!=null){mergeNode(tok);const cg=groupStack[groupStack.length-1];if(cg){const nd=newNodes.get(tok.id);if(nd)nd.parent=cg;}} }
  });
  classAssignments.forEach(ca => { ca.ids.forEach(id => { ensureNode(id); const nd=newNodes.get(id); if(!nd.classes.includes(ca.name))nd.classes.push(ca.name); }); });
  directStyles.forEach(ds => { ensureNode(ds.id); const ex=newNodes.get(ds.id); ex.style={...(ex.style||{}),...ds.props}; });
  return {newNodes, newEdges, newGroups, newClassDefs, dir};
}
