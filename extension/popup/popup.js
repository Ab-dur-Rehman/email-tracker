/**
 * Email Tracker - Popup Script
 * 
 * This script handles the popup UI functionality:
 * - Displays tracking statistics
 * - Shows recent activity
 * - Manages tracking toggle
 * - Provides access to dashboard and settings
 */

// DOM Elements
const trackingToggle = document.getElementById('tracking-toggle');
const toggleStatus = document.getElementById('toggle-status');
const sentCount = document.getElementById('sent-count');
const openedCount = document.getElementById('opened-count');
const clickedCount = document.getElementById('clicked-count');
const activityList = document.getElementById('activity-list');
const emptyState = document.getElementById('empty-state');
const clearDataBtn = document.getElementById('clear-data-btn');
const viewDashboardBtn = document.getElementById('view-dashboard-btn');
const connectGmailBtn = document.getElementById('connect-gmail-btn');
const addCurrentGmailBtn = document.getElementById('add-current-gmail-btn');
const scanGmailTabsBtn = document.getElementById('scan-gmail-tabs-btn');
const gmailAccountList = document.getElementById('gmail-account-list');
const gmailEmptyState = document.getElementById('gmail-empty-state');

// Tracking data
let trackingData = {};
let gmailAccounts = [];

/**
 * Initialize the popup
 */
async function initialize() {
  // Load tracking settings
  const settings = await chrome.storage.sync.get('trackingEnabled');
  const trackingEnabled = settings.trackingEnabled !== undefined ? settings.trackingEnabled : true;
  
  // Update toggle state
  trackingToggle.checked = trackingEnabled;
  updateToggleStatus(trackingEnabled);
  
  // Load tracking data
  await syncTrackingData();
  await loadGmailAccounts();
  
  // Update UI
  updateStatistics();
  updateGmailAccounts();
  updateActivityList();
  
  // Set up event listeners
  setupEventListeners();
}

/**
 * Load connected Gmail accounts from the background service worker.
 */
async function loadGmailAccounts() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_GMAIL_ACCOUNTS' },
      (response) => {
        gmailAccounts = response && response.success ? response.accounts || [] : [];
        resolve();
      }
    );
  });
}

/**
 * Update connected Gmail account display.
 */
function updateGmailAccounts() {
  const existingItems = gmailAccountList.querySelectorAll('.account-item');
  existingItems.forEach(item => item.remove());

  if (gmailAccounts.length === 0) {
    gmailEmptyState.style.display = 'block';
    connectGmailBtn.textContent = 'Connect Google Account';
    addCurrentGmailBtn.style.display = 'inline-block';
    return;
  }

  gmailEmptyState.style.display = 'none';
  connectGmailBtn.textContent = 'Connect Another Google Account';
  addCurrentGmailBtn.style.display = 'inline-block';

  gmailAccounts.forEach(account => {
    const item = document.createElement('div');
    item.className = 'account-item';

    const avatar = document.createElement('img');
    avatar.className = 'account-avatar';
    avatar.alt = '';
    avatar.src = account.picture || '../assets/icon48.png';

    const details = document.createElement('div');
    details.className = 'account-details';

    const name = document.createElement('div');
    name.className = 'account-name';
    name.textContent = account.name || account.email;

    const email = document.createElement('div');
    email.className = 'account-email';
    email.textContent = account.email || account.id || 'Detected Gmail tab';

    const source = document.createElement('div');
    source.className = 'account-source';
    source.textContent = formatAccountSource(account.source);

    const disconnect = document.createElement('button');
    disconnect.className = 'btn compact secondary';
    disconnect.textContent = 'Remove';
    disconnect.addEventListener('click', () => disconnectGmailAccount(account.email || account.id));

    details.appendChild(name);
    details.appendChild(email);
    details.appendChild(source);
    item.appendChild(avatar);
    item.appendChild(details);
    item.appendChild(disconnect);
    gmailAccountList.appendChild(item);
  });
}

