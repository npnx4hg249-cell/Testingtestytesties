/**
 * System Routes for ICES-Shifter
 *
 * Handles version management, auto-updates, and system configuration.
 */

import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { getSettings, updateSettings, getAll, update, getById } from '../data/store.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const VERSION_FILE = join(__dirname, '../../version.json');

// Update check configuration storage
let updateCheckConfig = {
  interval: 'day', // 'hour', '8hour', 'day'
  lastCheck: null,
  latestVersion: null,
  updateAvailable: false
};

/**
 * GET /api/system/version
 * Get current version information
 */
router.get('/version', (req, res) => {
  try {
    const versionData = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
    res.json({
      version: versionData.version,
      name: versionData.name,
      description: versionData.description,
      releaseDate: versionData.releaseDate
    });
  } catch (error) {
    res.json({
      version: '2.0.0',
      name: 'ICES-Shifter',
      description: 'Intelligent Constraint-based Engineering Scheduler',
      releaseDate: 'Unknown'
    });
  }
});

/**
 * GET /api/system/version/full
 * Get full version information including changelog (admin only)
 */
router.get('/version/full', authenticate, requireAdmin, (req, res) => {
  try {
    const versionData = JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
    res.json(versionData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read version file' });
  }
});

/**
 * GET /api/system/update-status
 * Get update status and configuration (admin only)
 */
router.get('/update-status', authenticate, requireAdmin, (req, res) => {
  res.json({
    currentVersion: getVersionInfo().version,
    ...updateCheckConfig,
    isDockerEnvironment: isDockerEnvironment()
  });
});

/**
 * POST /api/system/check-update
 * Check for updates from GitHub (admin only)
 */
router.post('/check-update', authenticate, requireAdmin, async (req, res) => {
  try {
    const currentVersion = getVersionInfo().version;

    // In a real implementation, this would check GitHub releases
    // For now, we simulate the check
    const checkResult = await checkForUpdates(currentVersion);

    updateCheckConfig.lastCheck = new Date().toISOString();
    updateCheckConfig.latestVersion = checkResult.latestVersion;
    updateCheckConfig.updateAvailable = checkResult.updateAvailable;

    res.json({
      currentVersion,
      latestVersion: checkResult.latestVersion,
      updateAvailable: checkResult.updateAvailable,
      releaseNotes: checkResult.releaseNotes,
      checkedAt: updateCheckConfig.lastCheck
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check for updates: ' + error.message });
  }
});

/**
 * POST /api/system/configure-update-check
 * Configure automatic update checking (admin only)
 */
router.post('/configure-update-check', authenticate, requireAdmin, (req, res) => {
  const { interval } = req.body;

  if (!['hour', '8hour', 'day', 'disabled'].includes(interval)) {
    return res.status(400).json({
      error: 'Invalid interval. Must be: hour, 8hour, day, or disabled'
    });
  }

  updateCheckConfig.interval = interval;

  res.json({
    message: 'Update check configuration saved',
    interval
  });
});

/**
 * POST /api/system/apply-update
 * Apply available update (admin only)
 */
router.post('/apply-update', authenticate, requireAdmin, async (req, res) => {
  if (!updateCheckConfig.updateAvailable) {
    return res.status(400).json({ error: 'No update available' });
  }

  try {
    const result = await applyUpdate();

    if (result.success) {
      res.json({
        message: 'Update applied successfully. Please restart the application.',
        newVersion: result.newVersion,
        requiresRestart: true
      });
    } else {
      res.status(500).json({
        error: 'Update failed',
        details: result.error
      });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to apply update: ' + error.message
    });
  }
});

/**
 * GET /api/system/settings
 * Get system settings (admin only)
 */
router.get('/settings', authenticate, requireAdmin, (req, res) => {
  const settings = getSettings();
  res.json(settings);
});

/**
 * PUT /api/system/settings
 * Update system settings (admin only)
 */
router.put('/settings', authenticate, requireAdmin, (req, res) => {
  const updated = updateSettings(req.body);
  res.json(updated);
});

/**
 * GET /api/system/email-config
 * Get email configuration status (admin only)
 */
router.get('/email-config', authenticate, requireAdmin, (req, res) => {
  res.json({
    configured: !!process.env.SMTP_HOST,
    host: process.env.SMTP_HOST ? '****' : null,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true'
  });
});

/**
 * PUT /api/users/:id/notifications
 * Update user email notification preferences
 */
router.put('/users/:id/notifications', authenticate, (req, res) => {
  const userId = req.params.id;

  // Users can only update their own notifications unless admin
  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot update other users notification settings' });
  }

  const user = getById('users', userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { emailNotifications } = req.body;

  const updated = update('users', userId, {
    emailNotifications: emailNotifications !== false
  });

  res.json({
    id: updated.id,
    emailNotifications: updated.emailNotifications
  });
});

/**
 * PUT /api/users/:id/engineer-link
 * Link admin/manager user to an engineer profile
 */
router.put('/users/:id/engineer-link', authenticate, requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { engineerId } = req.body;

  const user = getById('users', userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.role !== 'admin' && user.role !== 'manager') {
    return res.status(400).json({ error: 'Only admin or manager users can be linked to engineer profiles' });
  }

  if (engineerId) {
    const engineer = getById('engineers', engineerId);
    if (!engineer) {
      return res.status(404).json({ error: 'Engineer not found' });
    }
  }

  const updated = update('users', userId, {
    engineerId: engineerId || null,
    isAlsoEngineer: !!engineerId
  });

  res.json({
    id: updated.id,
    name: updated.name,
    role: updated.role,
    engineerId: updated.engineerId,
    isAlsoEngineer: updated.isAlsoEngineer
  });
});

/**
 * GET /api/system/users
 * Get all users for management (admin only)
 */
router.get('/users', authenticate, requireAdmin, (req, res) => {
  const users = getAll('users').map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    engineerId: u.engineerId,
    isAlsoEngineer: u.isAlsoEngineer,
    emailNotifications: u.emailNotifications !== false,
    createdAt: u.createdAt
  }));

  res.json(users);
});

