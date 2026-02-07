/**
 * Constraint Registry
 * Central registry for all scheduling constraints
 *
 * Constraints are organized by type and can be enabled/disabled per configuration.
 * Each constraint exports a factory function that creates constraint instances.
 */

import { Constraint } from '../core/ConstraintEngine.js';
import { SHIFTS, FORBIDDEN_TRANSITIONS, DEFAULT_COVERAGE, FLOATER_CONFIG } from '../config/defaults.js';
import { getTransitionViolation, ArbZG } from '../rules/GermanLaborLaws.js';
import { toDateString, isWeekend, getPreviousDay } from '../utils/DateUtils.js';

/**
 * Coverage Constraint
 * Ensures minimum number of engineers per shift
 */
export function createCoverageConstraint(dateStr, shift, minRequired, engineerIds) {
  return new Constraint(
    `coverage_${dateStr}_${shift}`,
    engineerIds.map(id => `${id}_${dateStr}`),
    (assignment) => {
      const count = engineerIds.filter(id => assignment[`${id}_${dateStr}`] === shift).length;
      return count >= minRequired;
    },
    'hard'
  );
}

/**
 * Transition Constraint (11-hour rest rule)
 * Prevents invalid shift transitions based on German labor law
 */
export function createTransitionConstraint(engineerId, prevDateStr, currDateStr) {
  return new Constraint(
    `transition_${engineerId}_${currDateStr}`,
    [`${engineerId}_${prevDateStr}`, `${engineerId}_${currDateStr}`],
    (assignment) => {
      const prevShift = assignment[`${engineerId}_${prevDateStr}`];
      const currShift = assignment[`${engineerId}_${currDateStr}`];

      // Skip if either is OFF/UNAVAILABLE
      if (!prevShift || !currShift ||
          prevShift === SHIFTS.OFF || prevShift === SHIFTS.UNAVAILABLE ||
          currShift === SHIFTS.OFF || currShift === SHIFTS.UNAVAILABLE) {
        return true;
      }

      // Check for violation
      const violation = getTransitionViolation(prevShift, currShift);
      return violation === null;
    },
    'hard'
  );
}

/**
 * Consecutive Days Constraint
 * Ensures no more than 6 consecutive working days (ArbZG compliance)
 */
export function createConsecutiveDaysConstraint(engineerId, days, maxConsecutive = ArbZG.MAX_CONSECUTIVE_WORK_DAYS) {
  const variableIds = days.map(day => `${engineerId}_${toDateString(day)}`);

  return new Constraint(
    `consecutive_${engineerId}`,
    variableIds,
    (assignment) => {
      let consecutive = 0;

      for (const day of days) {
        const dateStr = toDateString(day);
        const shift = assignment[`${engineerId}_${dateStr}`];

        if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
          consecutive++;
          if (consecutive > maxConsecutive) {
            return false;
          }
        } else {
          consecutive = 0;
        }
      }

      return true;
    },
    'hard'
  );
}

/**
 * Off Days Constraint
 * Ensures minimum off days per week (2 consecutive preferred, 1 minimum by law)
 */
export function createOffDaysConstraint(engineerId, weekDays, minOffDays = 2) {
  const variableIds = weekDays.map(day => `${engineerId}_${toDateString(day)}`);

  return new Constraint(
    `off_days_${engineerId}_${toDateString(weekDays[0])}`,
    variableIds,
    (assignment) => {
      let offCount = 0;

      for (const day of weekDays) {
        const dateStr = toDateString(day);
        const shift = assignment[`${engineerId}_${dateStr}`];

        if (shift === SHIFTS.OFF) {
          offCount++;
        }
      }

      return offCount >= minOffDays;
    },
    'hard'
  );
}

/**
 * Minimum Work Days Constraint
 * Ensures core engineers work at least 5 days per week (when no unavailable days)
 */
export function createMinWorkDaysConstraint(engineerId, weekDays, minWorkDays = 5) {
  const variableIds = weekDays.map(day => `${engineerId}_${toDateString(day)}`);

  return new Constraint(
    `min_work_${engineerId}_${toDateString(weekDays[0])}`,
    variableIds,
    (assignment) => {
      let workCount = 0;
      let unavailableCount = 0;

      for (const day of weekDays) {
        const dateStr = toDateString(day);
        const shift = assignment[`${engineerId}_${dateStr}`];

        if (shift === SHIFTS.UNAVAILABLE) {
          unavailableCount++;
        } else if (shift && shift !== SHIFTS.OFF) {
          workCount++;
        }
      }

      // 5-shift minimum suspended if any unavailable days
      if (unavailableCount > 0) {
        return true;
      }

      return workCount >= minWorkDays;
    },
    'hard'
  );
}

