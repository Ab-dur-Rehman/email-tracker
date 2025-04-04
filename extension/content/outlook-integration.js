/**
 * Email Tracker - Outlook Integration
 * 
 * This content script integrates with Outlook's web interface to:
 * - Detect when emails are being composed
 * - Insert tracking pixels into outgoing emails
 * - Track link clicks in email content
 * - Communicate with the background service worker
 */

// Configuration
const OUTLOOK_CONFIG = {
  COMPOSE_CONTAINER_SELECTOR: 'div[contenteditable="true"][aria-label="Message body"]', // Outlook compose box
  SEND_BUTTON_SELECTOR: 'button[aria-label="Send"]' // Outlook send button
};

// State management
let trackingEnabled = window.CONFIG.trackingEnabled; // Use the global CONFIG
let composeObserver = null;
let activeComposeElements = new Map(); // Maps compose elements to their tracking IDs

/**
 * Initialize the Outlook integration
 */
async function initialize() {
  console.log('Email Tracker: Outlook integration initialized');
  
  // Load tracking settings
  await loadTrackingSettings();
  
  // Set up listeners for settings changes
  chrome.storage.onChanged.addListener(handleStorageChanges);
  
  // Set up message listener for communication with background
  chrome.runtime.onMessage.addListener(handleMessages);
  
  // Start observing for compose windows
  startComposeObserver();
}

/**
 * Load tracking settings from storage
 */
async function loadTrackingSettings() {
  try {
    const settings = await chrome.storage.sync.get(window.CONFIG.TRACKING_ENABLED_KEY);
    trackingEnabled = settings[window.CONFIG.TRACKING_ENABLED_KEY] !== undefined 
      ? settings[window.CONFIG.TRACKING_ENABLED_KEY] 
      : true;
    
    debug('Tracking enabled:', trackingEnabled);
  } catch (error) {
    console.error('Error loading tracking settings:', error);
  }
}

/**
 * Handle storage changes
 */
function handleStorageChanges(changes, area) {
  if (area === 'sync' && changes[window.CONFIG.TRACKING_ENABLED_KEY]) {
    trackingEnabled = changes[window.CONFIG.TRACKING_ENABLED_KEY].newValue;
    debug('Tracking setting changed:', trackingEnabled);
  }
}

/**
 * Handle messages from background script
 */
function handleMessages(message, sender, sendResponse) {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      success: true,
      status: {
        trackingEnabled,
        activeComposeCount: activeComposeElements.size
      }
    });
    return true;
  }
  return false;
}

/**
 * Start observing for compose windows
 */
function startComposeObserver() {
  // Disconnect existing observer if any
  if (composeObserver) {
    composeObserver.disconnect();
  }
  
  // Create a new mutation observer
  composeObserver = new MutationObserver(mutations => {
    // Check if any compose elements have been added
    checkForComposeElements();
  });
  
  // Start observing the document body for changes
  composeObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also check for any existing compose windows
  checkForComposeElements();
}

/**
 * Check for compose elements in the current page
 */
function checkForComposeElements() {
  const composeElements = document.querySelectorAll(CONFIG.COMPOSE_CONTAINER_SELECTOR);
  
  for (const composeElement of composeElements) {
    if (!activeComposeElements.has(composeElement)) {
      handleNewComposeElement(composeElement);
    }
  }
}

/**
 * Handle a new compose element
 */
function handleNewComposeElement(composeElement) {
  debug('New compose element detected');
  
  // Find the send button (in Outlook, it's typically in a toolbar above the compose area)
  const sendButton = findSendButton();
  if (!sendButton) {
    debug('Could not find send button, will retry later');
    // In Outlook, the send button might not be immediately available
    // We'll set up a retry mechanism
    setTimeout(() => {
      if (!activeComposeElements.has(composeElement)) {
        handleNewComposeElement(composeElement);
      }
    }, 1000);
    return;
  }
  
  // Generate a tracking ID for this compose session
  const trackingId = generateSessionId();
  activeComposeElements.set(composeElement, trackingId);
  
  // Add click listener to the send button
  sendButton.addEventListener('click', () => handleSendButtonClick(composeElement, trackingId));
  
  debug('Compose element setup complete with tracking ID:', trackingId);
}

/**
 * Find the send button in the Outlook interface
 */
function findSendButton() {
  return document.querySelector(CONFIG.SEND_BUTTON_SELECTOR);
}

/**
 * Handle send button click
 */
async function handleSendButtonClick(composeElement, trackingId) {
  if (!trackingEnabled) {
    debug('Tracking disabled, not adding tracking pixel');
    return;
  }
  
  try {
    // Get email details
    const emailDetails = extractEmailDetails(composeElement);
    
    // Create tracking session in background
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_TRACKING_SESSION',
      emailDetails
    });
    
    if (response && response.success) {
      const serverTrackingId = response.trackingId;
      
      // Insert tracking pixel
      insertTrackingPixel(composeElement, serverTrackingId);
      
      // Process links for click tracking
      processLinksForTracking(composeElement, serverTrackingId);
      
      debug('Email prepared for tracking with ID:', serverTrackingId);
    } else {
      console.error('Failed to create tracking session:', response?.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error preparing email for tracking:', error);
  }
}

/**
 * Extract email details from the Outlook compose interface
 */
function extractEmailDetails(composeElement) {
  // In a real implementation, we would extract recipients, subject, etc.
  // This is a simplified version for Outlook
  
  // Find the subject input (this is a simplified approach for Outlook)
  const subjectInput = document.querySelector('input[aria-label="Add a subject"]');
  const subject = subjectInput ? subjectInput.value : 'No Subject';
  
  // For recipients, we would need to find the recipient fields
  // This is simplified and would need to be expanded in a real implementation
  const recipientElements = document.querySelectorAll('div[aria-label="To"] span[data-selection-index]');
  const recipients = Array.from(recipientElements).map(el => el.textContent.trim());
  
  return {
    subject,
    recipients,
    content: composeElement.innerHTML
  };
}

/**
 * Insert tracking pixel into email content
 */
function insertTrackingPixel(composeElement, trackingId) {
  // Create the tracking pixel HTML
  const pixelUrl = `https://api.emailtracker.com/pixel/${trackingId}`;
  const pixelHtml = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;">`;
  
  // Append the pixel to the email content
  composeElement.innerHTML += pixelHtml;
  
  debug('Tracking pixel inserted');
}

/**
 * Process links in the email for click tracking
 */
function processLinksForTracking(composeElement, trackingId) {
  const links = composeElement.querySelectorAll('a');
  
  links.forEach((link, index) => {
    const originalUrl = link.href;
    if (!originalUrl || originalUrl.startsWith('mailto:')) {
      return; // Skip mailto: links or empty links
    }
    
    // Create a tracked URL
    const linkId = `link_${index}`;
    const trackedUrl = `https://api.emailtracker.com/link/${trackingId}/${linkId}?url=${encodeURIComponent(originalUrl)}`;
    
    // Update the link
    link.href = trackedUrl;
  });
  
  debug(`Processed ${links.length} links for tracking`);
}

/**
 * Generate a session ID for tracking
 */
function generateSessionId() {
  return 'session_' + Math.random().toString(36).substring(2, 15);
}

/**
 * Debug logging function
 */
function debug(...args) {
  if (window.CONFIG.DEBUG) {
    console.log('Email Tracker (Outlook):', ...args);
  }
}

// Initialize when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}