async function syncTrackingData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'SYNC_NOW' }, (response) => {
      trackingData = response && response.success ? response.data || {} : trackingData;
      resolve();
    });
  });
}

/**
 * Load tracking data from background service worker
 */
async function loadTrackingData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'GET_TRACKING_DATA' },
      (response) => {
        if (response && response.success) {
          trackingData = response.data || {};
        } else {
          trackingData = {};
        }
        resolve();
      }
    );
  });
}

/**
 * Update tracking statistics display
 */
function updateStatistics() {
  const stats = calculateStatistics();
  
  sentCount.textContent = stats.sent;
  openedCount.textContent = stats.opened;
  clickedCount.textContent = stats.clicked;
}

/**
 * Calculate statistics from tracking data
 */
function calculateStatistics() {
  const stats = {
    sent: 0,
    opened: 0,
    clicked: 0
  };
  
  // Count emails by status
  Object.values(trackingData).forEach(session => {
    stats.sent++;
    
    if (getLikelyOpenLoads(session).length > 0) {
      stats.opened++;
    }
    
    if (getSessionConfidence(session).status === 'likely_human_engaged') {
      stats.clicked++;
    }
  });
  
  return stats;
}

/**
 * Update the activity list
 */
function updateActivityList() {
  // Clear existing items (except empty state)
  const items = activityList.querySelectorAll('.activity-item');
  items.forEach(item => item.remove());
  
  // Get recent activities
  const activities = getRecentActivities();
  
  if (activities.length === 0) {
    // Show empty state
    emptyState.style.display = 'block';
    return;
  }
  
  // Hide empty state
  emptyState.style.display = 'none';
  
  // Add activity items
  activities.forEach(activity => {
    const activityItem = createActivityItem(activity);
    activityList.appendChild(activityItem);
  });
}

/**
 * Get recent activities from tracking data
 */
function getRecentActivities() {
  const activities = [];
  
  // Process tracking data into activities
  Object.values(trackingData).forEach(session => {
    // Add sent activity
    activities.push({
      type: 'sent',
      emailSubject: session.emailSubject,
      timestamp: session.sentTimestamp,
      recipients: session.recipients
    });
    
    // Add open activities
    const likelyOpenLoads = getLikelyOpenLoads(session);
    if (likelyOpenLoads.length > 0) {
      likelyOpenLoads.forEach(load => {
        activities.push({
          type: 'opened',
          emailSubject: session.emailSubject,
          timestamp: load.timestamp,
          device: load.device,
          confidence: load.confidence || getSessionConfidence(session)
        });
      });
    }
    
    // Add click activities
    if (session.linkClicks && session.linkClicks.length > 0) {
      session.linkClicks.forEach(click => {
        activities.push({
          type: 'clicked',
          emailSubject: session.emailSubject,
          timestamp: click.timestamp,
          linkId: click.linkId,
          confidence: click.confidence || getSessionConfidence(session)
        });
      });
    }
  });
  
  // Sort by timestamp (newest first)
  activities.sort((a, b) => b.timestamp - a.timestamp);
  
  // Return only the 10 most recent activities
  return activities.slice(0, 10);
}

/**
 * Create an activity item element
 */
function createActivityItem(activity) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  
  // Set icon based on activity type
  const icon = document.createElement('div');
  icon.className = 'activity-icon';
  
  switch (activity.type) {
    case 'sent':
      icon.innerHTML = '📤';
      break;
    case 'opened':
      icon.innerHTML = '👁️';
      break;
    case 'clicked':
      icon.innerHTML = '🔗';
      break;
  }
  
  // Create details container
  const details = document.createElement('div');
  details.className = 'activity-details';
  
  // Create title
  const title = document.createElement('div');
  title.className = 'activity-title';
  
  // Create meta info
  const meta = document.createElement('div');
  meta.className = 'activity-meta';
  
  // Set content based on activity type
  switch (activity.type) {
    case 'sent':
      title.textContent = `Email Sent: "${truncateText(activity.emailSubject, 30)}"`;
      meta.textContent = `To: ${formatRecipients(activity.recipients)} • ${formatTime(activity.timestamp)}`;
      break;
    case 'opened':
      title.textContent = `${activity.confidence?.label || 'Image Loaded'}: "${truncateText(activity.emailSubject, 30)}"`;
      meta.textContent = `Confidence: ${formatConfidence(activity.confidence)} • ${formatDevice(activity.device)} • ${formatTime(activity.timestamp)}`;
      break;
    case 'clicked':
      title.textContent = `Likely Human Engaged: "${truncateText(activity.emailSubject, 30)}"`;
      meta.textContent = `Confidence: ${formatConfidence(activity.confidence)} • Link ID: ${activity.linkId} • ${formatTime(activity.timestamp)}`;
      break;
  }
  
  // Assemble the item
  details.appendChild(title);
  details.appendChild(meta);
  item.appendChild(icon);
  item.appendChild(details);
  
  return item;
}

