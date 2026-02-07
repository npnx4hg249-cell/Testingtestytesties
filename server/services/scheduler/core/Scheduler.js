/**
 * Main Schedule Generator
 * Orchestrates all scheduling components for 24/7 shift schedule generation
 *
 * Version: 2.0.0
 * Modular architecture for maintainability and updates
 */

import { SHIFTS, DEFAULT_COVERAGE, COLORS, SHIFT_TIMES } from '../config/defaults.js';
import { ArbZG, validateScheduleCompliance, getTransitionViolation } from '../rules/GermanLaborLaws.js';
import { toDateString, getMonthDays, getWeeks, isWeekend, format as formatDate } from '../utils/DateUtils.js';
import { format } from 'date-fns';

import { NightShiftStrategy } from '../strategies/NightShiftStrategy.js';
import { DayShiftStrategy } from '../strategies/DayShiftStrategy.js';
import { FloaterStrategy } from '../strategies/FloaterStrategy.js';

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
   * Assign OFF days to ensure 2 consecutive days per week
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

      // For each week, ensure 2 consecutive OFF days
      for (const week of weeks) {
        const unavailableDays = week.filter(d => {
          const dateStr = toDateString(d);
          return schedule[engineer.id][dateStr] === SHIFTS.UNAVAILABLE;
        }).length;

        const existingOffDays = week.filter(d => {
          const dateStr = toDateString(d);
          return schedule[engineer.id][dateStr] === SHIFTS.OFF;
        });

        const neededOff = 2 - existingOffDays.length;

        if (neededOff > 0) {
          const unassigned = week.filter(d => {
            const dateStr = toDateString(d);
            return schedule[engineer.id][dateStr] === null;
          });

          // Find best consecutive pair for OFF days
          let bestPair = null;
          let bestScore = -1;

          for (let i = 0; i < unassigned.length - 1; i++) {
            const day1 = unassigned[i];
            const day2 = unassigned[i + 1];

            // Check if consecutive
            const diff = Math.abs(day2.getTime() - day1.getTime()) / (1000 * 60 * 60 * 24);
            if (diff === 1) {
              let score = 0;

              // Prefer weekend days
              if (isWeekend(day1)) score += 2;
              if (isWeekend(day2)) score += 2;

              // Prefer holidays
              if (this.isHoliday(day1, engineer.state)) score += 3;
              if (this.isHoliday(day2, engineer.state)) score += 3;

              if (score > bestScore) {
                bestScore = score;
                bestPair = [day1, day2];
              }
            }
          }

          if (bestPair && neededOff >= 2) {
            schedule[engineer.id][toDateString(bestPair[0])] = SHIFTS.OFF;
            schedule[engineer.id][toDateString(bestPair[1])] = SHIFTS.OFF;
          } else if (unassigned.length >= neededOff) {
            // Fallback: assign OFF days preferring weekend/holidays
            const sorted = [...unassigned].sort((a, b) => {
              let aScore = isWeekend(a) ? 2 : 0;
              let bScore = isWeekend(b) ? 2 : 0;
              aScore += this.isHoliday(a, engineer.state) ? 3 : 0;
              bScore += this.isHoliday(b, engineer.state) ? 3 : 0;
              return bScore - aScore;
            });

            for (let i = 0; i < Math.min(neededOff, sorted.length); i++) {
              schedule[engineer.id][toDateString(sorted[i])] = SHIFTS.OFF;
            }
          }
        }

        // Verify OFF days
        const finalOffCount = week.filter(d => {
          const dateStr = toDateString(d);
          return schedule[engineer.id][dateStr] === SHIFTS.OFF;
        }).length;

        if (finalOffCount < 2 && unavailableDays === 0) {
          errors.push({
            type: 'off_day_violation',
            engineer: engineer.name,
            week: toDateString(week[0]),
            message: `${engineer.name} has only ${finalOffCount} Off days in week starting ${toDateString(week[0])}`
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
   * Main solve function
   */
  solve() {
    this.violations = [];
    this.warnings = [];

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

    // Step 2: Assign training engineers
    schedule = this.assignTrainingShifts(schedule);

    // Step 3: Assign night shifts (need continuity)
    const nightResult = this.nightStrategy.execute(schedule, coreEngineers, days, weeks);
    if (!nightResult.success) {
      return this.handleFailure(nightResult.errors, schedule);
    }
    schedule = nightResult.schedule;
    this.warnings.push(...(nightResult.warnings || []));

    // Step 4: Assign day shifts
    const dayResult = this.dayStrategy.execute(schedule, coreEngineers, days, weeks);
    if (!dayResult.success) {
      return this.handleFailure(dayResult.errors, schedule);
    }
    schedule = dayResult.schedule;
    this.warnings.push(...(dayResult.warnings || []));

    // Step 5: Assign OFF days
    const offResult = this.assignOffDays(schedule);
    schedule = offResult.schedule;
    if (offResult.errors.length > 0) {
      this.warnings.push(...offResult.errors.map(e => ({ ...e, demoted: true })));
    }

    // Step 6: Add floaters
    const floaterResult = this.floaterStrategy.execute(schedule, this.engineers, days, weeks);
    schedule = floaterResult.schedule;
    this.warnings.push(...(floaterResult.warnings || []));

    // Step 7: Validate final schedule
    const validation = this.validateSchedule(schedule);
    if (!validation.valid) {
      // Check for critical errors (German labor law violations)
      const criticalErrors = validation.errors.filter(e =>
        e.type === 'ARBZG_CONSECUTIVE_DAYS' ||
        e.type === 'ARBZG_REST_PERIOD' ||
        e.type === 'transition_violation'
      );

      if (criticalErrors.length > 0) {
        return this.handleFailure(criticalErrors, schedule);
      }

      // Non-critical errors become warnings
      this.warnings.push(...validation.errors);
    }

    // Calculate stats
    this.stats = this.calculateStats(schedule);

    return {
      success: true,
      schedule,
      warnings: this.warnings,
      stats: this.stats,
      version: '2.0.0'
    };
  }

  /**
   * Handle failure with recovery options
   */
  handleFailure(errors, partialSchedule) {
    const options = this.generateRecoveryOptions(errors);
    this.stats = this.calculateStats(partialSchedule);

    return {
      success: false,
      errors,
      partialSchedule,
      options,
      warnings: this.warnings,
      stats: this.stats,
      canManualEdit: true,
      version: '2.0.0'
    };
  }
}

// Export constants for external use
export { SHIFTS, SHIFT_TIMES, COLORS };

export default Scheduler;
