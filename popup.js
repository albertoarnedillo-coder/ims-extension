const API_BASE = 'http://172.20.149.114:3000/api';

// ─── DOM helpers ──────────────────────────────────────────────────────────────
function $(id)       { return document.getElementById(id); }
function show(el)    { el?.classList.remove('hidden'); }
function hide(el)    { el?.classList.add('hidden'); }

function showView(name) {
  ['view-loading', 'view-login', 'view-main'].forEach(id => hide($(id)));
  show($(name));
}

// ─── Background messaging ─────────────────────────────────────────────────────
function bgMessage(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function login() {
  const errorEl = $('login-error');
  hide(errorEl);

  let code;
  try {
    const clientId    = '113835763265-ptv5hp61pc02re7asuad015mebgr4m91.apps.googleusercontent.com';
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl     = 'https://accounts.google.com/o/oauth2/auth'
      + '?client_id='    + encodeURIComponent(clientId)
      + '&response_type=code'
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&scope='        + encodeURIComponent('openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/contacts.readonly')
      + '&access_type=offline'
      + '&prompt=consent';

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, url => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(url);
      });
    });

    code = new URLSearchParams(new URL(responseUrl).search).get('code');
    if (!code) throw new Error('No authorization code');
  } catch {
    if (errorEl) errorEl.textContent = 'Google sign-in was cancelled or failed.';
    show(errorEl);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, redirectUri: chrome.identity.getRedirectURL() }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const { accessToken, refreshToken, user } = await res.json();
    await bgMessage({ type: 'LOGIN', accessToken, refreshToken, user });
    await renderMain(user);
  } catch {
    if (errorEl) errorEl.textContent = 'Could not connect to IMS backend. Is the server running?';
    show(errorEl);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
  await bgMessage({ type: 'LOGOUT' });
  showView('view-login');
}

// ─── Main view ────────────────────────────────────────────────────────────────
async function renderMain(user) {
  showView('view-main');

  const nameEl = $('user-name');
  if (nameEl) nameEl.textContent = user?.name || user?.email || 'User';

  const avatarEl = $('user-avatar');
  const src = user?.avatar_url || user?.picture;
  if (avatarEl && src) { avatarEl.src = src; avatarEl.alt = user?.name || ''; }

  await loadStats();
}

async function loadStats() {
  const dash = await bgMessage({ type: 'GET_DASHBOARD' });
  if (!dash) return;
  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('stat-credits',    dash.credits?.balance    ?? '—');
  set('stat-unknown',    dash.contacts?.unknown   ?? '—');
  set('stat-suspicious', dash.contacts?.suspicious ?? '—');
}

// ─── Scan inbox ───────────────────────────────────────────────────────────────
async function scanInbox() {
  const btn     = $('btn-scan');
  const spinner = $('scan-spinner');
  if (!btn) return;

  btn.disabled = true;
  show(spinner);

  const result = await bgMessage({ type: 'SCAN_INBOX' });
  await loadStats();

  hide(spinner);
  btn.disabled = false;

  if (result) {
    const label = btn.querySelector('.btn-label') || btn;
    const prev  = label.textContent;
    label.textContent = `Scanned ${result.scanned ?? '?'} emails`;
    setTimeout(() => { label.textContent = prev; }, 2500);
  }
}

// ─── Buy credits ─────────────────────────────────────────────────────────────
async function buyCredits() {
  await bgMessage({ type: 'PURCHASE_CREDITS', packageId: 'starter' });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  showView('view-loading');
  hide($('login-error'));

  const { authenticated, user } = await bgMessage({ type: 'GET_AUTH_STATUS' });

  if (!authenticated) { showView('view-login'); return; }
  await renderMain(user);
}

// ─── Wire up (inside DOMContentLoaded so DOM is guaranteed ready) ─────────────
document.addEventListener('DOMContentLoaded', () => {
  $('btn-login')  ?.addEventListener('click', login);
  $('btn-logout') ?.addEventListener('click', logout);
  $('btn-scan')   ?.addEventListener('click', scanInbox);
  $('btn-options')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('btn-buy')    ?.addEventListener('click', buyCredits);

  init();
});
