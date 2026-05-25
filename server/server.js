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
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const DASHBOARD_TOKEN = process.env.DASHBOARD_TOKEN || '';

const usePostgres = Boolean(process.env.DATABASE_URL);
let pool = null;
let dbReadyPromise = null;
let memoryTrackingData = {};

if (usePostgres) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
  });
}

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for extension requests
app.use(express.json()); // Parse JSON request bodies
app.use(morgan('combined')); // Request logging
app.use('/dashboard-assets', express.static(path.join(__dirname, 'public')));

const asyncHandler = handler => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function requireDashboardAccess(req, res, next) {
  if (!DASHBOARD_TOKEN) {
    next();
    return;
  }

  const authHeader = req.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const token = bearerToken || req.query.token;

  if (token === DASHBOARD_TOKEN) {
    next();
    return;
  }

  res.status(401).json({
    success: false,
    error: 'Unauthorized'
  });
}

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

function updateSessionConfidence(session) {
  if (!session) return session;
  session.confidence = summarizeSessionConfidence(session);
  session.status = session.confidence.status;
  return session;
}

function normalizeSession(session) {
  const normalized = {
    id: session.id,
    emailSubject: session.emailSubject || session.subject || 'No Subject',
    recipients: Array.isArray(session.recipients) ? session.recipients : [],
    senderAccount: session.senderAccount || null,
    sentTimestamp: session.sentTimestamp || Date.now(),
    pixelLoads: Array.isArray(session.pixelLoads) ? session.pixelLoads : [],
    linkClicks: Array.isArray(session.linkClicks) ? session.linkClicks : [],
    status: session.status || 'sent',
    confidence: session.confidence || null
  };

  return updateSessionConfidence(normalized);
}

