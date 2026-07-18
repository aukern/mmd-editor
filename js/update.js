// ── Update notifier ───────────────────────────────────────────────────────────
// On startup (and every few hours) checks GitHub for a newer release and shows a small
// dismissible banner if one exists. Frontend-only, so it behaves identically in the
// browser and the desktop app; fails silently when offline or rate-limited. The
// "Download" link opens the release page in the real browser (Electron routes external
// links via shell.openExternal — see electron/main.js).

const REPO = 'aukern/mmd-editor';
const DISMISS_KEY = 'mmd.updateDismissed';

// Single source of truth for the running version: the startup-modal version label.
function currentVersion() {
  const el = document.querySelector('.modal-version');
  const m = (el && el.textContent || '').match(/(\d+)\.(\d+)\.(\d+)/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

// Numeric semver compare: >0 when a is newer than b.
function cmpVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

function showBanner(version, url) {
  if (document.getElementById('updateBanner')) return;
  const b = document.createElement('div');
  b.id = 'updateBanner';
  b.className = 'update-banner';
  b.innerHTML =
    `<span class="ub-dot">●</span>` +
    `<span class="ub-msg">Version <b>v${version}</b> is available.</span>` +
    `<a class="ub-link" target="_blank" rel="noopener">Download</a>` +
    `<button class="ub-close" title="Dismiss">×</button>`;
  b.querySelector('.ub-link').href = url;
  b.querySelector('.ub-close').addEventListener('click', () => {
    try { localStorage.setItem(DISMISS_KEY, version); } catch (e) {}   // don't nag for this version
    b.remove();
  });
  document.body.appendChild(b);
}

async function checkForUpdate() {
  try {
    const cur = currentVersion();
    if (!cur) return;
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`,
      { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!r.ok) return;
    const rel = await r.json();
    const m = (rel.tag_name || '').match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) return;
    const latest = `${m[1]}.${m[2]}.${m[3]}`;
    if (cmpVersions(latest, cur) <= 0) return;                 // already current (or ahead)
    let dismissed = null;
    try { dismissed = localStorage.getItem(DISMISS_KEY); } catch (e) {}
    if (dismissed === latest) return;                          // user dismissed this version
    showBanner(latest, rel.html_url || `https://github.com/${REPO}/releases/latest`);
  } catch (e) { /* offline / rate-limited / blocked — silently skip */ }
}

export function initUpdateCheck() {
  setTimeout(checkForUpdate, 2500);                            // after first render settles
  setInterval(checkForUpdate, 6 * 60 * 60 * 1000);            // and periodically for long sessions
}