// Helper functions

function getVersionInfo() {
  try {
    return JSON.parse(readFileSync(VERSION_FILE, 'utf-8'));
  } catch {
    return { version: '2.0.0' };
  }
}

function isDockerEnvironment() {
  return existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER === 'true';
}

async function checkForUpdates(currentVersion) {
  // In production, this would fetch from GitHub API:
  // const response = await fetch('https://api.github.com/repos/owner/ices-shifter/releases/latest');

  // For now, return simulated result
  return {
    latestVersion: currentVersion, // Same version = no update
    updateAvailable: false,
    releaseNotes: 'You are running the latest version.'
  };
}

async function applyUpdate() {
  const isDocker = isDockerEnvironment();

  try {
    if (isDocker) {
      // In Docker, we need to use git to pull updates
      // The data directory should be mounted as a volume to persist
      const { simpleGit } = await import('simple-git');
      const git = simpleGit();

      // Check if in git repo
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        return {
          success: false,
          error: 'Not a git repository. Cannot apply updates automatically.'
        };
      }

      // Stash any local changes (shouldn't be any in container)
      await git.stash();

      // Pull latest changes
      await git.pull('origin', 'main');

      // Get new version
      const newVersionInfo = getVersionInfo();

      return {
        success: true,
        newVersion: newVersionInfo.version
      };
    } else {
      // Non-Docker environment - use git directly
      const { simpleGit } = await import('simple-git');
      const git = simpleGit();

      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        return {
          success: false,
          error: 'Not a git repository. Cannot apply updates automatically.'
        };
      }

      // Stash changes, pull, pop stash
      await git.stash();
      await git.pull('origin', 'main');

      const newVersionInfo = getVersionInfo();

      return {
        success: true,
        newVersion: newVersionInfo.version
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

export default router;