function dedupeEvents(events, extraKey = '') {
  const seen = new Set();
  return events.filter(event => {
    const key = [
      event.timestamp || '',
      event.userAgent || '',
      event.ip || event.ipAddress || '',
      event.linkId || '',
      event.url || '',
      extraKey
    ].join('|');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeSessions(existing, incoming) {
  if (!existing) return normalizeSession(incoming);

  const merged = {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    emailSubject: incoming.emailSubject || existing.emailSubject,
    recipients: incoming.recipients && incoming.recipients.length ? incoming.recipients : existing.recipients,
    senderAccount: incoming.senderAccount || existing.senderAccount,
    sentTimestamp: incoming.sentTimestamp || existing.sentTimestamp || Date.now(),
    pixelLoads: dedupeEvents([
      ...(existing.pixelLoads || []),
      ...(incoming.pixelLoads || [])
    ]),
    linkClicks: dedupeEvents([
      ...(existing.linkClicks || []),
      ...(incoming.linkClicks || [])
    ])
  };

  return normalizeSession(merged);
}

async function ensureDatabase() {
  if (!usePostgres) return;
  if (!dbReadyPromise) {
    dbReadyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS tracking_sessions (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }
  await dbReadyPromise;
}

async function getSession(trackingId) {
  if (!usePostgres) {
    return memoryTrackingData[trackingId] || null;
  }

  await ensureDatabase();
  const result = await pool.query(
    'SELECT data FROM tracking_sessions WHERE id = $1',
    [trackingId]
  );

  return result.rows[0] ? result.rows[0].data : null;
}

async function saveSession(session) {
  const normalized = normalizeSession(session);

  if (!usePostgres) {
    memoryTrackingData[normalized.id] = normalized;
    return normalized;
  }

  await ensureDatabase();
  await pool.query(
    `INSERT INTO tracking_sessions (id, data, created_at, updated_at)
     VALUES ($1, $2::jsonb, NOW(), NOW())
     ON CONFLICT (id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [normalized.id, JSON.stringify(normalized)]
  );

  return normalized;
}

async function mergeAndSaveSession(incomingSession) {
  const existingSession = await getSession(incomingSession.id);
  return saveSession(mergeSessions(existingSession, incomingSession));
}

async function getAllSessions() {
  if (!usePostgres) {
    return memoryTrackingData;
  }

  await ensureDatabase();
  const result = await pool.query(
    'SELECT data FROM tracking_sessions ORDER BY updated_at DESC'
  );

  return result.rows.reduce((sessions, row) => {
    sessions[row.data.id] = normalizeSession(row.data);
    return sessions;
  }, {});
}

async function clearAllSessions() {
  if (!usePostgres) {
    memoryTrackingData = {};
    return;
  }

  await ensureDatabase();
  await pool.query('DELETE FROM tracking_sessions');
}

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
app.get('/pixel/:trackingId', trackingLimiter, asyncHandler(async (req, res) => {
  const { trackingId } = req.params;
  const clientInfo = getClientInfo(req);
  
  console.log(`Pixel load: ${trackingId}`);
  
  const session = await getSession(trackingId) || {
    id: trackingId,
    pixelLoads: [],
    linkClicks: []
  };
  
  clientInfo.confidence = classifyEngagementEvent({
    type: 'open',
    userAgent: clientInfo.userAgent,
    eventTimestamp: clientInfo.timestamp,
    sentTimestamp: session.sentTimestamp,
    hasLinkClick: (session.linkClicks || []).length > 0
  });

  session.pixelLoads = [...(session.pixelLoads || []), clientInfo];
  await saveSession(session);
  
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
}));

/**
 * Link tracking endpoint
 * Handles link click tracking and redirects
 */
app.get('/link/:trackingId/:linkId', trackingLimiter, asyncHandler(async (req, res) => {
  const { trackingId, linkId } = req.params;
  const redirectUrl = req.query.url;
  const clientInfo = getClientInfo(req);
  
  console.log(`Link click: ${trackingId} / ${linkId}`);
  
  const session = await getSession(trackingId) || {
    id: trackingId,
    pixelLoads: [],
    linkClicks: []
  };
  
  const clickEvent = {
    ...clientInfo,
    linkId,
    url: redirectUrl,
    confidence: classifyEngagementEvent({
      type: 'click',
      userAgent: clientInfo.userAgent,
      eventTimestamp: clientInfo.timestamp,
      sentTimestamp: session.sentTimestamp
    })
  };

  session.linkClicks = [...(session.linkClicks || []), clickEvent];
  await saveSession(session);
  
  // Redirect to the original URL
  if (redirectUrl) {
    res.redirect(redirectUrl);
  } else {
    res.status(400).send('Missing redirect URL');
  }
}));

/**
 * Sync endpoint
 * Allows the extension to sync tracking data
 */
app.post('/sync', express.json(), asyncHandler(async (req, res) => {
  const { trackingSessions } = req.body;

  if (trackingSessions) {
    for (const session of Object.values(trackingSessions)) {
      if (session && session.id) {
        await mergeAndSaveSession(session);
      }
    }
  }
  
  res.json({
    success: true,
    storage: usePostgres ? 'postgres' : 'memory',
    updatedSessions: await getAllSessions()
  });
}));

app.get('/dashboard', requireDashboardAccess, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/api/sessions', requireDashboardAccess, asyncHandler(async (req, res) => {
  const sessions = await getAllSessions();
  res.json({
    success: true,
    storage: usePostgres ? 'postgres' : 'memory',
    sessions,
    generatedAt: new Date().toISOString()
  });
}));

/**
 * Clear tracking data endpoint (for testing/development)
 */
app.post('/clear', requireDashboardAccess, asyncHandler(async (req, res) => {
  await clearAllSessions();
  res.json({ success: true, message: 'All tracking data cleared' });
}));

app.get('/health', asyncHandler(async (req, res) => {
  try {
    await ensureDatabase();
    res.json({
      success: true,
      storage: usePostgres ? 'postgres' : 'memory'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      storage: usePostgres ? 'postgres' : 'memory',
      error: error.message
    });
  }
}));

/**
 * GDPR compliance endpoint - data export
 */
app.get('/gdpr/export/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  
  // In a real implementation, we would:
  // 1. Authenticate the request
  // 2. Retrieve all data for the user
  // 3. Format it appropriately
  
  // For this example, we'll return a dummy response
  res.json({
    userId,
    exportDate: new Date().toISOString(),
    trackingData: await getAllSessions()
  });
}));

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

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

/**
 * Start the server
 */
app.listen(PORT, () => {
  console.log(`Email Tracker server running on port ${PORT}`);
});
