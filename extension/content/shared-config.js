/**
 * Email Tracker - Shared Configuration
 * 
 * This file contains shared configuration settings used across multiple content scripts.
 * It helps prevent duplicate declarations of the CONFIG object.
 */

// Configuration for Gmail integration
const CONFIG = {
  // Gmail selectors
  COMPOSE_CONTAINER_SELECTOR: '.Am.Al.editable', // Gmail compose box selector
  SEND_BUTTON_SELECTOR: '.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3', // Gmail send button
  COMPOSE_TOOLBAR_SELECTOR: '.btC', // Gmail compose toolbar
  
  // Common settings
  TRACKING_ENABLED_KEY: 'trackingEnabled',
  DEBUG: false
};