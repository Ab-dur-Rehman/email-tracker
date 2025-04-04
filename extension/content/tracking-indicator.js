/**
 * Email Tracker - Tracking Indicator
 * 
 * This script adds visual indicators to the Gmail interface to show when tracking is active
 * and provides a toggle button directly in the compose window.
 */

// Configuration is loaded from shared-config.js

// State management
const { trackingEnabled } = require('./shared-config.js');

/**
 * Initialize the tracking indicator
 */
async function initialize() {
  console.log('Email Tracker: Tracking indicator initialized');
  
  // Load tracking settings
  await loadTrackingSettings();
  
  // Set up listeners for settings changes
  chrome.storage.onChanged.addListener(handleStorageChanges);
  
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
    
    // Update all existing indicators
    updateAllTrackingIndicators();
  }
}

/**
 * Start observing for compose windows
 */
function startComposeObserver() {
  // Create a new mutation observer
  const composeObserver = new MutationObserver(mutations => {
    // Look for added nodes that might be compose windows
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for compose toolbars
            const toolbars = node.querySelectorAll(CONFIG.COMPOSE_TOOLBAR_SELECTOR);
            if (toolbars.length > 0) {
              for (const toolbar of toolbars) {
                addTrackingIndicator(toolbar);
              }
            }
            
            // Also check if the node itself is a toolbar
            if (node.matches && node.matches(CONFIG.COMPOSE_TOOLBAR_SELECTOR)) {
              addTrackingIndicator(node);
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
  
  // Also check for any existing compose toolbars
  const existingToolbars = document.querySelectorAll(CONFIG.COMPOSE_TOOLBAR_SELECTOR);
  for (const toolbar of existingToolbars) {
    addTrackingIndicator(toolbar);
  }
}

/**
 * Add tracking indicator to compose toolbar
 */
function addTrackingIndicator(toolbar) {
  // Check if indicator already exists
  if (toolbar.querySelector('.tracking-indicator')) {
    return;
  }
  
  // Create indicator container
  const indicatorContainer = document.createElement('div');
  indicatorContainer.className = 'tracking-indicator';
  indicatorContainer.style.display = 'inline-flex';
  indicatorContainer.style.alignItems = 'center';
  indicatorContainer.style.marginRight = '10px';
  indicatorContainer.style.cursor = 'pointer';
  
  // Create indicator icon
  const indicatorIcon = document.createElement('div');
  indicatorIcon.className = 'tracking-indicator-icon';
  indicatorIcon.style.width = '16px';
  indicatorIcon.style.height = '16px';
  indicatorIcon.style.borderRadius = '50%';
  indicatorIcon.style.marginRight = '5px';
  
  // Create indicator text
  const indicatorText = document.createElement('span');
  indicatorText.className = 'tracking-indicator-text';
  indicatorText.style.fontSize = '12px';
  indicatorText.style.fontWeight = 'bold';
  
  // Add elements to container
  indicatorContainer.appendChild(indicatorIcon);
  indicatorContainer.appendChild(indicatorText);
  
  // Update indicator state
  updateIndicatorState(indicatorContainer);
  
  // Add click handler to toggle tracking
  indicatorContainer.addEventListener('click', () => {
    toggleTracking(indicatorContainer);
  });
  
  // Find the right position to insert the indicator
  const firstChild = toolbar.firstChild;
  toolbar.insertBefore(indicatorContainer, firstChild);
  
  debug('Tracking indicator added to compose toolbar');
}

/**
 * Update indicator state based on tracking settings
 */
function updateIndicatorState(indicatorContainer) {
  const indicatorIcon = indicatorContainer.querySelector('.tracking-indicator-icon');
  const indicatorText = indicatorContainer.querySelector('.tracking-indicator-text');
  
  if (trackingEnabled) {
    indicatorIcon.style.backgroundColor = '#4CAF50'; // Green
    indicatorText.textContent = 'Tracking ON';
    indicatorText.style.color = '#4CAF50';
  } else {
    indicatorIcon.style.backgroundColor = '#F44336'; // Red
    indicatorText.textContent = 'Tracking OFF';
    indicatorText.style.color = '#F44336';
  }
}

/**
 * Update all existing tracking indicators
 */
function updateAllTrackingIndicators() {
  const indicators = document.querySelectorAll('.tracking-indicator');
  for (const indicator of indicators) {
    updateIndicatorState(indicator);
  }
}

/**
 * Toggle tracking state
 */
async function toggleTracking(indicatorContainer) {
  // Toggle tracking state
  trackingEnabled = !trackingEnabled;
  
  // Save to storage
  await chrome.storage.sync.set({ [CONFIG.TRACKING_ENABLED_KEY]: trackingEnabled });
  
  // Update indicator
  updateIndicatorState(indicatorContainer);
  
  debug('Tracking toggled:', trackingEnabled);
}

/**
 * Debug logging function
 */
function debug(...args) {
  if (CONFIG.DEBUG) {
    console.log('Email Tracker (Indicator):', ...args);
  }
}

// Initialize when the DOM is fully loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}