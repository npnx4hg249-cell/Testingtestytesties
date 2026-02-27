/**
 * Main Schedule Generator
 * Orchestrates all scheduling components for 24/7 shift schedule generation
 *
 * Version: 3.4.0
 * Week-by-week generation with interleaved OFF assignment
 * - Shifts and OFF days assigned per-week to fix consecutive work day check
 * - Consistency maintained via scoring bonus (not template copying)
 * Modular architecture for maintainability and updates
 */

import { SHIFTS, DEFAULT_COVERAGE, COLORS, SHIFT_TIMES, SHIFT_GROUPS } from '../config/defaults.js';
import { ArbZG, validateScheduleCompliance, getTransitionViolation } from '../rules/GermanLaborLaws.js';
import { toDateString, getMonthDays, getWeeks, isWeekend, format as formatDate, getPreviousDay } from '../utils/DateUtils.js';
import { format } from 'date-fns';

import { NightShiftStrategy } from '../strategies/NightShiftStrategy.js';
import { DayShiftStrategy } from '../strategies/DayShiftStrategy.js';
import { FloaterStrategy } from '../strategies/FloaterStrategy.js';

// Configuration constants
const MAX_ITERATIONS = 1000;
const TARGET_SHIFTS_PER_WEEK = 5; // Target 5 working days per week for core engineers
const MIN_SHIFTS_PER_WEEK = 4;   // Minimum shifts to avoid month-off scenarios
const MAX_OFF_PER_WEEK = 2;      // Maximum OFF days per week for core engineers

/**
 * Fisher-Yates shuffle for randomizing arrays in-place
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
 * Main Scheduler Class
 * Generates compliant shift schedules using modular strategies
 */
export class Scheduler {
  constructor(options = {}) {
    this.engineers = options.engineers || [];
    this.month = options.month || new Date();
    this.holidays = options.holidays || [];
    this.approvedRequests = options.approvedRequests || [];
    this.coverage = options.coverage || DEFAULT_COVERAGE;
    this.previousMonthSchedule = options.previousMonthSchedule || null;

    // Initialize strategies
    this.nightStrategy = new NightShiftStrategy({ coverage: this.coverage });
    this.dayStrategy = new DayShiftStrategy({ coverage: this.coverage });
    this.floaterStrategy = new FloaterStrategy({ coverage: this.coverage });

    // Tracking
    this.violations = [];
    this.warnings = [];
    this.stats = null;

    // Pre-compute previous month tail data for cross-month continuity
    this.prevMonthTail = this._buildPrevMonthTail();
  }

  /**
   * Build a lookup of the last 6 days of the previous month's schedule
   * for each engineer, used to prevent German labor law violations
   * (max 6 consecutive work days) across month boundaries.
   * Returns { engineerId: [{ date, shift }, ...] } sorted chronologically.
   */
  _buildPrevMonthTail() {
    if (!this.previousMonthSchedule) return {};

    const tail = {};
    // Get the previous month's date range (last 6 days)
    const prevMonthDate = new Date(this.month.getFullYear(), this.month.getMonth() - 1, 1);
    const prevDays = getMonthDays(prevMonthDate);
    const lastDays = prevDays.slice(-6); // Last 6 days of previous month

    for (const engineer of this.engineers) {
      const entries = [];
      for (const day of lastDays) {
        const dateStr = toDateString(day);
        const shift = this.previousMonthSchedule[engineer.id]?.[dateStr];
        if (shift !== undefined) {
          entries.push({ date: dateStr, shift, day });
        }
      }
      if (entries.length > 0) {
        tail[engineer.id] = entries;
      }
    }

    return tail;
  }

  /**
   * Get the shift for an engineer on a date, checking both current schedule and
   * previous month's schedule for cross-month boundary lookups.
   */
  getShiftWithPrevMonth(schedule, engineerId, dateStr) {
    const shift = schedule[engineerId]?.[dateStr];
    if (shift !== undefined && shift !== null) return shift;

    // Check previous month's schedule
    if (this.previousMonthSchedule) {
      return this.previousMonthSchedule[engineerId]?.[dateStr] || null;
    }
    return null;
  }

