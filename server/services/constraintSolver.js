/**
 * CC Shifter Constraint Solver
 *
 * Uses a constraint propagation and backtracking approach to generate
 * valid shift schedules. Implements all hard rules from the specification.
 */

import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  format, startOfWeek, endOfWeek, addDays, isSameDay,
  differenceInDays, isWeekend as dateFnsIsWeekend
} from 'date-fns';

// Shift definitions
export const SHIFTS = {
  EARLY: 'Early',
  MORNING: 'Morning',
  LATE: 'Late',
  NIGHT: 'Night',
  OFF: 'OFF',
  UNAVAILABLE: 'Unavailable'
};

// Shift times
export const SHIFT_TIMES = {
  weekday: {
    [SHIFTS.EARLY]: { start: '07:00', end: '15:30' },
    [SHIFTS.MORNING]: { start: '10:00', end: '18:30' },
    [SHIFTS.LATE]: { start: '15:00', end: '23:30' },
    [SHIFTS.NIGHT]: { start: '23:00', end: '07:30' }
  },
  weekend: {
    [SHIFTS.EARLY]: { start: '07:00', end: '15:30' },
    [SHIFTS.MORNING]: { start: '10:00', end: '18:30' },
    [SHIFTS.LATE]: { start: '15:00', end: '22:30' },
    [SHIFTS.NIGHT]: { start: '23:00', end: '07:30' }
  }
};

// Coverage requirements
const COVERAGE = {
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

// Color coding for output
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
    [SHIFTS.UNAVAILABLE]: { bg: '#b6d7a8', text: '#000000' }
  }
};

// Forbidden transitions (adjacency rules)
const FORBIDDEN_TRANSITIONS = [
  [SHIFTS.NIGHT, SHIFTS.EARLY],
  [SHIFTS.NIGHT, SHIFTS.MORNING],
  [SHIFTS.EARLY, SHIFTS.NIGHT],
  [SHIFTS.MORNING, SHIFTS.NIGHT]
];

/**
 * Main constraint solver class
 */
export class ShiftScheduler {
  constructor(options = {}) {
    this.engineers = options.engineers || [];
    this.month = options.month || new Date();
    this.holidays = options.holidays || [];
    this.approvedRequests = options.approvedRequests || [];
    this.violations = [];
    this.warnings = [];
  }

  /**
   * Get all days in the month
   */
  getMonthDays() {
    const start = startOfMonth(this.month);
    const end = endOfMonth(this.month);
    return eachDayOfInterval({ start, end });
  }

  /**
   * Get weeks in the month (Monday-Sunday)
   */
  getWeeks() {
    const days = this.getMonthDays();
    const weeks = [];
    let currentWeek = [];

    days.forEach(day => {
      const dayOfWeek = getDay(day);
      // Monday = 1, we want Monday to start the week
      if (dayOfWeek === 1 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    });

    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  }

  /**
   * Check if a day is a weekend
   */
  isWeekend(date) {
    return dateFnsIsWeekend(date);
  }

  /**
   * Check if a day is a holiday
   */
  isHoliday(date, engineerState = null) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return this.holidays.some(h => {
      if (h.date === dateStr) {
        // Federal holiday applies to all
        if (h.type === 'federal') return true;
        // State holiday applies only to engineers in that state
        if (h.type === 'state' && engineerState) {
          return h.states && h.states.includes(engineerState);
        }
      }
      return false;
    });
  }

  /**
   * Get coverage requirements for a day
   */
  getCoverageRequirements(date) {
    return this.isWeekend(date) ? COVERAGE.weekend : COVERAGE.weekday;
  }

  /**
   * Check if an engineer is available on a day
   */
  isEngineerAvailable(engineer, date) {
    const dateStr = format(date, 'yyyy-MM-dd');

    // Check explicit unavailability
    if (engineer.unavailableDays && engineer.unavailableDays.includes(dateStr)) {
      return false;
    }

    // Check approved time-off requests
    const hasApprovedTimeOff = this.approvedRequests.some(req =>
      req.engineerId === engineer.id &&
      req.type === 'time_off' &&
      req.dates.includes(dateStr)
    );

    if (hasApprovedTimeOff) return false;

    return true;
  }

  /**
   * Check if an engineer can work a specific shift
   */
  canWorkShift(engineer, shift) {
    // Check preferences
    if (engineer.preferences && engineer.preferences.length > 0) {
      return engineer.preferences.includes(shift);
    }
    // If no preferences specified, can work any shift
    return true;
  }

