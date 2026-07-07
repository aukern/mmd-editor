#!/usr/bin/env python3
"""
Mermaid Editor launcher.
- Starts a local HTTP server
- Exposes /api/list, /api/read, /api/write, /api/rename, /api/mtime
- Opens the browser automatically
- Shuts down when the tab is closed or after 5 min of inactivity
"""
import http.server
import json
import os
import re
import signal
import subprocess
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path

DIR = Path(__file__).parent
DIAGRAMS_DIR = DIR / "diagrams"
PID_FILE = DIR / ".server.pid"
IDLE_TIMEOUT = 300  # seconds

last_ping = time.time()

# ── Kill whatever is occupying port 8080 (our old instance or anything else) ──
def kill_port(port):
    try:
        result = subprocess.run(["ss", "-tlnpH", f"sport = :{port}"],
                                capture_output=True, text=True)
        for line in result.stdout.splitlines():
            m = re.search(r'pid=(\d+)', line)
            if m:
                pid = int(m.group(1))
                if pid != os.getpid():
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except (ProcessLookupError, PermissionError):
                        pass
    except Exception:
        pass

kill_port(8080)
time.sleep(0.6)  # let OS release the port
try:
    PID_FILE.unlink()
except FileNotFoundError:
    pass

PORT = 8080
PID_FILE.write_text(str(os.getpid()))
DIAGRAMS_DIR.mkdir(exist_ok=True)


_DIAGRAMS_NORM = os.path.normpath(str(DIAGRAMS_DIR)) + os.sep

def safe_path(name):
    """Validate name is within DIAGRAMS_DIR. Uses normpath (not resolve) so
    symlinks pointing outside diagrams/ are allowed — only path traversal via
    '..' is blocked."""
    if not name:
        return None
    p = DIAGRAMS_DIR / name
    norm = os.path.normpath(str(p))
    if not (norm + os.sep).startswith(_DIAGRAMS_NORM):
        return None
    return p


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIR), **kwargs)

    def end_headers(self):
        # Prevent browser from caching CSS/JS — ensures fresh files on every reload
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    # ── routing ──────────────────────────────────────────────────────────────
    def do_GET(self):
        global last_ping
        last_ping = time.time()

        if self.path == "/ping":
            return self._text(200, "ok")

        if self.path == "/shutdown":
            self._text(200, "bye")
            threading.Thread(target=_shutdown, daemon=True).start()
            return

        if self.path == "/api/list":
            files = []
            for root, dirs, fnames in os.walk(str(DIAGRAMS_DIR), followlinks=True):
                dirs.sort()
                for fname in sorted(fnames):
                    if fname.endswith('.mmd'):
                        rel = os.path.relpath(os.path.join(root, fname), str(DIAGRAMS_DIR))
                        files.append(rel)
            return self._json(200, files)

        if self.path.startswith("/api/read"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            name = qs.get("file", [""])[0]
            if not name:
                return self._text(400, "missing file param")
            p = safe_path(name)
            if not p:
                return self._text(403, "forbidden")
            if not p.exists():
                return self._text(404, "not found")
            return self._text(200, p.read_text(encoding="utf-8"))

        if self.path.startswith("/api/mtime"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            name = qs.get("file", [""])[0]
            p = safe_path(name)
            if not p or not p.exists():
                return self._text(404, "not found")
            return self._text(200, str(p.stat().st_mtime))

        super().do_GET()

    def do_POST(self):
        global last_ping
        last_ping = time.time()

        if self.path == "/shutdown":
            self._text(200, "bye")
            threading.Thread(target=_shutdown, daemon=True).start()
            return

        if self.path.startswith("/api/write"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            name = qs.get("file", [""])[0]
            if not name:
                return self._text(400, "missing file param")
            p = safe_path(name)
            if not p:
                return self._text(403, "forbidden")
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(body, encoding="utf-8")
            return self._text(200, "ok")

        if self.path.startswith("/api/rename"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            old_name = qs.get("from", [""])[0]
            new_name = qs.get("to", [""])[0]
            if not old_name or not new_name:
                return self._text(400, "missing from/to params")
            old_p = safe_path(old_name)
            new_p = safe_path(new_name)
            if not old_p or not new_p:
                return self._text(403, "forbidden")
            if not old_p.exists():
                return self._text(404, "source not found")
            if new_p.exists():
                return self._text(409, "target already exists")
            old_p.rename(new_p)
            return self._text(200, "ok")

        if self.path.startswith("/api/mkdir"):
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            dir_name = qs.get("dir", [""])[0]
            if not dir_name:
                return self._text(400, "missing dir param")
            p = safe_path(dir_name + "/__check__")
            if not p:
                return self._text(403, "forbidden")
            p.parent.mkdir(parents=True, exist_ok=True)
            return self._text(200, "ok")

        self._text(404, "not found")

    # ── helpers ───────────────────────────────────────────────────────────────
    def _text(self, code, body):
        b = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def _json(self, code, obj):
        b = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, fmt, *args):
        pass  # silent


def _shutdown():
    time.sleep(0.3)
    try:
        PID_FILE.unlink()
    except FileNotFoundError:
        pass
    print("\nServer stopped.")
    os._exit(0)


def watchdog():
    while True:
        time.sleep(10)
        if time.time() - last_ping > IDLE_TIMEOUT:
            print(f"\nNo activity for {IDLE_TIMEOUT}s — shutting down.")
            _shutdown()


import time as _t
url = f"http://localhost:{PORT}/index.html?nocache={int(_t.time())}"

server = http.server.ThreadingHTTPServer(("", PORT), Handler)
print(f"  Mermaid Editor → {url}")
print("  Close the browser tab (or press Ctrl+C) to stop.")

threading.Thread(target=lambda: (time.sleep(0.8), webbrowser.open(url)), daemon=True).start()
threading.Thread(target=watchdog, daemon=True).start()

try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
