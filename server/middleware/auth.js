/**
 * Authentication Middleware for Shifter for ICES
 *
 * JWT-based authentication with security features:
 * - Strong password validation
 * - Account lockout after failed attempts
 * - Auto sign-out after inactivity
 * - 2FA support
 */

import jwt from 'jsonwebtoken';
import { getById, update, getAll } from '../data/store.js';

// Secret key for JWT (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'shifter-ices-secret-key-change-in-production';
const JWT_EXPIRES_IN = '8h'; // Cookie lifetime
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour auto sign-out

// Failed login tracking (in-memory, would be in DB in production)
const failedAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 4;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Common passwords to deny
const COMMON_PASSWORDS = [
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567',
  'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
  'ashley', 'bailey', 'shadow', '123123', '654321', 'superman', 'qazwsx',
  'michael', 'football', 'password1', 'password123', 'welcome', 'jesus', 'ninja',
  'mustang', 'password2', 'admin', 'admin123', 'root', 'toor', 'pass', 'test',
  'guest', 'master123', 'changeme', 'hello', 'charlie', '112233', '121212',
  'computer', 'tigger', 'jennifer', 'hunter', 'pepper', 'soccer', 'hockey'
];

// Dictionary words (common English words to check against)
const DICTIONARY_WORDS = [
  'apple', 'banana', 'orange', 'house', 'water', 'fire', 'earth', 'wind',
  'summer', 'winter', 'spring', 'autumn', 'monday', 'friday', 'january',
  'december', 'hello', 'world', 'company', 'office', 'building', 'phone',
  'email', 'internet', 'computer', 'laptop', 'desktop', 'server', 'network'
];

/**
 * Validate password strength
 * Requirements:
 * - Min 10 characters
 * - At least one special character
 * - At least one number
 * - Not a common password or dictionary word
 */
export function validatePasswordStrength(password) {
  const errors = [];

  if (!password || password.length < 10) {
    errors.push('Password must be at least 10 characters long');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  // Check for common passwords
  const lowerPass = password.toLowerCase();
  if (COMMON_PASSWORDS.some(common => lowerPass.includes(common))) {
    errors.push('Password contains a commonly used password pattern');
  }

  // Check for dictionary words (3+ letters)
  for (const word of DICTIONARY_WORDS) {
    if (lowerPass.includes(word) && word.length >= 4) {
      errors.push('Password contains a dictionary word');
      break;
    }
  }

  // Check for sequential characters
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password cannot contain 3 or more repeated characters');
  }

  // Check for sequential numbers
  if (/012|123|234|345|456|567|678|789|890/.test(password)) {
    errors.push('Password cannot contain sequential numbers');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generate a strong random password
 */
export function generateStrongPassword(length = 16) {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%^&*_+-=';

  const allChars = uppercase + lowercase + numbers + special;

  let password = '';

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Check if account is locked
 */
export function isAccountLocked(email) {
  const record = failedAttempts.get(email.toLowerCase());
  if (!record) return false;

  if (record.lockoutUntil && record.lockoutUntil > Date.now()) {
    return true;
  }

  // Lockout expired, reset
  if (record.lockoutUntil && record.lockoutUntil <= Date.now()) {
    failedAttempts.delete(email.toLowerCase());
    return false;
  }

  return false;
}

/**
 * Record failed login attempt
 * Returns true if account is now locked
 */
export function recordFailedAttempt(email) {
  const key = email.toLowerCase();
  const record = failedAttempts.get(key) || { count: 0, attempts: [] };

  record.count++;
  record.attempts.push(new Date().toISOString());
  record.lastAttempt = Date.now();

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    record.lockedAt = new Date().toISOString();
  }

  failedAttempts.set(key, record);

  return record.count >= MAX_FAILED_ATTEMPTS;
}

/**
 * Clear failed attempts on successful login
 */
export function clearFailedAttempts(email) {
  failedAttempts.delete(email.toLowerCase());
}

/**
 * Get all locked accounts (for admin notification)
 */
export function getLockedAccounts() {
  const locked = [];
  for (const [email, record] of failedAttempts.entries()) {
    if (record.lockoutUntil && record.lockoutUntil > Date.now()) {
      locked.push({
        email,
        lockedAt: record.lockedAt,
        lockoutUntil: new Date(record.lockoutUntil).toISOString(),
        attemptCount: record.count,
        attempts: record.attempts
      });
    }
  }
  return locked;
}

/**
 * Unlock an account manually (admin only)
 */
export function unlockAccount(email) {
  failedAttempts.delete(email.toLowerCase());
}

/**
 * Generate JWT token for a user
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    engineerId: user.engineerId,
    issuedAt: Date.now()
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Authentication middleware
 * Requires valid JWT token in Authorization header
 * Enforces 1-hour inactivity timeout
 */
export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: 'No authorization header provided'
    });
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Invalid authorization header format. Use: Bearer <token>'
    });
  }

  const token = parts[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid or expired token'
    });
  }

  // Check session timeout (1 hour inactivity)
  const user = getById('users', decoded.id);
  if (user && user.lastActivity) {
    const lastActivity = new Date(user.lastActivity).getTime();
    if (Date.now() - lastActivity > SESSION_TIMEOUT_MS) {
      return res.status(401).json({
        error: 'Session expired due to inactivity',
        code: 'SESSION_TIMEOUT'
      });
    }
  }

  // Update last activity
  if (user) {
    update('users', user.id, { lastActivity: new Date().toISOString() });
  }

  // Verify user still exists
  if (!user) {
    return res.status(401).json({
      error: 'User no longer exists'
    });
  }

  // Attach user info to request
  req.user = {
    id: decoded.id,
    email: decoded.email,
    name: decoded.name,
    role: decoded.role,
    engineerId: decoded.engineerId
  };

  next();
}

/**
 * Admin authorization middleware
 * Must be used after authenticate middleware
 */
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required'
    });
  }

  next();
}

/**
 * Manager or Admin authorization middleware
 * Must be used after authenticate middleware
 */
export function requireManager(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'manager') {
    return res.status(403).json({
      error: 'Manager or admin access required'
    });
  }

  next();
}

/**
 * Engineer authorization middleware
 * Allows access only if the user is the engineer or is a manager/admin
 */
export function requireEngineerOrManager(req, res, next) {
  const requestedEngineerId = req.params.engineerId || req.body.engineerId;

  // Admins and managers can access any engineer
  if (req.user.role === 'admin' || req.user.role === 'manager') {
    return next();
  }

  // Engineers can only access their own data
  if (req.user.engineerId === requestedEngineerId) {
    return next();
  }

  return res.status(403).json({
    error: 'Access denied. You can only access your own data.'
  });
}

export default {
  validatePasswordStrength,
  generateStrongPassword,
  isAccountLocked,
  recordFailedAttempt,
  clearFailedAttempts,
  getLockedAccounts,
  unlockAccount,
  generateToken,
  verifyToken,
  authenticate,
  requireAdmin,
  requireManager,
  requireEngineerOrManager
};