/**
 * Preference Constraint
 * Engineers can only be assigned to shifts in their preferences
 */
export function createPreferenceConstraint(engineerId, dateStr, preferences, date) {
  return new Constraint(
    `preference_${engineerId}_${dateStr}`,
    [`${engineerId}_${dateStr}`],
    (assignment) => {
      const shift = assignment[`${engineerId}_${dateStr}`];

      // OFF and UNAVAILABLE are always allowed
      if (!shift || shift === SHIFTS.OFF || shift === SHIFTS.UNAVAILABLE || shift === SHIFTS.TRAINING) {
        return true;
      }

      // If no preferences, allow all
      if (!preferences || preferences.length === 0) {
        return true;
      }

      // Check weekend-specific preferences
      if (isWeekend(date)) {
        const weekendPref = `Weekend${shift}`;
        if (preferences.includes(weekendPref)) {
          return true;
        }
        // If has any weekend preferences, must match
        const hasWeekendPrefs = preferences.some(p => p.startsWith('Weekend'));
        if (hasWeekendPrefs) {
          return false;
        }
      }

      // Check regular preferences
      return preferences.includes(shift);
    },
    'hard'
  );
}

/**
 * Floater Max Shifts Constraint
 * Floaters can work maximum 2.5 shifts per week
 */
export function createFloaterMaxShiftsConstraint(floaterId, weekDays, maxShifts = FLOATER_CONFIG.maxShiftsPerWeek) {
  const variableIds = weekDays.map(day => `${floaterId}_${toDateString(day)}`);

  return new Constraint(
    `floater_max_${floaterId}_${toDateString(weekDays[0])}`,
    variableIds,
    (assignment) => {
      let shiftCount = 0;

      for (const day of weekDays) {
        const dateStr = toDateString(day);
        const shift = assignment[`${floaterId}_${dateStr}`];

        if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
          shiftCount++;
        }
      }

      return shiftCount <= maxShifts;
    },
    'hard'
  );
}

/**
 * Floater Same Shift Constraint
 * Two floaters cannot work the same shift on the same day
 */
export function createFloaterSameShiftConstraint(floater1Id, floater2Id, dateStr) {
  return new Constraint(
    `floater_same_${dateStr}`,
    [`${floater1Id}_${dateStr}`, `${floater2Id}_${dateStr}`],
    (assignment) => {
      const shift1 = assignment[`${floater1Id}_${dateStr}`];
      const shift2 = assignment[`${floater2Id}_${dateStr}`];

      // Both must be working same shift (not OFF/UNAVAILABLE)
      if (!shift1 || !shift2 ||
          shift1 === SHIFTS.OFF || shift1 === SHIFTS.UNAVAILABLE ||
          shift2 === SHIFTS.OFF || shift2 === SHIFTS.UNAVAILABLE) {
        return true;
      }

      return shift1 !== shift2;
    },
    'hard'
  );
}

/**
 * Single Shift Per Day Constraint
 * No engineer can work more than one shift in a 24-hour period
 */
export function createSingleShiftConstraint(engineerId, dateStr) {
  return new Constraint(
    `single_shift_${engineerId}_${dateStr}`,
    [`${engineerId}_${dateStr}`],
    (assignment) => {
      const shift = assignment[`${engineerId}_${dateStr}`];
      // This is implicitly enforced by having single value per variable
      // But we keep this for clarity and future extension
      return true;
    },
    'hard'
  );
}

/**
 * Consistency Preference Constraint (Soft)
 * Prefer maintaining shift patterns week-to-week
 */
export function createConsistencyConstraint(engineerId, dateStr, preferredShiftGroup) {
  return new Constraint(
    `consistency_${engineerId}_${dateStr}`,
    [`${engineerId}_${dateStr}`],
    (assignment) => {
      const shift = assignment[`${engineerId}_${dateStr}`];

      if (!shift || shift === SHIFTS.OFF || shift === SHIFTS.UNAVAILABLE) {
        return true;
      }

      if (!preferredShiftGroup) return true;

      // Check if shift matches preferred group
      if (preferredShiftGroup === 'day_early') {
        return shift === SHIFTS.EARLY || shift === SHIFTS.MORNING;
      } else if (preferredShiftGroup === 'day_late') {
        return shift === SHIFTS.LATE;
      } else if (preferredShiftGroup === 'night') {
        return shift === SHIFTS.NIGHT;
      }

      return true;
    },
    'soft'
  );
}

