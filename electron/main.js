const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('./server');

const REPO_URL = 'https://github.com/aukern/mmd-editor';

// App root (holds index.html, css/, js/). main.js lives in electron/, so it's one
// level up — works in dev and inside the packaged app.asar.
function appDir() {
  return path.join(__dirname, '..');
}

// Diagrams live in a writable user folder (the packaged app itself is read-only).
function diagramsDir() {
  const dir = process.env.MMD_DIAGRAMS || path.join(app.getPath('documents'), 'MermaidEditor');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let mainWindow = null;
let serverRef = null;

async function createWindow() {
  const { server, port } = await startServer(appDir(), diagramsDir());
  serverRef = server;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1a1b20',
    autoHideMenuBar: true,
    title: 'MMD Editor',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/index.html`);
  // Keep page zoom pinned at 100% — Ctrl+/- and pinch zoom the canvas, not the app.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(1);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });
  mainWindow.webContents.on('zoom-changed', () => mainWindow.webContents.setZoomFactor(1));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        // No zoomIn/zoomOut/resetZoom roles: their Ctrl+=/Ctrl+-/Ctrl+0 accelerators
        // would zoom the whole page. Those shortcuts are handled in the renderer to
        // zoom the canvas instead (see js/events.js).
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'View Source on GitHub', click: () => shell.openExternal(REPO_URL) },
        { label: 'Open Diagrams Folder', click: () => shell.openPath(diagramsDir()) },
        { type: 'separator' },
        {
          label: 'About MMD Editor',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'MMD Editor',
            message: `MMD Editor ${app.getVersion()}`,
            detail: `Visual editor for Mermaid flowcharts, with live view for all Mermaid diagram types.\n\n${REPO_URL}\n\nMIT License. Bundles Mermaid and dagre (MIT) — see THIRD-PARTY-NOTICES.`,
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Single-instance: focus the existing window instead of opening a second one.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => {
    if (serverRef) { try { serverRef.close(); } catch (_) {} }
    app.quit();
  });
}