  /**
   * Check if a transition between shifts is valid
   */
  isValidTransition(fromShift, toShift) {
    if (!fromShift || fromShift === SHIFTS.OFF || fromShift === SHIFTS.UNAVAILABLE) {
      return true;
    }
    if (!toShift || toShift === SHIFTS.OFF || toShift === SHIFTS.UNAVAILABLE) {
      return true;
    }
    return !FORBIDDEN_TRANSITIONS.some(
      ([from, to]) => from === fromShift && to === toShift
    );
  }

  /**
   * Get the number of consecutive working days ending at a date
   */
  getConsecutiveWorkDays(schedule, engineerId, endDate, days) {
    let count = 0;
    const endIndex = days.findIndex(d => isSameDay(d, endDate));

    for (let i = endIndex; i >= 0; i--) {
      const dateStr = format(days[i], 'yyyy-MM-dd');
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
   * Initialize empty schedule with unavailable days
   */
  initializeSchedule() {
    const schedule = {};
    const days = this.getMonthDays();

    this.engineers.forEach(engineer => {
      schedule[engineer.id] = {};

      days.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');

        if (!this.isEngineerAvailable(engineer, day)) {
          schedule[engineer.id][dateStr] = SHIFTS.UNAVAILABLE;
        } else {
          schedule[engineer.id][dateStr] = null; // To be assigned
        }
      });
    });

    return schedule;
  }

  /**
   * Main solving function
   */
  solve() {
    this.violations = [];
    this.warnings = [];

    const coreEngineers = this.engineers.filter(e => !e.isFloater);
    const floaters = this.engineers.filter(e => e.isFloater);

    if (floaters.length > 2) {
      this.violations.push({
        type: 'configuration',
        message: `Too many floaters (${floaters.length}). Maximum is 2.`
      });
    }

    const days = this.getMonthDays();
    const weeks = this.getWeeks();

    // Initialize schedule
    let schedule = this.initializeSchedule();

    // Step 1: Assign night shifts first (need continuity)
    const nightResult = this.assignNightShifts(schedule, coreEngineers, days, weeks);
    if (!nightResult.success) {
      return this.handleFailure(nightResult.errors, schedule);
    }
    schedule = nightResult.schedule;

    // Step 2: Assign day shifts for core engineers
    const dayResult = this.assignDayShifts(schedule, coreEngineers, days, weeks);
    if (!dayResult.success) {
      return this.handleFailure(dayResult.errors, schedule);
    }
    schedule = dayResult.schedule;

    // Step 3: Assign OFF days
    const offResult = this.assignOffDays(schedule, coreEngineers, days, weeks);
    if (!offResult.success) {
      return this.handleFailure(offResult.errors, schedule);
    }
    schedule = offResult.schedule;

    // Step 4: Add floaters where beneficial
    const floaterResult = this.assignFloaters(schedule, floaters, days, weeks);
    schedule = floaterResult.schedule;
    if (floaterResult.warnings) {
      this.warnings.push(...floaterResult.warnings);
    }

    // Step 5: Validate final schedule
    const validation = this.validateSchedule(schedule, days, weeks);
    if (!validation.valid) {
      return this.handleFailure(validation.errors, schedule);
    }

    return {
      success: true,
      schedule,
      warnings: this.warnings,
      stats: this.calculateStats(schedule, days, weeks)
    };
  }

