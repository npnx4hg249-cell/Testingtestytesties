/**
 * Authentication Routes for Shifter for ICES
 *
 * Includes:
 * - Login with lockout protection
 * - Registration with strong password validation
 * - Password change
 * - 2FA setup and verification
 */

import { Router } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import {
  findUserByEmail,
  validatePassword,
  createUser,
  getById,
  update,
  getAll,
  addNotification
} from '../data/store.js';
import {
  generateToken,
  authenticate,
  validatePasswordStrength,
  generateStrongPassword,
  isAccountLocked,
  recordFailedAttempt,
  clearFailedAttempts,
  getLockedAccounts,
  unlockAccount,
  requireAdmin,
  requireManager
} from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', (req, res) => {
  const { email, password, totpCode } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Check if account is locked
  if (isAccountLocked(email)) {
    return res.status(423).json({
      error: 'Account is locked due to too many failed login attempts. Please try again later.',
      code: 'ACCOUNT_LOCKED'
    });
  }

  const user = findUserByEmail(email);

  if (!user) {
    recordFailedAttempt(email);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(401).json({ error: 'Account is deactivated' });
  }

  if (!validatePassword(user, password)) {
    const isNowLocked = recordFailedAttempt(email);
    if (isNowLocked) {
      return res.status(423).json({
        error: 'Account is now locked due to too many failed login attempts.',
        code: 'ACCOUNT_LOCKED'
      });
    }
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Check 2FA if enabled
  if (user.twoFactorEnabled) {
    if (!totpCode) {
      return res.status(200).json({
        requiresTwoFactor: true,
        message: 'Please provide your 2FA code'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpCode,
      window: 2
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }
  }

  // Clear failed attempts on successful login
  clearFailedAttempts(email);

  // Update last login
  update('users', user.id, {
    lastLogin: new Date().toISOString(),
    lastActivity: new Date().toISOString()
  });

  const token = generateToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin || false,
      isManager: user.isManager || false,
      isFloater: user.isFloater || false,
      inTraining: user.inTraining || false,
      twoFactorEnabled: user.twoFactorEnabled || false,
      twoFactorForced: user.twoFactorForced || false,
      darkMode: user.darkMode || false,
      needsPasswordChange: user.needsPasswordChange || false
    }
  });
});

/**
 * POST /api/auth/register
 * Register a new user (self-registration)
 */
router.post('/register', (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      error: 'Password does not meet requirements',
      details: passwordValidation.errors
    });
  }

  // Check if email already exists
  const existingUser = findUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const user = createUser({
    email,
    password,
    name,
    isAdmin: false,
    isManager: false,
    isFloater: false,
    inTraining: false
  });

  const token = generateToken(user);

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      isManager: user.isManager
    }
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, (req, res) => {
  const user = getById('users', req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin || false,
    isManager: user.isManager || false,
    isFloater: user.isFloater || false,
    inTraining: user.inTraining || false,
    tier: user.tier || 'T2',
    state: user.state,
    preferences: user.preferences || [],
    twoFactorEnabled: user.twoFactorEnabled || false,
    twoFactorForced: user.twoFactorForced || false,
    darkMode: user.darkMode || false,
    emailNotifications: user.emailNotifications !== false,
    needsPasswordChange: user.needsPasswordChange || false,
    notifications: user.notifications || []
  });
});

/**
 * POST /api/auth/change-password
 * Change password for current user
 */
router.post('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      error: 'Current password and new password are required'
    });
  }

  const user = getById('users', req.user.id);

  if (!validatePassword(user, currentPassword)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  // Validate new password strength
  const passwordValidation = validatePasswordStrength(newPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      error: 'New password does not meet requirements',
      details: passwordValidation.errors
    });
  }

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  update('users', user.id, {
    password: hashedPassword,
    needsPasswordChange: false
  });

  res.json({ message: 'Password changed successfully' });
});

/**
 * POST /api/auth/generate-password
 * Generate a strong random password
 */
router.post('/generate-password', authenticate, (req, res) => {
  const password = generateStrongPassword(16);
  res.json({ password });
});

/**
 * POST /api/auth/2fa/setup
 * Set up 2FA for the current user
 */
router.post('/2fa/setup', authenticate, async (req, res) => {
  const user = getById('users', req.user.id);

  if (user.twoFactorEnabled) {
    return res.status(400).json({ error: '2FA is already enabled for this account' });
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `Shifter for ICES (${user.email})`,
    length: 20
  });

  // Store temporarily (not enabled yet)
  update('users', user.id, {
    twoFactorSecret: secret.base32,
    twoFactorPending: true
  });

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  res.json({
    secret: secret.base32,
    qrCode: qrCodeUrl,
    message: 'Scan the QR code with your authenticator app, then verify with a code'
  });
});

