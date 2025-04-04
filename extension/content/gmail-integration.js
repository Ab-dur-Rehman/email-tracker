/**
 * Email Tracker - Gmail Integration
 * 
 * This content script integrates with Gmail's web interface to:
 * - Detect when emails are being composed
 * - Insert tracking pixels into outgoing emails
 * - Track link clicks in email content
 * - Communicate with the background service worker
 */

// Configuration
const CONFIG = {
  COMPOSE_CONTAINER_SELECTOR: '.Am.Al.editable', // Gmail compose box selector
  SEND_BUTTON_SELECTOR: '.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3', // Gmail send button
  TRACKING_ENABLED_KEY: 'trackingEnabled',
  DEBUG: false
};

// State management
let trackingEnabled = true;
let composeObserver = null;
let activeComposeElements = new Map(); // Maps compose elements to their tracking IDs

/**
 * Initialize the Gmail integration
 */
async function initialize() {
  console.log('Email Tracker: Gmail integration initialized');
  
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
    const settings = await chrome.storage.sync.get(CONFIG.TRACKING_ENABLED_KEY);
    trackingEnabled = settings[CONFIG.TRACKING_ENABLED_KEY] !== undefined 
      ? settings[CONFIG.TRACKING_ENABLED_KEY] 
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
  if (area === 'sync' && changes[CONFIG.TRACKING_ENABLED_KEY]) {
    trackingEnabled = changes[CONFIG.TRACKING_ENABLED_KEY].newValue;
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
    // Look for added nodes that might be compose windows
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for compose elements
            const composeElements = node.querySelectorAll(CONFIG.COMPOSE_CONTAINER_SELECTOR);
            if (composeElements.length > 0) {
              for (const composeElement of composeElements) {
                handleNewComposeElement(composeElement);
              }
            }
            
            // Also check if the node itself is a compose element
            if (node.matches && node.matches(CONFIG.COMPOSE_CONTAINER_SELECTOR)) {
              handleNewComposeElement(node);
            }
          }
        }
      }
    }
  });
  
  // Start observing the document body for changes
  composeObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also check for any existing compose windows
  const existingComposeElements = document.querySelectorAll(CONFIG.COMPOSE_CONTAINER_SELECTOR);
  for (const composeElement of existingComposeElements) {
    handleNewComposeElement(composeElement);
  }
}

/**
 * Handle a new compose element
 */
function handleNewComposeElement(composeElement) {
  // Skip if we're already tracking this element
  if (activeComposeElements.has(composeElement)) {
    return;
  }
  
  debug('New compose element detected');
  
  // Find the closest form that contains the send button
  const composeForm = findComposeForm(composeElement);
  if (!composeForm) {
    debug('Could not find compose form');
    return;
  }
  
  // Find the send button
  const sendButton = composeForm.querySelector(CONFIG.SEND_BUTTON_SELECTOR);
  if (!sendButton) {
    debug('Could not find send button');
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
 * Find the compose form that contains the given compose element
 */
function findComposeForm(composeElement) {
  // In Gmail, we need to traverse up to find the form
  let element = composeElement;
  while (element && element.tagName !== 'FORM' && element !== document.body) {
    element = element.parentElement;
  }
  
  return element && element.tagName === 'FORM' ? element : null;
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
 * Extract email details from compose element
 */
function extractEmailDetails(composeElement) {
  // In a real implementation, we would extract recipients, subject, etc.
  // This is a simplified version
  
  // Find the subject input (this is a simplified approach)
  const subjectInput = document.querySelector('input[name="subjectbox"]');
  const subject = subjectInput ? subjectInput.value : 'No Subject';
  
  // For recipients, we would need to find the recipient fields
  // This is simplified and would need to be expanded in a real implementation
  const recipientElements = document.querySelectorAll('div[role="option"][data-hovercard-id]');
  const recipients = Array.from(recipientElements).map(el => {
    const email = el.getAttribute('data-hovercard-id');
    return email || el.textContent.trim();
  });
  
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
  const pixelUrl = `https://email-tracker-virid.vercel.app/pixel/${trackingId}`;
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
    const trackedUrl = `https://email-tracker-virid.vercel.app/link/${trackingId}/${linkId}?url=${encodeURIComponent(originalUrl)}`;
    
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
  if (CONFIG.DEBUG) {
    console.log('Email Tracker (Gmail):', ...args);
  }
}

// Initialize when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}