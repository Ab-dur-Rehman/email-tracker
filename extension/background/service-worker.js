/**
 * Email Tracker - Background Service Worker
 * 
 * This service worker handles background processes for the email tracking extension:
 * - Manages communication between content scripts and server
 * - Processes tracking pixel loads
 * - Stores and syncs tracking data
 * - Handles notifications for email opens
 */

// Track active email tracking sessions
let activeTrackingSessions = {};

// Configuration for the tracking server
const CONFIG = {
  API_ENDPOINT: 'https://api.emailtracker.com',
  TRACKING_PIXEL_PATH: '/pixel',
  LINK_TRACKING_PATH: '/link',
  SYNC_INTERVAL: 5 * 60 * 1000, // 5 minutes
};

/**
 * Initialize the background service worker
 */
function initialize() {
  console.log('Email Tracker background service worker initialized');
  
  // Load stored tracking data from browser storage
  loadStoredTrackingData();
  
  // Set up periodic sync with server
  setInterval(syncWithServer, CONFIG.SYNC_INTERVAL);
}

/**
 * Load stored tracking data from browser storage
 */
async function loadStoredTrackingData() {
  try {
    const data = await chrome.storage.sync.get('trackingData');
    if (data.trackingData) {
      activeTrackingSessions = data.trackingData;
      console.log('Loaded tracking data from storage', Object.keys(activeTrackingSessions).length);
    }
  } catch (error) {
    console.error('Error loading tracking data:', error);
  }
}

/**
 * Save tracking data to browser storage
 */
async function saveTrackingData() {
  try {
    await chrome.storage.sync.set({ 'trackingData': activeTrackingSessions });
    console.log('Saved tracking data to storage');
  } catch (error) {
    console.error('Error saving tracking data:', error);
  }
}

/**
 * Sync tracking data with the server
 */
async function syncWithServer() {
  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trackingSessions: activeTrackingSessions,
        timestamp: Date.now(),
      }),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Synced with server successfully', data);
      
      // Update local data with server data
      if (data.updatedSessions) {
        Object.assign(activeTrackingSessions, data.updatedSessions);
        saveTrackingData();
      }
    } else {
      console.error('Server sync failed:', response.status);
    }
  } catch (error) {
    console.error('Error syncing with server:', error);
  }
}

/**
 * Generate a new tracking UUID
 */
function generateTrackingId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Create a new tracking session for an email
 */
function createTrackingSession(emailDetails) {
  const trackingId = generateTrackingId();
  
  activeTrackingSessions[trackingId] = {
    id: trackingId,
    emailSubject: emailDetails.subject,
    recipients: emailDetails.recipients,
    sentTimestamp: Date.now(),
    pixelLoads: [],
    linkClicks: [],
    status: 'sent'
  };
  
  saveTrackingData();
  return trackingId;
}

/**
 * Record a tracking pixel load event
 */
function recordPixelLoad(trackingId, eventData) {
  if (activeTrackingSessions[trackingId]) {
    activeTrackingSessions[trackingId].pixelLoads.push({
      timestamp: Date.now(),
      ipAddress: eventData.ip || 'unknown',
      userAgent: eventData.userAgent || 'unknown',
      geolocation: eventData.geolocation || null,
      device: parseUserAgent(eventData.userAgent || 'unknown')
    });
    
    // Update status to 'opened'
    activeTrackingSessions[trackingId].status = 'opened';
    
    // Send notification
    sendOpenNotification(trackingId);
    
    saveTrackingData();
    return true;
  }
  return false;
}

/**
 * Record a tracked link click event
 */
function recordLinkClick(trackingId, linkId, eventData) {
  if (activeTrackingSessions[trackingId]) {
    activeTrackingSessions[trackingId].linkClicks.push({
      linkId: linkId,
      timestamp: Date.now(),
      ipAddress: eventData.ip || 'unknown',
      userAgent: eventData.userAgent || 'unknown',
      geolocation: eventData.geolocation || null,
      device: parseUserAgent(eventData.userAgent || 'unknown')
    });
    
    saveTrackingData();
    return true;
  }
  return false;
}

/**
 * Parse user agent string to extract device information
 */
function parseUserAgent(userAgent) {
  let device = {
    browser: 'unknown',
    os: 'unknown',
    device: 'unknown'
  };
  
  // Simple parsing logic - in production, use a comprehensive library
  if (userAgent.includes('Chrome')) device.browser = 'Chrome';
  else if (userAgent.includes('Firefox')) device.browser = 'Firefox';
  else if (userAgent.includes('Safari')) device.browser = 'Safari';
  else if (userAgent.includes('Edge')) device.browser = 'Edge';
  
  if (userAgent.includes('Windows')) device.os = 'Windows';
  else if (userAgent.includes('Mac')) device.os = 'MacOS';
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) device.os = 'iOS';
  else if (userAgent.includes('Android')) device.os = 'Android';
  
  if (userAgent.includes('Mobile')) device.device = 'Mobile';
  else device.device = 'Desktop';
  
  return device;
}

/**
 * Send a notification when an email is opened
 */
function sendOpenNotification(trackingId) {
  const session = activeTrackingSessions[trackingId];
  if (!session) return;
  
  // Create notification
  chrome.notifications.create(`open-${trackingId}`, {
    type: 'basic',
    iconUrl: '../assets/icon128.png',
    title: 'Email Opened!',
    message: `Your email "${session.emailSubject}" was just opened by one of the recipients.`,
    priority: 2
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  switch (message.type) {
    case 'CREATE_TRACKING':
      const trackingId = createTrackingSession(message.data);
      sendResponse({ success: true, trackingId });
      break;
      
    case 'RECORD_PIXEL_LOAD':
      const pixelResult = recordPixelLoad(message.trackingId, message.data);
      sendResponse({ success: pixelResult });
      break;
      
    case 'RECORD_LINK_CLICK':
      const linkResult = recordLinkClick(message.trackingId, message.linkId, message.data);
      sendResponse({ success: linkResult });
      break;
      
    case 'GET_TRACKING_DATA':
      sendResponse({ 
        success: true, 
        data: message.trackingId ? 
          activeTrackingSessions[message.trackingId] : 
          activeTrackingSessions 
      });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown message type' });
  }
  
  return true; // Keep the message channel open for async response
});

// Initialize when the service worker starts
initialize();