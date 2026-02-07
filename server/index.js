/**
 * Shifter for ICES - Main Server Entry Point
 *
 * Intelligent Constraint-based Engineering Scheduler
 * A shift planning application for engineering teams.
 *
 * Security Updates (v2.0):
 * - CORS origin restrictions
 * - Security headers
 * - Rate limiting
 * - HTTPS enforcement in production
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { initStore } from './data/store.js';

// Import routes
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import scheduleRoutes from './routes/schedules.js';
import requestRoutes from './routes/requests.js';
import systemRoutes from './routes/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize data store
initStore();

// Create Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting (in-memory, simple implementation)
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100; // 100 requests per minute
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_LIMIT_MAX = 10; // 10 login attempts per 15 minutes

function rateLimit(windowMs, maxRequests, keyGenerator = (req) => req.ip) {
  return (req, res, next) => {
    const key = keyGenerator(req);
    const now = Date.now();
    const windowKey = `${key}_${Math.floor(now / windowMs)}`;

    const current = rateLimitStore.get(windowKey) || 0;
    if (current >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests, please try again later'
      });
    }

    rateLimitStore.set(windowKey, current + 1);

    // Cleanup old entries
    for (const [k, v] of rateLimitStore.entries()) {
      const keyTime = parseInt(k.split('_').pop()) * windowMs;
      if (now - keyTime > windowMs * 2) {
        rateLimitStore.delete(k);
      }
    }

    next();
  };
}

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'");

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // HSTS (only in production with HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

// HTTPS enforcement in production
const enforceHttps = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' &&
      req.headers['x-forwarded-proto'] !== 'https' &&
      !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
};

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Apply middleware
app.use(enforceHttps);
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting
app.use('/api/', rateLimit(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS));
app.use('/api/auth/login', rateLimit(LOGIN_RATE_LIMIT_WINDOW_MS, LOGIN_RATE_LIMIT_MAX));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
// Legacy route alias - /api/engineers maps to /api/users
app.use('/api/engineers', userRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/system', systemRoutes);

// Get version info
function getVersion() {
  try {
    const versionFile = join(__dirname, '../version.json');
    const data = JSON.parse(readFileSync(versionFile, 'utf-8'));
    return data.version;
  } catch {
    return '3.0.0';
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: getVersion(),
    name: 'Shifter for ICES'
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'Shifter for ICES API',
    version: getVersion(),
    description: 'Intelligent Constraint-based Engineering Scheduler',
    endpoints: {
      auth: {
        'POST /api/auth/login': 'Login with email and password',
        'POST /api/auth/register': 'Register a new user',
        'GET /api/auth/me': 'Get current user info',
        'POST /api/auth/change-password': 'Change password',
        'POST /api/auth/2fa/setup': 'Setup 2FA',
        'POST /api/auth/2fa/verify': 'Verify 2FA',
        'POST /api/auth/2fa/disable': 'Disable 2FA'
      },
      users: {
        'GET /api/users': 'List all users',
        'GET /api/users/states': 'List German states',
        'GET /api/users/:id': 'Get user by ID',
        'POST /api/users': 'Create user (manager only)',
        'PUT /api/users/:id': 'Update user',
        'DELETE /api/users/:id': 'Deactivate user',
        'PUT /api/users/:id/preferences': 'Update shift preferences',
        'PUT /api/users/:id/unavailable': 'Update unavailable days',
        'GET /api/users/:id/holidays': 'Get holidays for user',
        'POST /api/users/:id/reset-password': 'Reset user password',
        'POST /api/users/bulk-upload': 'Bulk upload users from CSV',
        'POST /api/users/bulk-upload-excel': 'Bulk upload users from Excel'
      },
      schedules: {
        'GET /api/schedules': 'List all schedules',
        'GET /api/schedules/:id': 'Get schedule by ID',
        'GET /api/schedules/month/:year/:month': 'Get schedule for month',
        'GET /api/schedules/latest-published': 'Get latest published schedule',
        'POST /api/schedules/generate': 'Generate new schedule',
        'POST /api/schedules/generate-with-option': 'Generate with recovery option',
        'PUT /api/schedules/:id': 'Update schedule',
        'PUT /api/schedules/:id/shift': 'Update single shift',
        'POST /api/schedules/:id/publish': 'Publish schedule',
        'POST /api/schedules/:id/archive': 'Archive schedule',
        'DELETE /api/schedules/:id': 'Delete unpublished schedule'
      },
      requests: {
        'GET /api/requests': 'List requests',
        'GET /api/requests/pending': 'Get pending requests (manager only)',
        'POST /api/requests': 'Create scheduling request',
        'POST /api/requests/:id/approve': 'Approve request (manager only)',
        'POST /api/requests/:id/reject': 'Reject request (manager only)'
      },
      system: {
        'GET /api/system/version': 'Get version info',
        'GET /api/system/settings': 'Get system settings',
        'PUT /api/system/smtp-settings': 'Update SMTP settings',
        'GET /api/system/locked-accounts': 'Get locked accounts'
      }
    }
  });
});

// Serve static files from client build in production
const clientBuildPath = join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(join(clientBuildPath, 'index.html'), err => {
    if (err) {
      // In development, client build might not exist
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Shifter for ICES</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #1155cc; }
            h1 span { font-size: 0.5em; opacity: 0.8; }
            code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
            pre { background: #f0f0f0; padding: 15px; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>Shifter <span>for ICES</span></h1>
          <p>The API server is running. To use the full application:</p>
          <ol>
            <li>Build the client: <code>cd client && npm install && npm run build</code></li>
            <li>Or run in development mode: <code>npm run dev</code></li>
          </ol>
          <h2>Quick Start</h2>
          <p>Default admin login:</p>
          <pre>Email: admin@example.com
Password: Admin123!@#</pre>
          <p>API documentation: <a href="/api">/api</a></p>
          <p>Health check: <a href="/api/health">/api/health</a></p>
        </body>
        </html>
      `);
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Shifter for ICES - Shift Planning Application           ║
║                                                           ║
║   Server running at http://localhost:${PORT}                ║
║   API documentation at http://localhost:${PORT}/api         ║
║                                                           ║
║   Default admin login:                                    ║
║   Email: admin@example.com                                ║
║   Password: Admin123!@#                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
