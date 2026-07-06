import { SHAPES } from '../constants.js';
import { S } from '../state.js';

export function setCurrentShape(val) {
  S.currentShapeValue = val;
  updateShapeDropdownBtn();
  if (S.selected && S.selected.type === 'node') {
    const n = S.nodes.find(x => x.id === S.selected.id);
    if (n) {
      const { pushUndo } = window._editorUtils || {};
      if (pushUndo) pushUndo();
      n.shape = val;
      const { render } = window._editorRender || {};
      if (render) render();
    }
  }
  document.getElementById('propShapeSelect').value = val;
}

function updateShapeDropdownBtn() {
  const s = SHAPES.find(x => x.value === S.currentShapeValue) || SHAPES[0];
  document.getElementById('shapeDropdownPreview').innerHTML = `<g style="color:#9a9aa5">${s.svg}</g>`;
  document.getElementById('shapeDropdownLabel').textContent = s.label;
  document.querySelectorAll('#shapeDropdownPanel .shape-option').forEach(el => {
    el.classList.toggle('active', el.dataset.value === S.currentShapeValue);
  });
}

export function buildShapeDropdown() {
  const panel = document.getElementById('shapeDropdownPanel');
  panel.innerHTML = '';
  SHAPES.forEach(s => {
    const item = document.createElement('div');
    item.className = 'shape-option' + (s.value === S.currentShapeValue ? ' active' : '');
    item.dataset.value = s.value;
    item.innerHTML = `<svg width="40" height="26" viewBox="0 0 40 26" style="color:#9a9aa5">${s.svg}</svg><span>${s.label}</span>`;
    item.addEventListener('mousedown', ev => {
      ev.preventDefault(); ev.stopPropagation();
      setCurrentShape(s.value);
      panel.classList.remove('open');
    });
    panel.appendChild(item);
  });
  updateShapeDropdownBtn();

  document.getElementById('shapeDropdownBtn').addEventListener('click', ev => {
    ev.stopPropagation();
    const open = panel.classList.toggle('open');
    if (open) {
      const r = document.getElementById('shapeDropdownBtn').getBoundingClientRect();
      panel.style.left = r.left + 'px';
      panel.style.top = (r.bottom + 2) + 'px';
    }
  });
}
