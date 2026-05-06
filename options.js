const STORAGE_KEY = 'imsSettings';

const DEFAULT_SETTINGS = {
  pricePerStamp: 1.00,
  charityEnabled: false,
  charityRecipient: 'effective-altruism',
  whitelist: [],
};

let settings = { ...DEFAULT_SETTINGS };

async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.get([STORAGE_KEY], result => {
      settings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEY] || {}) };
      resolve(settings);
    });
  });
}

async function saveSettings() {
  return new Promise(resolve => {
    chrome.storage.sync.set({ [STORAGE_KEY]: settings }, resolve);
  });
}

function renderWhitelist() {
  const list = document.getElementById('whitelist-list');
  const empty = document.getElementById('whitelist-empty');
  list.innerHTML = '';

  if (settings.whitelist.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  settings.whitelist.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'whitelist-item';
    li.innerHTML = `
      <span class="whitelist-email">${escapeHtml(entry)}</span>
      <button class="btn-remove" data-idx="${idx}" title="Remove">×</button>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      settings.whitelist.splice(idx, 1);
      renderWhitelist();
    });
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function applySettingsToUI() {
  document.getElementById('price-input').value = settings.pricePerStamp.toFixed(2);
  document.getElementById('charity-toggle').checked = settings.charityEnabled;
  document.getElementById('charity-select').value = settings.charityRecipient;
  toggleCharitySelect(settings.charityEnabled);
  renderWhitelist();
}

function toggleCharitySelect(enabled) {
  document.getElementById('charity-select-row').style.display = enabled ? 'flex' : 'none';
}

function collectSettingsFromUI() {
  const price = parseFloat(document.getElementById('price-input').value);
  settings.pricePerStamp = isNaN(price) || price < 0.10 ? DEFAULT_SETTINGS.pricePerStamp : price;
  settings.charityEnabled = document.getElementById('charity-toggle').checked;
  settings.charityRecipient = document.getElementById('charity-select').value;
  // whitelist is mutated in-place via renderWhitelist
}

function addWhitelistEntry() {
  const input = document.getElementById('whitelist-input');
  const value = input.value.trim().toLowerCase();
  if (!value) return;

  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isDomain = /^@[a-z0-9.-]+\.[a-z]{2,}$/.test(value);

  if (!isEmail && !isDomain) {
    input.style.borderColor = '#dc2626';
    setTimeout(() => { input.style.borderColor = ''; }, 1500);
    return;
  }

  if (!settings.whitelist.includes(value)) {
    settings.whitelist.push(value);
    renderWhitelist();
  }
  input.value = '';
}

function showSaveConfirmation() {
  const el = document.getElementById('save-status');
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2500);
}

// Event listeners
document.getElementById('charity-toggle').addEventListener('change', e => {
  toggleCharitySelect(e.target.checked);
});

document.getElementById('btn-add-whitelist').addEventListener('click', addWhitelistEntry);

document.getElementById('whitelist-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addWhitelistEntry();
});

document.getElementById('btn-save').addEventListener('click', async () => {
  collectSettingsFromUI();
  await saveSettings();
  showSaveConfirmation();
});

// Init
loadSettings().then(applySettingsToUI);
