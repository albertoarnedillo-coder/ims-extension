// IMS Content Script — classifies email senders in Gmail and injects badges.
// Selectors used:
//   .zF[email]  — sender span in inbox list rows
//   .gD[email]  — sender span in thread/message view

const BADGE_CLASS = 'ims-badge';

const BADGE_STYLE = {
  known:      'color:#16a34a;font-size:11px;margin-left:5px;font-weight:700;cursor:default;vertical-align:middle;',
  unknown:    'color:#d97706;font-size:11px;margin-left:5px;cursor:default;vertical-align:middle;',
  suspicious: 'color:#dc2626;font-size:11px;margin-left:5px;cursor:default;vertical-align:middle;',
};
const BADGE_GLYPH = { known: '✓', unknown: '?', suspicious: '⚠' };
const BADGE_TITLE = {
  known:      'IMS: Known sender',
  unknown:    'IMS: Unknown sender',
  suspicious: 'IMS: Flagged as suspicious',
};

// email → { status, name }
const classified = new Map();
// DOM elements already processed
const badgedEls  = new WeakSet();
// emails waiting for their first classification round
let pendingEmails = new Set();
let batchTimer    = null;

// ─── Badge injection ──────────────────────────────────────────────────────────
function injectBadge(el, status) {
  // Avoid duplicating if parent already has one (e.g. after re-render race)
  if (el.parentNode?.querySelector(`.${BADGE_CLASS}`)) return;

  const badge = document.createElement('span');
  badge.className = BADGE_CLASS;
  badge.textContent = BADGE_GLYPH[status] ?? '?';
  badge.title       = BADGE_TITLE[status] ?? '';
  badge.style.cssText = BADGE_STYLE[status] ?? BADGE_STYLE.unknown;
  el.after(badge);
}

// ─── Batch classification ─────────────────────────────────────────────────────
function queueClassify(emails) {
  let added = false;
  emails.forEach(e => { if (!classified.has(e)) { pendingEmails.add(e); added = true; } });
  if (!added) return;
  clearTimeout(batchTimer);
  batchTimer = setTimeout(flushBatch, 700);
}

async function flushBatch() {
  if (!pendingEmails.size) return;
  const batch = [...pendingEmails];
  pendingEmails.clear();

  try {
    const result = await chrome.runtime.sendMessage({ type: 'CLASSIFY_SENDERS', emails: batch });
    if (result && typeof result === 'object') {
      Object.entries(result).forEach(([email, info]) => classified.set(email, info));
      applyBadges();
    }
  } catch {
    // Extension reloading or user not authenticated — silently skip
  }
}

// ─── DOM scanning ─────────────────────────────────────────────────────────────
function applyBadges() {
  document.querySelectorAll('.zF[email], .gD[email]').forEach(el => {
    const email = el.getAttribute('email');
    if (!email) return;

    if (!classified.has(email)) {
      queueClassify([email]);
      return;
    }

    if (badgedEls.has(el)) return;
    badgedEls.add(el);
    injectBadge(el, classified.get(email).status);
  });
}

// ─── Observer ─────────────────────────────────────────────────────────────────
const observer = new MutationObserver(() => applyBadges());
observer.observe(document.body, { childList: true, subtree: true });

// Initial scan (Gmail may already be fully loaded)
applyBadges();