  /**
   * Count consecutive work days at the end of the previous month for an engineer.
   * Used to ensure the new month doesn't create a streak > 6 when combined.
   */
  getPrevMonthTrailingWorkDays(engineerId) {
    const entries = this.prevMonthTail[engineerId];
    if (!entries || entries.length === 0) return 0;

    let count = 0;
    // Walk backwards from the last day
    for (let i = entries.length - 1; i >= 0; i--) {
      const shift = entries[i].shift;
      if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  /**
   * Get month days
   */
  getDays() {
    return getMonthDays(this.month);
  }

  /**
   * Get weeks
   */
  getWeeksInMonth() {
    return getWeeks(this.month);
  }

  /**
   * Check if a day is a holiday for an engineer
   */
  isHoliday(date, engineerState = null) {
    const dateStr = toDateString(date);
    return this.holidays.some(h => {
      if (h.date === dateStr) {
        if (h.type === 'federal') return true;
        if (h.type === 'state' && engineerState) {
          return h.states?.includes(engineerState);
        }
      }
      return false;
    });
  }

  /**
   * Check if engineer is available on a date
   */
  isEngineerAvailable(engineer, date) {
    const dateStr = toDateString(date);

    // Check explicit unavailability
    if (engineer.unavailableDays?.includes(dateStr)) {
      return false;
    }

    // Check approved time-off requests
    const hasApprovedTimeOff = this.approvedRequests.some(req =>
      req.engineerId === engineer.id &&
      req.type === 'time_off' &&
      req.dates?.includes(dateStr)
    );

    if (hasApprovedTimeOff) return false;

    return true;
  }

  /**
   * Check if an engineer can work a specific shift based on their preferences
   * @param {Object} engineer - The engineer object
   * @param {string} shift - The shift type (Early, Morning, Late, Night)
   * @param {Date} date - The date to check (for weekend-specific preferences)
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
   * Check if an unavailable day is a "Predetermined Off" type
   * These count as OFF days, not UNAVAILABLE (they count toward the 2-per-week requirement)
   */
  isPredeterminedOff(engineer, dateStr) {
    // First check the unavailableTypes map (preferred format)
    const type = engineer.unavailableTypes?.[dateStr];
    if (type === 'predetermined_off') {
      return true;
    }

    // Fallback: check unavailableDates array (legacy format from users route)
    const unavailableDates = engineer.unavailableDates || [];
    for (const item of unavailableDates) {
      if (typeof item === 'object' && item.date === dateStr) {
        if (item.type === 'predetermined_off') {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check whether an engineer can still get 2 consecutive OFF days in a week.
   * Returns true if there are at least 2 consecutive null/OFF slots remaining.
   */
  canStillGetConsecutiveOff(schedule, engineerId, week) {
    for (let i = 0; i < week.length - 1; i++) {
      const dateStr1 = toDateString(week[i]);
      const dateStr2 = toDateString(week[i + 1]);
      const shift1 = schedule[engineerId]?.[dateStr1];
      const shift2 = schedule[engineerId]?.[dateStr2];

      const slot1Free = shift1 === null || shift1 === undefined || shift1 === SHIFTS.OFF;
      const slot2Free = shift2 === null || shift2 === undefined || shift2 === SHIFTS.OFF;

      if (slot1Free && slot2Free) return true;
    }
    return false;
  }

  /**
   * Reserve OFF days BEFORE assigning shifts.
   * Pre-computes and locks 2 consecutive OFF day slots per engineer per week.
   * This prevents shift assignment from consuming all available slots.
   *
   * IMPORTANT: Partial weeks (< 4 days at month start/end) are SKIPPED since
   * requiring 2 consecutive OFF in a 1-3 day week is impossible or impractical.
   */
  reserveOffDays(schedule) {
    const weeks = this.getWeeksInMonth();
    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);
    const errors = [];

    for (const week of weeks) {
      // Skip partial weeks - can't require 2 consecutive OFF in < 4 days
      if (week.length < 4) continue;

      const shuffledEngineers = shuffleArray(coreEngineers);

      for (const engineer of shuffledEngineers) {
        // Fixed off days are handled separately
        if (engineer.fixedOffDays) {
          for (const day of week) {
            const dayOfWeek = day.getDay();
            const dateStr = toDateString(day);
            if (engineer.fixedOffDays.includes(dayOfWeek) &&
                schedule[engineer.id][dateStr] === null) {
              schedule[engineer.id][dateStr] = SHIFTS.OFF;
            }
          }
          continue;
        }

        // Count existing OFF days (from predetermined off, etc.)
        const existingOffDays = week.filter(d =>
          schedule[engineer.id][toDateString(d)] === SHIFTS.OFF
        );

        // Check if we already have 2+ consecutive OFF days
        let hasConsecutiveOff = false;
        for (let i = 0; i < existingOffDays.length - 1; i++) {
          const diff = Math.abs(existingOffDays[i + 1].getTime() - existingOffDays[i].getTime()) / (1000 * 60 * 60 * 24);
          if (diff === 1) {
            hasConsecutiveOff = true;
            break;
          }
        }

        if (hasConsecutiveOff && existingOffDays.length >= 2) continue;

        const neededOff = Math.max(0, MAX_OFF_PER_WEEK - existingOffDays.length);
        if (neededOff === 0 && hasConsecutiveOff) continue;

        // Find null/unassigned slots in this week for this engineer
        const availableForOff = week.filter(d => {
          const dateStr = toDateString(d);
          const shift = schedule[engineer.id][dateStr];
          return shift === null || shift === undefined;
        });

        // Find best consecutive pair for OFF days
        let bestPair = null;
        let bestScore = -Infinity;

        for (let i = 0; i < availableForOff.length - 1; i++) {
          const day1 = availableForOff[i];
          const day2 = availableForOff[i + 1];

          const diff = Math.abs(day2.getTime() - day1.getTime()) / (1000 * 60 * 60 * 24);
          if (diff !== 1) continue;

          let score = 0;

          // PENALIZE weekends heavily - we need people working weekends
          if (isWeekend(day1)) score -= 15;
          if (isWeekend(day2)) score -= 15;

          // Prefer holidays
          if (this.isHoliday(day1, engineer.state)) score += 5;
          if (this.isHoliday(day2, engineer.state)) score += 5;

          // Prefer mid-week days (Tue-Thu) for OFF
          const dow1 = day1.getDay();
          const dow2 = day2.getDay();
          if (dow1 >= 2 && dow1 <= 4) score += 3;
          if (dow2 >= 2 && dow2 <= 4) score += 3;

          // Prefer if already has one OFF day adjacent
          const shift1 = schedule[engineer.id][toDateString(day1)];
          const shift2 = schedule[engineer.id][toDateString(day2)];
          if (shift1 === SHIFTS.OFF || shift2 === SHIFTS.OFF) score += 12;

          // Spread OFF days: penalize if too many engineers already off on these days
          const offCount1 = this.countOffOnDay(schedule, coreEngineers, toDateString(day1));
          const offCount2 = this.countOffOnDay(schedule, coreEngineers, toDateString(day2));
          score -= (offCount1 + offCount2) * 3;

          // Cross-month: for first full week, check previous month trailing work days
          if (week === weeks[0] || (weeks[0].length < 4 && week === weeks[1])) {
            const trailingWorkDays = this.getPrevMonthTrailingWorkDays(engineer.id);
            if (trailingWorkDays >= 4) {
              const maxWorkBeforeOff = Math.max(0, ArbZG.MAX_CONSECUTIVE_WORK_DAYS - trailingWorkDays);
              const dayIndex1 = week.indexOf(day1);
              // Strongly prefer earlier OFF if previous month had long streak
              if (dayIndex1 <= maxWorkBeforeOff) score += 20;
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestPair = [day1, day2];
          }
        }

        if (bestPair) {
          schedule[engineer.id][toDateString(bestPair[0])] = SHIFTS.OFF;
          schedule[engineer.id][toDateString(bestPair[1])] = SHIFTS.OFF;
        } else if (neededOff > 0) {
          // Could not find consecutive pair - try single OFF as fallback for partial coverage
          const unassigned = availableForOff.filter(d => !isWeekend(d));
          if (unassigned.length > 0) {
            // Assign 1 OFF day as partial fallback (better than nothing)
            schedule[engineer.id][toDateString(unassigned[0])] = SHIFTS.OFF;
          }
          // Only warn, don't hard error from reservation
          this.warnings.push({
            type: 'off_day_reservation_partial',
            engineer: engineer.name,
            week: toDateString(week[0]),
            message: `${engineer.name}: could not find consecutive OFF pair in week starting ${toDateString(week[0])}, using best-effort fallback`
          });
        }
      }
    }

    return { schedule, errors };
  }

  /**
   * Initialize empty schedule with unavailable days
   * "Predetermined Off" days are initialized as OFF (count toward weekly off requirements)
   * All other unavailable types are initialized as UNAVAILABLE
   */
  initializeSchedule() {
    const schedule = {};
    const days = this.getDays();

    for (const engineer of this.engineers) {
      schedule[engineer.id] = {};

      for (const day of days) {
        const dateStr = toDateString(day);

        if (!this.isEngineerAvailable(engineer, day)) {
          // Check if this is a "Predetermined Off" day (counts as OFF, not UNAVAILABLE)
          if (this.isPredeterminedOff(engineer, dateStr)) {
            schedule[engineer.id][dateStr] = SHIFTS.OFF;
          } else {
            schedule[engineer.id][dateStr] = SHIFTS.UNAVAILABLE;
          }
        } else {
          schedule[engineer.id][dateStr] = null;
        }
      }
    }

    return schedule;
  }

  /**
   * Assign training engineers (Mon-Fri Training, Sat-Sun Off)
   */
  assignTrainingShifts(schedule) {
    const days = this.getDays();
    const trainingEngineers = this.engineers.filter(e => e.inTraining);

    for (const engineer of trainingEngineers) {
      for (const day of days) {
        const dateStr = toDateString(day);
        const dayOfWeek = day.getDay();

        // Skip if already assigned (unavailable)
        if (schedule[engineer.id][dateStr] !== null) continue;

        // Saturday = 6, Sunday = 0
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          schedule[engineer.id][dateStr] = SHIFTS.OFF;
        } else {
          schedule[engineer.id][dateStr] = SHIFTS.TRAINING;
        }
      }
    }

    return schedule;
  }

  /**
   * Count how many engineers are OFF on a specific day
   */
  countOffOnDay(schedule, engineers, dateStr) {
    return engineers.filter(e =>
      schedule[e.id]?.[dateStr] === SHIFTS.OFF
    ).length;
  }

  /**
   * Count coverage for a specific shift on a specific day
   */
  countShiftCoverage(schedule, engineers, dateStr, shift) {
    return engineers.filter(e =>
      schedule[e.id]?.[dateStr] === shift
    ).length;
  }

  /**
   * Check if weekend coverage would still be met if we assign this engineer OFF
   */
  wouldMaintainWeekendCoverage(schedule, engineerId, day, coreEngineers) {
    if (!isWeekend(day)) return true; // Only check weekends

    const dateStr = toDateString(day);
    const currentShift = schedule[engineerId]?.[dateStr];

    // If engineer doesn't have a work shift here, no coverage impact
    if (!currentShift || currentShift === SHIFTS.OFF ||
        currentShift === SHIFTS.UNAVAILABLE || currentShift === null) {
      return true;
    }

    // Count current coverage for this shift excluding this engineer
    const coverageWithout = coreEngineers.filter(e =>
      e.id !== engineerId && schedule[e.id]?.[dateStr] === currentShift
    ).length;

    const weekendMin = this.coverage.weekend[currentShift]?.min || 2;
    return coverageWithout >= weekendMin;
  }

  /**
   * Assign OFF days for a single week.
   * Called after each week's shift assignment to ensure consecutive check works
   * properly for the next week.
   *
   * @param {Object} schedule - Current schedule state
   * @param {Array} week - Array of day objects for this week
   * @param {number} weekIndex - Index of the week (0-based)
   * @param {Array} weeks - All weeks in the month
   * @returns {{ schedule: Object, errors: Array }}
   */
  assignOffDaysForWeek(schedule, week, weekIndex, weeks) {
    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);
    const errors = [];

    // Skip partial weeks (< 4 days) - can't require 2 consecutive OFF
    if (week.length < 4) {
      return { schedule, errors };
    }

    // For the first full week, enforce early OFF days for engineers who ended
    // the previous month with a long work streak (German labor law: max 6 consecutive)
    const firstFullWeek = weeks.find(w => w.length >= 4);
    const isFirstFullWeek = firstFullWeek && week === firstFullWeek;

    if (isFirstFullWeek) {
      for (const engineer of coreEngineers) {
        const trailingWorkDays = this.getPrevMonthTrailingWorkDays(engineer.id);
        if (trailingWorkDays >= 4) {
          const maxWorkBeforeOff = Math.max(0, ArbZG.MAX_CONSECUTIVE_WORK_DAYS - trailingWorkDays);
          for (let d = 0; d < week.length && d <= maxWorkBeforeOff; d++) {
            const dateStr = toDateString(week[d]);
            const current = schedule[engineer.id][dateStr];
            if (d === maxWorkBeforeOff && (current === null || current === undefined)) {
              schedule[engineer.id][dateStr] = SHIFTS.OFF;
            }
          }
        }
      }
    }

    // Shuffle engineers each week so different people get first pick
    const shuffledEngineers = shuffleArray(coreEngineers);

    for (const engineer of shuffledEngineers) {
      // Special handling for fixed off days
      if (engineer.fixedOffDays) {
        for (const day of week) {
          const dayOfWeek = day.getDay();
          const dateStr = toDateString(day);
          if (engineer.fixedOffDays.includes(dayOfWeek) &&
              schedule[engineer.id][dateStr] === null) {
            schedule[engineer.id][dateStr] = SHIFTS.OFF;
          }
        }
        continue;
      }

      const unavailableDays = week.filter(d =>
        schedule[engineer.id][toDateString(d)] === SHIFTS.UNAVAILABLE
      ).length;

      // Count existing OFF days this week (including predetermined off)
      const existingOffDays = week.filter(d =>
        schedule[engineer.id][toDateString(d)] === SHIFTS.OFF
      );

      // Check if we already have 2+ consecutive OFF days
      let hasConsecutiveOff = false;
      for (let i = 0; i < existingOffDays.length - 1; i++) {
        const diff = Math.abs(existingOffDays[i + 1].getTime() - existingOffDays[i].getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          hasConsecutiveOff = true;
          break;
        }
      }

      // If we already have 2+ OFF days (including predetermined), we're done.
      // Predetermined OFF days are hard-coded for the individual and count as their days off.
      // Don't add more OFF on top — just warn if they're not consecutive.
      if (existingOffDays.length >= 2) {
        if (!hasConsecutiveOff && unavailableDays === 0) {
          errors.push({
            type: 'non_consecutive_off',
            engineer: engineer.name,
            week: toDateString(week[0]),
            message: `${engineer.name} has ${existingOffDays.length} Off days but not consecutive in week starting ${toDateString(week[0])}`
          });
        }
        continue;
      }

      // How many more OFF days do we need? (0, 1, or 2)
      const neededOff = Math.max(0, 2 - existingOffDays.length);
      if (neededOff === 0) continue;

      // Get slots that can be set to OFF (prefer null/unassigned, but allow overriding shifts)
      const availableForOff = week.filter(d => {
        const dateStr = toDateString(d);
        const shift = schedule[engineer.id][dateStr];
        return shift === null || shift === undefined ||
               (shift !== SHIFTS.UNAVAILABLE && shift !== SHIFTS.OFF);
      });

      // CASE A: Need 1 more OFF (have 1 existing, e.g. predetermined)
      // Try to place adjacent to existing OFF for consecutiveness
      if (neededOff === 1 && existingOffDays.length === 1) {
        const existingOff = existingOffDays[0];
        let bestDay = null;
        let bestScore = -Infinity;

        for (const d of availableForOff) {
          const dayDiff = Math.abs(d.getTime() - existingOff.getTime()) / (1000 * 60 * 60 * 24);
          let score = 0;

          // Strongly prefer adjacent to existing OFF (makes them consecutive)
          if (dayDiff === 1) score += 50;

          // Penalize weekends
          if (isWeekend(d)) score -= 15;
          if (isWeekend(d) && !this.wouldMaintainWeekendCoverage(schedule, engineer.id, d, coreEngineers)) {
            score -= 100;
          }

          // Prefer null slots over overriding work shifts
          const shift = schedule[engineer.id][toDateString(d)];
          if (shift === null || shift === undefined) score += 8;

          // Prefer holidays
          if (this.isHoliday(d, engineer.state)) score += 5;

          // Prefer mid-week
          const dow = d.getDay();
          if (dow >= 2 && dow <= 4) score += 3;

          // Spread OFF days
          const offCount = this.countOffOnDay(schedule, coreEngineers, toDateString(d));
          score -= offCount * 3;

          if (score > bestScore) {
            bestScore = score;
            bestDay = d;
          }
        }

        if (bestDay) {
          schedule[engineer.id][toDateString(bestDay)] = SHIFTS.OFF;
        }
      }
      // CASE B: Need 2 OFF days (have 0 existing)
      // Find best consecutive pair
      else if (neededOff === 2) {
        let bestPair = null;
        let bestScore = -Infinity;

        for (let i = 0; i < availableForOff.length - 1; i++) {
          const day1 = availableForOff[i];
          const day2 = availableForOff[i + 1];

          const diff = Math.abs(day2.getTime() - day1.getTime()) / (1000 * 60 * 60 * 24);
          if (diff !== 1) continue;

          let score = 0;

          // PENALIZE weekends - we need people working weekends
          if (isWeekend(day1)) score -= 15;
          if (isWeekend(day2)) score -= 15;

          // Only allow weekend OFF if coverage would still be met
          if (isWeekend(day1) && !this.wouldMaintainWeekendCoverage(schedule, engineer.id, day1, coreEngineers)) {
            score -= 100;
          }
          if (isWeekend(day2) && !this.wouldMaintainWeekendCoverage(schedule, engineer.id, day2, coreEngineers)) {
            score -= 100;
          }

          // Prefer holidays
          if (this.isHoliday(day1, engineer.state)) score += 5;
          if (this.isHoliday(day2, engineer.state)) score += 5;

          // Strongly prefer null/unassigned slots over overriding existing shifts
          const shift1 = schedule[engineer.id][toDateString(day1)];
          const shift2 = schedule[engineer.id][toDateString(day2)];
          if (shift1 === null || shift1 === undefined) score += 8;
          if (shift2 === null || shift2 === undefined) score += 8;

          // Prefer mid-week days (Tue-Thu) for OFF
          const dow1 = day1.getDay();
          const dow2 = day2.getDay();
          if (dow1 >= 2 && dow1 <= 4) score += 3;
          if (dow2 >= 2 && dow2 <= 4) score += 3;

          // Spread OFF days: penalize if too many engineers already off on these days
          const offCount1 = this.countOffOnDay(schedule, coreEngineers, toDateString(day1));
          const offCount2 = this.countOffOnDay(schedule, coreEngineers, toDateString(day2));
          score -= (offCount1 + offCount2) * 3;

          if (score > bestScore) {
            bestScore = score;
            bestPair = [day1, day2];
          }
        }

        if (bestPair) {
          schedule[engineer.id][toDateString(bestPair[0])] = SHIFTS.OFF;
          schedule[engineer.id][toDateString(bestPair[1])] = SHIFTS.OFF;
        } else {
          // No consecutive pair found - fall back to non-consecutive (better than nothing)
          const unassigned = week.filter(d => {
            const dateStr = toDateString(d);
            const shift = schedule[engineer.id][dateStr];
            return shift === null || shift === undefined;
          });

          const sorted = shuffleArray([...unassigned]).sort((a, b) => {
            let aScore = isWeekend(a) ? -10 : 0;
            let bScore = isWeekend(b) ? -10 : 0;
            aScore += this.isHoliday(a, engineer.state) ? 5 : 0;
            bScore += this.isHoliday(b, engineer.state) ? 5 : 0;
            aScore -= this.countOffOnDay(schedule, coreEngineers, toDateString(a)) * 3;
            bScore -= this.countOffOnDay(schedule, coreEngineers, toDateString(b)) * 3;
            return bScore - aScore;
          });

          for (let i = 0; i < Math.min(neededOff, sorted.length); i++) {
            schedule[engineer.id][toDateString(sorted[i])] = SHIFTS.OFF;
          }
        }
      }

      // Verify result
      const finalOffDays = week.filter(d =>
        schedule[engineer.id][toDateString(d)] === SHIFTS.OFF
      );

      let hasFinalConsecutive = false;
      for (let i = 0; i < finalOffDays.length - 1; i++) {
        const diff = Math.abs(finalOffDays[i + 1].getTime() - finalOffDays[i].getTime()) / (1000 * 60 * 60 * 24);
        if (diff === 1) {
          hasFinalConsecutive = true;
          break;
        }
      }

      if (!hasFinalConsecutive && finalOffDays.length < 2 && unavailableDays === 0) {
        errors.push({
          type: 'off_day_violation',
          engineer: engineer.name,
          week: toDateString(week[0]),
          message: `${engineer.name} has only ${finalOffDays.length} Off days in week starting ${toDateString(week[0])}`
        });
      } else if (!hasFinalConsecutive && finalOffDays.length >= 2) {
        errors.push({
          type: 'non_consecutive_off',
          engineer: engineer.name,
          week: toDateString(week[0]),
          message: `${engineer.name} has ${finalOffDays.length} Off days but not consecutive in week starting ${toDateString(week[0])}`
        });
      }
    }

    return { schedule, errors };
  }

  /**
   * Assign OFF days to ensure 2 consecutive days per week (HARD constraint).
   * Runs AFTER shift assignment to find optimal gaps in the schedule.
   * Skips partial weeks (< 4 days) at month start/end.
   * Falls back to non-consecutive OFF (with warning) rather than leaving engineers
   * with no OFF days at all.
   *
   * NOTE: This method now delegates to assignOffDaysForWeek() for each week.
   * It's kept for backward compatibility and for cases where we need to
   * re-run OFF assignment for the entire month.
   */
  assignOffDays(schedule) {
    const weeks = this.getWeeksInMonth();
    const allErrors = [];

    // Process each week using the new per-week method
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      const week = weeks[weekIndex];
      const weekResult = this.assignOffDaysForWeek(schedule, week, weekIndex, weeks);
      schedule = weekResult.schedule;
      allErrors.push(...weekResult.errors);
    }

    return { schedule, errors: allErrors };
  }

  /**
   * Validate the schedule (complete or partial)
   * @param {Object} schedule - The schedule to validate
   * @param {Object} options - Validation options
   * @param {boolean} options.partial - If true, skip OFF day checks (for incremental validation)
   */
  validateSchedule(schedule, options = {}) {
    const { partial = false } = options;
    const days = this.getDays();
    const weeks = this.getWeeksInMonth();
    const errors = [];

    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);
    const floaters = this.engineers.filter(e => e.isFloater);

    // 1. Check coverage (min AND max)
    for (const day of days) {
      const dateStr = toDateString(day);
      const isWknd = isWeekend(day);
      const dayCoverage = isWknd ? this.coverage.weekend : this.coverage.weekday;

      for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT]) {
        const coreCoverage = coreEngineers.filter(e =>
          schedule[e.id][dateStr] === shift
        ).length;

        // Check minimum coverage
        if (coreCoverage < dayCoverage[shift].min) {
          errors.push({
            type: 'coverage_violation',
            shift,
            date: dateStr,
            actual: coreCoverage,
            required: dayCoverage[shift].min,
            message: `${shift} on ${dateStr}: ${coreCoverage} core engineers, need ${dayCoverage[shift].min}`
          });
        }

        // Check maximum coverage (especially important for Night)
        const maxCoverage = dayCoverage[shift].max;
        if (maxCoverage && coreCoverage > maxCoverage) {
          errors.push({
            type: 'coverage_exceeded',
            shift,
            date: dateStr,
            actual: coreCoverage,
            max: maxCoverage,
            message: `${shift} on ${dateStr}: ${coreCoverage} core engineers, max is ${maxCoverage}`
          });
        }
      }
    }

    // 2. Check German labor law compliance
    for (const engineer of this.engineers) {
      const violations = validateScheduleCompliance(schedule, engineer.id, days);
      errors.push(...violations);

      // Also check cross-month consecutive work days
      const trailingWorkDays = this.getPrevMonthTrailingWorkDays(engineer.id);
      if (trailingWorkDays > 0) {
        let currentStreak = trailingWorkDays;
        for (const day of days) {
          const dateStr = toDateString(day);
          const shift = schedule[engineer.id]?.[dateStr];
          if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
            currentStreak++;
            if (currentStreak > ArbZG.MAX_CONSECUTIVE_WORK_DAYS) {
              errors.push({
                type: 'ARBZG_CONSECUTIVE_DAYS_CROSS_MONTH',
                severity: 'critical',
                law: '§11 ArbZG',
                message: `${engineer.name} has ${currentStreak} consecutive work days across month boundary (max ${ArbZG.MAX_CONSECUTIVE_WORK_DAYS})`,
                date: dateStr
              });
              break; // Only report once per engineer
            }
          } else {
            break; // Streak broken
          }
        }
      }

      // Check transition from last day of previous month to first day of this month
      const prevTail = this.prevMonthTail[engineer.id];
      if (prevTail && prevTail.length > 0 && days.length > 0) {
        const lastPrevShift = prevTail[prevTail.length - 1].shift;
        const firstDateStr = toDateString(days[0]);
        const firstShift = schedule[engineer.id]?.[firstDateStr];
        const violation = getTransitionViolation(lastPrevShift, firstShift);
        if (violation) {
          errors.push({
            type: 'transition_violation_cross_month',
            engineer: engineer.name,
            date: firstDateStr,
            law: violation.law,
            message: `${engineer.name}: ${lastPrevShift} → ${firstShift} across month boundary on ${firstDateStr} - ${violation.reason}`
          });
        }
      }
    }

