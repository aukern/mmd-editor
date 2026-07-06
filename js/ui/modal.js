import { S } from '../state.js';
import { serverList, serverRead, serverWrite, serverMtime } from '../file.js';
import { extractSnapshotsFromText, refreshHistoryPanel, takeSnapshot } from '../history.js';
import { openInNewTab, newTab, renderTabBar } from '../tabs.js';

export function closeModal() {
  document.getElementById('startupModal').style.display = 'none';
}

function buildFileList(files, container, searchValue) {
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
    item.addEventListener('click', async () => {
      try {
        const text = await serverRead(name);
        closeModal();
        openInNewTab(name, text);
        // Update mtime after opening
        const mtime = await serverMtime(name);
        if (mtime !== null) S.lastKnownMtime = mtime;
        document.getElementById('statusText').textContent = `Opened: ${name}`;
      } catch(e) {
        document.getElementById('statusText').textContent = 'Read failed: ' + e.message;
      }
    });
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

  document.getElementById('modalOpenBtn').addEventListener('click', async () => {
    const panel = document.getElementById('fileListPanel');
    if (panel.style.display === 'block') { panel.style.display = 'none'; return; }
    panel.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">Loading…</div>';
    panel.style.display = 'block';
    cachedFiles = await serverList();
    panel.innerHTML = '';
    if (!cachedFiles.length) {
      panel.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">No .mmd files found in the editor folder.</div>';
      return;
    }
    // Show search
    const searchInput = document.getElementById('fileSearchInput');
    if (searchInput) {
      searchInput.style.display = 'block';
      searchInput.value = '';
      buildFileList(cachedFiles, panel, '');
      searchInput.oninput = () => buildFileList(cachedFiles, panel, searchInput.value);
    } else {
      buildFileList(cachedFiles, panel, '');
    }
  });

  document.getElementById('fileSearchInput').addEventListener('input', function() {
    const panel = document.getElementById('fileListPanel');
    if (panel.style.display === 'block') buildFileList(cachedFiles, panel, this.value);
  });

  document.getElementById('modalNewBtn').addEventListener('click', () => {
    const row = document.getElementById('newFileRow');
    row.style.display = row.style.display === 'none' ? 'block' : 'none';
    if (row.style.display === 'block') document.getElementById('newFileInput').focus();
  });

  async function createNewFile() {
    let name = document.getElementById('newFileInput').value.trim();
    if (!name) return;
    if (!name.endsWith('.mmd')) name += '.mmd';
    try {
      const blank = 'flowchart TD\n';
      await serverWrite(name, blank);
      closeModal();
      newTab(name);
      document.getElementById('statusText').textContent = `Created: ${name}`;
    } catch(e) {
      document.getElementById('statusText').textContent = 'Create failed: ' + e.message;
    }
  }

  document.getElementById('modalNewConfirmBtn').addEventListener('click', createNewFile);
  document.getElementById('newFileInput').addEventListener('keydown', ev => { if (ev.key === 'Enter') createNewFile(); });
}
