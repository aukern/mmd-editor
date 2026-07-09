import { S } from './state.js';
import { nodeSize } from './utils.js';

function computeBoundingBox() {
  if (!S.nodes.length && !S.groups.length) {
    const wrap = document.getElementById('canvasWrap').getBoundingClientRect();
    return { x: 0, y: 0, w: wrap.width, h: wrap.height };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  S.nodes.forEach(n => {
    const {w,h} = nodeSize(n);
    minX = Math.min(minX, n.x-w/2); minY = Math.min(minY, n.y-h/2);
    maxX = Math.max(maxX, n.x+w/2); maxY = Math.max(maxY, n.y+h/2);
  });
  S.groups.forEach(g => {
    minX = Math.min(minX, g.x); minY = Math.min(minY, g.y);
    maxX = Math.max(maxX, g.x+g.w); maxY = Math.max(maxY, g.y+g.h);
  });
  const pad = 40;
  return { x: minX-pad, y: minY-pad, w: (maxX-minX)+pad*2, h: (maxY-minY)+pad*2 };
}

const EXPORT_STYLE = `
.node .shape { fill: #33343d; stroke: #ae9026; stroke-width: 2; }
.node text { fill: #e6e6ea; font-size: 13px; text-anchor: middle; }
.edge-label-text { fill: #9a9aa5; font-size: 11px; text-anchor: middle; dominant-baseline: middle; }
.group-rect { fill: rgba(174,144,38,0.06); stroke: #ae9026; stroke-width: 1.5; stroke-dasharray: 6,4; }
.group-title-text { fill: #9a9aa5; font-size: 12px; font-weight: 600; }
`;

// In view mode the diagram is a Mermaid-rendered SVG — export that directly.
function viewExportSVGString() {
  const vsvg = document.querySelector('#viewPan svg');
  if (!vsvg) return null;
  const clone = vsvg.cloneNode(true);
  const b = vsvg.viewBox && vsvg.viewBox.baseVal;
  if (b && b.width) { clone.setAttribute('width', b.width); clone.setAttribute('height', b.height); }
  clone.style.width = ''; clone.style.height = '';
  return new XMLSerializer().serializeToString(clone);
}

function exportBBox() {
  if (S.viewMode) {
    const vsvg = document.querySelector('#viewPan svg');
    const b = vsvg && vsvg.viewBox && vsvg.viewBox.baseVal;
    if (b && b.width) return { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  return computeBoundingBox();
}

function buildExportSVGString() {
  if (S.viewMode) { const s = viewExportSVGString(); if (s) return s; }
  const svg = document.getElementById('canvas');
  const clone = svg.cloneNode(true);
  const bb = computeBoundingBox();
  clone.setAttribute('viewBox', `${bb.x} ${bb.y} ${bb.w} ${bb.h}`);
  clone.setAttribute('width', bb.w);
  clone.setAttribute('height', bb.h);
  // Remove ports and overlay layers content (ghost lines etc.)
  const ports = clone.querySelector('#portsLayer'); if (ports) ports.innerHTML = '';
  const overlay = clone.querySelector('#overlayLayer'); if (overlay) overlay.innerHTML = '';
  // Reset transform (export shows raw diagram coords)
  const root = clone.querySelector('#root');
  if (root) root.setAttribute('transform', '');
  // Inject style
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg','style');
  styleEl.textContent = EXPORT_STYLE;
  clone.insertBefore(styleEl, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

function triggerDownload(url, filename) {
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportSVG() {
  const svgStr = buildExportSVGString();
  const blob = new Blob([svgStr], {type:'image/svg+xml'});
  triggerDownload(URL.createObjectURL(blob), 'diagram.svg');
}

export function exportPNG() {
  const svgStr = buildExportSVGString();
  const bb = exportBBox();
  const b64 = btoa(unescape(encodeURIComponent(svgStr)));
  const dataUrl = 'data:image/svg+xml;base64,' + b64;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const scale = 2; // 2x for retina
    canvas.width = bb.w * scale; canvas.height = bb.h * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(blob => { triggerDownload(URL.createObjectURL(blob), 'diagram.png'); }, 'image/png');
  };
  img.src = dataUrl;
}

export function exportPDF() {
  const bb = computeBoundingBox();
  const styleId = 'printStyle';
  let style = document.getElementById(styleId);
  if (!style) { style = document.createElement('style'); style.id = styleId; document.head.appendChild(style); }
  style.textContent = `
    @media print {
      body > *:not(#main) { display: none !important; }
      #main > *:not(#canvasWrap) { display: none !important; }
      #canvasWrap { flex: 1; overflow: visible !important; }
      #canvasWrap::before, #canvasWrap::after { display: none; }
      @page { size: ${bb.w}px ${bb.h}px; margin: 0; }
      svg#canvas { position: static !important; width: ${bb.w}px !important; height: ${bb.h}px !important; }
    }
  `;
  window.print();
  window.addEventListener('afterprint', () => { style.textContent = ''; }, { once: true });
}