/**
 * Holiday Off Preference (Soft)
 * Prefer giving holidays as off days when possible
 */
export function createHolidayPreferenceConstraint(engineerId, dateStr) {
  return new Constraint(
    `holiday_pref_${engineerId}_${dateStr}`,
    [`${engineerId}_${dateStr}`],
    (assignment) => {
      const shift = assignment[`${engineerId}_${dateStr}`];
      return shift === SHIFTS.OFF;
    },
    'soft'
  );
}

/**
 * Weekend Distribution Preference (Soft)
 * Prefer giving weekend shifts to engineers who didn't work weekends last month
 */
export function createWeekendDistributionConstraint(engineerId, dateStr, workedLastMonthWeekend) {
  return new Constraint(
    `weekend_dist_${engineerId}_${dateStr}`,
    [`${engineerId}_${dateStr}`],
    (assignment) => {
      const shift = assignment[`${engineerId}_${dateStr}`];

      // If they worked weekend last month, prefer OFF this weekend
      if (workedLastMonthWeekend) {
        return shift === SHIFTS.OFF;
      }

      // If they didn't, prefer working
      return shift && shift !== SHIFTS.OFF;
    },
    'soft'
  );
}

/**
 * Factory function to create all constraints for a scheduling problem
 */
export function createAllConstraints(config) {
  const constraints = [];
  const {
    engineers,
    days,
    weeks,
    holidays,
    coverage,
    previousMonthData
  } = config;

  const coreEngineers = engineers.filter(e => !e.isFloater && !e.inTraining);
  const floaters = engineers.filter(e => e.isFloater);

  // Coverage constraints for each day/shift
  for (const day of days) {
    const dateStr = toDateString(day);
    const isWknd = isWeekend(day);
    const dayCoverage = isWknd ? coverage.weekend : coverage.weekday;

    for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT]) {
      const minRequired = dayCoverage[shift]?.min || 2;
      constraints.push(createCoverageConstraint(
        dateStr, shift, minRequired, coreEngineers.map(e => e.id)
      ));
    }
  }

  // Transition constraints
  for (const engineer of engineers) {
    for (let i = 1; i < days.length; i++) {
      const prevDateStr = toDateString(days[i - 1]);
      const currDateStr = toDateString(days[i]);
      constraints.push(createTransitionConstraint(engineer.id, prevDateStr, currDateStr));
    }
  }

  // Consecutive days constraints
  for (const engineer of engineers) {
    constraints.push(createConsecutiveDaysConstraint(engineer.id, days));
  }

  // Weekly constraints
  for (const week of weeks) {
    // Off days constraints for core engineers
    for (const engineer of coreEngineers) {
      constraints.push(createOffDaysConstraint(engineer.id, week, 2));
      constraints.push(createMinWorkDaysConstraint(engineer.id, week, 5));
    }

    // Floater max shifts
    for (const floater of floaters) {
      constraints.push(createFloaterMaxShiftsConstraint(floater.id, week));
    }
  }

  // Preference constraints
  for (const engineer of engineers) {
    for (const day of days) {
      const dateStr = toDateString(day);
      constraints.push(createPreferenceConstraint(
        engineer.id, dateStr, engineer.preferences, day
      ));
    }
  }

  // Floater same shift constraints
  if (floaters.length >= 2) {
    for (const day of days) {
      const dateStr = toDateString(day);
      constraints.push(createFloaterSameShiftConstraint(
        floaters[0].id, floaters[1].id, dateStr
      ));
    }
  }

  // Holiday preference constraints (soft)
  for (const holiday of holidays) {
    for (const engineer of coreEngineers) {
      constraints.push(createHolidayPreferenceConstraint(engineer.id, holiday.date));
    }
  }

  return constraints;
}

export default {
  createCoverageConstraint,
  createTransitionConstraint,
  createConsecutiveDaysConstraint,
  createOffDaysConstraint,
  createMinWorkDaysConstraint,
  createPreferenceConstraint,
  createFloaterMaxShiftsConstraint,
  createFloaterSameShiftConstraint,
  createSingleShiftConstraint,
  createConsistencyConstraint,
  createHolidayPreferenceConstraint,
  createWeekendDistributionConstraint,
  createAllConstraints
};
