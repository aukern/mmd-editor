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
let treeSeeded = false;

// All .mmd paths under a tree node (recursive) — powers the folder count + "Open all".
function filesUnder(node) {
  let out = [...node.files];
  for (const d of Object.keys(node.dirs)) out = out.concat(filesUnder(node.dirs[d]));
  return out;
}

// Collapse every folder by default so the picker stays compact and scannable at any
// scale. Root files are always visible; folders are opened on demand.
function seedCollapsed(node, prefix) {
  for (const dir of Object.keys(node.dirs)) {
    const full = prefix ? prefix + '/' + dir : dir;
    collapsedDirs.add(full);
    seedCollapsed(node.dirs[dir], full);
  }
}

function fileRow(fullPath, onOpen, showFullPath) {
  const item = document.createElement('div');
  item.className = 'file-row';
  item.innerHTML = `<span class="file-icon">📄</span><span class="file-name"></span>`;
  item.querySelector('.file-name').textContent = showFullPath ? fullPath : fullPath.split('/').pop();
  item.title = fullPath;
  item.addEventListener('click', () => onOpen(fullPath, item));
  return item;
}

function renderFileTree(files, container, query, onOpen, onOpenAll) {
  container.innerHTML = '';
  const noMatch = document.getElementById('fileNoMatch');
  const q = (query || '').toLowerCase().trim();

  // Search mode: flat list of matching files, showing full paths for disambiguation.
  if (q) {
    const filtered = files.filter(f => f.toLowerCase().includes(q)).sort();
    if (!filtered.length) { if (noMatch) noMatch.style.display = 'block'; return; }
    if (noMatch) noMatch.style.display = 'none';
    filtered.forEach(f => container.appendChild(fileRow(f, onOpen, true)));
    return;
  }
  if (noMatch) noMatch.style.display = 'none';

  if (!files.length) {
    container.innerHTML = '<div class="file-empty">No .mmd files found.</div>';
    return;
  }

  const tree = buildTree(files);
  if (!treeSeeded) { collapsedDirs.clear(); seedCollapsed(tree, ''); treeSeeded = true; }

  // Files at each level first, then subfolders — uniform at every depth, so root files
  // sit at the top and every folder's contents are clearly enclosed below it.
  const renderLevel = (node, into, prefix) => {
    [...node.files].sort().forEach(f => into.appendChild(fileRow(f, onOpen, false)));
    Object.keys(node.dirs).sort().forEach(dir => {
      const full = prefix ? prefix + '/' + dir : dir;
      const child = node.dirs[dir];
      const isOpen = !collapsedDirs.has(full);
      const count = filesUnder(child).length;

      const section = document.createElement('div');
      section.className = 'folder-section';
      const header = document.createElement('div');
      header.className = 'folder-header';
      header.innerHTML =
        `<span class="folder-toggle">${isOpen ? '▾' : '▸'}</span>` +
        `<span class="folder-icon">📁</span>` +
        `<span class="folder-name"></span>` +
        `<span class="folder-count">${count}</span>` +
        `<button class="folder-openall" title="Open all ${count} file(s) in this folder as tabs">Open all</button>`;
      header.querySelector('.folder-name').textContent = dir;
      header.addEventListener('click', ev => {
        if (ev.target.closest('.folder-openall')) return;
        if (collapsedDirs.has(full)) collapsedDirs.delete(full); else collapsedDirs.add(full);
        renderFileTree(files, container, query, onOpen, onOpenAll);
      });
      header.querySelector('.folder-openall').addEventListener('click', ev => {
        ev.stopPropagation();
        onOpenAll(filesUnder(child));
      });
      section.appendChild(header);

      if (isOpen) {
        const body = document.createElement('div');
        body.className = 'folder-body';
        renderLevel(child, body, full);
        section.appendChild(body);
      }
      into.appendChild(section);
    });
  };

  renderLevel(tree, container, '');
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

  // Reset the picker so it re-fetches fresh next time it's opened. Called whenever
  // the startup modal (re)appears — otherwise the list shows whatever was rendered
  // the first time, missing files added (or symlinked) while the app is open.
  function resetFilePicker() {
    cachedFiles = [];
    isOpening = false;
    treeSeeded = false;          // re-collapse folders to defaults on each fresh open
    const panel = document.getElementById('fileListPanel');
    if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
    const search = document.getElementById('fileSearchInput');
    if (search) { search.style.display = 'none'; search.value = ''; }
    const row = document.getElementById('newFileRow');
    if (row) row.style.display = 'none';
    const noMatch = document.getElementById('fileNoMatch');
    if (noMatch) noMatch.style.display = 'none';
    showFileError('');
  }
  window._editorModal = { resetFilePicker };

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

  // Open every file in a folder — the first adopts the pending tab, the rest open as
  // new tabs (loadIntoCurrentTab routes to a new tab once the current one has a file).
  async function openAllFiles(list) {
    list = [...new Set(list)].sort();
    if (!list.length) return;
    if (list.length > 20 && !window.confirm(`Open all ${list.length} files as tabs?`)) return;
    showFileError('');
    let ok = 0;
    for (const name of list) {
      try { const text = await serverRead(name); loadIntoCurrentTab(name, text); ok++; }
      catch (e) { /* skip a file that can't be read, keep going */ }
    }
    document.getElementById('statusText').textContent = `Opened ${ok} of ${list.length} file(s).`;
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
    renderFileTree(cachedFiles, panel, '', openFile, openAllFiles);
    if (searchInput) {
      searchInput.oninput = () => renderFileTree(cachedFiles, panel, searchInput.value, openFile, openAllFiles);
    }
  });

  document.getElementById('fileSearchInput').addEventListener('input', function() {
    const panel = document.getElementById('fileListPanel');
    if (panel.style.display === 'block') renderFileTree(cachedFiles, panel, this.value, openFile, openAllFiles);
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
