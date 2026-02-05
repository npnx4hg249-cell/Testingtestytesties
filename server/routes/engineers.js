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

// Valid shift preferences (weekday and weekend)
const WEEKDAY_SHIFTS = ['Early', 'Morning', 'Late', 'Night'];
const WEEKEND_SHIFTS = ['WeekendEarly', 'WeekendMorning', 'WeekendLate', 'WeekendNight'];
const ALL_VALID_SHIFTS = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];

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
  if (preferences && preferences.some(p => !ALL_VALID_SHIFTS.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be one of: ' + ALL_VALID_SHIFTS.join(', ')
    });
  }

  const engineer = createEngineer({
    name,
    email,
    tier: tier || 'T2',
    isFloater: isFloater || false,
    state,
    preferences: preferences || [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS] // Default to all shifts
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

  if (preferences.some(p => !ALL_VALID_SHIFTS.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be one of: ' + ALL_VALID_SHIFTS.join(', ')
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

/**
 * POST /api/engineers/:id/duplicate
 * Duplicate an existing engineer (managers/admins only)
 */
router.post('/:id/duplicate', authenticate, requireManager, (req, res) => {
  const sourceEngineer = getById('engineers', req.params.id);

  if (!sourceEngineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  // Create a copy with modified name and email
  const newEngineer = createEngineer({
    name: `${sourceEngineer.name} (Copy)`,
    email: `copy.${sourceEngineer.email}`,
    tier: sourceEngineer.tier,
    isFloater: sourceEngineer.isFloater,
    state: sourceEngineer.state,
    preferences: [...(sourceEngineer.preferences || [])]
  });

  res.status(201).json(newEngineer);
});

/**
 * POST /api/engineers/bulk-upload
 * Bulk upload engineers from CSV (managers/admins only)
 *
 * CSV Format:
 * name,email,tier,isFloater,state,preferences
 * "John Doe",john@example.com,T2,false,BY,"Early,Morning,Late"
 */
router.post('/bulk-upload', authenticate, requireManager, (req, res) => {
  const { csvData } = req.body;

  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({
      error: 'CSV data is required as a string'
    });
  }

  const lines = csvData.trim().split('\n');

  if (lines.length < 2) {
    return res.status(400).json({
      error: 'CSV must have a header row and at least one data row'
    });
  }

  // Parse header
  const header = parseCSVLine(lines[0].toLowerCase());
  const requiredColumns = ['name', 'email'];
  const missingColumns = requiredColumns.filter(col => !header.includes(col));

  if (missingColumns.length > 0) {
    return res.status(400).json({
      error: `Missing required columns: ${missingColumns.join(', ')}`
    });
  }

  const validStates = getAllStates().map(s => s.code);
  const results = {
    success: [],
    errors: []
  };

  // Process each row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const values = parseCSVLine(line);
      const row = {};

      header.forEach((col, idx) => {
        row[col] = values[idx] || '';
      });

      // Validate required fields
      if (!row.name || !row.email) {
        results.errors.push({
          row: i + 1,
          error: 'Name and email are required',
          data: row
        });
        continue;
      }

      // Parse and validate tier
      const tier = row.tier?.toUpperCase() || 'T2';
      if (!['T1', 'T2', 'T3'].includes(tier)) {
        results.errors.push({
          row: i + 1,
          error: `Invalid tier: ${row.tier}. Must be T1, T2, or T3`,
          data: row
        });
        continue;
      }

      // Parse isFloater
      const isFloater = row.isfloater?.toLowerCase() === 'true' || row.isfloater === '1';

      // Validate state
      const state = row.state?.toUpperCase() || null;
      if (state && !validStates.includes(state)) {
        results.errors.push({
          row: i + 1,
          error: `Invalid state: ${row.state}`,
          data: row
        });
        continue;
      }

      // Parse preferences
      let preferences = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS]; // Default to all
      if (row.preferences) {
        preferences = row.preferences.split(',').map(p => p.trim());
        const invalidPrefs = preferences.filter(p => !ALL_VALID_SHIFTS.includes(p));
        if (invalidPrefs.length > 0) {
          results.errors.push({
            row: i + 1,
            error: `Invalid preferences: ${invalidPrefs.join(', ')}`,
            data: row
          });
          continue;
        }
      }

      // Create engineer
      const engineer = createEngineer({
        name: row.name,
        email: row.email,
        tier,
        isFloater,
        state,
        preferences
      });

      results.success.push({
        row: i + 1,
        engineer: {
          id: engineer.id,
          name: engineer.name,
          email: engineer.email
        }
      });

    } catch (err) {
      results.errors.push({
        row: i + 1,
        error: `Parse error: ${err.message}`,
        data: line
      });
    }
  }

  res.status(results.errors.length > 0 ? 207 : 201).json({
    message: `Created ${results.success.length} engineers, ${results.errors.length} errors`,
    created: results.success.length,
    failed: results.errors.length,
    results
  });
});

/**
 * GET /api/engineers/csv-template
 * Get CSV template for bulk upload
 */
router.get('/csv-template', (req, res) => {
  const template = `name,email,tier,isFloater,state,preferences
"John Doe",john.doe@example.com,T2,false,BY,"Early,Morning,Late,Night,WeekendEarly,WeekendMorning,WeekendLate,WeekendNight"
"Jane Smith",jane.smith@example.com,T1,false,NW,"Early,Morning,WeekendMorning"
"Bob Wilson",bob.wilson@example.com,T3,true,BE,"Late,Night,WeekendLate,WeekendNight"`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=engineers-template.csv');
  res.send(template);
});

/**
 * GET /api/engineers/shift-options
 * Get available shift preference options
 */
router.get('/shift-options', (req, res) => {
  res.json({
    weekday: WEEKDAY_SHIFTS.map(s => ({
      id: s,
      name: s,
      description: getShiftDescription(s, false)
    })),
    weekend: WEEKEND_SHIFTS.map(s => ({
      id: s,
      name: s.replace('Weekend', ''),
      description: getShiftDescription(s, true)
    })),
    all: ALL_VALID_SHIFTS
  });
});

/**
 * Helper: Parse CSV line handling quoted values
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Helper: Get shift description
 */
function getShiftDescription(shift, isWeekend) {
  const times = {
    'Early': '07:00 - 15:30',
    'Morning': '10:00 - 18:30',
    'Late': isWeekend ? '15:00 - 22:30' : '15:00 - 23:30',
    'Night': '23:00 - 07:30',
    'WeekendEarly': '07:00 - 15:30',
    'WeekendMorning': '10:00 - 18:30',
    'WeekendLate': '15:00 - 22:30',
    'WeekendNight': '23:00 - 07:30'
  };
  return times[shift] || '';
}

export default router;