/**
 * POST /api/auth/2fa/verify
 * Verify and enable 2FA
 */
router.post('/2fa/verify', authenticate, (req, res) => {
  const { code } = req.body;
  const user = getById('users', req.user.id);

  if (!user.twoFactorSecret || !user.twoFactorPending) {
    return res.status(400).json({ error: 'Please set up 2FA first' });
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 2
  });

  if (!verified) {
    return res.status(400).json({ error: 'Invalid verification code' });
  }

  update('users', user.id, {
    twoFactorEnabled: true,
    twoFactorPending: false,
    twoFactorForced: false
  });

  res.json({ message: '2FA has been enabled successfully' });
});

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA for current user
 */
router.post('/2fa/disable', authenticate, (req, res) => {
  const { password } = req.body;
  const user = getById('users', req.user.id);

  if (!user.twoFactorEnabled) {
    return res.status(400).json({ error: '2FA is not enabled for this account' });
  }

  if (!validatePassword(user, password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  update('users', user.id, {
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorPending: false
  });

  res.json({ message: '2FA has been disabled' });
});

/**
 * PUT /api/auth/preferences
 * Update user preferences (dark mode, notifications)
 */
router.put('/preferences', authenticate, (req, res) => {
  const { darkMode, emailNotifications } = req.body;
  const user = getById('users', req.user.id);

  const updates = {};
  if (typeof darkMode === 'boolean') updates.darkMode = darkMode;
  if (typeof emailNotifications === 'boolean') updates.emailNotifications = emailNotifications;

  update('users', user.id, updates);

  res.json({
    message: 'Preferences updated',
    darkMode: updates.darkMode ?? user.darkMode,
    emailNotifications: updates.emailNotifications ?? user.emailNotifications
  });
});

/**
 * PUT /api/auth/profile
 * Update user profile (name, email)
 */
router.put('/profile', authenticate, (req, res) => {
  const { name, email } = req.body;
  const user = getById('users', req.user.id);
  const updates = {};

  if (name) updates.name = name;

  if (email && email !== user.email) {
    // Check email uniqueness
    const existingUser = findUserByEmail(email);
    if (existingUser && existingUser.id !== user.id) {
      return res.status(400).json({ error: 'Email is already in use' });
    }
    updates.email = email;
  }

  update('users', user.id, updates);

  res.json({
    message: 'Profile updated',
    name: updates.name || user.name,
    email: updates.email || user.email
  });
});

/**
 * GET /api/auth/locked-accounts
 * Get list of locked accounts (admin only)
 */
router.get('/locked-accounts', authenticate, requireAdmin, (req, res) => {
  res.json(getLockedAccounts());
});

/**
 * POST /api/auth/unlock-account
 * Unlock a locked account (admin only)
 */
router.post('/unlock-account', authenticate, requireAdmin, (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  unlockAccount(email);

  res.json({ message: `Account ${email} has been unlocked` });
});

/**
 * POST /api/auth/admin/reset-password
 * Admin reset password for a user
 */
router.post('/admin/reset-password', authenticate, requireManager, (req, res) => {
  const { userId, newPassword, generateNew, sendEmail } = req.body;

  const user = getById('users', userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  let password = newPassword;
  if (generateNew) {
    password = generateStrongPassword(16);
  }

  if (!password) {
    return res.status(400).json({
      error: 'Please provide a password or set generateNew to true'
    });
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      error: 'Password does not meet requirements',
      details: passwordValidation.errors
    });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  update('users', userId, {
    password: hashedPassword,
    needsPasswordChange: true
  });

  // Add notification to user
  addNotification(userId, {
    type: 'password_reset',
    message: 'Your password has been reset by an administrator.'
  });

  res.json({
    message: 'Password has been reset',
    generatedPassword: generateNew ? password : undefined
  });
});

/**
 * PUT /api/auth/admin/user/:id/2fa
 * Admin manage 2FA for a user (force enable/disable)
 */
router.put('/admin/user/:id/2fa', authenticate, requireManager, (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // 'force' or 'disable'

  const user = getById('users', id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (action === 'disable') {
    update('users', id, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorPending: false,
      twoFactorForced: false
    });
    return res.json({ message: '2FA has been disabled for this user' });
  }

  if (action === 'force') {
    update('users', id, { twoFactorForced: true });
    return res.json({ message: 'User will be required to set up 2FA on next login' });
  }

  res.status(400).json({ error: 'Invalid action. Use "force" or "disable"' });
});

export default router;
