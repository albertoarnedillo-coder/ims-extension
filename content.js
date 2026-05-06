// IMS Content Script - injected into Gmail
const IMS_VERIFIED_CLASS = 'ims-verified-badge';
const IMS_PENDING_CLASS = 'ims-pending-badge';

// Observe Gmail DOM changes
const observer = new MutationObserver(() => {
  addIMSBadges();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Add visual badges to IMS emails
function addIMSBadges() {
  // Verified emails
  const verifiedEmails = document.querySelectorAll('[data-ims-verified="true"]');
  verifiedEmails.forEach(el => {
    if (!el.querySelector(`.${IMS_VERIFIED_CLASS}`)) {
      const badge = document.createElement('span');
      badge.className = IMS_VERIFIED_CLASS;
      badge.textContent = '✓ IMS Verified';
      badge.style.cssText = `
        background: #00C48C;
        color: white;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 12px;
        margin-left: 8px;
        font-weight: 600;
      `;
      el.appendChild(badge);
    }
  });

  // Pending emails
  const pendingEmails = document.querySelectorAll('[data-ims-pending="true"]');
  pendingEmails.forEach(el => {
    if (!el.querySelector(`.${IMS_PENDING_CLASS}`)) {
      const badge = document.createElement('span');
      badge.className = IMS_PENDING_CLASS;
      badge.textContent = '⏳ IMS Pending';
      badge.style.cssText = `
        background: #FF6B35;
        color: white;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 12px;
        margin-left: 8px;
        font-weight: 600;
      `;
      el.appendChild(badge);
    }
  });
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'UPDATE_BADGES') {
    addIMSBadges();
  }
});

// Initial run
addIMSBadges();