/**
 * Format recipients for display
 */
function formatRecipients(recipients) {
  if (!recipients || recipients.length === 0) {
    return 'Unknown';
  }
  
  if (recipients.length === 1) {
    return recipients[0];
  }
  
  return `${recipients[0]} +${recipients.length - 1} more`;
}

/**
 * Format device information for display
 */
function formatDevice(device) {
  if (!device) return 'Unknown';
  
  return `${device.browser} on ${device.os}`;
}

function getSessionConfidence(session) {
  if (session.confidence) {
    return session.confidence;
  }

  if (session.linkClicks && session.linkClicks.length > 0) {
    return {
      score: 75,
      label: 'Likely human engaged',
      status: 'likely_human_engaged'
    };
  }

  if (getLikelyOpenLoads(session).length > 0) {
    return {
      score: 45,
      label: 'Image loaded',
      status: 'image_loaded'
    };
  }

  return {
    score: 0,
    label: 'Sent',
    status: 'sent'
  };
}

function isLikelyRecipientOpen(load, session) {
  const confidence = load.confidence || {};
  const score = typeof confidence.score === 'number' ? confidence.score : null;
  const millisecondsAfterSend = load.timestamp && session.sentTimestamp ? load.timestamp - session.sentTimestamp : null;

  if (confidence.status === 'possible_bot_proxy' || (score !== null && score < 30)) {
    return false;
  }

  if (millisecondsAfterSend !== null && millisecondsAfterSend < 10000) {
    return false;
  }

  return true;
}

function getLikelyOpenLoads(session) {
  return (session.pixelLoads || []).filter(load => isLikelyRecipientOpen(load, session));
}

function formatConfidence(confidence) {
  if (!confidence) return 'Unknown';
  return `${confidence.score}/100`;
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  
  // Format relative time
  if (diffSec < 60) {
    return 'Just now';
  } else if (diffMin < 60) {
    return `${diffMin}m ago`;
  } else if (diffHour < 24) {
    return `${diffHour}h ago`;
  } else if (diffDay < 7) {
    return `${diffDay}d ago`;
  } else {
    // Format as date
    return date.toLocaleDateString();
  }
}

/**
 * Truncate text to specified length
 */
function truncateText(text, maxLength) {
  if (!text) return 'Untitled';
  
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength) + '...';
}

/**
 * Update the toggle status text
 */
