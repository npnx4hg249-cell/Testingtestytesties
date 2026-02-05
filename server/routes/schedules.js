/**
 * Schedule Routes
 */

import { Router } from 'express';
import {
  getAll,
  getById,
  create,
  update,
  find,
  getActiveEngineers,
  createSchedule,
  getScheduleForMonth,
  getPublishedScheduleForMonth,
  getApprovedRequestsForMonth
} from '../data/store.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { ShiftScheduler, SHIFTS, COLORS } from '../services/constraintSolver.js';
import { getHolidaysForMonth, getHolidaysForEngineer } from '../services/germanHolidays.js';
import { format, parse, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

const router = Router();

/**
 * GET /api/schedules
 * Get all schedules
 */
router.get('/', authenticate, (req, res) => {
  const { year, month, status } = req.query;

  let schedules = getAll('schedules');

  if (year && month) {
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    schedules = schedules.filter(s => s.month === monthStr);
  }

  if (status) {
    schedules = schedules.filter(s => s.status === status);
  }

  // Sort by creation date descending
  schedules.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Return without full data (for list view)
  res.json(schedules.map(s => ({
    id: s.id,
    month: s.month,
    status: s.status,
    createdAt: s.createdAt,
    createdBy: s.createdBy,
    publishedAt: s.publishedAt
  })));
});

/**
 * GET /api/schedules/:id
 * Get schedule by ID
 */
router.get('/:id', authenticate, (req, res) => {
  const schedule = getById('schedules', req.params.id);

  if (!schedule) {
    return res.status(404).json({
      error: 'Schedule not found'
    });
  }

  res.json(schedule);
});

/**
 * GET /api/schedules/month/:year/:month
 * Get schedule for a specific month
 */
router.get('/month/:year/:month', authenticate, (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({
      error: 'Invalid year or month'
    });
  }

  const published = req.query.published === 'true';

  const schedule = published
    ? getPublishedScheduleForMonth(year, month)
    : getScheduleForMonth(year, month);

  if (!schedule) {
    return res.status(404).json({
      error: 'No schedule found for this month'
    });
  }

  res.json(schedule);
});

/**
 * POST /api/schedules/generate
 * Generate a new schedule
 */
router.post('/generate', authenticate, requireManager, (req, res) => {
  const { year, month, options = {} } = req.body;

  if (!year || !month) {
    return res.status(400).json({
      error: 'Year and month are required'
    });
  }

  // Get active engineers
  let engineers = getActiveEngineers();

  if (engineers.length < 10) {
    return res.status(400).json({
      error: `Not enough engineers (${engineers.length}). Minimum 10 required for scheduling.`
    });
  }

  // Get states from engineers for holiday calculation
  const engineerStates = [...new Set(engineers.filter(e => e.state).map(e => e.state))];

  // Get holidays for the month
  const holidays = getHolidaysForMonth(year, month, engineerStates);

  // Get approved requests for this month
  const approvedRequests = getApprovedRequestsForMonth(year, month);

  // Create the date for the month
  const monthDate = new Date(year, month - 1, 1);

  // Create scheduler
  const scheduler = new ShiftScheduler({
    engineers,
    month: monthDate,
    holidays,
    approvedRequests
  });

  // Attempt to solve
  const result = scheduler.solve();

  if (result.success) {
    // Create schedule record
    const schedule = createSchedule({
      month: `${year}-${month.toString().padStart(2, '0')}`,
      year,
      data: result.schedule,
      stats: result.stats,
      createdBy: req.user.id
    });

    return res.status(201).json({
      success: true,
      schedule,
      warnings: result.warnings,
      stats: result.stats
    });
  } else {
    // Return failure with options
    return res.status(422).json({
      success: false,
      errors: result.errors,
      options: result.options,
      partialSchedule: result.partialSchedule,
      canManualEdit: result.canManualEdit,
      message: 'Schedule generation failed. See errors and options for resolution.'
    });
  }
});

/**
 * POST /api/schedules/generate-with-option
 * Generate schedule with a recovery option applied
 */
router.post('/generate-with-option', authenticate, requireManager, (req, res) => {
  const { year, month, optionId } = req.body;

  if (!year || !month || !optionId) {
    return res.status(400).json({
      error: 'Year, month, and optionId are required'
    });
  }

  // Get active engineers
  let engineers = getActiveEngineers();
  const engineerStates = [...new Set(engineers.filter(e => e.state).map(e => e.state))];
  const holidays = getHolidaysForMonth(year, month, engineerStates);
  const approvedRequests = getApprovedRequestsForMonth(year, month);
  const monthDate = new Date(year, month - 1, 1);

  // Apply option modifications
  let modifiedOptions = {};

  switch (optionId) {
    case 'relax_coverage':
      modifiedOptions.relaxedCoverage = true;
      break;
    case 'increase_floater_hours':
      modifiedOptions.maxFloaterShifts = 4;
      break;
    case 'reduce_off_days':
      modifiedOptions.minOffDays = 1;
      break;
    default:
      return res.status(400).json({
        error: 'Unknown option ID'
      });
  }

  // Create scheduler with modified options
  const scheduler = new ShiftScheduler({
    engineers,
    month: monthDate,
    holidays,
    approvedRequests,
    ...modifiedOptions
  });

  const result = scheduler.solve();

  if (result.success) {
    const schedule = createSchedule({
      month: `${year}-${month.toString().padStart(2, '0')}`,
      year,
      data: result.schedule,
      stats: result.stats,
      createdBy: req.user.id,
      appliedOptions: [optionId]
    });

    return res.status(201).json({
      success: true,
      schedule,
      warnings: result.warnings,
      stats: result.stats,
      appliedOption: optionId
    });
  } else {
    return res.status(422).json({
      success: false,
      errors: result.errors,
      options: result.options,
      message: 'Schedule generation still failed even with the option applied.'
    });
  }
});

