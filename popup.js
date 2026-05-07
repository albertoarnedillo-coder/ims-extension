const API_BASE = 'http://172.20.149.114:3000/api';

// ─── View management ──────────────────────────────────────────────────────────
const views = {
  loading: document.getElementById('view-loading'),
  login:   document.getElementById('view-login'),
  main:    document.getElementById('view-main'),
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

// ─── Background messaging ──────────────────────────────────────────────────────
function bgMessage(msg) {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve));
}

// ─── Login flow ───────────────────────────────────────────────────────────────
async function login() {
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  // 1. Get Google auth code via Chrome identity
  let code;
  try {
    const clientId    = '113835763265-ptv5hp61pc02re7asuad015mebgr4m91.apps.googleusercontent.com';
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl     = 'https://accounts.google.com/o/oauth2/auth'
      + '?client_id='    + encodeURIComponent(clientId)
      + '&response_type=code'
      + '&redirect_uri=' + encodeURIComponent(redirectUri)
      + '&scope='        + encodeURIComponent('openid email profile')
      + '&access_type=offline'
      + '&prompt=consent';

    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, url => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(url);
      });
    });

    const params = new URLSearchParams(new URL(responseUrl).search);
    code = params.get('code');
    if (!code) throw new Error('No authorization code');
  } catch {
    errorEl.textContent = 'Google sign-in was cancelled or failed.';
    errorEl.classList.remove('hidden');
    return;
  }

  // 2. Exchange code for IMS tokens
  try {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, redirectUri: chrome.identity.getRedirectURL() }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);

    const { accessToken, refreshToken, user } = await res.json();

    // Store in background service worker
    await bgMessage({ type: 'LOGIN', accessToken, refreshToken, user });

    await renderMain(user);
  } catch {
    errorEl.textContent = 'Could not connect to IMS backend. Is the server running?';
    errorEl.classList.remove('hidden');
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
  await bgMessage({ type: 'LOGOUT' });
  showView('login');
}

// ─── Main view ────────────────────────────────────────────────────────────────
async function renderMain(user) {
  showView('main');

  // Render name + avatar immediately from stored user object
  document.getElementById('user-name').textContent = user?.name || user?.email || 'User';
  const avatarEl = document.getElementById('user-avatar');
  if (user?.avatar_url || user?.picture) {
    avatarEl.src = user.avatar_url || user.picture;
    avatarEl.alt = user?.name || '';
  }

  await loadStats();
}

async function loadStats() {
  // Dashboard gives us everything in one call
  const dash = await bgMessage({ type: 'GET_DASHBOARD' });
  if (!dash) return;

  document.getElementById('stat-credits').textContent    = dash.credits?.balance ?? '—';
  document.getElementById('stat-unknown').textContent    = dash.contacts?.unknown ?? '—';
  document.getElementById('stat-suspicious').textContent = dash.contacts?.suspicious ?? '—';
}

// ─── Scan inbox ───────────────────────────────────────────────────────────────
async function scanInbox() {
  const btn     = document.getElementById('btn-scan');
  const spinner = document.getElementById('scan-spinner');
  btn.disabled  = true;
  spinner.classList.remove('hidden');

  const result = await bgMessage({ type: 'SCAN_INBOX' });
  await loadStats();

  spinner.classList.add('hidden');
  btn.disabled = false;

  if (result) {
    btn.textContent = `Scanned ${result.scanned ?? '?'} emails`;
    setTimeout(() => {
      btn.innerHTML = '';
      const sp = document.createElement('span');
      sp.id = 'scan-spinner';
      sp.className = 'spinner hidden';
      btn.appendChild(sp);
      btn.appendChild(document.createTextNode('Scan Inbox'));
    }, 2500);
  }
}

// ─── Buy credits ─────────────────────────────────────────────────────────────
async function buyCredits() {
  await bgMessage({ type: 'PURCHASE_CREDITS', packageId: 'starter' });
  // Background opens the Stripe checkout URL in a new tab
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  showView('loading');
  document.getElementById('login-error').classList.add('hidden');

  const { authenticated, user } = await bgMessage({ type: 'GET_AUTH_STATUS' });

  if (!authenticated) {
    showView('login');
    return;
  }

  await renderMain(user);
}

// ─── Event listeners ──────────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', login);
document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-scan').addEventListener('click', scanInbox);
document.getElementById('btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('btn-buy').addEventListener('click', buyCredits);

init();
