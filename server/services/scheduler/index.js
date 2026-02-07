/**
 * Modular Schedule Generation Engine
 * Version 2.0.0
 *
 * This is the main entry point for the schedule generation engine.
 * Import this module to use the scheduling functionality.
 *
 * Architecture:
 * - core/           Core scheduling logic (Scheduler, ConstraintEngine)
 * - constraints/    Modular constraint definitions
 * - rules/          German labor law and shift rules
 * - strategies/     Assignment strategies (Night, Day, Floater)
 * - utils/          Date and preference utilities
 * - config/         Configuration defaults
 */

// Core exports
export { Scheduler, SHIFTS, SHIFT_TIMES, COLORS } from './core/Scheduler.js';
export { ConstraintEngine, Variable, Constraint } from './core/ConstraintEngine.js';

// Configuration exports
export {
  DEFAULT_COVERAGE,
  SHIFT_GROUPS,
  FORBIDDEN_TRANSITIONS,
  UNAVAILABLE_TYPES,
  FLOATER_CONFIG,
  NIGHT_SHIFT_CONFIG,
  ALGORITHM_CONFIG
} from './config/defaults.js';

// Rules exports
export {
  ArbZG,
  calculateRestHours,
  violatesRestRequirement,
  getValidNextShifts,
  isNightWork,
  calculateWorkingHours,
  validateScheduleCompliance,
  getTransitionViolation,
  hasAdequateWeeklyRest,
  validateNightWorkerCompliance
} from './rules/GermanLaborLaws.js';

// Strategy exports
export { NightShiftStrategy } from './strategies/NightShiftStrategy.js';
export { DayShiftStrategy } from './strategies/DayShiftStrategy.js';
export { FloaterStrategy } from './strategies/FloaterStrategy.js';

// Constraint exports
export {
  createCoverageConstraint,
  createTransitionConstraint,
  createConsecutiveDaysConstraint,
  createOffDaysConstraint,
  createMinWorkDaysConstraint,
  createPreferenceConstraint,
  createFloaterMaxShiftsConstraint,
  createFloaterSameShiftConstraint,
  createAllConstraints
} from './constraints/index.js';

// Utility exports
export {
  toDateString,
  parseDate,
  getMonthDays,
  getWeeks,
  isWeekend,
  isSaturday,
  isSunday,
  getDayOfWeek,
  getPreviousDay,
  getNextDay,
  areSameDay,
  daysDifference,
  getWeekStart,
  getWeekEnd,
  getWeekDays,
  isDateInRange,
  getMonthYear,
  dateRange,
  findWeekIndex,
  groupDaysByWeek
} from './utils/DateUtils.js';

/**
 * Create a new scheduler instance
 * @param {Object} options Scheduler options
 * @returns {Scheduler} Scheduler instance
 */
export function createScheduler(options) {
  const { Scheduler } = require('./core/Scheduler.js');
  return new Scheduler(options);
}

/**
 * Version information
 */
export const VERSION = {
  major: 2,
  minor: 0,
  patch: 0,
  string: '2.0.0',
  date: '2026-02-07',
  features: [
    'Modular architecture',
    'German labor law compliance (ArbZG)',
    'Constraint satisfaction with AC-3',
    'Night shift continuity (2-week blocks)',
    'Early/Morning shift interchangeability',
    'Floater constraints (max 2.5 shifts/week)',
    'Holiday preferences',
    'Recovery options on failure'
  ]
};

/**
 * Quick solve function for simple usage
 */
export async function generateSchedule(options) {
  const { Scheduler } = await import('./core/Scheduler.js');
  const scheduler = new Scheduler(options);
  return scheduler.solve();
}

export default {
  VERSION,
  generateSchedule,
  createScheduler
};
