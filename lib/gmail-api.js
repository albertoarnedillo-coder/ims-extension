const GMAIL_API = 'https://www.googleapis.com/gmail/v1/users/me';

/**
 * Get a fresh Google OAuth token from Chrome identity API.
 */
export async function getGoogleToken(interactive = false) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, token => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(token);
    });
  });
}

/**
 * Revoke and remove a cached Google OAuth token.
 */
export async function revokeGoogleToken(token) {
  return new Promise(resolve => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

/**
 * Low-level authenticated request to the Gmail API.
 */
async function gmailRequest(path, { method = 'GET', body, token } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(`${GMAIL_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw Object.assign(new Error(err?.error?.message || `Gmail API error ${res.status}`), {
      status: res.status,
      code: err?.error?.code,
    });
  }
  return res.status === 204 ? null : res.json();
}

/**
 * List messages matching a Gmail query.
 * Returns array of { id, threadId }.
 */
export async function listMessages(token, { query = '', maxResults = 50, pageToken } = {}) {
  const params = new URLSearchParams({ maxResults });
  if (query) params.set('q', query);
  if (pageToken) params.set('pageToken', pageToken);
  const data = await gmailRequest(`/messages?${params}`, { token });
  return {
    messages: data.messages || [],
    nextPageToken: data.nextPageToken || null,
    resultSizeEstimate: data.resultSizeEstimate || 0,
  };
}

/**
 * Fetch a single message by ID.
 * format: 'full' | 'metadata' | 'minimal' | 'raw'
 */
export async function getMessage(token, messageId, format = 'metadata') {
  return gmailRequest(`/messages/${messageId}?format=${format}`, { token });
}

/**
 * Get a message header value by name (case-insensitive).
 */
export function getHeader(message, name) {
  const headers = message.payload?.headers || [];
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

/**
 * Add labels to a message.
 */
export async function addLabels(token, messageId, labelIds) {
  return gmailRequest(`/messages/${messageId}/modify`, {
    method: 'POST',
    token,
    body: { addLabelIds: labelIds },
  });
}

/**
 * Remove labels from a message.
 */
export async function removeLabels(token, messageId, labelIds) {
  return gmailRequest(`/messages/${messageId}/modify`, {
    method: 'POST',
    token,
    body: { removeLabelIds: labelIds },
  });
}

/**
 * Move a message to trash.
 */
export async function trashMessage(token, messageId) {
  return gmailRequest(`/messages/${messageId}/trash`, { method: 'POST', token });
}

/**
 * List all labels in the mailbox.
 */
export async function listLabels(token) {
  const data = await gmailRequest('/labels', { token });
  return data.labels || [];
}

/**
 * Create a new label.
 */
export async function createLabel(token, name, { textColor = '#ffffff', backgroundColor = '#1B3A5C' } = {}) {
  return gmailRequest('/labels', {
    method: 'POST',
    token,
    body: {
      name,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show',
      color: { textColor, backgroundColor },
    },
  });
}

/**
 * Send a reply to a thread (used to send stamp-request notifications).
 */
export async function sendReply(token, { to, subject, body, threadId, inReplyTo, references }) {
  const mimeLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${inReplyTo}`,
    `References: ${references}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ];
  const raw = btoa(mimeLines.join('\r\n'))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return gmailRequest('/messages/send', {
    method: 'POST',
    token,
    body: { raw, threadId },
  });
}

/**
 * Get the authenticated user's Gmail profile.
 */
export async function getProfile(token) {
  return gmailRequest('/profile', { token });
}

/**
 * Fetch messages in pages until predicate returns false or all pages consumed.
 * Calls onBatch(messages) for each page.
 */
export async function walkMessages(token, query, onBatch, { maxPages = 10 } = {}) {
  let pageToken;
  let pages = 0;
  do {
    const { messages, nextPageToken } = await listMessages(token, { query, pageToken });
    if (messages.length) await onBatch(messages);
    pageToken = nextPageToken;
    pages++;
  } while (pageToken && pages < maxPages);
}
