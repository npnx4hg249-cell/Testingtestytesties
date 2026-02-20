/**
 * Main Schedule Generator
 * Orchestrates all scheduling components for 24/7 shift schedule generation
 *
 * Version: 3.0.0
 * Week-by-week generation with template copying for consistency
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
const MAX_ITERATIONS = 250;
const TARGET_SHIFTS_PER_WEEK = 5; // Target 5 working days per week for core engineers
const MIN_SHIFTS_PER_WEEK = 4;   // Minimum shifts to avoid month-off scenarios

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
   * Initialize empty schedule with unavailable days
   */
  initializeSchedule() {
    const schedule = {};
    const days = this.getDays();

    for (const engineer of this.engineers) {
      schedule[engineer.id] = {};

      for (const day of days) {
        const dateStr = toDateString(day);

        if (!this.isEngineerAvailable(engineer, day)) {
          schedule[engineer.id][dateStr] = SHIFTS.UNAVAILABLE;
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
   * Assign OFF days to ensure 2 consecutive days per week (HARD constraint)
   */
  assignOffDays(schedule) {
    const days = this.getDays();
    const weeks = this.getWeeksInMonth();
    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);
    const errors = [];

    for (const engineer of coreEngineers) {
      // Special handling for fixed off days (if configured)
      if (engineer.fixedOffDays) {
        for (const day of days) {
          const dayOfWeek = day.getDay();
          const dateStr = toDateString(day);

          if (engineer.fixedOffDays.includes(dayOfWeek) &&
              schedule[engineer.id][dateStr] === null) {
            schedule[engineer.id][dateStr] = SHIFTS.OFF;
          }
        }
        continue;
      }

      // For each week, ensure 2 CONSECUTIVE OFF days (hard constraint)
      for (const week of weeks) {
        const unavailableDays = week.filter(d => {
          const dateStr = toDateString(d);
          return schedule[engineer.id][dateStr] === SHIFTS.UNAVAILABLE;
        }).length;

        // Check if we already have consecutive OFF days
        const existingOffDays = week.filter(d => {
          const dateStr = toDateString(d);
          return schedule[engineer.id][dateStr] === SHIFTS.OFF;
        });

        let hasConsecutiveOff = false;
        for (let i = 0; i < existingOffDays.length - 1; i++) {
          const diff = Math.abs(existingOffDays[i + 1].getTime() - existingOffDays[i].getTime()) / (1000 * 60 * 60 * 24);
          if (diff === 1) {
            hasConsecutiveOff = true;
            break;
          }
        }

        // If we already have consecutive OFF days, skip
        if (hasConsecutiveOff && existingOffDays.length >= 2) continue;

        // Get all possible consecutive pairs from the week (including already assigned days)
        const availableForOff = week.filter(d => {
          const dateStr = toDateString(d);
          const shift = schedule[engineer.id][dateStr];
          // Can assign OFF to null slots or existing work shifts (will override)
          return shift === null || shift === undefined ||
                 (shift !== SHIFTS.UNAVAILABLE && shift !== SHIFTS.OFF);
        });

        // Find best consecutive pair for OFF days
        let bestPair = null;
        let bestScore = -Infinity;

        for (let i = 0; i < availableForOff.length - 1; i++) {
          const day1 = availableForOff[i];
          const day2 = availableForOff[i + 1];

          // Check if consecutive calendar days
          const diff = Math.abs(day2.getTime() - day1.getTime()) / (1000 * 60 * 60 * 24);
          if (diff === 1) {
            let score = 0;

            // Strongly prefer weekend days
            if (isWeekend(day1)) score += 10;
            if (isWeekend(day2)) score += 10;

            // Prefer holidays
            if (this.isHoliday(day1, engineer.state)) score += 5;
            if (this.isHoliday(day2, engineer.state)) score += 5;

            // Prefer null slots over overriding existing shifts
            const shift1 = schedule[engineer.id][toDateString(day1)];
            const shift2 = schedule[engineer.id][toDateString(day2)];
            if (shift1 === null || shift1 === undefined) score += 3;
            if (shift2 === null || shift2 === undefined) score += 3;

            // Prefer if already has one OFF day adjacent
            if (shift1 === SHIFTS.OFF || shift2 === SHIFTS.OFF) score += 8;

            if (score > bestScore) {
              bestScore = score;
              bestPair = [day1, day2];
            }
          }
        }

        if (bestPair) {
          schedule[engineer.id][toDateString(bestPair[0])] = SHIFTS.OFF;
          schedule[engineer.id][toDateString(bestPair[1])] = SHIFTS.OFF;
        } else {
          // No consecutive pair found - try to find any 2 days
          const unassigned = week.filter(d => {
            const dateStr = toDateString(d);
            const shift = schedule[engineer.id][dateStr];
            return shift === null || shift === undefined;
          });

          // Assign non-consecutive OFF days as fallback (not ideal but better than none)
          const sorted = shuffleArray([...unassigned]).sort((a, b) => {
            let aScore = isWeekend(a) ? 10 : 0;
            let bScore = isWeekend(b) ? 10 : 0;
            aScore += this.isHoliday(a, engineer.state) ? 5 : 0;
            bScore += this.isHoliday(b, engineer.state) ? 5 : 0;
            return bScore - aScore;
          });

          const needed = 2 - existingOffDays.length;
          for (let i = 0; i < Math.min(needed, sorted.length); i++) {
            schedule[engineer.id][toDateString(sorted[i])] = SHIFTS.OFF;
          }
        }

        // Verify consecutive OFF days
        const finalOffDays = week.filter(d => {
          const dateStr = toDateString(d);
          return schedule[engineer.id][dateStr] === SHIFTS.OFF;
        });

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
    }

    return { schedule, errors };
  }

  /**
   * Validate the complete schedule
   */
  validateSchedule(schedule) {
    const days = this.getDays();
    const weeks = this.getWeeksInMonth();
    const errors = [];

    const coreEngineers = this.engineers.filter(e => !e.isFloater && !e.inTraining);
    const floaters = this.engineers.filter(e => e.isFloater);

    // 1. Check coverage
    for (const day of days) {
      const dateStr = toDateString(day);
      const isWknd = isWeekend(day);
      const dayCoverage = isWknd ? this.coverage.weekend : this.coverage.weekday;

      for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT]) {
        const coreCoverage = coreEngineers.filter(e =>
          schedule[e.id][dateStr] === shift
        ).length;

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
      }
    }

    // 2. Check German labor law compliance
    for (const engineer of this.engineers) {
      const violations = validateScheduleCompliance(schedule, engineer.id, days);
      errors.push(...violations);
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
        if (sourceShift && sourceShift !== SHIFTS.UNAVAILABLE) {
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
    const allShifts = [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT];
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

              // Check if underworked can take this shift
              const prevDateStr = toDateString(getPreviousDay(day));
              const prevShift = schedule[under.id]?.[prevDateStr];
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

    // 2. Check for consecutive work days > 6
    for (const engineer of this.engineers) {
      let consecutiveCount = 0;
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

    // 3. Check transition violations
    for (const engineer of this.engineers) {
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

              // Check transition validity
              const prevDateStr = toDateString(getPreviousDay(day));
              const prevShift = filled[engineer.id]?.[prevDateStr];
              const violation = getTransitionViolation(prevShift, shift);
              if (violation) return false;

              // Check consecutive work days
              let consecutive = 0;
              for (let i = days.indexOf(day) - 1; i >= 0 && consecutive < 6; i--) {
                const checkDateStr = toDateString(days[i]);
                const checkShift = filled[engineer.id]?.[checkDateStr];
                if (checkShift && checkShift !== SHIFTS.OFF && checkShift !== SHIFTS.UNAVAILABLE) {
                  consecutive++;
                } else {
                  break;
                }
              }
              if (consecutive >= 5) return false;

              return true;
            })).sort((a, b) => shiftCounts.get(a.id) - shiftCounts.get(b.id));

            for (const engineer of candidates) {
              if (currentCoverage >= minRequired) break;
              if (shiftCounts.get(engineer.id) >= TARGET_SHIFTS_PER_WEEK) continue;

              filled[engineer.id][dateStr] = shift;
              shiftCounts.set(engineer.id, shiftCounts.get(engineer.id) + 1);
              break; // Only assign one engineer at a time to this shift
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

      for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE]) {
        const minRequired = dayCoverage[shift]?.min || 2;

        // Get eligible engineers for this shift
        const eligible = shuffleArray(coreEngineers.filter(engineer => {
          // Must have null slot
          const current = schedule[engineer.id]?.[dateStr];
          if (current !== null && current !== undefined) return false;

          // Check transition validity
          const prevDateStr = toDateString(getPreviousDay(day));
          const prevShift = schedule[engineer.id]?.[prevDateStr];
          const violation = getTransitionViolation(prevShift, shift);
          if (violation) return false;

          // Check consecutive work days
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
          if (consecutive >= 5) return false;

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

        // Assign shifts
        let assigned = 0;
        for (const { engineer } of scored) {
          if (assigned >= minRequired) break;

          // Check week shift limit
          const weekShifts = this.getWeekShiftCount(schedule, engineer.id, week);
          if (weekShifts >= TARGET_SHIFTS_PER_WEEK) continue;

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

    return { schedule, errors };
  }

  /**
   * Main solve function - Week-by-Week Generation
   * Generates week 1 with full constraints, then copies template to subsequent weeks.
   * Always produces a complete schedule, even if constraints are violated.
   * Returns success:true if no errors, success:false with errors and the
   * best-available schedule if constraints could not be fully satisfied.
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
    const nightResult = this.nightStrategy.execute(schedule, coreEngineers, days, weeks);
    if (nightResult.schedule) {
      schedule = nightResult.schedule;
    }
    if (!nightResult.success) {
      collectedErrors.push(...(nightResult.errors || []));
    }
    this.warnings.push(...(nightResult.warnings || []));

    // Step 4: Week-by-Week Generation for day shifts
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      if (weekIndex > 0) {
        // Copy template from previous week before solving
        schedule = this.copyWeekTemplate(schedule, coreEngineers, weeks[weekIndex - 1], weeks[weekIndex]);
      }

      // Solve this week (fills in remaining slots)
      const weekResult = this.solveWeek(schedule, weekIndex, weeks, coreEngineers, days);
      schedule = weekResult.schedule;
      if (weekResult.errors.length > 0) {
        collectedErrors.push(...weekResult.errors);
      }
    }

    // Step 5: Assign OFF days (ensures 2 consecutive per week)
    const offResult = this.assignOffDays(schedule);
    schedule = offResult.schedule;
    if (offResult.errors.length > 0) {
      this.warnings.push(...offResult.errors.map(e => ({ ...e, demoted: true })));
    }

    // Step 6: Add floaters
    const floaterResult = this.floaterStrategy.execute(schedule, this.engineers, days, weeks);
    schedule = floaterResult.schedule;
    this.warnings.push(...(floaterResult.warnings || []));

    // Step 7: Fill any remaining null slots intelligently
    schedule = this.fillNullSlots(schedule);

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
        version: '3.0.0'
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
      version: '3.0.0'
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
