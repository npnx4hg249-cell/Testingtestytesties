/**
 * Authentication Middleware for ICES-Shifter
 *
 * JWT-based authentication for the ICES-Shifter API.
 */

import jwt from 'jsonwebtoken';
import { getById } from '../data/store.js';

// Secret key for JWT (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'ices-shifter-secret-key-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * Generate JWT token for a user
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    engineerId: user.engineerId
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

  // Verify user still exists
  const user = getById('users', decoded.id);

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
  generateToken,
  verifyToken,
  authenticate,
  requireAdmin,
  requireManager,
  requireEngineerOrManager
};
