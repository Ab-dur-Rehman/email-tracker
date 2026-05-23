/**
 * Email Tracker - Gmail Integration
 * 
 * This content script integrates with Gmail's web interface to:
 * - Detect when emails are being composed
 * - Insert tracking pixels into outgoing emails
 * - Track link clicks in email content
 * - Communicate with the background service worker
 */

(() => {
// Configuration
const GMAIL_CONFIG = {
  COMPOSE_CONTAINER_SELECTOR: 'div[role="textbox"][aria-label="Message Body"], div[role="textbox"][contenteditable="true"][aria-label*="Message Body"]',
  COMPOSE_ROOT_SELECTOR: 'div[role="dialog"], table[role="presentation"]',
  SEND_BUTTON_SELECTOR: 'div[role="button"][data-tooltip^="Send"], div[role="button"][aria-label^="Send"], div[role="button"][data-tooltip*="Send"]',
  ACCOUNT_SELECTOR: 'a[aria-label*="Google Account"], a[title*="@"]'
};

// State management
let trackingEnabled = window.CONFIG.trackingEnabled; // Use the global CONFIG
let composeObserver = null;
let activeComposeElements = new Map(); // Maps compose elements to their tracking IDs
let preparingComposeElements = new WeakMap();
let composeScanInterval = null;
const allowedProgrammaticSends = new WeakSet();

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

  // Gmail's compose markup changes often. Delegated handling is more reliable
  // than binding directly to a button inside a specific compose form.
  document.addEventListener('click', handleDocumentSendClick, true);
  registerActiveGmailAccount();
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
    return false;
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
            const composeElements = node.querySelectorAll(GMAIL_CONFIG.COMPOSE_CONTAINER_SELECTOR);
            if (composeElements.length > 0) {
              for (const composeElement of composeElements) {
                handleNewComposeElement(composeElement);
              }
            }
            
            // Also check if the node itself is a compose element
            if (node.matches && node.matches(GMAIL_CONFIG.COMPOSE_CONTAINER_SELECTOR)) {
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
  scanComposeWindows();

  if (composeScanInterval) {
    clearInterval(composeScanInterval);
  }
  composeScanInterval = setInterval(scanComposeWindows, 1000);
}

function scanComposeWindows() {
  const existingComposeElements = document.querySelectorAll(GMAIL_CONFIG.COMPOSE_CONTAINER_SELECTOR);
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
  
  // Generate a tracking ID for this compose session
  const trackingId = generateSessionId();
  activeComposeElements.set(composeElement, trackingId);

  debug('Compose element setup complete with tracking ID:', trackingId);
}

/**
 * Handle delegated Gmail send button clicks.
 */
async function handleDocumentSendClick(event) {
  const sendButton = event.target.closest?.(GMAIL_CONFIG.SEND_BUTTON_SELECTOR);
  if (!sendButton) {
    return;
  }

  if (!event.isTrusted || allowedProgrammaticSends.has(sendButton)) {
    allowedProgrammaticSends.delete(sendButton);
    return;
  }

  const composeElement = findComposeElementForSendButton(sendButton);
  if (!composeElement) {
    console.warn('Email Tracker (Gmail): send clicked, but compose body was not found');
    return;
  }

  console.info('Email Tracker (Gmail): send click captured');
  event.preventDefault();
  event.stopImmediatePropagation();

  try {
    await prepareComposeForTracking(composeElement);
  } finally {
    allowedProgrammaticSends.add(sendButton);
    sendButton.click();
  }
}

/**
 * Find the compose body associated with a send button.
 */
function findComposeElementForSendButton(sendButton) {
  const composeRoot = sendButton.closest(GMAIL_CONFIG.COMPOSE_ROOT_SELECTOR) || document;
  const composeElement = composeRoot.querySelector(GMAIL_CONFIG.COMPOSE_CONTAINER_SELECTOR);
  if (composeElement) return composeElement;

  const allComposeElements = Array.from(document.querySelectorAll(GMAIL_CONFIG.COMPOSE_CONTAINER_SELECTOR));
  return allComposeElements.find(element => element.offsetParent !== null) || null;
}

/**
 * Prepare a compose window before Gmail sends it.
 */
async function prepareComposeForTracking(composeElement) {
  if (!trackingEnabled) {
    debug('Tracking disabled, not adding tracking pixel');
    return;
  }

  if (composeElement.dataset.emailTrackerPrepared === 'true') {
    debug('Compose already prepared for tracking');
    return;
  }

  if (preparingComposeElements.has(composeElement)) {
    return preparingComposeElements.get(composeElement);
  }
  
  const preparation = (async () => {
    // Get email details
    const emailDetails = extractEmailDetails(composeElement);
    emailDetails.senderAccount = detectActiveGmailAccount();
    
    // Create tracking session in background
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_TRACKING',
      data: emailDetails
    });
    
    if (response && response.success) {
      const serverTrackingId = response.trackingId;
      
      // Insert tracking pixel
      insertTrackingPixel(composeElement, serverTrackingId);
      
      // Process links for click tracking
      processLinksForTracking(composeElement, serverTrackingId);

      composeElement.dataset.emailTrackerPrepared = 'true';
      composeElement.dataset.emailTrackerId = serverTrackingId;
      
      console.info('Email Tracker (Gmail): tracking session created', serverTrackingId);
    } else {
      console.error('Failed to create tracking session:', response?.error || 'Unknown error');
    }
  })();

  preparingComposeElements.set(composeElement, preparation);

  try {
    await preparation;
  } catch (error) {
    console.error('Error preparing email for tracking:', error);
    throw error;
  } finally {
    preparingComposeElements.delete(composeElement);
  }
}

