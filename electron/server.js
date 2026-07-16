// Local HTTP server for the Electron app — a Node port of launch.py.
// Serves the static frontend from `appDir` and the file API over `diagramsDir`.
// Binds a stable port on 127.0.0.1 (see STABLE_PORT below) so the origin — and thus
// localStorage — persists across launches; falls back to an ephemeral port only if it's
// taken. No idle-shutdown, no pid file; the Electron window lifecycle owns the process.
// /ping and /shutdown are accepted as no-ops so the frontend's existing calls stay harmless.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mmd': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Validate `name` stays within diagramsDir (blocks ../ traversal).
function safePath(diagramsDir, name) {
  if (!name) return null;
  const base = path.resolve(diagramsDir);
  const p = path.resolve(base, name);
  if (p !== base && !p.startsWith(base + path.sep)) return null;
  return p;
}

// Recursively list *.mmd under diagramsDir, forward-slash relative paths, sorted.
// Follows symlinked files and directories (so you can symlink files/folders from
// anywhere into the diagrams folder), with cycle protection via realpath.
function listMmd(diagramsDir) {
  const out = [];
  const seen = new Set();
  const walk = (dir, rel) => {
    let real;
    try { real = fs.realpathSync(dir); } catch { return; }
    if (seen.has(real)) return;               // guard against symlink cycles
    seen.add(real);
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      let isDir = e.isDirectory(), isFile = e.isFile();
      if (e.isSymbolicLink()) {
        try { const st = fs.statSync(full); isDir = st.isDirectory(); isFile = st.isFile(); }
        catch { continue; }                   // broken/dangling symlink
      }
      if (isDir) walk(full, r);
      else if (isFile && e.name.endsWith('.mmd')) out.push(r);
    }
  };
  walk(diagramsDir, '');
  return out;
}

function sendText(res, code, body, type = 'text/plain; charset=utf-8') {
  const buf = Buffer.from(body, 'utf-8');
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store' });
  res.end(buf);
}

function serveStatic(res, appDir, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(appDir, rel));
  const base = path.resolve(appDir);
  if (path.resolve(filePath) !== base && !path.resolve(filePath).startsWith(base + path.sep)) {
    return sendText(res, 403, 'forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'not found');
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

function handle(req, res, appDir, diagramsDir) {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const q = u.searchParams;

  if (p === '/ping') return sendText(res, 200, 'ok');
  if (p === '/shutdown') return sendText(res, 200, 'bye'); // no-op; Electron owns lifecycle

  if (req.method === 'GET') {
    if (p === '/api/list') return sendText(res, 200, JSON.stringify(listMmd(diagramsDir)), MIME['.json']);
    if (p === '/api/read') {
      const name = q.get('file');
      if (!name) return sendText(res, 400, 'missing file param');
      const fp = safePath(diagramsDir, name);
      if (!fp) return sendText(res, 403, 'forbidden');
      if (!fs.existsSync(fp)) return sendText(res, 404, 'not found');
      return sendText(res, 200, fs.readFileSync(fp, 'utf-8'));
    }
    if (p === '/api/mtime') {
      const name = q.get('file');
      const fp = safePath(diagramsDir, name);
      if (!fp || !fs.existsSync(fp)) return sendText(res, 404, 'not found');
      return sendText(res, 200, String(fs.statSync(fp).mtimeMs / 1000));
    }
    return serveStatic(res, appDir, p);
  }

  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      if (p === '/api/write') {
        const name = q.get('file');
        if (!name) return sendText(res, 400, 'missing file param');
        const fp = safePath(diagramsDir, name);
        if (!fp) return sendText(res, 403, 'forbidden');
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, body, 'utf-8');
        return sendText(res, 200, 'ok');
      }
      if (p === '/api/rename') {
        const oldName = q.get('from'), newName = q.get('to');
        if (!oldName || !newName) return sendText(res, 400, 'missing from/to params');
        const oldP = safePath(diagramsDir, oldName), newP = safePath(diagramsDir, newName);
        if (!oldP || !newP) return sendText(res, 403, 'forbidden');
        if (!fs.existsSync(oldP)) return sendText(res, 404, 'source not found');
        if (fs.existsSync(newP)) return sendText(res, 409, 'target already exists');
        fs.mkdirSync(path.dirname(newP), { recursive: true });
        fs.renameSync(oldP, newP);
        return sendText(res, 200, 'ok');
      }
      if (p === '/api/mkdir') {
        const dirName = q.get('dir');
        if (!dirName) return sendText(res, 400, 'missing dir param');
        const fp = safePath(diagramsDir, dirName + '/__check__');
        if (!fp) return sendText(res, 403, 'forbidden');
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        return sendText(res, 200, 'ok');
      }
      sendText(res, 404, 'not found');
    });
    return;
  }

  sendText(res, 405, 'method not allowed');
}

// A STABLE loopback port keeps the origin (http://127.0.0.1:PORT) constant across
// launches, so localStorage-backed settings ("reopen last files on startup", etc.)
// actually persist — an ephemeral port gives a new origin every launch and silently
// wipes them. The single-instance lock prevents the app colliding with itself; if the
// port is held by something else, we fall back to an ephemeral one (that run just won't
// remember settings).
const STABLE_PORT = 39400;

function startServer(appDir, diagramsDir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try { handle(req, res, appDir, diagramsDir); }
      catch (e) { sendText(res, 500, 'server error: ' + (e && e.message)); }
    });
    let usedFallback = false;
    server.on('error', (err) => {
      if (!usedFallback && err && err.code === 'EADDRINUSE') {
        usedFallback = true;
        server.listen(0, '127.0.0.1');     // stable port busy → ephemeral fallback
      } else {
        reject(err);
      }
    });
    server.on('listening', () => resolve({ server, port: server.address().port }));
    server.listen(STABLE_PORT, '127.0.0.1');
  });
}

module.exports = { startServer, listMmd, safePath };

// Allow running standalone for testing: `node electron/server.js [appDir] [diagramsDir]`
if (require.main === module) {
  const appDir = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const diagramsDir = path.resolve(process.argv[3] || path.join(appDir, 'diagrams'));
  fs.mkdirSync(diagramsDir, { recursive: true });
  startServer(appDir, diagramsDir).then(({ port }) => {
    console.log(`server: http://127.0.0.1:${port}  app=${appDir}  diagrams=${diagramsDir}`);
  });
}
