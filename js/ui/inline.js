import { S } from '../state.js';

function autosize(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

export function activateInline(screenX, screenY, text, width, onConfirm) {
  const inlineInput = document.getElementById('inlineInput');
  S.inlineTarget = { onConfirm, cx: screenX, cy: screenY };
  inlineInput.value = text;
  const w = Math.max(width, 120);
  inlineInput.style.width = w + 'px';
  inlineInput.style.display = 'block';
  inlineInput.style.left = (screenX - w/2) + 'px';
  autosize(inlineInput);
  inlineInput.style.top = (screenY - inlineInput.offsetHeight/2) + 'px';
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
    ev.stopPropagation();
    if (ev.key === 'Enter' && (ev.shiftKey || ev.altKey)) {
      // Insert a real newline at the caret and grow the box.
      ev.preventDefault();
      const s = inlineInput.selectionStart, e = inlineInput.selectionEnd;
      inlineInput.value = inlineInput.value.slice(0, s) + '\n' + inlineInput.value.slice(e);
      inlineInput.selectionStart = inlineInput.selectionEnd = s + 1;
      autosize(inlineInput);
      if (S.inlineTarget) inlineInput.style.top = (S.inlineTarget.cy - inlineInput.offsetHeight/2) + 'px';
      return;
    }
    if (ev.key === 'Enter') { ev.preventDefault(); confirmInline(); return; }
    if (ev.key === 'Escape') { ev.preventDefault(); cancelInline(); return; }
  });
  inlineInput.addEventListener('input', () => {
    autosize(inlineInput);
    if (S.inlineTarget) inlineInput.style.top = (S.inlineTarget.cy - inlineInput.offsetHeight/2) + 'px';
  });
  inlineInput.addEventListener('blur', () => {
    setTimeout(confirmInline, 80);
  });
}
