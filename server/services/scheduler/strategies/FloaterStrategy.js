/**
 * Floater Assignment Strategy
 * Handles floater scheduling with specific constraints
 */

import { SHIFTS, FLOATER_CONFIG, DEFAULT_COVERAGE } from '../config/defaults.js';
import { toDateString, isWeekend, getPreviousDay } from '../utils/DateUtils.js';
import { getTransitionViolation } from '../rules/GermanLaborLaws.js';

/**
 * Floater Strategy
 * Assigns floaters to supplement core coverage (after core minimums are met)
 */
export class FloaterStrategy {
  constructor(options = {}) {
    this.maxShiftsPerWeek = options.maxShiftsPerWeek || FLOATER_CONFIG.maxShiftsPerWeek;
    this.coverage = options.coverage || DEFAULT_COVERAGE;
  }

  /**
   * Count shifts a floater has worked in a week
   */
  getWeekShiftCount(schedule, floaterId, week) {
    let count = 0;

    for (const day of week) {
      const dateStr = toDateString(day);
      const shift = schedule[floaterId]?.[dateStr];

      if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check if floater can work on a date
   */
  canWork(schedule, floater, date, shift, floaters) {
    const dateStr = toDateString(date);

    // Already assigned
    const current = schedule[floater.id]?.[dateStr];
    if (current !== null && current !== undefined) {
      return false;
    }

    // Check preferences
    if (floater.preferences && floater.preferences.length > 0) {
      const isWknd = isWeekend(date);

      if (isWknd) {
        const weekendPref = `Weekend${shift}`;
        if (!floater.preferences.includes(weekendPref)) {
          // Check if has any weekend prefs
          const hasWeekendPrefs = floater.preferences.some(p => p.startsWith('Weekend'));
          if (hasWeekendPrefs) {
            return false;
          }
          if (!floater.preferences.includes(shift)) {
            return false;
          }
        }
      } else if (!floater.preferences.includes(shift)) {
        return false;
      }
    }

    // Check transition from previous day
    const prevDateStr = toDateString(getPreviousDay(date));
    const prevShift = schedule[floater.id]?.[prevDateStr];
    const violation = getTransitionViolation(prevShift, shift);
    if (violation) {
      return false;
    }

    // Check no other floater on same shift
    const otherFloaterOnShift = floaters.some(f =>
      f.id !== floater.id && schedule[f.id]?.[dateStr] === shift
    );
    if (otherFloaterOnShift) {
      return false;
    }

    return true;
  }

  /**
   * Get current coverage for a shift on a date
   */
  getCurrentCoverage(schedule, engineers, dateStr, shift) {
    return engineers.filter(e =>
      schedule[e.id]?.[dateStr] === shift
    ).length;
  }

  /**
   * Execute floater strategy
   */
  execute(schedule, engineers, days, weeks) {
    const floaters = engineers.filter(e => e.isFloater);
    const warnings = [];

    if (floaters.length === 0) {
      return { schedule, warnings };
    }

    if (floaters.length > 2) {
      warnings.push({
        type: 'configuration',
        message: `${floaters.length} floaters configured, maximum is 2. Using first 2.`
      });
    }

    const activeFloaters = floaters.slice(0, 2);

    // Track shifts per week per floater
    const weeklyShifts = new Map();
    activeFloaters.forEach(f => {
      weeklyShifts.set(f.id, new Map());
      weeks.forEach((week, i) => {
        weeklyShifts.get(f.id).set(i, 0);
      });
    });

    // Process each week
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      const week = weeks[weekIndex];

      for (const day of week) {
        const dateStr = toDateString(day);
        const isWknd = isWeekend(day);
        const dayCoverage = isWknd ? this.coverage.weekend : this.coverage.weekday;

        // Only add floaters for Early, Late, Morning shifts (Morning deprioritized)
        for (const shift of [SHIFTS.EARLY, SHIFTS.LATE, SHIFTS.MORNING]) {
          const currentCoverage = this.getCurrentCoverage(schedule, engineers, dateStr, shift);
          const preferredCoverage = dayCoverage[shift]?.preferred || dayCoverage[shift]?.min || 2;

          // Only add floaters if below preferred (not minimum - core handles minimum)
          if (currentCoverage < preferredCoverage) {
            for (const floater of activeFloaters) {
              // Check weekly limit
              const currentWeeklyShifts = weeklyShifts.get(floater.id).get(weekIndex);
              if (currentWeeklyShifts >= this.maxShiftsPerWeek) {
                continue;
              }

              // Check if can work
              if (!this.canWork(schedule, floater, day, shift, activeFloaters)) {
                continue;
              }

              // Assign floater
              schedule[floater.id][dateStr] = shift;
              weeklyShifts.get(floater.id).set(weekIndex, currentWeeklyShifts + 1);
              break; // Only one floater per coverage gap
            }
          }
        }
      }
    }

    // Fill in OFF days for floaters where not assigned
    for (const floater of activeFloaters) {
      for (const day of days) {
        const dateStr = toDateString(day);
        if (schedule[floater.id]?.[dateStr] === null ||
            schedule[floater.id]?.[dateStr] === undefined) {
          schedule[floater.id][dateStr] = SHIFTS.OFF;
        }
      }
    }

    return { schedule, warnings };
  }
}

export default FloaterStrategy;