  /**
   * Assign night shifts with continuity
   */
  assignNightShifts(schedule, engineers, days, weeks) {
    const errors = [];

    // Find engineers who can work nights
    const nightEligible = engineers.filter(e => this.canWorkShift(e, SHIFTS.NIGHT));

    if (nightEligible.length < 2) {
      errors.push({
        type: 'insufficient_coverage',
        shift: SHIFTS.NIGHT,
        message: `Only ${nightEligible.length} engineers can work nights. Minimum 2 required.`
      });
      return { success: false, errors, schedule };
    }

    // Group nights into 2-week blocks for continuity
    const nightBlocks = [];
    let currentBlock = [];

    weeks.forEach((week, weekIndex) => {
      currentBlock.push(week);
      if (currentBlock.length === 2 || weekIndex === weeks.length - 1) {
        nightBlocks.push([...currentBlock]);
        currentBlock = [];
      }
    });

    // Assign night cohort for each block
    let nightCohortIndex = 0;

    for (const block of nightBlocks) {
      const blockDays = block.flat();

      // Determine how many night workers needed
      const maxNightNeeded = 3;
      const minNightNeeded = 2;

      // Select night cohort (rotate through eligible engineers)
      const cohortSize = Math.min(maxNightNeeded, nightEligible.length);
      const cohort = [];

      for (let i = 0; i < cohortSize; i++) {
        const engineer = nightEligible[(nightCohortIndex + i) % nightEligible.length];
        // Check if engineer is available for most of the block
        const availableDays = blockDays.filter(d =>
          this.isEngineerAvailable(engineer, d)
        ).length;

        if (availableDays >= blockDays.length * 0.5) {
          cohort.push(engineer);
        }
      }

      if (cohort.length < minNightNeeded) {
        errors.push({
          type: 'insufficient_coverage',
          shift: SHIFTS.NIGHT,
          message: `Cannot form night cohort for week block. Only ${cohort.length} available.`
        });
        continue;
      }

      // Assign nights to cohort
      for (const day of blockDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const coverage = this.getCoverageRequirements(day);
        let assigned = 0;

        for (const engineer of cohort) {
          if (assigned >= coverage[SHIFTS.NIGHT].preferred) break;

          if (schedule[engineer.id][dateStr] === null &&
              this.isEngineerAvailable(engineer, day)) {
            // Check transition validity
            const prevDay = addDays(day, -1);
            const prevDateStr = format(prevDay, 'yyyy-MM-dd');
            const prevShift = schedule[engineer.id][prevDateStr];

            if (this.isValidTransition(prevShift, SHIFTS.NIGHT)) {
              schedule[engineer.id][dateStr] = SHIFTS.NIGHT;
              assigned++;
            }
          }
        }

        if (assigned < coverage[SHIFTS.NIGHT].min) {
          errors.push({
            type: 'coverage_failure',
            shift: SHIFTS.NIGHT,
            date: dateStr,
            message: `Night shift on ${dateStr}: only ${assigned} engineers, need ${coverage[SHIFTS.NIGHT].min}`
          });
        }
      }

      nightCohortIndex += cohortSize;
    }

    return { success: errors.length === 0, errors, schedule };
  }

  /**
   * Assign day shifts (Early, Morning, Late)
   */
  assignDayShifts(schedule, engineers, days, weeks) {
    const errors = [];
    const dayShifts = [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE];

    // For each day, ensure coverage
    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const coverage = this.getCoverageRequirements(day);

      for (const shift of dayShifts) {
        // Find engineers who can work this shift and are available
        const eligible = engineers.filter(e => {
          if (schedule[e.id][dateStr] !== null) return false; // Already assigned
          if (!this.isEngineerAvailable(e, day)) return false;
          if (!this.canWorkShift(e, shift)) return false;

          // Check transition validity
          const prevDay = addDays(day, -1);
          const prevDateStr = format(prevDay, 'yyyy-MM-dd');
          const prevShift = schedule[e.id][prevDateStr];
          if (!this.isValidTransition(prevShift, shift)) return false;

          // Check consecutive days limit
          const consecutive = this.getConsecutiveWorkDays(schedule, e.id, addDays(day, -1), days);
          if (consecutive >= 5) return false;

          return true;
        });

        // Sort by who has worked least this week
        eligible.sort((a, b) => {
          const weekStart = startOfWeek(day, { weekStartsOn: 1 });
          const weekEnd = endOfWeek(day, { weekStartsOn: 1 });
          const weekDays = eachDayOfInterval({ start: weekStart, end: day });

          const aCount = weekDays.filter(d => {
            const ds = format(d, 'yyyy-MM-dd');
            const s = schedule[a.id][ds];
            return s && s !== SHIFTS.OFF && s !== SHIFTS.UNAVAILABLE;
          }).length;

          const bCount = weekDays.filter(d => {
            const ds = format(d, 'yyyy-MM-dd');
            const s = schedule[b.id][ds];
            return s && s !== SHIFTS.OFF && s !== SHIFTS.UNAVAILABLE;
          }).length;

          return aCount - bCount;
        });

        // Assign engineers to meet coverage
        let assigned = 0;
        for (const engineer of eligible) {
          if (assigned >= coverage[shift].min) break;

          schedule[engineer.id][dateStr] = shift;
          assigned++;
        }

        if (assigned < coverage[shift].min) {
          errors.push({
            type: 'coverage_failure',
            shift,
            date: dateStr,
            message: `${shift} shift on ${dateStr}: only ${assigned} engineers, need ${coverage[shift].min}`,
            shortfall: coverage[shift].min - assigned
          });
        }
      }
    }

