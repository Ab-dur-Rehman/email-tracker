/**
 * Email Tracker - Server Component
 * 
 * This server handles:
 * - Tracking pixel requests
 * - Link click redirects
 * - Data synchronization with browser extensions
 * - Geolocation and device detection
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const path = require('path');
const fs = require('fs');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Database simulation (in a real app, use a proper database)
let trackingData = {};

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for extension requests
app.use(express.json()); // Parse JSON request bodies
app.use(morgan('combined')); // Request logging

// Rate limiting for pixel and link endpoints
const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

// Create a 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

/**
 * Helper function to extract client information from request
 */
function getClientInfo(req) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Parse user agent
  const uaParser = new UAParser(userAgent);
  const uaResult = uaParser.getResult();
  
  // Get geolocation from IP
  const geo = geoip.lookup(ip);
  
  return {
    ip,
    userAgent,
    timestamp: Date.now(),
    device: {
      browser: uaResult.browser.name || 'unknown',
      browserVersion: uaResult.browser.version || 'unknown',
      os: uaResult.os.name || 'unknown',
      osVersion: uaResult.os.version || 'unknown',
      device: uaResult.device.type || 'desktop',
      deviceVendor: uaResult.device.vendor || 'unknown',
      deviceModel: uaResult.device.model || 'unknown'
    },
    geolocation: geo ? {
      country: geo.country,
      region: geo.region,
      city: geo.city,
      ll: geo.ll // latitude, longitude
    } : null
  };
}

/**
 * Tracking pixel endpoint
 * Handles email open tracking
 */
app.get('/pixel/:trackingId', trackingLimiter, (req, res) => {
  const { trackingId } = req.params;
  const clientInfo = getClientInfo(req);
  
  console.log(`Pixel load: ${trackingId}`);
  
  // Record the pixel load event
  if (!trackingData[trackingId]) {
    trackingData[trackingId] = {
      id: trackingId,
      pixelLoads: [],
      linkClicks: []
    };
  }
  
  trackingData[trackingId].pixelLoads.push(clientInfo);
  
  // Set ETag for caching control and verification
  const etag = `"${trackingId}_${Date.now()}"`;
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Send the tracking pixel
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', TRACKING_PIXEL.length);
  res.end(TRACKING_PIXEL);
});

/**
 * Link tracking endpoint
 * Handles link click tracking and redirects
 */
app.get('/link/:trackingId/:linkId', trackingLimiter, (req, res) => {
  const { trackingId, linkId } = req.params;
  const redirectUrl = req.query.url;
  const clientInfo = getClientInfo(req);
  
  console.log(`Link click: ${trackingId} / ${linkId}`);
  
  // Record the link click event
  if (!trackingData[trackingId]) {
    trackingData[trackingId] = {
      id: trackingId,
      pixelLoads: [],
      linkClicks: []
    };
  }
  
  trackingData[trackingId].linkClicks.push({
    ...clientInfo,
    linkId,
    url: redirectUrl
  });
  
  // Redirect to the original URL
  if (redirectUrl) {
    res.redirect(redirectUrl);
  } else {
    res.status(400).send('Missing redirect URL');
  }
});

/**
 * Sync endpoint
 * Allows the extension to sync tracking data
 */
app.post('/sync', express.json(), async (req, res) => {
  try {
    const { trackingSessions, timestamp } = req.body;
    
    // In a real implementation, we would:
    // 1. Authenticate the request
    // 2. Validate the data
    // 3. Merge with server data
    // 4. Store in a database
    
    // For this example, we'll just merge with our in-memory data
    if (trackingSessions) {
      Object.keys(trackingSessions).forEach(id => {
        if (!trackingData[id]) {
          trackingData[id] = trackingSessions[id];
        } else {
          // Merge data (simplified)
          trackingData[id] = {
            ...trackingData[id],
            ...trackingSessions[id],
            pixelLoads: [
              ...(trackingData[id].pixelLoads || []),
              ...(trackingSessions[id].pixelLoads || [])
            ],
            linkClicks: [
              ...(trackingData[id].linkClicks || []),
              ...(trackingSessions[id].linkClicks || [])
            ]
          };
        }
      });
    }
    
    // Return any updated sessions
    // In a real app, we'd filter based on timestamp
    res.json({
      success: true,
      updatedSessions: trackingData
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Clear tracking data endpoint (for testing/development)
 */
app.post('/clear', (req, res) => {
  trackingData = {};
  res.json({ success: true, message: 'All tracking data cleared' });
});

/**
 * GDPR compliance endpoint - data export
 */
app.get('/gdpr/export/:userId', (req, res) => {
  const { userId } = req.params;
  
  // In a real implementation, we would:
  // 1. Authenticate the request
  // 2. Retrieve all data for the user
  // 3. Format it appropriately
  
  // For this example, we'll return a dummy response
  res.json({
    userId,
    exportDate: new Date().toISOString(),
    trackingData: {}
  });
});

/**
 * GDPR compliance endpoint - data deletion
 */
app.delete('/gdpr/delete/:userId', (req, res) => {
  const { userId } = req.params;
  
  // In a real implementation, we would:
  // 1. Authenticate the request
  // 2. Delete all data for the user
  
  // For this example, we'll return a success response
  res.json({
    success: true,
    userId,
    deletionDate: new Date().toISOString(),
    message: 'All user data has been deleted'
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`Email Tracker server running on port ${PORT}`);
});