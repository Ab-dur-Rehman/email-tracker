const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const sessionList = document.getElementById('session-list');
const lastUpdated = document.getElementById('last-updated');
const sentCount = document.getElementById('sent-count');
const imageLoadCount = document.getElementById('image-load-count');
const engagedCount = document.getElementById('engaged-count');
const rateCount = document.getElementById('rate-count');

let sessions = [];

function getToken() {
  return new URLSearchParams(window.location.search).get('token') || localStorage.getItem('dashboardToken') || '';
}

function rememberToken() {
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) {
    localStorage.setItem('dashboardToken', token);
  }
}

async function fetchSessions() {
  rememberToken();
  const token = getToken();
  const response = await fetch(`/api/sessions${token ? `?token=${encodeURIComponent(token)}` : ''}`);

  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Unauthorized dashboard token.' : 'Could not load dashboard data.');
  }

  const payload = await response.json();
  sessions = Object.values(payload.sessions || {}).sort((a, b) => (b.sentTimestamp || 0) - (a.sentTimestamp || 0));
  lastUpdated.textContent = `Updated ${new Date(payload.generatedAt).toLocaleString()} | ${payload.storage}`;
}

function getConfidence(session) {
  if (session.confidence) return session.confidence;
  if ((session.linkClicks || []).length > 0) {
    return { score: 75, label: 'Likely human engaged', status: 'likely_human_engaged' };
  }
  if ((session.pixelLoads || []).length > 0) {
    return { score: 45, label: 'Image loaded', status: 'image_loaded' };
  }
  return { score: 0, label: 'Sent', status: 'sent' };
}

function renderStats(filteredSessions) {
  const sent = filteredSessions.length;
  const imageLoads = filteredSessions.filter(session => (session.pixelLoads || []).length > 0).length;
  const engaged = filteredSessions.filter(session => getConfidence(session).status === 'likely_human_engaged').length;

  sentCount.textContent = sent;
  imageLoadCount.textContent = imageLoads;
  engagedCount.textContent = engaged;
  rateCount.textContent = sent ? `${Math.round((imageLoads / sent) * 100)}%` : '0%';
}

function formatRecipients(recipients) {
  if (!recipients || recipients.length === 0) return 'Unknown recipient';
  if (recipients.length === 1) return recipients[0];
  return `${recipients[0]} +${recipients.length - 1} more`;
}

function formatTime(timestamp) {
  if (!timestamp) return 'Unknown time';
  return new Date(timestamp).toLocaleString();
}

function renderSessions() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;

  const filteredSessions = sessions.filter(session => {
    const confidence = getConfidence(session);
    const matchesStatus = status === 'all' || confidence.status === status;
    const haystack = [
      session.emailSubject || '',
      ...(session.recipients || []),
      session.senderAccount?.email || ''
    ].join(' ').toLowerCase();

    return matchesStatus && (!query || haystack.includes(query));
  });

  renderStats(filteredSessions);

  if (filteredSessions.length === 0) {
    sessionList.innerHTML = '<div class="empty">No tracking records found.</div>';
    return;
  }

  sessionList.innerHTML = filteredSessions.map(session => {
    const confidence = getConfidence(session);
    const opens = (session.pixelLoads || []).length;
    const clicks = (session.linkClicks || []).length;

    return `
      <article class="session-card">
        <div class="session-header">
          <div>
            <h2 class="subject">${escapeHtml(session.emailSubject || 'No Subject')}</h2>
            <div class="meta">To: ${escapeHtml(formatRecipients(session.recipients))}</div>
          </div>
          <span class="badge status-${confidence.status}">${escapeHtml(confidence.label)}</span>
        </div>
        <div class="details">
          Sent: ${escapeHtml(formatTime(session.sentTimestamp))}<br>
          Image loads: ${opens} | Clicks: ${clicks} | Confidence: ${confidence.score}/100
        </div>
      </article>
    `;
  }).join('');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function refreshDashboard() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Loading';

  try {
    await fetchSessions();
    renderSessions();
  } catch (error) {
    lastUpdated.textContent = error.message;
    sessionList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh';
  }
}

refreshBtn.addEventListener('click', refreshDashboard);
searchInput.addEventListener('input', renderSessions);
statusFilter.addEventListener('change', renderSessions);

refreshDashboard();