    // 3. Check floater rules
    for (const floater of floaters) {
      for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
        const week = weeks[weekIndex];
        const shifts = week.filter(d => {
          const dateStr = toDateString(d);
          const s = schedule[floater.id][dateStr];
          return s && s !== SHIFTS.OFF && s !== SHIFTS.UNAVAILABLE;
        }).length;

        if (shifts > 2.5) {
          errors.push({
            type: 'floater_overwork',
            engineer: floater.name,
            week: weekIndex + 1,
            shifts,
            message: `Floater ${floater.name} has ${shifts} shifts in week ${weekIndex + 1}, max is 2.5`
          });
        }
      }
    }

    // 4. Check both floaters not on same shift
    if (floaters.length >= 2) {
      for (const day of days) {
        const dateStr = toDateString(day);
        for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT]) {
          const floatersOnShift = floaters.filter(f =>
            schedule[f.id][dateStr] === shift
          );
          if (floatersOnShift.length > 1) {
            errors.push({
              type: 'floater_collision',
              date: dateStr,
              shift,
              message: `Both floaters on ${shift} shift on ${dateStr}`
            });
          }
        }
      }
    }

    // 5. Check transition rules
    for (const engineer of this.engineers) {
      for (let i = 1; i < days.length; i++) {
        const prevDateStr = toDateString(days[i-1]);
        const currDateStr = toDateString(days[i]);
        const prevShift = schedule[engineer.id][prevDateStr];
        const currShift = schedule[engineer.id][currDateStr];

        const violation = getTransitionViolation(prevShift, currShift);
        if (violation) {
          errors.push({
            type: 'transition_violation',
            engineer: engineer.name,
            date: currDateStr,
            law: violation.law,
            message: `${engineer.name}: ${prevShift} → ${currShift} on ${currDateStr} - ${violation.reason}`
          });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Calculate schedule statistics
   */
  calculateStats(schedule) {
    const days = this.getDays();
    const stats = {
      totalShifts: {},
      coverageByDay: {},
      engineerStats: {},
      summary: {
        totalWorkShifts: 0,
        totalOffDays: 0,
        totalUnavailable: 0,
        coverageIssues: 0
      }
    };

    // Initialize engineer stats
    for (const engineer of this.engineers) {
      stats.engineerStats[engineer.id] = {
        name: engineer.name,
        tier: engineer.tier,
        isFloater: engineer.isFloater,
        inTraining: engineer.inTraining,
        totalShifts: 0,
        shiftBreakdown: {},
        offDays: 0,
        unavailableDays: 0
      };
    }

    // Calculate stats
    for (const day of days) {
      const dateStr = toDateString(day);
      stats.coverageByDay[dateStr] = {
        [SHIFTS.EARLY]: 0,
        [SHIFTS.MORNING]: 0,
        [SHIFTS.LATE]: 0,
        [SHIFTS.NIGHT]: 0
      };

      for (const engineer of this.engineers) {
        const shift = schedule[engineer.id][dateStr];

        if (shift === SHIFTS.OFF) {
          stats.engineerStats[engineer.id].offDays++;
          stats.summary.totalOffDays++;
        } else if (shift === SHIFTS.UNAVAILABLE) {
          stats.engineerStats[engineer.id].unavailableDays++;
          stats.summary.totalUnavailable++;
        } else if (shift && shift !== SHIFTS.TRAINING) {
          stats.engineerStats[engineer.id].totalShifts++;
          stats.engineerStats[engineer.id].shiftBreakdown[shift] =
            (stats.engineerStats[engineer.id].shiftBreakdown[shift] || 0) + 1;
          stats.coverageByDay[dateStr][shift]++;
          stats.summary.totalWorkShifts++;
        }
      }
    }

    return stats;
  }

  /**
   * Get shift count for an engineer in a specific week
   */
  getWeekShiftCount(schedule, engineerId, week) {
    let count = 0;
    for (const day of week) {
      const dateStr = toDateString(day);
      const shift = schedule[engineerId]?.[dateStr];
      if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get the dominant shift pattern for an engineer in a week
   */
  getDominantPattern(schedule, engineerId, week) {
    const counts = {
      day_early: 0,  // Early, Morning
      day_late: 0,   // Late
      night: 0       // Night
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

    // Determine dominant pattern
    let maxCount = 0;
    let dominant = null;
    for (const [group, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        dominant = group;
      }
    }

    return { pattern: dominant, counts };
  }

  /**
   * Copy week template to the next week, adapting for availability
   */
  copyWeekTemplate(schedule, engineers, sourceWeek, targetWeek) {
    for (const engineer of engineers) {
      // Skip floaters and training (handled separately)
      if (engineer.isFloater || engineer.inTraining) continue;

      const { pattern } = this.getDominantPattern(schedule, engineer.id, sourceWeek);

      for (let dayIndex = 0; dayIndex < targetWeek.length && dayIndex < sourceWeek.length; dayIndex++) {
        const sourceDateStr = toDateString(sourceWeek[dayIndex]);
        const targetDateStr = toDateString(targetWeek[dayIndex]);
        const sourceShift = schedule[engineer.id][sourceDateStr];
        const targetCurrent = schedule[engineer.id][targetDateStr];

        // Skip if already assigned (unavailable or pre-assigned)
        if (targetCurrent !== null && targetCurrent !== undefined) continue;

        // Try to copy the same shift, but check constraints
        // SKIP Night shifts - they are already assigned for the entire month by NightShiftStrategy
        if (sourceShift && sourceShift !== SHIFTS.UNAVAILABLE && sourceShift !== SHIFTS.NIGHT) {
          // Check if the transition from previous day is valid
          const prevDateStr = toDateString(getPreviousDay(targetWeek[dayIndex]));
          const prevShift = schedule[engineer.id]?.[prevDateStr];
          const violation = getTransitionViolation(prevShift, sourceShift);

          if (!violation) {
            schedule[engineer.id][targetDateStr] = sourceShift;
          } else if (sourceShift !== SHIFTS.OFF) {
            // Try to assign a compatible shift from the same pattern group
            const compatibleShifts = this.getCompatibleShifts(pattern, prevShift);
            if (compatibleShifts.length > 0) {
              schedule[engineer.id][targetDateStr] = compatibleShifts[0];
            }
          }
        }
      }
    }

    return schedule;
  }

  /**
   * Get compatible shifts based on pattern and previous shift
   */
  getCompatibleShifts(pattern, prevShift) {
    // Exclude Night - handled separately by NightShiftStrategy
    // Priority: Early, Morning (rest-restricted), Late
    const allShifts = [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE];
    const compatible = [];

    for (const shift of allShifts) {
      const violation = getTransitionViolation(prevShift, shift);
      if (!violation) {
        // Prioritize shifts matching the pattern
        const matchesPattern =
          (pattern === 'day_early' && SHIFT_GROUPS.day_early.includes(shift)) ||
          (pattern === 'day_late' && SHIFT_GROUPS.day_late.includes(shift)) ||
          (pattern === 'night' && SHIFT_GROUPS.night.includes(shift));

        if (matchesPattern) {
          compatible.unshift(shift); // Add to front for priority
        } else {
          compatible.push(shift);
        }
      }
    }

    return compatible;
  }

  /**
   * Balance workload - ensure minimum shifts per week for all engineers
   */
  balanceWorkload(schedule, engineers, weeks) {
    const warnings = [];
    const coreEngineers = engineers.filter(e => !e.isFloater && !e.inTraining);

    for (const week of weeks) {
      // Calculate current shift counts
      const shiftCounts = new Map();
      for (const engineer of coreEngineers) {
        shiftCounts.set(engineer.id, this.getWeekShiftCount(schedule, engineer.id, week));
      }

      // Find engineers with too few shifts
      const underworked = coreEngineers.filter(e => {
        const count = shiftCounts.get(e.id);
        const unavailCount = week.filter(d =>
          schedule[e.id]?.[toDateString(d)] === SHIFTS.UNAVAILABLE
        ).length;
        // Only flag if they're available enough days
        return count < MIN_SHIFTS_PER_WEEK && (week.length - unavailCount) >= MIN_SHIFTS_PER_WEEK;
      });

      // Find engineers with too many shifts
      const overworked = coreEngineers.filter(e =>
        shiftCounts.get(e.id) > TARGET_SHIFTS_PER_WEEK
      );

      // Try to rebalance
      for (const under of underworked) {
        const underCount = shiftCounts.get(under.id);
        const needed = MIN_SHIFTS_PER_WEEK - underCount;

        for (let i = 0; i < needed && overworked.length > 0; i++) {
          // Find a day where we can swap
          for (const day of week) {
            const dateStr = toDateString(day);
            const underShift = schedule[under.id]?.[dateStr];

            // Skip if underworked already has a shift or is unavailable
            if (underShift !== null && underShift !== undefined) continue;
            if (underShift === SHIFTS.UNAVAILABLE) continue;

            // Find an overworked engineer with a shift on this day
            for (const over of overworked) {
              const overShift = schedule[over.id]?.[dateStr];
              if (!overShift || overShift === SHIFTS.OFF || overShift === SHIFTS.UNAVAILABLE) continue;

              // Check if underworked can take this shift (including cross-month boundary)
              const prevDateStr = toDateString(getPreviousDay(day));
              const prevShift = this.getShiftWithPrevMonth(schedule, under.id, prevDateStr);
              const violation = getTransitionViolation(prevShift, overShift);

              if (!violation) {
                // Swap: give shift to underworked, give OFF to overworked
                schedule[under.id][dateStr] = overShift;
                schedule[over.id][dateStr] = SHIFTS.OFF;
                shiftCounts.set(under.id, shiftCounts.get(under.id) + 1);
                shiftCounts.set(over.id, shiftCounts.get(over.id) - 1);
                break;
              }
            }

            // Check if we've reached minimum
            if (shiftCounts.get(under.id) >= MIN_SHIFTS_PER_WEEK) break;
          }
        }

        if (shiftCounts.get(under.id) < MIN_SHIFTS_PER_WEEK) {
          warnings.push({
            type: 'workload_imbalance',
            engineer: under.name,
            week: toDateString(week[0]),
            shifts: shiftCounts.get(under.id),
            message: `${under.name} has only ${shiftCounts.get(under.id)} shifts in week of ${toDateString(week[0])}`
          });
        }
      }
    }

    return { schedule, warnings };
  }

  /**
   * Rationality check - final pass to verify and fix any remaining issues
   */
  rationalityCheck(schedule) {
    const days = this.getDays();
    const weeks = this.getWeeksInMonth();
    const fixes = [];
    const warnings = [];

    // 1. Check and fix consecutive OFF days per week
    for (const engineer of this.engineers) {
      if (engineer.isFloater || engineer.inTraining) continue;

      for (const week of weeks) {
        const offDays = [];
        const workDays = [];

        for (const day of week) {
          const dateStr = toDateString(day);
          const shift = schedule[engineer.id]?.[dateStr];
          if (shift === SHIFTS.OFF) {
            offDays.push(day);
          } else if (shift && shift !== SHIFTS.UNAVAILABLE) {
            workDays.push(day);
          }
        }

        // Check for 2 consecutive OFF days
        let hasConsecutiveOff = false;
        for (let i = 0; i < offDays.length - 1; i++) {
          const diff = Math.abs(offDays[i + 1].getTime() - offDays[i].getTime()) / (1000 * 60 * 60 * 24);
          if (diff === 1) {
            hasConsecutiveOff = true;
            break;
          }
        }

        if (offDays.length >= 2 && !hasConsecutiveOff) {
          // Try to make two OFF days consecutive
          for (let i = 0; i < week.length - 1; i++) {
            const day1 = week[i];
            const day2 = week[i + 1];
            const dateStr1 = toDateString(day1);
            const dateStr2 = toDateString(day2);
            const shift1 = schedule[engineer.id]?.[dateStr1];
            const shift2 = schedule[engineer.id]?.[dateStr2];

            // If one is OFF and one is a work shift, try to swap to make consecutive
            if (shift1 === SHIFTS.OFF && shift2 && shift2 !== SHIFTS.OFF && shift2 !== SHIFTS.UNAVAILABLE) {
              // Look for another day to swap shift2 to
              for (const swapDay of week) {
                const swapDateStr = toDateString(swapDay);
                if (swapDateStr === dateStr1 || swapDateStr === dateStr2) continue;
                const swapShift = schedule[engineer.id]?.[swapDateStr];

                if (swapShift === null || swapShift === undefined) {
                  // Check transition validity
                  const prevDateStr = toDateString(getPreviousDay(swapDay));
                  const prevShift = schedule[engineer.id]?.[prevDateStr];
                  const violation = getTransitionViolation(prevShift, shift2);

                  if (!violation) {
                    schedule[engineer.id][swapDateStr] = shift2;
                    schedule[engineer.id][dateStr2] = SHIFTS.OFF;
                    fixes.push({
                      engineer: engineer.name,
                      action: 'consecutive_off_fix',
                      message: `Made ${dateStr1} and ${dateStr2} consecutive OFF days for ${engineer.name}`
                    });
                    hasConsecutiveOff = true;
                    break;
                  }
                }
              }
              if (hasConsecutiveOff) break;
            }
          }

          if (!hasConsecutiveOff) {
            warnings.push({
              type: 'non_consecutive_off',
              engineer: engineer.name,
              week: toDateString(week[0]),
              message: `${engineer.name} does not have consecutive OFF days in week of ${toDateString(week[0])}`
            });
          }
        }
      }
    }

    // 2. Check for consecutive work days > 6 (including previous month's trailing days)
    for (const engineer of this.engineers) {
      // Start with previous month's trailing work days
      let consecutiveCount = this.getPrevMonthTrailingWorkDays(engineer.id);
      let streakStart = null;

      for (const day of days) {
        const dateStr = toDateString(day);
        const shift = schedule[engineer.id]?.[dateStr];

        if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
          if (consecutiveCount === 0) streakStart = day;
          consecutiveCount++;

          if (consecutiveCount > ArbZG.MAX_CONSECUTIVE_WORK_DAYS) {
            // Try to insert an OFF day
            const fixDateStr = toDateString(day);
            const prevDateStr = toDateString(getPreviousDay(day));

            // Change current day to OFF if possible
            schedule[engineer.id][fixDateStr] = SHIFTS.OFF;
            consecutiveCount = 0;
            fixes.push({
              engineer: engineer.name,
              action: 'consecutive_work_fix',
              message: `Changed ${fixDateStr} to OFF for ${engineer.name} to break consecutive work streak`
            });
          }
        } else {
          consecutiveCount = 0;
        }
      }
    }

    // 3. Check transition violations (including cross-month boundary for day 0)
    for (const engineer of this.engineers) {
      // Check transition from previous month's last day to first day of this month
      if (days.length > 0) {
        const firstDateStr = toDateString(days[0]);
        const firstShift = schedule[engineer.id]?.[firstDateStr];
        const prevMonthLastDateStr = toDateString(getPreviousDay(days[0]));
        const prevMonthLastShift = this.getShiftWithPrevMonth(schedule, engineer.id, prevMonthLastDateStr);

        if (prevMonthLastShift) {
          const crossViolation = getTransitionViolation(prevMonthLastShift, firstShift);
          if (crossViolation) {
            const compatible = this.getCompatibleShifts(null, prevMonthLastShift);
            if (compatible.length > 0 && compatible[0] !== firstShift) {
              schedule[engineer.id][firstDateStr] = compatible[0];
              fixes.push({
                engineer: engineer.name,
                action: 'transition_fix_cross_month',
                message: `Changed ${firstDateStr} from ${firstShift} to ${compatible[0]} for ${engineer.name} to fix cross-month ${prevMonthLastShift}→${firstShift} violation`
              });
            } else {
              schedule[engineer.id][firstDateStr] = SHIFTS.OFF;
              fixes.push({
                engineer: engineer.name,
                action: 'transition_fix_cross_month_off',
                message: `Changed ${firstDateStr} to OFF for ${engineer.name} to fix cross-month ${prevMonthLastShift}→${firstShift} violation`
              });
            }
          }
        }
      }

      for (let i = 1; i < days.length; i++) {
        const prevDateStr = toDateString(days[i - 1]);
        const currDateStr = toDateString(days[i]);
        const prevShift = schedule[engineer.id]?.[prevDateStr];
        const currShift = schedule[engineer.id]?.[currDateStr];

        const violation = getTransitionViolation(prevShift, currShift);
        if (violation) {
          // Try to fix by changing current shift to OFF or a compatible shift
          const compatible = this.getCompatibleShifts(null, prevShift);
          if (compatible.length > 0 && compatible[0] !== currShift) {
            schedule[engineer.id][currDateStr] = compatible[0];
            fixes.push({
              engineer: engineer.name,
              action: 'transition_fix',
              message: `Changed ${currDateStr} from ${currShift} to ${compatible[0]} for ${engineer.name} to fix ${prevShift}→${currShift} violation`
            });
          } else {
            schedule[engineer.id][currDateStr] = SHIFTS.OFF;
            fixes.push({
              engineer: engineer.name,
              action: 'transition_fix_off',
              message: `Changed ${currDateStr} to OFF for ${engineer.name} to fix ${prevShift}→${currShift} violation`
            });
          }
        }
      }
    }

    return { schedule, fixes, warnings };
  }

  /**
   * Generate recovery options when constraints fail
   */
  generateRecoveryOptions(errors) {
    const options = [];

    const coverageErrors = errors.filter(e =>
      e.type === 'coverage_failure' || e.type === 'coverage_violation'
    );
    const offDayErrors = errors.filter(e => e.type === 'off_day_violation');
    const laborLawErrors = errors.filter(e =>
      e.type === 'ARBZG_CONSECUTIVE_DAYS' || e.type === 'ARBZG_REST_PERIOD'
    );

    if (coverageErrors.length > 0) {
      const affectedShifts = [...new Set(coverageErrors.map(e => e.shift))];
      options.push({
        id: 'relax_coverage',
        title: 'Relax Coverage Requirements',
        description: `Reduce minimum coverage for ${affectedShifts.join(', ')} shifts by 1`,
        impact: 'Lower staffing on some shifts',
        severity: 'medium'
      });

      options.push({
        id: 'increase_floater_hours',
        title: 'Increase Floater Availability',
        description: 'Allow floaters to work up to 4 shifts per week',
        impact: 'Floaters work more hours',
        severity: 'low'
      });
    }

    if (offDayErrors.length > 0) {
      options.push({
        id: 'reduce_off_days',
        title: 'Flexible OFF Days',
        description: 'Allow 1 OFF day per week instead of 2 when coverage is tight',
        impact: 'Some engineers may work more consecutive days',
        severity: 'high'
      });
    }

    if (laborLawErrors.length > 0) {
      options.push({
        id: 'labor_law_review',
        title: 'Review Labor Law Compliance',
        description: 'Manual review required - automatic scheduling cannot violate German labor law',
        impact: 'May need to hire temporary staff',
        severity: 'critical'
      });
    }

    options.push({
      id: 'manual_edit',
      title: 'Manual Schedule Adjustment',
      description: 'Open the schedule editor to manually adjust shifts',
      impact: 'Full control, but requires careful attention to rules',
      severity: 'none'
    });

    return options.slice(0, 5);
  }

  /**
   * Fill any remaining null slots intelligently
   * First tries to assign work shifts to engineers with low shift counts,
   * then fills remaining slots with OFF
   */
  fillNullSlots(schedule) {
    const days = this.getDays();
    const weeks = this.getWeeksInMonth();
    const filled = {};

    // Copy schedule
    for (const engineer of this.engineers) {
      filled[engineer.id] = { ...(schedule[engineer.id] || {}) };
    }

    // First pass: try to assign work shifts to under-scheduled engineers
    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);

    for (const week of weeks) {
      // Calculate shift counts
      const shiftCounts = new Map();
      for (const engineer of coreEngineers) {
        shiftCounts.set(engineer.id, this.getWeekShiftCount(filled, engineer.id, week));
      }

      // Find null slots and try to fill with work shifts for under-scheduled engineers
      for (const day of week) {
        const dateStr = toDateString(day);
        const isWknd = isWeekend(day);
        const dayCoverage = isWknd ? this.coverage.weekend : this.coverage.weekday;

        // Priority: Early first, Morning (has rest restrictions), then Late
        for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE]) {
          // Count current coverage for this shift
          const currentCoverage = coreEngineers.filter(e =>
            filled[e.id][dateStr] === shift
          ).length;

          const minRequired = dayCoverage[shift]?.min || 2;

          // If under coverage, try to assign from engineers with null slots
          if (currentCoverage < minRequired) {
            // Sort engineers by shift count (ascending) with randomization for ties
            const candidates = shuffleArray(coreEngineers.filter(engineer => {
              const currentValue = filled[engineer.id][dateStr];
              if (currentValue !== null && currentValue !== undefined) return false;

              // Check transition validity (including cross-month boundary)
              const prevDateStr = toDateString(getPreviousDay(day));
              const prevShift = this.getShiftWithPrevMonth(filled, engineer.id, prevDateStr);
              const violation = getTransitionViolation(prevShift, shift);
              if (violation) return false;

              // Check consecutive work days (including previous month's trailing days)
              let consecutive = 0;
              const dayIdx = days.indexOf(day);
              for (let i = dayIdx - 1; i >= 0 && consecutive < 6; i--) {
                const checkDateStr = toDateString(days[i]);
                const checkShift = filled[engineer.id]?.[checkDateStr];
                if (checkShift && checkShift !== SHIFTS.OFF && checkShift !== SHIFTS.UNAVAILABLE) {
                  consecutive++;
                } else {
                  break;
                }
              }
              // If we reached the start of the month without a break, add previous month trailing days
              if (dayIdx - consecutive <= 0 && consecutive < 6) {
                consecutive += this.getPrevMonthTrailingWorkDays(engineer.id);
              }
              // German law allows up to 6 consecutive work days
              if (consecutive >= 6) return false;

              // Check if engineer can work this shift based on preferences
              if (!this.canWorkShift(engineer, shift, day)) return false;

              return true;
            })).sort((a, b) => shiftCounts.get(a.id) - shiftCounts.get(b.id));

            let filledCount = currentCoverage;
            for (const engineer of candidates) {
              if (filledCount >= minRequired) break;
              // When under coverage, always allow up to legal max (6 shifts/week)
              // Only use standard limit (5) when coverage is already met
              const weekLimit = ArbZG.MAX_CONSECUTIVE_WORK_DAYS;
              if (shiftCounts.get(engineer.id) >= weekLimit) continue;

              filled[engineer.id][dateStr] = shift;
              shiftCounts.set(engineer.id, shiftCounts.get(engineer.id) + 1);
              filledCount++;
            }
          }
        }
      }
    }

    // Second pass: fill remaining null slots with OFF
    for (const engineer of this.engineers) {
      for (const day of days) {
        const dateStr = toDateString(day);
        if (filled[engineer.id][dateStr] === null || filled[engineer.id][dateStr] === undefined) {
          filled[engineer.id][dateStr] = SHIFTS.OFF;
        }
      }
    }

    return filled;
  }

  /**
   * Aggressive coverage repair pass
   * Tries to fix remaining coverage gaps by:
   * 1. Finding engineers with OFF on under-covered days
   * 2. Moving their OFF day to a different day in the same week
   * 3. Assigning them to the under-covered shift
   */
  repairCoverageGaps(schedule) {
    const days = this.getDays();
    const weeks = this.getWeeksInMonth();
    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);
    let repairCount = 0;

    // Find all coverage gaps
    for (const day of days) {
      const dateStr = toDateString(day);
      const isWknd = isWeekend(day);
      const dayCoverage = isWknd ? this.coverage.weekend : this.coverage.weekday;

      // Check each shift for coverage gaps (Early, Morning, Late, Night)
      for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT]) {
        const currentCoverage = coreEngineers.filter(e =>
          schedule[e.id][dateStr] === shift
        ).length;

        const minRequired = dayCoverage[shift]?.min || 2;

        if (currentCoverage >= minRequired) continue;

        // Find the week this day belongs to
        const weekIndex = weeks.findIndex(w => w.some(d => toDateString(d) === dateStr));
        if (weekIndex < 0) continue;
        const week = weeks[weekIndex];

        // Find engineers with OFF on this day who could work this shift
        const candidates = coreEngineers.filter(eng => {
          if (schedule[eng.id][dateStr] !== SHIFTS.OFF) return false;

          // Check if they can work this shift (preferences)
          if (!this.canWorkShift(eng, shift, day)) return false;

          // Check transition validity
          const prevDateStr = toDateString(getPreviousDay(day));
          const prevShift = this.getShiftWithPrevMonth(schedule, eng.id, prevDateStr);
          const violation = getTransitionViolation(prevShift, shift);
          if (violation) return false;

          // Check next day transition
          const nextDay = days[days.indexOf(day) + 1];
          if (nextDay) {
            const nextDateStr = toDateString(nextDay);
            const nextShift = schedule[eng.id][nextDateStr];
            const nextViolation = getTransitionViolation(shift, nextShift);
            if (nextViolation) return false;
          }

          return true;
        });

        // Try to reassign each candidate
        for (const engineer of candidates) {
          if (currentCoverage >= minRequired) break;

          // Find an alternative day in the same week to move their OFF to
          let moved = false;
          for (const altDay of shuffleArray([...week])) {
            const altDateStr = toDateString(altDay);
            if (altDateStr === dateStr) continue;

            const altShift = schedule[engineer.id][altDateStr];
            // Must have a work shift we can convert to OFF
            if (!altShift || altShift === SHIFTS.OFF || altShift === SHIFTS.UNAVAILABLE) continue;

            // Check if converting this day to OFF would hurt coverage
            const altIsWknd = isWeekend(altDay);
            const altDayCoverage = altIsWknd ? this.coverage.weekend : this.coverage.weekday;
            const altCoverage = coreEngineers.filter(e =>
              schedule[e.id][altDateStr] === altShift
            ).length;

            // Only allow if alternative day has surplus coverage
            if (altCoverage <= altDayCoverage[altShift]?.min) continue;

            // Check that we maintain 2 consecutive OFF days requirement
            // Find the other OFF day(s) in this week
            const offDays = week.filter(d =>
              schedule[engineer.id][toDateString(d)] === SHIFTS.OFF &&
              toDateString(d) !== dateStr // Exclude the day we're converting
            );

            // After the swap: we remove dateStr from OFF, add altDateStr to OFF
            // Check if altDateStr would be consecutive with another OFF day
            let hasConsecutiveOff = false;
            const altDayIndex = week.indexOf(altDay);
            if (altDayIndex > 0) {
              const prevWeekDay = week[altDayIndex - 1];
              if (schedule[engineer.id][toDateString(prevWeekDay)] === SHIFTS.OFF ||
                  toDateString(prevWeekDay) === altDateStr) {
                hasConsecutiveOff = true;
              }
            }
            if (altDayIndex < week.length - 1 && !hasConsecutiveOff) {
              const nextWeekDay = week[altDayIndex + 1];
              if (schedule[engineer.id][toDateString(nextWeekDay)] === SHIFTS.OFF) {
                hasConsecutiveOff = true;
              }
            }

            // If we can't maintain consecutive OFF, skip
            if (!hasConsecutiveOff && offDays.length < 2) continue;

            // Perform the swap
            schedule[engineer.id][dateStr] = shift;
            schedule[engineer.id][altDateStr] = SHIFTS.OFF;
            moved = true;
            repairCount++;
            break;
          }

          if (moved) {
            // Recalculate coverage for this shift
            const newCoverage = coreEngineers.filter(e =>
              schedule[e.id][dateStr] === shift
            ).length;
            if (newCoverage >= minRequired) break;
          }
        }
      }
    }

    if (repairCount > 0) {
      this.warnings.push({
        type: 'coverage_repair',
        message: `Repaired ${repairCount} coverage gaps by reassigning OFF days`
      });
    }

    return schedule;
  }

  /**
   * Generate schedule for a single week
   */
  solveWeek(schedule, weekIndex, weeks, coreEngineers, days) {
    const week = weeks[weekIndex];
    const weekDays = week;
    const errors = [];

    // For week 1, do full constraint solving
    // For subsequent weeks, we've already copied the template

    // Night shifts for this week (handled by cohort blocks)
    // Day shifts for this week
    for (const day of weekDays) {
      const dateStr = toDateString(day);
      const isWknd = isWeekend(day);
      const dayCoverage = isWknd ? this.coverage.weekend : this.coverage.weekday;

      // Assign Early first, then Morning (has rest restrictions), then Late
      for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE]) {
        const minRequired = dayCoverage[shift]?.min || 2;

        // Get eligible engineers for this shift
        const eligible = shuffleArray(coreEngineers.filter(engineer => {
          // Must have null slot
          const current = schedule[engineer.id]?.[dateStr];
          if (current !== null && current !== undefined) return false;

          // Check transition validity (including cross-month boundary)
          const prevDateStr = toDateString(getPreviousDay(day));
          const prevShift = this.getShiftWithPrevMonth(schedule, engineer.id, prevDateStr);
          const violation = getTransitionViolation(prevShift, shift);
          if (violation) return false;

          // Check consecutive work days (including previous month's trailing days)
          let consecutive = 0;
          const dayIndex = days.findIndex(d => toDateString(d) === dateStr);
          for (let i = dayIndex - 1; i >= 0 && consecutive < 6; i--) {
            const checkDateStr = toDateString(days[i]);
            const checkShift = schedule[engineer.id]?.[checkDateStr];
            if (checkShift && checkShift !== SHIFTS.OFF && checkShift !== SHIFTS.UNAVAILABLE) {
              consecutive++;
            } else {
              break;
            }
          }
          // If we reached the start of the month without a break, add previous month trailing days
          if (dayIndex - consecutive <= 0 && consecutive < 6) {
            consecutive += this.getPrevMonthTrailingWorkDays(engineer.id);
          }
          // German law allows up to 6 consecutive work days (ArbZG.MAX_CONSECUTIVE_WORK_DAYS)
          if (consecutive >= 6) return false;

          // Check if engineer can work this shift based on preferences
          if (!this.canWorkShift(engineer, shift, day)) return false;

          return true;
        }));

        // Score and sort engineers
        const scored = eligible.map(engineer => {
          let score = 0;

          // Consistency bonus: prefer engineers who match their pattern
          if (weekIndex > 0) {
            const { pattern } = this.getDominantPattern(schedule, engineer.id, weeks[weekIndex - 1]);
            const matchesPattern =
              (pattern === 'day_early' && SHIFT_GROUPS.day_early.includes(shift)) ||
              (pattern === 'day_late' && SHIFT_GROUPS.day_late.includes(shift)) ||
              (pattern === 'night' && SHIFT_GROUPS.night.includes(shift));
            if (matchesPattern) score += 30;
          }

          // Preference bonus
          if (engineer.preferences?.includes(shift)) score += 15;

          // Workload balance: favor engineers with fewer shifts this week
          const weekShiftCount = this.getWeekShiftCount(schedule, engineer.id, week);
          score -= weekShiftCount * 10;

          // T1 tier bonus
          if (engineer.tier === 'T1') score += 5;

          // Add small random factor for tie-breaking
          score += Math.random() * 2;

          return { engineer, score };
        }).sort((a, b) => b.score - a.score);

        // Assign shifts - first pass with normal weekly limit
        let assigned = 0;
        for (const { engineer } of scored) {
          if (assigned >= minRequired) break;

          // Check week shift limit
          const weekShifts = this.getWeekShiftCount(schedule, engineer.id, week);
          if (weekShifts >= TARGET_SHIFTS_PER_WEEK) continue;

          schedule[engineer.id][dateStr] = shift;
          assigned++;
        }

        // Overflow pass: if coverage still not met, allow up to 6 shifts/week (legal max)
        if (assigned < minRequired) {
          for (const { engineer } of scored) {
            if (assigned >= minRequired) break;

            // Skip already-assigned engineers
            if (schedule[engineer.id]?.[dateStr] === shift) continue;
            if (schedule[engineer.id]?.[dateStr] !== null && schedule[engineer.id]?.[dateStr] !== undefined) continue;

            const weekShifts = this.getWeekShiftCount(schedule, engineer.id, week);
            // Allow up to 6 shifts/week (German law max) for coverage needs
            if (weekShifts >= ArbZG.MAX_CONSECUTIVE_WORK_DAYS) continue;

            schedule[engineer.id][dateStr] = shift;
            assigned++;
          }
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

    return { schedule, errors };
  }

  /**
   * Main solve function - Week-by-Week Generation with Interleaved OFF Assignment
   * Pipeline: Initialize → Training → Night shifts → [Day shifts + OFF per week] → Floaters →
   *           Fill nulls → Balance → Rationality check → Validate
   *
   * CRITICAL FIX (v3.3.0): OFF days are now assigned IMMEDIATELY after each week's
   * day shifts, not after all weeks. This fixes the consecutive work day check bug
   * where engineers who worked 5 days in week N were blocked from week N+1 because
   * their OFF days hadn't been assigned yet.
   *
   * Each week is solved independently by solveWeek. Shift pattern consistency is
   * maintained via the scoring system (consistency bonus for matching previous week's
   * dominant shift group) rather than rigid template copying.
   */
  solve() {
    this.violations = [];
    this.warnings = [];
    const collectedErrors = [];

    const days = this.getDays();
    const weeks = this.getWeeksInMonth();

    // Separate engineers by type
    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);
    const floaters = this.engineers.filter(e => e.isFloater);
    const trainingEngineers = this.engineers.filter(e => e.inTraining);

    if (floaters.length > 2) {
      this.warnings.push({
        type: 'configuration',
        message: `Too many floaters (${floaters.length}). Maximum is 2.`
      });
    }

    // Step 1: Initialize schedule with unavailable days
    let schedule = this.initializeSchedule();

    // Step 2: Assign training engineers (entire month)
    schedule = this.assignTrainingShifts(schedule);

    // Step 3: Assign night shifts (entire month - uses 2-week cohort blocks)
    // Pass prevMonthTail for cross-month context
    const nightResult = this.nightStrategy.execute(
      schedule, coreEngineers, days, weeks, this.prevMonthTail
    );
    if (nightResult.schedule) {
      schedule = nightResult.schedule;
    }
    if (!nightResult.success) {
      collectedErrors.push(...(nightResult.errors || []));
    }
    this.warnings.push(...(nightResult.warnings || []));

    // Step 4: Week-by-Week Generation for day shifts WITH interleaved OFF assignment
    // Each week: assign shifts, then immediately assign OFF days
    // This ensures the consecutive work day check for week N+1 sees week N's OFF days
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      // 4a: Assign day shifts for this week
      const weekResult = this.solveWeek(schedule, weekIndex, weeks, coreEngineers, days);
      schedule = weekResult.schedule;
      if (weekResult.errors.length > 0) {
        collectedErrors.push(...weekResult.errors);
      }

      // 4b: Immediately assign OFF days for this week (CRITICAL for consecutive check)
      // This ensures the next week's eligibility filter sees OFF days as breaks
      const offResult = this.assignOffDaysForWeek(schedule, weeks[weekIndex], weekIndex, weeks);
      schedule = offResult.schedule;
      if (offResult.errors.length > 0) {
        this.warnings.push(...offResult.errors.map(e => ({ ...e, demoted: true })));
      }
    }

    // Step 5: (Removed - OFF days now assigned per-week in step 4b)

    // Step 6: Add floaters
    const floaterResult = this.floaterStrategy.execute(schedule, this.engineers, days, weeks);
    schedule = floaterResult.schedule;
    this.warnings.push(...(floaterResult.warnings || []));

    // Step 7: Fill any remaining null slots intelligently
    schedule = this.fillNullSlots(schedule);

    // Step 7b: Aggressive coverage repair - swap OFF days to fill remaining gaps
    schedule = this.repairCoverageGaps(schedule);

    // Step 8: Balance workload
    const workloadResult = this.balanceWorkload(schedule, this.engineers, weeks);
    schedule = workloadResult.schedule;
    this.warnings.push(...workloadResult.warnings);

    // Step 9: Rationality check - final pass to fix any remaining issues
    const rationalityResult = this.rationalityCheck(schedule);
    schedule = rationalityResult.schedule;
    if (rationalityResult.fixes.length > 0) {
      this.warnings.push({
        type: 'rationality_fixes',
        message: `Applied ${rationalityResult.fixes.length} automatic fixes during rationality check`,
        details: rationalityResult.fixes
      });
    }
    this.warnings.push(...rationalityResult.warnings);

    // Step 10: Validate final schedule
    const validation = this.validateSchedule(schedule);
    const allErrors = [...collectedErrors, ...(validation.valid ? [] : validation.errors)];

    // Calculate stats
    this.stats = this.calculateStats(schedule);

    if (allErrors.length === 0) {
      return {
        success: true,
        schedule,
        warnings: this.warnings,
        stats: this.stats,
        version: '3.6.0'
      };
    }

    // Return complete schedule with errors for manual review/editing
    const options = this.generateRecoveryOptions(allErrors);
    return {
      success: false,
      errors: allErrors,
      schedule,
      partialSchedule: schedule,
      options,
      warnings: this.warnings,
      stats: this.stats,
      canManualEdit: true,
      version: '3.6.0'
    };
  }

  /**
   * Handle failure with recovery options (kept for backward compatibility)
   */
  handleFailure(errors, partialSchedule) {
    const filledSchedule = this.fillNullSlots(partialSchedule);
    const options = this.generateRecoveryOptions(errors);
    this.stats = this.calculateStats(filledSchedule);

    return {
      success: false,
      errors,
      schedule: filledSchedule,
      partialSchedule: filledSchedule,
      options,
      warnings: this.warnings,
      stats: this.stats,
      canManualEdit: true,
      version: '3.0.0'
    };
  }
}

// Export constants for external use
export { SHIFTS, SHIFT_TIMES, COLORS };

export default Scheduler;
