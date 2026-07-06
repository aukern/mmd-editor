import { S } from '../state.js';
import { serverList, serverRead, serverWrite, serverMtime } from '../file.js';
import { extractSnapshotsFromText, refreshHistoryPanel, takeSnapshot } from '../history.js';
import { openInNewTab, newTab, renderTabBar, loadIntoCurrentTab, syncModal } from '../tabs.js';

export function closeModal() {
  document.getElementById('startupModal').style.display = 'none';
}

function showFileError(msg) {
  let el = document.getElementById('fileOpenError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fileOpenError';
    el.style.cssText = 'color:#c0504d;font-size:11px;padding:6px 10px;text-align:left';
    document.getElementById('fileListPanel').before(el);
  }
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

function showCreateError(msg) {
  let el = document.getElementById('newFileError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'newFileError';
    el.style.cssText = 'color:#c0504d;font-size:11px;margin-top:4px;text-align:left';
    document.getElementById('newFileInput').insertAdjacentElement('afterend', el);
  }
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
  if (msg) document.getElementById('newFileInput').style.borderColor = '#c0504d';
  else document.getElementById('newFileInput').style.borderColor = '';
}

function buildFileList(files, container, searchValue, onOpen) {
  container.innerHTML = '';
  const noMatch = document.getElementById('fileNoMatch');
  const query = (searchValue || '').toLowerCase();
  const filtered = query ? files.filter(f => f.toLowerCase().includes(query)) : files;
  if (!filtered.length) {
    if (noMatch) noMatch.style.display = 'block';
    return;
  }
  if (noMatch) noMatch.style.display = 'none';
  filtered.forEach(name => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.textContent = name;
    item.addEventListener('click', () => onOpen(name, item));
    container.appendChild(item);
  });
}

export function initModal() {
  const isFileProt = window.location.protocol === 'file:';

  if (isFileProt) {
    document.getElementById('startupModal').innerHTML = `
      <div class="modal-card" style="max-width:500px;text-align:left">
        <div style="font-size:36px;text-align:center;margin-bottom:12px">⚠</div>
        <h2 style="text-align:center;margin-bottom:14px">Use launch.sh to open</h2>
        <p>You opened this file directly. Run <code style="background:#0f1014;padding:2px 5px;border-radius:4px">launch.sh</code> in the <code style="background:#0f1014;padding:2px 5px;border-radius:4px">mmd-editor</code> folder — it starts the server and opens the browser automatically.</p>
      </div>`;
    return;
  }

  let cachedFiles = [];
  // Shared lock — only one file open at a time
  let isOpening = false;

  async function openFile(name, itemEl) {
    if (isOpening) return;
    isOpening = true;
    if (itemEl) itemEl.style.opacity = '0.5';
    showFileError('');
    // Optimistically update the tab label before the async read completes
    const { renderTabBar } = window._editorTabs || {};
    if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx] && !S.tabs[S.activeTabIdx].filename) {
      S.tabs[S.activeTabIdx].filename = name;  // show name immediately
      if (renderTabBar) renderTabBar();
    }
    try {
      const text = await serverRead(name);
      loadIntoCurrentTab(name, text);
      document.getElementById('statusText').textContent = `Opened: ${name}`;
    } catch(e) {
      // Revert optimistic update on failure
      if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx]) S.tabs[S.activeTabIdx].filename = null;
      if (renderTabBar) renderTabBar();
      showFileError('Read failed: ' + e.message);
      isOpening = false;
      if (itemEl) itemEl.style.opacity = '';
    }
  }

  document.getElementById('modalOpenBtn').addEventListener('click', async () => {
    const panel = document.getElementById('fileListPanel');
    if (panel.style.display === 'block') { panel.style.display = 'none'; showFileError(''); return; }
    panel.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">Loading…</div>';
    panel.style.display = 'block';
    isOpening = false;  // reset lock whenever file list is freshly opened
    cachedFiles = await serverList();
    panel.innerHTML = '';
    if (!cachedFiles.length) {
      panel.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">No .mmd files found.</div>';
      return;
    }
    const searchInput = document.getElementById('fileSearchInput');
    if (searchInput) {
      searchInput.style.display = 'block';
      searchInput.value = '';
      buildFileList(cachedFiles, panel, '', openFile);
      searchInput.oninput = () => buildFileList(cachedFiles, panel, searchInput.value, openFile);
    } else {
      buildFileList(cachedFiles, panel, '', openFile);
    }
  });

  document.getElementById('fileSearchInput').addEventListener('input', function() {
    const panel = document.getElementById('fileListPanel');
    if (panel.style.display === 'block') buildFileList(cachedFiles, panel, this.value, openFile);
  });

  document.getElementById('modalNewBtn').addEventListener('click', () => {
    const row = document.getElementById('newFileRow');
    const showing = row.style.display !== 'none' && row.style.display !== '';
    row.style.display = showing ? 'none' : 'block';
    if (!showing) {
      document.getElementById('newFileInput').focus();
      showCreateError('');
    }
  });

  async function createNewFile() {
    let name = document.getElementById('newFileInput').value.trim();
    if (!name) return;
    if (!name.endsWith('.mmd')) name += '.mmd';
    showCreateError('');
    if (!cachedFiles.length) cachedFiles = await serverList();
    if (cachedFiles.includes(name)) {
      showCreateError(`"${name}" already exists — open it instead.`);
      document.getElementById('newFileInput').select();
      return;
    }
    try {
      const blank = 'flowchart TD\n';
      await serverWrite(name, blank);
      cachedFiles.push(name);
      loadIntoCurrentTab(name, blank);
      document.getElementById('statusText').textContent = `Created: ${name}`;
    } catch(e) {
      showCreateError('Create failed: ' + e.message);
    }
  }

  document.getElementById('modalNewConfirmBtn').addEventListener('click', createNewFile);
  document.getElementById('newFileInput').addEventListener('keydown', ev => {
    if (ev.key === 'Enter') createNewFile();
    if (ev.key !== 'Enter') showCreateError('');  // clear error on typing
  });
  document.getElementById('newFileInput').addEventListener('input', () => {
    showCreateError('');
    document.getElementById('newFileInput').style.borderColor = '';
  });
}
