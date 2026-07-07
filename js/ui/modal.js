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

// Build a nested tree from flat path list
function buildTree(files) {
  const root = { dirs: {}, files: [] };
  for (const f of files) {
    const parts = f.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.dirs[parts[i]]) node.dirs[parts[i]] = { dirs: {}, files: [] };
      node = node.dirs[parts[i]];
    }
    node.files.push(f);
  }
  return root;
}

const collapsedDirs = new Set();

function renderFileTree(files, container, query, onOpen) {
  container.innerHTML = '';
  const noMatch = document.getElementById('fileNoMatch');
  const q = (query || '').toLowerCase().trim();

  // Search mode: flat list of matching files with full paths
  if (q) {
    const filtered = files.filter(f => f.toLowerCase().includes(q));
    if (!filtered.length) {
      if (noMatch) noMatch.style.display = 'block';
      return;
    }
    if (noMatch) noMatch.style.display = 'none';
    filtered.forEach(f => {
      const item = document.createElement('div');
      item.className = 'file-item';
      item.textContent = f;
      item.addEventListener('click', () => onOpen(f, item));
      container.appendChild(item);
    });
    return;
  }

  if (noMatch) noMatch.style.display = 'none';

  if (!files.length) {
    container.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">No .mmd files found.</div>';
    return;
  }

  const tree = buildTree(files);

  function renderNode(node, depth, pathPrefix) {
    const dirs = Object.keys(node.dirs).sort();
    const nodeFiles = [...node.files].sort();

    for (const dir of dirs) {
      const fullPath = pathPrefix ? pathPrefix + '/' + dir : dir;
      const isOpen = !collapsedDirs.has(fullPath);
      const folderEl = document.createElement('div');
      folderEl.className = 'file-folder';
      folderEl.style.paddingLeft = (depth * 14) + 'px';
      folderEl.innerHTML =
        `<span class="folder-toggle">${isOpen ? '▾' : '▸'}</span>` +
        `<span class="folder-name">${dir}</span>`;
      folderEl.addEventListener('click', ev => {
        ev.stopPropagation();
        if (collapsedDirs.has(fullPath)) collapsedDirs.delete(fullPath);
        else collapsedDirs.add(fullPath);
        renderFileTree(files, container, query, onOpen);
      });
      container.appendChild(folderEl);
      if (isOpen) renderNode(node.dirs[dir], depth + 1, fullPath);
    }

    for (const file of nodeFiles) {
      const basename = file.split('/').pop();
      const item = document.createElement('div');
      item.className = 'file-item';
      item.style.paddingLeft = (depth * 14 + (depth > 0 ? 18 : 4)) + 'px';
      item.textContent = basename;
      item.title = file;
      item.addEventListener('click', () => onOpen(file, item));
      container.appendChild(item);
    }
  }

  renderNode(tree, 0, '');
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
  let isOpening = false;

  async function openFile(name, itemEl) {
    if (isOpening) return;
    isOpening = true;
    if (itemEl) itemEl.style.opacity = '0.5';
    showFileError('');
    if (S.activeTabIdx >= 0 && S.tabs[S.activeTabIdx] && !S.tabs[S.activeTabIdx].filename) {
      const tabEls = document.querySelectorAll('#tabBar .tab');
      if (tabEls[S.activeTabIdx]) {
        const lbl = tabEls[S.activeTabIdx].querySelector('.tab-label');
        if (lbl) lbl.textContent = name.split('/').pop();
      }
    }
    try {
      const text = await serverRead(name);
      loadIntoCurrentTab(name, text);
      document.getElementById('statusText').textContent = `Opened: ${name}`;
    } catch(e) {
      showFileError('Read failed: ' + e.message);
    } finally {
      isOpening = false;
      if (itemEl) itemEl.style.opacity = '';
    }
  }

  document.getElementById('modalOpenBtn').addEventListener('click', async () => {
    const panel = document.getElementById('fileListPanel');
    if (panel.style.display === 'block') { panel.style.display = 'none'; showFileError(''); return; }
    panel.innerHTML = '<div style="padding:10px;color:var(--muted);font-size:12px">Loading…</div>';
    panel.style.display = 'block';
    isOpening = false;
    cachedFiles = await serverList();
    panel.innerHTML = '';
    const searchInput = document.getElementById('fileSearchInput');
    if (searchInput) {
      searchInput.style.display = 'block';
      searchInput.value = '';
    }
    renderFileTree(cachedFiles, panel, '', openFile);
    if (searchInput) {
      searchInput.oninput = () => renderFileTree(cachedFiles, panel, searchInput.value, openFile);
    }
  });

  document.getElementById('fileSearchInput').addEventListener('input', function() {
    const panel = document.getElementById('fileListPanel');
    if (panel.style.display === 'block') renderFileTree(cachedFiles, panel, this.value, openFile);
  });

  function populateFolderSelect(files) {
    const sel = document.getElementById('newFolderSelect');
    if (!sel) return;
    // Collect all unique folder paths from file list
    const folders = new Set();
    files.forEach(f => {
      const parts = f.split('/');
      for (let i = 1; i < parts.length; i++) {
        folders.add(parts.slice(0, i).join('/'));
      }
    });
    sel.innerHTML = '';
    const rootOpt = document.createElement('option');
    rootOpt.value = '';
    rootOpt.textContent = '/ (root)';
    sel.appendChild(rootOpt);
    [...folders].sort().forEach(folder => {
      const opt = document.createElement('option');
      opt.value = folder;
      opt.textContent = folder + '/';
      sel.appendChild(opt);
    });
  }

  document.getElementById('modalNewBtn').addEventListener('click', async () => {
    const row = document.getElementById('newFileRow');
    const showing = row.style.display !== 'none' && row.style.display !== '';
    row.style.display = showing ? 'none' : 'block';
    if (!showing) {
      // Refresh file list for folder options if not already loaded
      if (!cachedFiles.length) cachedFiles = await serverList();
      populateFolderSelect(cachedFiles);
      document.getElementById('newFileInput').value = '';
      document.getElementById('newFileInput').focus();
      showCreateError('');
    }
  });

  async function createNewFile() {
    const folder = document.getElementById('newFolderSelect')?.value.trim() || '';
    let filename = document.getElementById('newFileInput').value.trim();
    if (!filename) return;
    if (!filename.endsWith('.mmd')) filename += '.mmd';
    // If user typed a path in the filename (e.g. "sub/name"), respect it over the select
    const name = filename.includes('/') ? filename : (folder ? folder + '/' + filename : filename);
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
    if (ev.key !== 'Enter') showCreateError('');
  });
  document.getElementById('newFileInput').addEventListener('input', () => {
    showCreateError('');
    document.getElementById('newFileInput').style.borderColor = '';
  });
}