/**
 * PUT /api/schedules/:id
 * Update a schedule (manual edit)
 */
router.put('/:id', authenticate, requireManager, (req, res) => {
  const schedule = getById('schedules', req.params.id);

  if (!schedule) {
    return res.status(404).json({
      error: 'Schedule not found'
    });
  }

  if (schedule.status === 'published') {
    return res.status(400).json({
      error: 'Cannot edit a published schedule. Create a new version instead.'
    });
  }

  const { data } = req.body;

  if (!data) {
    return res.status(400).json({
      error: 'Schedule data is required'
    });
  }

  // Validate the updated schedule
  const engineers = getActiveEngineers();
  const year = parseInt(schedule.month.split('-')[0]);
  const month = parseInt(schedule.month.split('-')[1]);
  const engineerStates = [...new Set(engineers.filter(e => e.state).map(e => e.state))];
  const holidays = getHolidaysForMonth(year, month, engineerStates);
  const monthDate = new Date(year, month - 1, 1);

  const scheduler = new ShiftScheduler({
    engineers,
    month: monthDate,
    holidays
  });

  const days = scheduler.getMonthDays();
  const weeks = scheduler.getWeeks();
  const validation = scheduler.validateSchedule(data, days, weeks);

  const updated = update('schedules', req.params.id, {
    data,
    stats: scheduler.calculateStats(data, days, weeks),
    validationErrors: validation.valid ? [] : validation.errors
  });

  res.json({
    schedule: updated,
    validation: {
      valid: validation.valid,
      errors: validation.errors
    }
  });
});

/**
 * POST /api/schedules/:id/publish
 * Publish a schedule
 */
router.post('/:id/publish', authenticate, requireManager, (req, res) => {
  const schedule = getById('schedules', req.params.id);

  if (!schedule) {
    return res.status(404).json({
      error: 'Schedule not found'
    });
  }

  if (schedule.status === 'published') {
    return res.status(400).json({
      error: 'Schedule is already published'
    });
  }

  // Archive any existing published schedule for this month
  const existingPublished = find('schedules', s =>
    s.month === schedule.month && s.status === 'published'
  );

  existingPublished.forEach(s => {
    update('schedules', s.id, { status: 'archived' });
  });

  // Publish the new schedule
  const updated = update('schedules', req.params.id, {
    status: 'published',
    publishedAt: new Date().toISOString()
  });

  res.json({
    message: 'Schedule published successfully',
    schedule: updated
  });
});

/**
 * GET /api/schedules/:id/export
 * Export schedule data for rendering
 */
router.get('/:id/export', authenticate, (req, res) => {
  const schedule = getById('schedules', req.params.id);

  if (!schedule) {
    return res.status(404).json({
      error: 'Schedule not found'
    });
  }

  const engineers = getActiveEngineers();
  const year = parseInt(schedule.month.split('-')[0]);
  const month = parseInt(schedule.month.split('-')[1]);
  const monthDate = new Date(year, month - 1, 1);

  const days = eachDayOfInterval({
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate)
  });

  // Build export data
  const exportData = {
    month: schedule.month,
    days: days.map(d => ({
      date: format(d, 'yyyy-MM-dd'),
      dayOfWeek: format(d, 'EEE'),
      dayNumber: format(d, 'd')
    })),
    engineers: engineers.map(e => ({
      id: e.id,
      name: e.name,
      tier: e.tier,
      isFloater: e.isFloater,
      tierColor: COLORS.tier[e.tier],
      shifts: days.map(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        const shift = schedule.data[e.id]?.[dateStr];
        return {
          date: dateStr,
          shift: shift || null,
          color: shift ? COLORS.shift[shift] : null
        };
      })
    })),
    colors: COLORS,
    stats: schedule.stats
  };

  res.json(exportData);
});

/**
 * GET /api/schedules/holidays/:year/:month
 * Get holidays for a month
 */
router.get('/holidays/:year/:month', authenticate, (req, res) => {
  const year = parseInt(req.params.year);
  const month = parseInt(req.params.month);

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return res.status(400).json({
      error: 'Invalid year or month'
    });
  }

  // Get all engineer states
  const engineers = getActiveEngineers();
  const states = [...new Set(engineers.filter(e => e.state).map(e => e.state))];

  const holidays = getHolidaysForMonth(year, month, states.length > 0 ? states : null);

  res.json({
    year,
    month,
    holidays
  });
});

export default router;