function updateToggleStatus(enabled) {
  toggleStatus.textContent = enabled ? 'Tracking Enabled' : 'Tracking Disabled';
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Tracking toggle
  trackingToggle.addEventListener('change', async () => {
    const enabled = trackingToggle.checked;
    
    // Update UI
    updateToggleStatus(enabled);
    
    // Save setting
    await chrome.storage.sync.set({ 'trackingEnabled': enabled });
    
    // Notify background service worker
    chrome.runtime.sendMessage({
      type: 'SET_TRACKING_ENABLED',
      enabled: enabled
    });
  });

  connectGmailBtn.addEventListener('click', async () => {
    connectGmailBtn.disabled = true;
    connectGmailBtn.textContent = 'Connecting...';

    chrome.runtime.sendMessage({ type: 'CONNECT_GMAIL_ACCOUNT' }, async (response) => {
      connectGmailBtn.disabled = false;

      if (!response || !response.success) {
        alert(response?.error || 'Could not connect Gmail account.');
      }

      await loadGmailAccounts();
      updateGmailAccounts();
    });
  });

  addCurrentGmailBtn.addEventListener('click', addCurrentGmailTab);
  scanGmailTabsBtn.addEventListener('click', scanOpenGmailTabs);
  
  // Clear data button
  clearDataBtn.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear all tracking data? This cannot be undone.')) {
      // Send clear data message to background
      chrome.runtime.sendMessage({ type: 'CLEAR_TRACKING_DATA' }, async (response) => {
        if (response && response.success) {
          // Reload data and update UI
          await loadTrackingData();
          updateStatistics();
          updateActivityList();
          
          // Show confirmation
          alert('Tracking data has been cleared.');
        }
      });
    }
  });
  
  // View dashboard button
  viewDashboardBtn.addEventListener('click', () => {
    // Open dashboard in new tab
    chrome.tabs.create({ url: '../dashboard/dashboard.html' });
  });
}

async function disconnectGmailAccount(email) {
  chrome.runtime.sendMessage({ type: 'DISCONNECT_GMAIL_ACCOUNT', email }, async (response) => {
    if (!response || !response.success) {
      alert(response?.error || 'Could not remove Gmail account.');
    }

    await loadGmailAccounts();
    updateGmailAccounts();
  });
}

async function addCurrentGmailTab() {
  addCurrentGmailBtn.disabled = true;
  addCurrentGmailBtn.textContent = 'Adding...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.startsWith('https://mail.google.com/')) {
      alert('Open the Gmail account tab you want to add, then click Add Tab again.');
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: 'GET_GMAIL_PAGE_ACCOUNT' }, (response) => {
      const account = response && response.success ? response.account : null;
      if (!account) {
        alert('Could not detect the current Gmail account. Refresh Gmail and try again.');
        return;
      }

      chrome.runtime.sendMessage({ type: 'REGISTER_GMAIL_ACCOUNT', account }, async (registerResponse) => {
        if (!registerResponse || !registerResponse.success) {
          alert(registerResponse?.error || 'Could not add this Gmail tab.');
        }

        await loadGmailAccounts();
        updateGmailAccounts();
      });
    });
  } finally {
    addCurrentGmailBtn.disabled = false;
    addCurrentGmailBtn.textContent = 'Add Tab';
  }
}

async function scanOpenGmailTabs() {
  scanGmailTabsBtn.disabled = true;
  scanGmailTabsBtn.textContent = 'Scanning...';

  try {
    const tabs = await chrome.tabs.query({ url: 'https://mail.google.com/*' });
    if (tabs.length === 0) {
      alert('No Gmail tabs are open. Open each Gmail account you want to track, then scan again.');
      return;
    }

    let addedCount = 0;
    for (const tab of tabs) {
      const account = await getAccountFromGmailTab(tab.id);
      if (!account) continue;

      const response = await registerGmailAccount(account);
      if (response && response.success) {
        addedCount++;
      }
    }

    await loadGmailAccounts();
    updateGmailAccounts();
    alert(`Added or refreshed ${addedCount} Gmail account tab${addedCount === 1 ? '' : 's'}.`);
  } finally {
    scanGmailTabsBtn.disabled = false;
    scanGmailTabsBtn.textContent = 'Scan Open Gmail Tabs';
  }
}

function getAccountFromGmailTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'GET_GMAIL_PAGE_ACCOUNT' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        resolve(null);
        return;
      }
      resolve(response.account);
    });
  });
}

function registerGmailAccount(account) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'REGISTER_GMAIL_ACCOUNT', account }, (response) => {
      resolve(response);
    });
  });
}

function formatAccountSource(source) {
  switch (source) {
    case 'chrome_identity':
      return 'Connected with Google OAuth';
    case 'gmail_page':
      return 'Detected from open Gmail tab';
    default:
      return 'Gmail account';
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);