/**
 * Extract email details from compose element
 */
function extractEmailDetails(composeElement) {
  const composeRoot = composeElement.closest(GMAIL_CONFIG.COMPOSE_ROOT_SELECTOR) || document;
  const subjectInput = composeRoot.querySelector('input[name="subjectbox"]');
  const subject = subjectInput ? subjectInput.value : 'No Subject';
  
  const recipientElements = composeRoot.querySelectorAll('div[role="option"][data-hovercard-id], span[email], div[email]');
  const recipients = Array.from(recipientElements).map(el => {
    const email = el.getAttribute('data-hovercard-id') || el.getAttribute('email');
    return email || el.textContent.trim();
  }).filter(Boolean);
  
  return {
    subject,
    recipients,
    senderAccount: detectActiveGmailAccount(),
    content: composeElement.innerHTML
  };
}

function registerActiveGmailAccount() {
  const account = detectActiveGmailAccount();
  if (!account.email) return;

  chrome.runtime.sendMessage({
    type: 'REGISTER_GMAIL_ACCOUNT',
    account
  });
}

function detectActiveGmailAccount() {
  const accountLinks = Array.from(document.querySelectorAll(GMAIL_CONFIG.ACCOUNT_SELECTOR));
  const text = accountLinks
    .map(link => `${link.getAttribute('aria-label') || ''} ${link.getAttribute('title') || ''} ${link.textContent || ''}`)
    .join(' ');
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  if (emailMatch) {
    return {
      id: emailMatch[0],
      email: emailMatch[0],
      name: emailMatch[0],
      source: 'gmail_page',
      connectedAt: Date.now()
    };
  }

  const mailboxMatch = window.location.pathname.match(/\/mail\/u\/([^/]+)/);
  return {
    id: mailboxMatch ? `gmail-u-${mailboxMatch[1]}` : 'gmail-current-tab',
    email: '',
    name: mailboxMatch ? `Gmail account ${mailboxMatch[1]}` : 'Current Gmail tab',
    source: 'gmail_page',
    connectedAt: Date.now()
  };
}

/**
 * Insert tracking pixel into email content
 */
function insertTrackingPixel(composeElement, trackingId) {
  // Create the tracking pixel HTML
  const pixelUrl = `${window.CONFIG.API_ENDPOINT}/pixel/${trackingId}`;
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
    const trackedUrl = `${window.CONFIG.API_ENDPOINT}/link/${trackingId}/${linkId}?url=${encodeURIComponent(originalUrl)}`;
    
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
    console.log('Email Tracker (Gmail):', ...args);
  }
}

// Initialize when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
})();