    return { success: errors.length === 0, errors, schedule };
  }

  /**
   * Assign OFF days to ensure exactly 2 per week per engineer
   */
  assignOffDays(schedule, engineers, days, weeks) {
    const errors = [];

    for (const engineer of engineers) {
      // Special handling for Josh Migura (fixed Friday/Saturday off)
      if (engineer.name === 'Josh Migura') {
        for (const day of days) {
          const dayOfWeek = getDay(day);
          const dateStr = format(day, 'yyyy-MM-dd');

          // Friday = 5, Saturday = 6
          if ((dayOfWeek === 5 || dayOfWeek === 6) &&
              schedule[engineer.id][dateStr] === null) {
            schedule[engineer.id][dateStr] = SHIFTS.OFF;
          }
        }
        continue;
      }

      // For each week, ensure exactly 2 OFF days
      for (const week of weeks) {
        // Count unavailable days this week
        const unavailableDays = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          return schedule[engineer.id][dateStr] === SHIFTS.UNAVAILABLE;
        }).length;

        // Count assigned shifts
        const assignedDays = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const shift = schedule[engineer.id][dateStr];
          return shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE;
        }).length;

        // Count existing OFF days
        const existingOff = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          return schedule[engineer.id][dateStr] === SHIFTS.OFF;
        }).length;

        const neededOff = 2 - existingOff;

        if (neededOff > 0) {
          // Find unassigned days to mark as OFF
          const unassigned = week.filter(d => {
            const dateStr = format(d, 'yyyy-MM-dd');
            return schedule[engineer.id][dateStr] === null;
          });

          // Prefer weekend days for OFF
          unassigned.sort((a, b) => {
            const aIsWeekend = this.isWeekend(a) ? 0 : 1;
            const bIsWeekend = this.isWeekend(b) ? 0 : 1;
            return aIsWeekend - bIsWeekend;
          });

          for (let i = 0; i < Math.min(neededOff, unassigned.length); i++) {
            const dateStr = format(unassigned[i], 'yyyy-MM-dd');
            schedule[engineer.id][dateStr] = SHIFTS.OFF;
          }

          // Check if we achieved 2 OFF days
          const finalOffCount = week.filter(d => {
            const dateStr = format(d, 'yyyy-MM-dd');
            return schedule[engineer.id][dateStr] === SHIFTS.OFF;
          }).length;

          if (finalOffCount < 2) {
            errors.push({
              type: 'off_day_violation',
              engineer: engineer.name,
              week: format(week[0], 'yyyy-MM-dd'),
              message: `${engineer.name} has only ${finalOffCount} OFF days in week starting ${format(week[0], 'yyyy-MM-dd')}`
            });
          }
        }
      }
    }

    return { success: errors.length === 0, errors, schedule };
  }

  /**
   * Assign floaters where beneficial (after core coverage is met)
   */
  assignFloaters(schedule, floaters, days, weeks) {
    const warnings = [];

    if (floaters.length === 0) {
      return { schedule, warnings };
    }

    // Track floater shifts per week
    const floaterWeekShifts = {};
    floaters.forEach(f => {
      floaterWeekShifts[f.id] = {};
      weeks.forEach((week, i) => {
        floaterWeekShifts[f.id][i] = 0;
      });
    });

    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      const week = weeks[weekIndex];

      for (const day of week) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const coverage = this.getCoverageRequirements(day);

        for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE]) {
          // Count current coverage
          const currentCoverage = this.engineers.filter(e =>
            schedule[e.id][dateStr] === shift
          ).length;

          // If below preferred, try to add floater
          if (currentCoverage < coverage[shift].preferred) {
            for (const floater of floaters) {
              // Check 2.5 shifts/week limit
              if (floaterWeekShifts[floater.id][weekIndex] >= 2.5) continue;

              // Check availability
              if (!this.isEngineerAvailable(floater, day)) continue;
              if (!this.canWorkShift(floater, shift)) continue;
              if (schedule[floater.id][dateStr] !== null) continue;

              // Check no other floater on same shift
              const otherFloaterOnShift = floaters.some(f =>
                f.id !== floater.id && schedule[f.id][dateStr] === shift
              );
              if (otherFloaterOnShift) continue;

              // Assign floater
              schedule[floater.id][dateStr] = shift;
              floaterWeekShifts[floater.id][weekIndex] += 1;
              break;
            }
          }
        }
      }
    }

    return { schedule, warnings };
  }

  /**
   * Validate the complete schedule
   */
  validateSchedule(schedule, days, weeks) {
    const errors = [];

    const coreEngineers = this.engineers.filter(e => !e.isFloater);
    const floaters = this.engineers.filter(e => e.isFloater);

    // 1. Check coverage
    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const coverage = this.getCoverageRequirements(day);

      for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT]) {
        const coreCoverage = coreEngineers.filter(e =>
          schedule[e.id][dateStr] === shift
        ).length;

        if (coreCoverage < coverage[shift].min) {
          errors.push({
            type: 'coverage_violation',
            shift,
            date: dateStr,
            message: `${shift} on ${dateStr}: ${coreCoverage} core engineers, need ${coverage[shift].min}`
          });
        }
      }
    }

    // 2. Check floater rules
    for (const floater of floaters) {
      for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
        const week = weeks[weekIndex];
        const shifts = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          const s = schedule[floater.id][dateStr];
          return s && s !== SHIFTS.OFF && s !== SHIFTS.UNAVAILABLE;
        }).length;

        if (shifts > 2.5) {
          errors.push({
            type: 'floater_overwork',
            engineer: floater.name,
            week: weekIndex + 1,
            message: `Floater ${floater.name} has ${shifts} shifts in week ${weekIndex + 1}, max is 2.5`
          });
        }
      }
    }

    // 3. Check both floaters not on same shift
    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
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

    // 4. Check OFF days for core engineers
    for (const engineer of coreEngineers) {
      if (engineer.name === 'Josh Migura') continue; // Special case

      for (const week of weeks) {
        const offDays = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          return schedule[engineer.id][dateStr] === SHIFTS.OFF;
        }).length;

        const unavailableDays = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          return schedule[engineer.id][dateStr] === SHIFTS.UNAVAILABLE;
        }).length;

        // Only require 2 OFF days if no unavailable days
        if (unavailableDays === 0 && offDays !== 2) {
          errors.push({
            type: 'off_day_count',
            engineer: engineer.name,
            week: format(week[0], 'yyyy-MM-dd'),
            message: `${engineer.name} has ${offDays} OFF days (need 2) in week of ${format(week[0], 'yyyy-MM-dd')}`
          });
        }
      }
    }

    // 5. Check workload
    for (const engineer of coreEngineers) {
      for (const week of weeks) {
        const unavailableDays = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          return schedule[engineer.id][dateStr] === SHIFTS.UNAVAILABLE;
        }).length;

        if (unavailableDays === 0) {
          const workDays = week.filter(d => {
            const dateStr = format(d, 'yyyy-MM-dd');
            const s = schedule[engineer.id][dateStr];
            return s && s !== SHIFTS.OFF && s !== SHIFTS.UNAVAILABLE;
          }).length;

          if (workDays < 5) {
            errors.push({
              type: 'underwork',
              engineer: engineer.name,
              week: format(week[0], 'yyyy-MM-dd'),
              message: `${engineer.name} has only ${workDays} shifts (need 5) in week of ${format(week[0], 'yyyy-MM-dd')}`
            });
          }
        }
      }
    }

    // 6. Check consecutive working days
    for (const engineer of this.engineers) {
      let consecutive = 0;
      let streakStart = null;

      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const shift = schedule[engineer.id][dateStr];

        if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
          if (consecutive === 0) streakStart = dateStr;
          consecutive++;

          if (consecutive > 6) {
            errors.push({
              type: 'consecutive_days',
              engineer: engineer.name,
              start: streakStart,
              message: `${engineer.name} has ${consecutive} consecutive working days starting ${streakStart}`
            });
          }
        } else {
          consecutive = 0;
        }
      }
    }

    // 7. Check transition rules
    for (const engineer of this.engineers) {
      for (let i = 1; i < days.length; i++) {
        const prevDateStr = format(days[i-1], 'yyyy-MM-dd');
        const currDateStr = format(days[i], 'yyyy-MM-dd');
        const prevShift = schedule[engineer.id][prevDateStr];
        const currShift = schedule[engineer.id][currDateStr];

        if (!this.isValidTransition(prevShift, currShift)) {
          errors.push({
            type: 'invalid_transition',
            engineer: engineer.name,
            date: currDateStr,
            message: `${engineer.name}: invalid transition ${prevShift} → ${currShift} on ${currDateStr}`
          });
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Calculate schedule statistics
   */
  calculateStats(schedule, days, weeks) {
    const stats = {
      totalShifts: {},
      coverageByDay: {},
      engineerStats: {}
    };

    // Initialize
    this.engineers.forEach(e => {
      stats.engineerStats[e.id] = {
        name: e.name,
        totalShifts: 0,
        shiftBreakdown: {},
        offDays: 0,
        unavailableDays: 0
      };
    });

    // Calculate
    for (const day of days) {
      const dateStr = format(day, 'yyyy-MM-dd');
      stats.coverageByDay[dateStr] = {};

      for (const shift of [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT]) {
        stats.coverageByDay[dateStr][shift] = 0;
      }

      for (const engineer of this.engineers) {
        const shift = schedule[engineer.id][dateStr];

        if (shift === SHIFTS.OFF) {
          stats.engineerStats[engineer.id].offDays++;
        } else if (shift === SHIFTS.UNAVAILABLE) {
          stats.engineerStats[engineer.id].unavailableDays++;
        } else if (shift) {
          stats.engineerStats[engineer.id].totalShifts++;
          stats.engineerStats[engineer.id].shiftBreakdown[shift] =
            (stats.engineerStats[engineer.id].shiftBreakdown[shift] || 0) + 1;
          stats.coverageByDay[dateStr][shift]++;
        }
      }
    }

    return stats;
  }

  /**
   * Handle failure with options
   */
  handleFailure(errors, partialSchedule) {
    const options = this.generateRecoveryOptions(errors);

    return {
      success: false,
      errors,
      partialSchedule,
      options,
      canManualEdit: true
    };
  }

  /**
   * Generate recovery options when constraints fail
   */
  generateRecoveryOptions(errors) {
    const options = [];

    // Analyze error types
    const coverageErrors = errors.filter(e =>
      e.type === 'coverage_failure' || e.type === 'coverage_violation'
    );
    const offDayErrors = errors.filter(e => e.type === 'off_day_count');
    const workloadErrors = errors.filter(e => e.type === 'underwork');

    // Option 1: Relax coverage requirements
    if (coverageErrors.length > 0) {
      const affectedShifts = [...new Set(coverageErrors.map(e => e.shift))];
      options.push({
        id: 'relax_coverage',
        title: 'Relax Coverage Requirements',
        description: `Reduce minimum coverage for ${affectedShifts.join(', ')} shifts by 1`,
        impact: 'Lower staffing on some shifts, may affect response times',
        severity: 'medium'
      });
    }

    // Option 2: Allow more floater hours
    if (coverageErrors.length > 0) {
      options.push({
        id: 'increase_floater_hours',
        title: 'Increase Floater Availability',
        description: 'Allow floaters to work up to 4 shifts per week instead of 2.5',
        impact: 'Floaters work more hours, may need overtime compensation',
        severity: 'low'
      });
    }

    // Option 3: Reduce OFF days requirement
    if (offDayErrors.length > 0 || workloadErrors.length > 0) {
      options.push({
        id: 'reduce_off_days',
        title: 'Flexible OFF Days',
        description: 'Allow 1 OFF day per week instead of 2 when coverage is tight',
        impact: 'Some engineers may work more consecutive days',
        severity: 'high'
      });
    }

    // Option 4: Hire temporary coverage
    if (coverageErrors.length >= 5) {
      options.push({
        id: 'temp_coverage',
        title: 'Request Temporary Coverage',
        description: 'Bring in temporary staff or contractors for specific shifts',
        impact: 'Additional cost, requires external coordination',
        severity: 'medium'
      });
    }

    // Option 5: Manual adjustment
    options.push({
      id: 'manual_edit',
      title: 'Manual Schedule Adjustment',
      description: 'Open the schedule editor to manually assign shifts',
      impact: 'Full control, but requires careful attention to rules',
      severity: 'none'
    });

    // Ensure at least 3 options
    while (options.length < 3) {
      options.push({
        id: `suggestion_${options.length}`,
        title: 'Contact Team Lead',
        description: 'Discuss scheduling constraints with team leadership',
        impact: 'May find creative solutions not captured by the system',
        severity: 'low'
      });
    }

    return options.slice(0, Math.max(3, options.length));
  }
}

export default ShiftScheduler;
