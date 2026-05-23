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
let connectedGmailAccounts = [];

// Configuration for the tracking server
const CONFIG = {
  API_ENDPOINT: 'https://email-tracker-virid.vercel.app',
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
  loadConnectedAccounts();
  
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
 * Load Gmail accounts connected through Chrome Identity.
 */
async function loadConnectedAccounts() {
  try {
    const data = await chrome.storage.sync.get('gmailAccounts');
    connectedGmailAccounts = Array.isArray(data.gmailAccounts) ? data.gmailAccounts : [];
    console.log('Loaded Gmail accounts', connectedGmailAccounts.length);
  } catch (error) {
    console.error('Error loading Gmail accounts:', error);
  }
}

/**
 * Save connected Gmail account metadata. OAuth tokens remain in Chrome's token cache.
 */
async function saveConnectedAccounts() {
  try {
    await chrome.storage.sync.set({ gmailAccounts: connectedGmailAccounts });
  } catch (error) {
    console.error('Error saving Gmail accounts:', error);
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
        Object.keys(activeTrackingSessions).forEach(updateSessionConfidence);
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
 * Connect the primary signed-in Google account for Gmail tracking.
 */
async function connectGmailAccount() {
  const tokenResult = await chrome.identity.getAuthToken({
    interactive: true,
    scopes: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ]
  });
  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult.token;

  if (!token) {
    throw new Error('Chrome Identity did not return an OAuth token.');
  }

  let account = null;
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (response.ok) {
      const profile = await response.json();
      account = {
        id: profile.sub || profile.email,
        email: profile.email,
        name: profile.name || profile.email,
        picture: profile.picture || '',
        connectedAt: Date.now()
      };
    }
  } catch (error) {
    console.warn('Could not fetch Google userinfo, falling back to Chrome profile info:', error);
  }

  if (!account) {
    const profile = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
    account = {
      id: profile.id || profile.email,
      email: profile.email,
      name: profile.email,
      picture: '',
      connectedAt: Date.now()
    };
  }

  if (!account.email) {
    throw new Error('No Google account email was available. Sign in to Chrome and try again.');
  }

  connectedGmailAccounts = [
    account,
    ...connectedGmailAccounts.filter(existing => existing.email !== account.email)
  ];
  await saveConnectedAccounts();

  return account;
}

/**
 * Disconnect a Gmail account from extension state.
 */
async function disconnectGmailAccount(email) {
  connectedGmailAccounts = connectedGmailAccounts.filter(account => account.email !== email);
  await saveConnectedAccounts();
  return connectedGmailAccounts;
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

function classifyEngagementEvent({ type, userAgent = '', eventTimestamp = Date.now(), sentTimestamp = 0, hasLinkClick = false }) {
  const ua = userAgent.toLowerCase();
  const secondsAfterSend = sentTimestamp ? Math.round((eventTimestamp - sentTimestamp) / 1000) : null;
  let score = type === 'click' ? 75 : 45;
  const reasons = [];

  if (type === 'click') {
    reasons.push('Tracked link was clicked.');
  } else {
    reasons.push('Tracking image was loaded.');
  }

  if (ua.includes('googleimageproxy')) {
    score -= 15;
    reasons.push('Loaded through Google image proxy.');
  }

  if (ua.includes('proofpoint') || ua.includes('mimecast') || ua.includes('barracuda') || ua.includes('safelinks')) {
    score -= 35;
    reasons.push('User agent resembles a security scanner.');
  }

  if (ua.includes('apple') && ua.includes('mail')) {
    score -= 20;
    reasons.push('May be affected by Apple Mail Privacy Protection.');
  }

  if (secondsAfterSend !== null && secondsAfterSend < 5) {
    score -= 30;
    reasons.push('Event happened almost immediately after send.');
  }

  if (hasLinkClick && type === 'open') {
    score += 25;
    reasons.push('Same email also has a tracked link click.');
  }

  score = Math.max(0, Math.min(100, score));

  let label = 'Uncertain open';
  let status = 'image_loaded';
  if (type === 'click' || score >= 80) {
    label = 'Likely human engaged';
    status = 'likely_human_engaged';
  } else if (score >= 55) {
    label = 'Likely opened';
    status = 'likely_opened';
  } else if (score >= 30) {
    label = 'Image loaded';
  } else {
    label = 'Possible bot/proxy';
    status = 'possible_bot_proxy';
  }

  return {
    score,
    label,
    status,
    reasons
  };
}

function summarizeSessionConfidence(session) {
  const clicks = session.linkClicks || [];
  const opens = session.pixelLoads || [];

  if (clicks.length > 0) {
    const bestClick = clicks.reduce((best, click) => {
      const current = click.confidence || classifyEngagementEvent({
        type: 'click',
        userAgent: click.userAgent,
        eventTimestamp: click.timestamp,
        sentTimestamp: session.sentTimestamp
      });
      return !best || current.score > best.score ? current : best;
    }, null);

    return {
      ...bestClick,
      status: 'likely_human_engaged',
      label: 'Likely human engaged'
    };
  }

  if (opens.length > 0) {
    return opens.reduce((best, open) => {
      const current = open.confidence || classifyEngagementEvent({
        type: 'open',
        userAgent: open.userAgent,
        eventTimestamp: open.timestamp,
        sentTimestamp: session.sentTimestamp,
        hasLinkClick: false
      });
      return !best || current.score > best.score ? current : best;
    }, null);
  }

  return {
    score: 0,
    label: 'Sent',
    status: 'sent',
    reasons: ['No image load, click, reply, or confirmation recorded yet.']
  };
}

function updateSessionConfidence(trackingId) {
  const session = activeTrackingSessions[trackingId];
  if (!session) return;

  session.confidence = summarizeSessionConfidence(session);
  session.status = session.confidence.status;
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
    senderAccount: emailDetails.senderAccount || null,
    sentTimestamp: Date.now(),
    pixelLoads: [],
    linkClicks: [],
    status: 'sent',
    confidence: {
      score: 0,
      label: 'Sent',
      status: 'sent',
      reasons: ['No image load, click, reply, or confirmation recorded yet.']
    }
  };
  
  saveTrackingData();
  return trackingId;
}

/**
 * Record a tracking pixel load event
 */
function recordPixelLoad(trackingId, eventData) {
  if (activeTrackingSessions[trackingId]) {
    const timestamp = Date.now();
    const confidence = classifyEngagementEvent({
      type: 'open',
      userAgent: eventData.userAgent || 'unknown',
      eventTimestamp: timestamp,
      sentTimestamp: activeTrackingSessions[trackingId].sentTimestamp,
      hasLinkClick: (activeTrackingSessions[trackingId].linkClicks || []).length > 0
    });

    activeTrackingSessions[trackingId].pixelLoads.push({
      timestamp,
      ipAddress: eventData.ip || 'unknown',
      userAgent: eventData.userAgent || 'unknown',
      geolocation: eventData.geolocation || null,
      device: parseUserAgent(eventData.userAgent || 'unknown'),
      confidence
    });
    
    updateSessionConfidence(trackingId);
    
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
    const timestamp = Date.now();
    const confidence = classifyEngagementEvent({
      type: 'click',
      userAgent: eventData.userAgent || 'unknown',
      eventTimestamp: timestamp,
      sentTimestamp: activeTrackingSessions[trackingId].sentTimestamp
    });

    activeTrackingSessions[trackingId].linkClicks.push({
      linkId: linkId,
      timestamp,
      ipAddress: eventData.ip || 'unknown',
      userAgent: eventData.userAgent || 'unknown',
      geolocation: eventData.geolocation || null,
      device: parseUserAgent(eventData.userAgent || 'unknown'),
      confidence
    });
    
    updateSessionConfidence(trackingId);
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
    title: session.confidence?.label || 'Email Tracking Signal',
    message: `Your email "${session.emailSubject}" recorded a tracking signal with ${session.confidence?.score ?? 0}/100 confidence.`,
    priority: 2
  });
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
  switch (message.type) {
    case 'CONNECT_GMAIL_ACCOUNT':
      connectGmailAccount()
        .then(account => sendResponse({ success: true, account }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'DISCONNECT_GMAIL_ACCOUNT':
      disconnectGmailAccount(message.email)
        .then(accounts => sendResponse({ success: true, accounts }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'GET_GMAIL_ACCOUNTS':
      sendResponse({ success: true, accounts: connectedGmailAccounts });
      break;

    case 'SET_TRACKING_ENABLED':
      chrome.storage.sync.set({ trackingEnabled: Boolean(message.enabled) })
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'CLEAR_TRACKING_DATA':
      activeTrackingSessions = {};
      saveTrackingData()
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;

    case 'CREATE_TRACKING':
    case 'CREATE_TRACKING_SESSION':
      const trackingId = createTrackingSession(message.data || message.emailDetails || {});
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
  
  return false;
});

// Initialize when the service worker starts
initialize();
