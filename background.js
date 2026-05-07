const API_BASE = 'http://172.20.149.114:3000/api';

// ─── Storage ──────────────────────────────────────────────────────────────────
function store(data)  { return new Promise(r => chrome.storage.local.set(data, r)); }
function load(keys)   { return new Promise(r => chrome.storage.local.get(keys, r)); }
function clear(keys)  { return new Promise(r => chrome.storage.local.remove(keys, r)); }

// ─── API client with auto-refresh ─────────────────────────────────────────────
async function apiRequest(method, path, body, _retry = true) {
  const { accessToken, refreshToken } = await load(['accessToken', 'refreshToken']);
  if (!accessToken) return null;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { return null; }

  if (res.status === 401 && _retry && refreshToken) {
    const ok = await doRefresh(refreshToken);
    if (ok) return apiRequest(method, path, body, false);
    await clear(['accessToken', 'refreshToken', 'user']);
    return null;
  }

  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function doRefresh(refreshToken) {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return false;
    const { accessToken } = await res.json();
    await store({ accessToken });
    return true;
  } catch { return false; }
}

// ─── Badge (shows suspicious sender count) ────────────────────────────────────
async function updateBadge() {
  const { accessToken } = await load(['accessToken']);
  if (!accessToken) { chrome.action.setBadgeText({ text: '' }); return; }

  const data = await apiRequest('GET', '/contacts/summary');
  if (data?.suspicious > 0) {
    chrome.action.setBadgeText({ text: String(data.suspicious) });
    chrome.action.setBadgeBackgroundColor({ color: '#FF6B35' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ─── Alarms ───────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('updateBadge', { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateBadge') updateBadge();
});

// ─── Message hub ─────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(() => sendResponse(null));
  return true; // keep channel open for async
});

async function handleMessage(msg) {
  switch (msg.type) {

    case 'GET_AUTH_STATUS': {
      const { accessToken, user } = await load(['accessToken', 'user']);
      return { authenticated: !!accessToken, user: user ?? null };
    }

    case 'LOGIN': {
      await store({
        accessToken:  msg.accessToken,
        refreshToken: msg.refreshToken,
        user:         msg.user,
      });
      updateBadge();
      return { success: true };
    }

    case 'LOGOUT': {
      const { refreshToken } = await load(['refreshToken']);
      if (refreshToken) {
        apiRequest('POST', '/auth/logout', { refreshToken }).catch(() => {});
      }
      await clear(['accessToken', 'refreshToken', 'user']);
      chrome.action.setBadgeText({ text: '' });
      return { success: true };
    }

    case 'GET_DASHBOARD':
      return apiRequest('GET', '/dashboard');

    case 'GET_CREDITS':
      return apiRequest('GET', '/credits');

    case 'GET_CONTACTS_SUMMARY':
      return apiRequest('GET', '/contacts/summary');

    case 'CLASSIFY_SENDERS': {
      const emails = msg.emails;
      if (!emails?.length) return {};
      const data = await apiRequest('POST', '/contacts/check-batch', { emails });
      return data ?? {};
    }

    case 'SCAN_INBOX': {
      const data = await apiRequest('POST', '/gmail/scan');
      await updateBadge();
      return data;
    }

    case 'PURCHASE_CREDITS': {
      const data = await apiRequest('POST', '/credits/purchase', {
        packageId: msg.packageId || 'starter',
      });
      if (data?.checkoutUrl) chrome.tabs.create({ url: data.checkoutUrl });
      return data;
    }

    default:
      return null;
  }
}
