import { S } from '../state.js';

export function activateInline(screenX, screenY, text, width, onConfirm) {
  const inlineInput = document.getElementById('inlineInput');
  S.inlineTarget = { onConfirm };
  inlineInput.value = text;
  const w = Math.max(width, 120);
  inlineInput.style.left = (screenX - w/2) + 'px';
  inlineInput.style.top = (screenY - 15) + 'px';
  inlineInput.style.width = w + 'px';
  inlineInput.style.display = 'block';
  setTimeout(() => { inlineInput.focus(); inlineInput.select(); }, 0);
}

export function confirmInline() {
  const inlineInput = document.getElementById('inlineInput');
  if (!S.inlineTarget) return;
  const val = inlineInput.value;
  const cb = S.inlineTarget.onConfirm;
  S.inlineTarget = null;
  inlineInput.style.display = 'none';
  cb(val);
}

export function cancelInline() {
  const inlineInput = document.getElementById('inlineInput');
  S.inlineTarget = null;
  inlineInput.style.display = 'none';
}

export function initInline() {
  // Move inlineInput inside canvasWrap so absolute positioning works correctly
  const inlineInput = document.getElementById('inlineInput');
  const canvasWrap = document.getElementById('canvasWrap');
  if (inlineInput && canvasWrap && inlineInput.parentNode !== canvasWrap) {
    canvasWrap.appendChild(inlineInput);
  }
  inlineInput.addEventListener('keydown', ev => {
    if (ev.key === 'Enter') { ev.preventDefault(); confirmInline(); }
    if (ev.key === 'Escape') { ev.preventDefault(); cancelInline(); }
    ev.stopPropagation();
  });
  inlineInput.addEventListener('blur', () => {
    setTimeout(confirmInline, 80);
  });
}
