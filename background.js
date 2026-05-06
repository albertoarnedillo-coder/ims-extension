const API_BASE = 'http://172.20.149.114:3000/api';
const CHECK_INTERVAL_MINUTES = 5;

// On install, set up alarm for periodic email checking
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('checkEmails', { periodInMinutes: CHECK_INTERVAL_MINUTES });
  console.log('IMS Extension installed');
});

// Main alarm handler
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkEmails') {
    checkNewEmails();
  }
});

// Get stored auth token
async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['token'], (result) => {
      resolve(result.token || null);
    });
  });
}

// Check new emails via backend
async function checkNewEmails() {
  const token = await getAuthToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE}/gmail/status`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.intercepted > 0) {
        chrome.action.setBadgeText({ text: String(data.intercepted) });
        chrome.action.setBadgeBackgroundColor({ color: '#FF6B35' });
      }
    }
  } catch (err) {
    console.error('IMS check error:', err);
  }
}

// Listen for messages from popup and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    getAuthToken().then(token => {
      sendResponse({ authenticated: !!token });
    });
    return true;
  }

  if (message.type === 'LOGOUT') {
    chrome.storage.local.remove(['token', 'user']);
    chrome.action.setBadgeText({ text: '' });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'CHECK_NOW') {
    checkNewEmails().then(() => sendResponse({ success: true }));
    return true;
  }
});
