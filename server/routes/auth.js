/**
 * Authentication Routes
 */

import { Router } from 'express';
import { findUserByEmail, validatePassword, createUser, getById } from '../data/store.js';
import { generateToken, authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Email and password are required'
    });
  }

  const user = findUserByEmail(email);

  if (!user) {
    return res.status(401).json({
      error: 'Invalid email or password'
    });
  }

  if (!validatePassword(user, password)) {
    return res.status(401).json({
      error: 'Invalid email or password'
    });
  }

  const token = generateToken(user);

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      engineerId: user.engineerId
    }
  });
});

/**
 * POST /api/auth/register
 * Register a new user (engineers self-register, linked to engineer record)
 */
router.post('/register', (req, res) => {
  const { email, password, name, engineerId } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({
      error: 'Email, password, and name are required'
    });
  }

  // Check if email already exists
  const existingUser = findUserByEmail(email);

  if (existingUser) {
    return res.status(400).json({
      error: 'Email already registered'
    });
  }

  // If engineerId provided, verify it exists
  if (engineerId) {
    const engineer = getById('engineers', engineerId);
    if (!engineer) {
      return res.status(400).json({
        error: 'Invalid engineer ID'
      });
    }
  }

  const user = createUser({
    email,
    password,
    name,
    role: 'engineer',
    engineerId
  });

  const token = generateToken(user);

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      engineerId: user.engineerId
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
    return res.status(404).json({
      error: 'User not found'
    });
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    engineerId: user.engineerId
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
    return res.status(401).json({
      error: 'Current password is incorrect'
    });
  }

  const bcrypt = await import('bcryptjs');
  const hashedPassword = bcrypt.default.hashSync(newPassword, 10);

  const { update } = await import('../data/store.js');
  update('users', user.id, { password: hashedPassword });

  res.json({
    message: 'Password changed successfully'
  });
});

export default router;
