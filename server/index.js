/**
 * ICES-Shifter - Main Server Entry Point
 *
 * Intelligent Constraint-based Engineering Scheduler
 * A shift planning application for engineering teams.
 */

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { initStore } from './data/store.js';

// Import routes
import authRoutes from './routes/auth.js';
import engineerRoutes from './routes/engineers.js';
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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/engineers', engineerRoutes);
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
    return '2.0.0';
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: getVersion(),
    name: 'ICES-Shifter'
  });
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'ICES-Shifter API',
    version: getVersion(),
    description: 'Intelligent Constraint-based Engineering Scheduler',
    endpoints: {
      auth: {
        'POST /api/auth/login': 'Login with email and password',
        'POST /api/auth/register': 'Register a new user',
        'GET /api/auth/me': 'Get current user info'
      },
      engineers: {
        'GET /api/engineers': 'List all engineers',
        'GET /api/engineers/states': 'List German states',
        'GET /api/engineers/:id': 'Get engineer by ID',
        'POST /api/engineers': 'Create engineer (manager only)',
        'PUT /api/engineers/:id': 'Update engineer (manager only)',
        'PUT /api/engineers/:id/preferences': 'Update shift preferences',
        'PUT /api/engineers/:id/unavailable': 'Update unavailable days',
        'GET /api/engineers/:id/holidays': 'Get holidays for engineer'
      },
      schedules: {
        'GET /api/schedules': 'List all schedules',
        'GET /api/schedules/:id': 'Get schedule by ID',
        'GET /api/schedules/month/:year/:month': 'Get schedule for month',
        'POST /api/schedules/generate': 'Generate new schedule',
        'POST /api/schedules/generate-with-option': 'Generate with recovery option',
        'PUT /api/schedules/:id': 'Update schedule (manual edit)',
        'POST /api/schedules/:id/publish': 'Publish schedule',
        'GET /api/schedules/:id/export': 'Export schedule data',
        'GET /api/schedules/holidays/:year/:month': 'Get holidays for month'
      },
      requests: {
        'GET /api/requests': 'List requests',
        'GET /api/requests/pending': 'Get pending requests (manager only)',
        'GET /api/requests/:id': 'Get request by ID',
        'POST /api/requests': 'Create scheduling request',
        'POST /api/requests/:id/approve': 'Approve request (manager only)',
        'POST /api/requests/:id/reject': 'Reject request (manager only)',
        'DELETE /api/requests/:id': 'Cancel pending request',
        'GET /api/requests/types/list': 'Get request types'
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
          <title>ICES-Shifter</title>
          <style>
            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
            h1 { color: #1155cc; }
            code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
            pre { background: #f0f0f0; padding: 15px; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>🗓️ ICES-Shifter API</h1>
          <p>The API server is running. To use the full application:</p>
          <ol>
            <li>Build the client: <code>cd client && npm install && npm run build</code></li>
            <li>Or run in development mode: <code>npm run dev</code></li>
          </ol>
          <h2>Quick Start</h2>
          <p>Default admin login:</p>
          <pre>Email: admin@example.com
Password: admin123</pre>
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
║   🗓️  ICES-Shifter - Shift Planning Application             ║
║                                                           ║
║   Server running at http://localhost:${PORT}                ║
║   API documentation at http://localhost:${PORT}/api         ║
║                                                           ║
║   Default admin login:                                    ║
║   Email: admin@example.com                                ║
║   Password: admin123                                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
