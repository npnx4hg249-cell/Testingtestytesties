/**
 * Day Shift Assignment Strategy
 * Handles Early, Morning, and Late shift scheduling with consistency preferences
 */

import { SHIFTS, DEFAULT_COVERAGE, SHIFT_GROUPS } from '../config/defaults.js';
import { toDateString, isWeekend, getPreviousDay, findWeekIndex } from '../utils/DateUtils.js';
import { getTransitionViolation, ArbZG } from '../rules/GermanLaborLaws.js';

/**
 * Fisher-Yates shuffle for randomizing arrays
 */
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Day Shift Strategy
 * Assigns Early, Morning, and Late shifts while maintaining consistency
 */
export class DayShiftStrategy {
  constructor(options = {}) {
    this.coverage = options.coverage || DEFAULT_COVERAGE;
    this.maxConsecutiveWork = options.maxConsecutiveWork || ArbZG.MAX_CONSECUTIVE_WORK_DAYS;
  }

  /**
   * Get the dominant shift group for an engineer in a week
   */
  getDominantShiftGroup(schedule, engineerId, week) {
    const counts = {
      day_early: 0,
      day_late: 0,
      night: 0
    };

    for (const day of week) {
      const dateStr = toDateString(day);
      const shift = schedule[engineerId]?.[dateStr];

      if (SHIFT_GROUPS.day_early.includes(shift)) {
        counts.day_early++;
      } else if (SHIFT_GROUPS.day_late.includes(shift)) {
        counts.day_late++;
      } else if (SHIFT_GROUPS.night.includes(shift)) {
        counts.night++;
      }
    }

    let maxCount = 0;
    let dominantGroup = null;

    for (const [group, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantGroup = group;
      }
    }

    return { group: dominantGroup, count: maxCount };
  }

  /**
   * Check if a shift matches a consistency group
   */
  matchesConsistencyGroup(shift, group) {
    if (!group) return true;

    if (group === 'day_early') {
      return SHIFT_GROUPS.day_early.includes(shift);
    } else if (group === 'day_late') {
      return SHIFT_GROUPS.day_late.includes(shift);
    } else if (group === 'night') {
      return SHIFT_GROUPS.night.includes(shift);
    }

    return true;
  }

