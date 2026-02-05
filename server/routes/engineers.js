/**
 * Engineer Routes
 */

import { Router } from 'express';
import {
  getAll,
  getById,
  create,
  update,
  remove,
  createEngineer,
  getActiveEngineers
} from '../data/store.js';
import { authenticate, requireManager, requireEngineerOrManager } from '../middleware/auth.js';
import { getAllStates, getHolidaysForEngineer } from '../services/germanHolidays.js';

const router = Router();

/**
 * GET /api/engineers
 * Get all engineers
 */
router.get('/', authenticate, (req, res) => {
  const { active } = req.query;

  let engineers = active === 'true'
    ? getActiveEngineers()
    : getAll('engineers');

  // Don't return sensitive data
  engineers = engineers.map(e => ({
    id: e.id,
    name: e.name,
    email: e.email,
    tier: e.tier,
    isFloater: e.isFloater,
    state: e.state,
    preferences: e.preferences,
    isActive: e.isActive,
    createdAt: e.createdAt
  }));

  res.json(engineers);
});

/**
 * GET /api/engineers/states
 * Get list of German states
 */
router.get('/states', (req, res) => {
  res.json(getAllStates());
});

/**
 * GET /api/engineers/:id
 * Get engineer by ID
 */
router.get('/:id', authenticate, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  res.json({
    id: engineer.id,
    name: engineer.name,
    email: engineer.email,
    tier: engineer.tier,
    isFloater: engineer.isFloater,
    state: engineer.state,
    preferences: engineer.preferences,
    unavailableDays: engineer.unavailableDays,
    isActive: engineer.isActive,
    createdAt: engineer.createdAt
  });
});

/**
 * POST /api/engineers
 * Create a new engineer (managers/admins only)
 */
router.post('/', authenticate, requireManager, (req, res) => {
  const { name, email, tier, isFloater, state, preferences } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: 'Name and email are required'
    });
  }

  // Validate tier
  const validTiers = ['T1', 'T2', 'T3'];
  if (tier && !validTiers.includes(tier)) {
    return res.status(400).json({
      error: 'Invalid tier. Must be T1, T2, or T3'
    });
  }

  // Validate state if provided
  const validStates = getAllStates().map(s => s.code);
  if (state && !validStates.includes(state)) {
    return res.status(400).json({
      error: 'Invalid state code'
    });
  }

  // Validate preferences if provided
  const validShifts = ['Early', 'Morning', 'Late', 'Night'];
  if (preferences && preferences.some(p => !validShifts.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be Early, Morning, Late, or Night'
    });
  }

  const engineer = createEngineer({
    name,
    email,
    tier: tier || 'T2',
    isFloater: isFloater || false,
    state,
    preferences: preferences || validShifts // Default to all shifts
  });

  res.status(201).json(engineer);
});

/**
 * PUT /api/engineers/:id
 * Update an engineer
 */
router.put('/:id', authenticate, requireManager, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const { name, email, tier, isFloater, state, preferences, isActive } = req.body;

  // Validate tier
  const validTiers = ['T1', 'T2', 'T3'];
  if (tier && !validTiers.includes(tier)) {
    return res.status(400).json({
      error: 'Invalid tier. Must be T1, T2, or T3'
    });
  }

  // Validate state if provided
  const validStates = getAllStates().map(s => s.code);
  if (state && !validStates.includes(state)) {
    return res.status(400).json({
      error: 'Invalid state code'
    });
  }

  const updated = update('engineers', req.params.id, {
    name: name !== undefined ? name : engineer.name,
    email: email !== undefined ? email : engineer.email,
    tier: tier !== undefined ? tier : engineer.tier,
    isFloater: isFloater !== undefined ? isFloater : engineer.isFloater,
    state: state !== undefined ? state : engineer.state,
    preferences: preferences !== undefined ? preferences : engineer.preferences,
    isActive: isActive !== undefined ? isActive : engineer.isActive
  });

  res.json(updated);
});

/**
 * DELETE /api/engineers/:id
 * Delete (deactivate) an engineer
 */
router.delete('/:id', authenticate, requireManager, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  // Soft delete - just deactivate
  update('engineers', req.params.id, { isActive: false });

  res.json({ message: 'Engineer deactivated successfully' });
});

/**
 * PUT /api/engineers/:id/preferences
 * Update engineer's shift preferences
 */
router.put('/:id/preferences', authenticate, (req, res) => {
  // Allow engineers to update their own preferences, or managers to update any
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.engineerId !== req.params.id) {
    return res.status(403).json({
      error: 'You can only update your own preferences'
    });
  }

  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const { preferences } = req.body;

  if (!preferences || !Array.isArray(preferences)) {
    return res.status(400).json({
      error: 'Preferences must be an array of shift types'
    });
  }

  const validShifts = ['Early', 'Morning', 'Late', 'Night'];
  if (preferences.some(p => !validShifts.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be Early, Morning, Late, or Night'
    });
  }

  const updated = update('engineers', req.params.id, { preferences });

  res.json({
    id: updated.id,
    name: updated.name,
    preferences: updated.preferences
  });
});

/**
 * PUT /api/engineers/:id/unavailable
 * Update engineer's unavailable days
 */
router.put('/:id/unavailable', authenticate, (req, res) => {
  // Allow engineers to update their own, or managers to update any
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.engineerId !== req.params.id) {
    return res.status(403).json({
      error: 'You can only update your own unavailable days'
    });
  }

  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const { unavailableDays } = req.body;

  if (!unavailableDays || !Array.isArray(unavailableDays)) {
    return res.status(400).json({
      error: 'unavailableDays must be an array of date strings (YYYY-MM-DD)'
    });
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (unavailableDays.some(d => !dateRegex.test(d))) {
    return res.status(400).json({
      error: 'All dates must be in YYYY-MM-DD format'
    });
  }

  const updated = update('engineers', req.params.id, { unavailableDays });

  res.json({
    id: updated.id,
    name: updated.name,
    unavailableDays: updated.unavailableDays
  });
});

/**
 * GET /api/engineers/:id/holidays
 * Get holidays applicable to an engineer based on their state
 */
router.get('/:id/holidays', authenticate, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const year = parseInt(req.query.year) || new Date().getFullYear();

  if (!engineer.state) {
    return res.status(400).json({
      error: 'Engineer has no state assigned. Only federal holidays will apply.'
    });
  }

  const holidays = getHolidaysForEngineer(year, engineer.state);

  res.json({
    engineerId: engineer.id,
    engineerName: engineer.name,
    state: engineer.state,
    year,
    holidays
  });
});

export default router;
