/**
 * Email Tracker - Shared Configuration
 * 
 * This file contains shared configuration settings used across content scripts.
 * It uses window.CONFIG to make settings globally accessible without requiring imports.
 */

// Create a global configuration object if it doesn't exist
window.CONFIG = window.CONFIG || {};

// Set default tracking state
window.CONFIG.trackingEnabled = true;

// Tracking API. Keep this without a trailing slash so URL building is stable.
window.CONFIG.API_ENDPOINT = 'https://email-tracker-virid.vercel.app';

// Export tracking enabled key for storage
window.CONFIG.TRACKING_ENABLED_KEY = 'trackingEnabled';

// Gmail compose selectors used by the Gmail content scripts.
window.CONFIG.COMPOSE_CONTAINER_SELECTOR = 'div[role="textbox"][aria-label="Message Body"]';
window.CONFIG.COMPOSE_TOOLBAR_SELECTOR = 'div[role="toolbar"][aria-label*="Formatting"]';

// Debug mode setting
window.CONFIG.DEBUG = false;
