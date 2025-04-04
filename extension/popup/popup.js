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

// Tracking data
let trackingData = {};

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
  await loadTrackingData();
  
  // Update UI
  updateStatistics();
  updateActivityList();
  
  // Set up event listeners
  setupEventListeners();
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
    
    if (session.pixelLoads && session.pixelLoads.length > 0) {
      stats.opened++;
    }
    
    if (session.linkClicks && session.linkClicks.length > 0) {
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
    if (session.pixelLoads && session.pixelLoads.length > 0) {
      session.pixelLoads.forEach(load => {
        activities.push({
          type: 'opened',
          emailSubject: session.emailSubject,
          timestamp: load.timestamp,
          device: load.device
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
          linkId: click.linkId
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
      title.textContent = `Email Opened: "${truncateText(activity.emailSubject, 30)}"`;
      meta.textContent = `Device: ${formatDevice(activity.device)} • ${formatTime(activity.timestamp)}`;
      break;
    case 'clicked':
      title.textContent = `Link Clicked: "${truncateText(activity.emailSubject, 30)}"`;
      meta.textContent = `Link ID: ${activity.linkId} • ${formatTime(activity.timestamp)}`;
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

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', initialize);