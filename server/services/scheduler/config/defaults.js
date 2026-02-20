/**
 * Scheduler Configuration Defaults
 * Modular configuration for the shift scheduling engine
 */

// Shift type definitions
export const SHIFTS = {
  EARLY: 'Early',
  MORNING: 'Morning',
  LATE: 'Late',
  NIGHT: 'Night',
  OFF: 'Off',
  UNAVAILABLE: 'Unavailable',
  TRAINING: 'Training'
};

// Shift time definitions (24h format)
export const SHIFT_TIMES = {
  weekday: {
    [SHIFTS.EARLY]: { start: '07:00', end: '15:30', duration: 8.5 },
    [SHIFTS.MORNING]: { start: '10:00', end: '18:30', duration: 8.5 },
    [SHIFTS.LATE]: { start: '15:00', end: '23:30', duration: 8.5 },
    [SHIFTS.NIGHT]: { start: '23:00', end: '07:30', duration: 8.5 }
  },
  weekend: {
    [SHIFTS.EARLY]: { start: '07:00', end: '15:30', duration: 8.5 },
    [SHIFTS.MORNING]: { start: '10:00', end: '18:30', duration: 8.5 },
    [SHIFTS.LATE]: { start: '15:00', end: '22:30', duration: 7.5 },
    [SHIFTS.NIGHT]: { start: '23:00', end: '07:30', duration: 8.5 }
  }
};

// Default coverage requirements
export const DEFAULT_COVERAGE = {
  weekday: {
    [SHIFTS.EARLY]: { min: 3, preferred: 3 },
    [SHIFTS.MORNING]: { min: 3, preferred: 3 },
    [SHIFTS.LATE]: { min: 3, preferred: 3 },
    [SHIFTS.NIGHT]: { min: 2, preferred: 3 }
  },
  weekend: {
    [SHIFTS.EARLY]: { min: 2, preferred: 2 },
    [SHIFTS.MORNING]: { min: 2, preferred: 2 },
    [SHIFTS.LATE]: { min: 2, preferred: 2 },
    [SHIFTS.NIGHT]: { min: 2, preferred: 2 }
  }
};

// Shift consistency groups (for maintaining patterns)
export const SHIFT_GROUPS = {
  day_early: [SHIFTS.EARLY, SHIFTS.MORNING], // Early/Morning are interchangeable
  day_late: [SHIFTS.LATE],
  night: [SHIFTS.NIGHT]
};

// Forbidden shift transitions (11-hour rest rule violations)
export const FORBIDDEN_TRANSITIONS = [
  { from: SHIFTS.NIGHT, to: SHIFTS.EARLY, reason: 'Insufficient rest time (< 11 hours)' },
  { from: SHIFTS.NIGHT, to: SHIFTS.MORNING, reason: 'Insufficient rest time (< 11 hours)' },
  { from: SHIFTS.LATE, to: SHIFTS.EARLY, reason: 'Insufficient rest time (< 11 hours)' },
  { from: SHIFTS.LATE, to: SHIFTS.MORNING, reason: 'Insufficient rest time (10.5 hours < 11 required)' }
];

// Color coding for UI display
export const COLORS = {
  tier: {
    T1: '#d5a6bd',
    T2: '#b6d7a7',
    T3: '#b7e1cd'
  },
  shift: {
    [SHIFTS.EARLY]: { bg: '#f1c232', text: '#000000' },
    [SHIFTS.MORNING]: { bg: '#ffff00', text: '#000000' },
    [SHIFTS.LATE]: { bg: '#6fa8dc', text: '#ffffff' },
    [SHIFTS.NIGHT]: { bg: '#1155cc', text: '#ffffff' },
    [SHIFTS.OFF]: { bg: '#5a3286', text: '#ffffff' },
    [SHIFTS.UNAVAILABLE]: { bg: '#b6d7a8', text: '#000000' },
    [SHIFTS.TRAINING]: { bg: '#e6cff2', text: '#000000' }
  }
};

// Unavailable day types and their properties
export const UNAVAILABLE_TYPES = {
  VACATION: { countsAsOff: false, label: 'Vacation' },
  PERSONAL: { countsAsOff: false, label: 'Personal' },
  SICK: { countsAsOff: false, label: 'Sick Leave' },
  OTHER: { countsAsOff: true, label: 'Other' } // Max 2 can count as off days
};

// Floater configuration
export const FLOATER_CONFIG = {
  maxShiftsPerWeek: 2.5,
  minShiftsPerWeek: 0,
  cannotWorkSameShiftTogether: true,
  cannotReplaceCoreCoverage: true
};

// Night shift configuration
export const NIGHT_SHIFT_CONFIG = {
  consistencyWeeks: 2, // Night shifts should be consistent for 2 weeks
  minEngineers: 2,
  cohortRotation: true
};

// Scheduler algorithm settings
export const ALGORITHM_CONFIG = {
  maxBacktrackAttempts: 1000,
  useArcConsistency: true,
  preferenceWeight: {
    consistency: 0.3,    // Maintaining shift patterns
    fairness: 0.25,      // Equal distribution
    preference: 0.25,    // User preferences
    holidays: 0.2        // Holiday optimization
  }
};

export default {
  SHIFTS,
  SHIFT_TIMES,
  DEFAULT_COVERAGE,
  SHIFT_GROUPS,
  FORBIDDEN_TRANSITIONS,
  COLORS,
  UNAVAILABLE_TYPES,
  FLOATER_CONFIG,
  NIGHT_SHIFT_CONFIG,
  ALGORITHM_CONFIG
};
