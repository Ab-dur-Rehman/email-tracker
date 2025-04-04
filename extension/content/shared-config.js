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

// Export tracking enabled key for storage
window.CONFIG.TRACKING_ENABLED_KEY = 'trackingEnabled';

// Debug mode setting
window.CONFIG.DEBUG = false;