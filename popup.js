const API_BASE = 'http://172.20.149.114:3000/api';

const views = {
  loading: document.getElementById('view-loading'),
  login: document.getElementById('view-login'),
  main: document.getElementById('view-main'),
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
}

async function getStoredData(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}

async function setStoredData(data) {
  return new Promise(resolve => chrome.storage.local.set(data, resolve));
}

async function login() {
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('hidden');

  let oauthToken;
  try {
    const manifest = chrome.runtime.getManifest();
    const clientId = "113835763265-ptv5hp61pc02re7asuad015mebgr4m91.apps.googleusercontent.com";
    const scopes = manifest.oauth2.scopes.join(' ');
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = 'https://accounts.google.com/o/oauth2/auth' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&response_type=code' +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&scope=' + encodeURIComponent(scopes);
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, url => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(url);
      });
    });
    const params = new URLSearchParams(new URL(responseUrl).search);
    oauthToken = params.get('code');
    if (!oauthToken) throw new Error('No authorization code received');
  } catch (err) {
    errorEl.textContent = 'Google sign-in was cancelled or failed.';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: oauthToken, redirectUri: chrome.identity.getRedirectURL() }),
    });

    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const { accessToken: token, user } = await res.json();
    await setStoredData({ token, user });
    await renderMain(user);
  } catch (err) {
    errorEl.textContent = 'Could not connect to IMS backend. Is the server running?';
    errorEl.classList.remove('hidden');
  }
}

async function logout() {
  await new Promise(resolve => chrome.storage.local.remove(['token', 'user'], resolve));
  chrome.runtime.sendMessage({ type: 'LOGOUT' });
  showView('login');
}

async function fetchUserStatus(token) {
  const res = await fetch(`${API_BASE}/users/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Unauthorized');
  return res.json();
}

async function renderMain(user) {
  showView('main');

  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  nameEl.textContent = user?.name || user?.email || 'User';
  if (user?.picture) {
    avatarEl.src = user.picture;
    avatarEl.alt = user.name || '';
  }

  const { token } = await getStoredData(['token']);
  if (!token) { showView('login'); return; }

  try {
    const status = await fetchUserStatus(token);
    document.getElementById('stat-credits').textContent = status.credits ?? 0;
    document.getElementById('stat-intercepted').textContent = status.intercepted ?? 0;
  } catch {
    document.getElementById('stat-credits').textContent = '—';
    document.getElementById('stat-intercepted').textContent = '—';
  }
}

async function handleCheckNow() {
  const btn = document.getElementById('btn-check');
  const spinner = document.getElementById('check-spinner');
  btn.disabled = true;
  spinner.classList.remove('hidden');

  await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'CHECK_NOW' }, resolve)
  );

  // Refresh stats after check
  const { token, user } = await getStoredData(['token', 'user']);
  if (token) {
    try {
      const status = await fetchUserStatus(token);
      document.getElementById('stat-credits').textContent = status.credits ?? 0;
      document.getElementById('stat-intercepted').textContent = status.intercepted ?? 0;
    } catch { /* ignore */ }
  }

  spinner.classList.add('hidden');
  btn.disabled = false;
}

async function init() {
  showView('loading');
  const errorEl = document.getElementById('login-error');
  if (errorEl) errorEl.classList.add('hidden');

  const { token, user } = await getStoredData(['token', 'user']);

  if (!token) {
    showView('login');
    return;
  }

  // Verify token is still valid
  try {
    const status = await fetchUserStatus(token);
    await renderMain(user);
    document.getElementById('stat-credits').textContent = status.credits ?? 0;
    document.getElementById('stat-intercepted').textContent = status.intercepted ?? 0;
  } catch {
    // Token expired — clear and show login
    await new Promise(resolve => chrome.storage.local.remove(['token', 'user'], resolve));
    const errorEl = document.getElementById('login-error');
    if (errorEl) errorEl.classList.add('hidden');
    showView('login');
  }
}

// Event listeners
document.getElementById('btn-login').addEventListener('click', login);
document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-check').addEventListener('click', handleCheckNow);
document.getElementById('btn-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

init();