  /**
   * Count consecutive work days ending at a date
   */
  getConsecutiveWorkDays(schedule, engineerId, endDate, days) {
    let count = 0;
    const endIndex = days.findIndex(d => toDateString(d) === toDateString(endDate));

    for (let i = endIndex; i >= 0; i--) {
      const dateStr = toDateString(days[i]);
      const shift = schedule[engineerId]?.[dateStr];

      if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }

  /**
   * Count shifts worked this week
   */
  getWeekShiftCount(schedule, engineerId, day, days) {
    // Find the Monday of this week
    let weekStart = day;
    while (weekStart.getDay() !== 1 && weekStart > days[0]) {
      weekStart = getPreviousDay(weekStart);
    }

    let count = 0;
    for (const d of days) {
      if (d < weekStart) continue;
      if (d > day) break;

      const dateStr = toDateString(d);
      const shift = schedule[engineerId]?.[dateStr];

      if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check if engineer can work a specific shift
   */
  canWorkShift(engineer, shift, date) {
    // Training engineers only work training shifts
    if (engineer.inTraining) {
      return shift === SHIFTS.TRAINING;
    }

    // Check preferences
    if (engineer.preferences && engineer.preferences.length > 0) {
      const isWknd = isWeekend(date);

      if (isWknd) {
        const weekendPref = `Weekend${shift}`;
        if (engineer.preferences.includes(weekendPref)) {
          return true;
        }

        // If has any weekend preferences defined, must match
        const hasWeekendPrefs = engineer.preferences.some(p => p.startsWith('Weekend'));
        if (hasWeekendPrefs) {
          return false;
        }
      }

      return engineer.preferences.includes(shift);
    }

    return true;
  }

  /**
   * Check if engineer is available on a date
   */
  isAvailable(schedule, engineerId, dateStr) {
    const current = schedule[engineerId]?.[dateStr];
    return current === null || current === undefined;
  }

  /**
   * Check valid transition from previous day
   */
  isValidTransition(schedule, engineerId, date, targetShift) {
    const prevDateStr = toDateString(getPreviousDay(date));
    const prevShift = schedule[engineerId]?.[prevDateStr];

    const violation = getTransitionViolation(prevShift, targetShift);
    return violation === null;
  }

  /**
   * Get eligible engineers for a shift on a date
   */
  getEligibleEngineers(schedule, engineers, date, shift, days, weeks) {
    const dateStr = toDateString(date);

    return engineers.filter(engineer => {
      // Must not be floater (handled separately)
      if (engineer.isFloater) return false;

      // Must not be in training (handled separately)
      if (engineer.inTraining) return false;

      // Must be available
      if (!this.isAvailable(schedule, engineer.id, dateStr)) return false;

      // Must be able to work this shift (preferences)
      if (!this.canWorkShift(engineer, shift, date)) return false;

      // Must have valid transition
      if (!this.isValidTransition(schedule, engineer.id, date, shift)) return false;

      // Check consecutive days limit - German law allows up to 6 consecutive work days
      const consecutive = this.getConsecutiveWorkDays(schedule, engineer.id, getPreviousDay(date), days);
      if (consecutive >= 6) return false;

      return true;
    });
  }

  /**
   * Score engineers for assignment priority
   */
  scoreEngineers(eligible, schedule, date, shift, days, weeks) {
    const currentWeekIndex = findWeekIndex(weeks, date);

    // Shuffle first to randomize tie-breaking
    return shuffleArray(eligible).map(engineer => {
      let score = 0;

      // Consistency bonus: favor engineers whose previous week matches this shift type
      if (currentWeekIndex > 0) {
        const prevWeek = weeks[currentWeekIndex - 1];
        const { group: prevGroup } = this.getDominantShiftGroup(schedule, engineer.id, prevWeek);

        if (this.matchesConsistencyGroup(shift, prevGroup)) {
          score += 30;
        }
      }

      // Fairness: favor engineers who have worked least this week
      const weekShifts = this.getWeekShiftCount(schedule, engineer.id, date, days);
      score -= weekShifts * 10;

      // Preference bonus: favor engineers who explicitly prefer this shift
      if (engineer.preferences?.includes(shift)) {
        score += 15;
      }

      // Tier consideration: T1 engineers slightly preferred for complex shifts
      if (engineer.tier === 'T1') {
        score += 5;
      }

      // Add small random factor for fine-grained tie-breaking
      score += Math.random() * 2;

      return { engineer, score };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Execute day shift strategy
   */
  execute(schedule, engineers, days, weeks) {
    const errors = [];
    const warnings = [];
    // Priority order: Early first, then Late; Morning is deprioritized (overflow only)
    // Morning only needs minimum coverage (2), additional staff goes to Early/Late first
    const dayShifts = [SHIFTS.EARLY, SHIFTS.LATE, SHIFTS.MORNING];

    for (const day of days) {
      const dateStr = toDateString(day);
      const isWknd = isWeekend(day);
      const dayCoverage = isWknd ? this.coverage.weekend : this.coverage.weekday;

      for (const shift of dayShifts) {
        const minRequired = dayCoverage[shift]?.min || 2;
        const eligible = this.getEligibleEngineers(schedule, engineers, day, shift, days, weeks);
        const scored = this.scoreEngineers(eligible, schedule, day, shift, days, weeks);

        let assigned = 0;
        for (const { engineer } of scored) {
          if (assigned >= minRequired) break;

          schedule[engineer.id][dateStr] = shift;
          assigned++;
        }

        if (assigned < minRequired) {
          errors.push({
            type: 'coverage_failure',
            shift,
            date: dateStr,
            message: `${shift} shift on ${dateStr}: only ${assigned} engineers, need ${minRequired}`,
            shortfall: minRequired - assigned
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
      schedule
    };
  }
}

export default DayShiftStrategy;
