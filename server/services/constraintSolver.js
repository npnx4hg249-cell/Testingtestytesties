/**
 * ICES-Shifter Constraint Solver
 *
 * Intelligent Constraint-based Engineering Scheduler
 * Uses a constraint propagation and backtracking approach to generate
 * valid shift schedules. Implements all hard rules from the specification.
 *
 * Shift Consistency Rule:
 * - Early/Morning shifts should stay together week-to-week
 * - Late shifts should stay consistent week-to-week
 * - Night shifts should stay consistent for at least 2 weeks
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
  OFF: 'Off',
  UNAVAILABLE: 'Unavailable',
  TRAINING: 'Training'
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
    [SHIFTS.UNAVAILABLE]: { bg: '#b6d7a8', text: '#000000' },
    [SHIFTS.TRAINING]: { bg: '#e6cff2', text: '#000000' }
  }
};

// Maximum consecutive working days before requiring OFF days
const MAX_CONSECUTIVE_WORK_DAYS = 6;

// Minimum OFF days per 7-day period (must be consecutive)
const MIN_OFF_DAYS_PER_WEEK = 2;

// Forbidden transitions (adjacency rules)
const FORBIDDEN_TRANSITIONS = [
  [SHIFTS.NIGHT, SHIFTS.EARLY],
  [SHIFTS.NIGHT, SHIFTS.MORNING],
  [SHIFTS.EARLY, SHIFTS.NIGHT],
  [SHIFTS.MORNING, SHIFTS.NIGHT]
];

// Shift consistency groups - shifts that should stay together
const SHIFT_CONSISTENCY_GROUPS = {
  day_early: [SHIFTS.EARLY, SHIFTS.MORNING],  // Early/Morning stay together
  day_late: [SHIFTS.LATE],                     // Late stays consistent
  night: [SHIFTS.NIGHT]                        // Night stays for 2+ weeks
};

// Minimum weeks for night shift consistency
const NIGHT_CONSISTENCY_WEEKS = 2;

// Maximum iterations for schedule generation
const MAX_ITERATIONS = 1000;

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

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
    this.maxIterations = options.maxIterations || MAX_ITERATIONS;
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

    // Check approved time-off requests (support both userId and engineerId for compatibility)
    const hasApprovedTimeOff = this.approvedRequests.some(req =>
      (req.userId === engineer.id || req.engineerId === engineer.id) &&
      req.type === 'time_off' &&
      req.dates.includes(dateStr)
    );

    if (hasApprovedTimeOff) return false;

    return true;
  }

  /**
   * Check if an engineer can work a specific shift
   * @param {Object} engineer - The engineer object
   * @param {string} shift - The shift type (Early, Morning, Late, Night)
   * @param {Date} date - Optional date to check weekend preferences
   */
  canWorkShift(engineer, shift, date = null) {
    // Check preferences
    if (engineer.preferences && engineer.preferences.length > 0) {
      // If date is provided, check for weekend-specific preferences
      if (date && this.isWeekend(date)) {
        // Check for weekend-specific preference first
        const weekendPref = `Weekend${shift}`;
        if (engineer.preferences.includes(weekendPref)) {
          return true;
        }
        // If no weekend-specific preference, check if they have regular shift preference
        // but NOT if they have weekend preferences defined (meaning they explicitly chose weekend shifts)
        const hasAnyWeekendPref = engineer.preferences.some(p => p.startsWith('Weekend'));
        if (hasAnyWeekendPref) {
          // They have weekend preferences defined, so only allow if weekend shift is in preferences
          return false;
        }
        // No weekend preferences defined, fall back to regular preferences
        return engineer.preferences.includes(shift);
      }
      // Weekday - check regular preferences
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
   * Get an engineer's dominant shift type in a week
   * Returns the shift group (day_early, day_late, night) they worked most
   */
  getDominantShiftGroup(schedule, engineerId, week) {
    const shiftCounts = {
      day_early: 0,
      day_late: 0,
      night: 0
    };

    for (const day of week) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const shift = schedule[engineerId]?.[dateStr];

      if (SHIFT_CONSISTENCY_GROUPS.day_early.includes(shift)) {
        shiftCounts.day_early++;
      } else if (SHIFT_CONSISTENCY_GROUPS.day_late.includes(shift)) {
        shiftCounts.day_late++;
      } else if (SHIFT_CONSISTENCY_GROUPS.night.includes(shift)) {
        shiftCounts.night++;
      }
    }

    // Find the dominant group
    let maxCount = 0;
    let dominantGroup = null;
    for (const [group, count] of Object.entries(shiftCounts)) {
      if (count > maxCount) {
        maxCount = count;
        dominantGroup = group;
      }
    }

    return { group: dominantGroup, count: maxCount };
  }

  /**
   * Check if a shift matches the engineer's preferred consistency group
   * This helps maintain week-to-week shift consistency
   */
  matchesConsistencyPreference(shift, preferredGroup) {
    if (!preferredGroup) return true; // No preference established yet

    if (preferredGroup === 'day_early') {
      return SHIFT_CONSISTENCY_GROUPS.day_early.includes(shift);
    } else if (preferredGroup === 'day_late') {
      return SHIFT_CONSISTENCY_GROUPS.day_late.includes(shift);
    } else if (preferredGroup === 'night') {
      return SHIFT_CONSISTENCY_GROUPS.night.includes(shift);
    }

    return true;
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
   * Main solving function - uses iterative approach
   * Tries up to maxIterations times, returning the best result found
   */
  solve() {
    let bestResult = null;
    let bestErrorCount = Infinity;
    let iterationResults = [];

    console.log(`Starting iterative schedule generation (max ${this.maxIterations} iterations)`);

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      const result = this.solveSingleIteration(iteration);

      // Count total errors
      const errorCount = result.errors ? result.errors.length : 0;

      iterationResults.push({
        iteration,
        errorCount,
        success: result.success
      });

      // If perfect solution found, return immediately
      if (result.success && errorCount === 0) {
        console.log(`Perfect schedule found on iteration ${iteration}`);
        return {
          ...result,
          iterations: iteration,
          iterationHistory: iterationResults
        };
      }

      // Track best result
      if (errorCount < bestErrorCount) {
        bestErrorCount = errorCount;
        bestResult = result;
        console.log(`Iteration ${iteration}: New best with ${errorCount} errors`);
      } else {
        console.log(`Iteration ${iteration}: ${errorCount} errors (best: ${bestErrorCount})`);
      }

      // If we found a result with very few errors, we can stop early
      if (bestErrorCount <= 2 && iteration >= 5) {
        console.log(`Stopping early with ${bestErrorCount} errors after ${iteration} iterations`);
        break;
      }
    }

    // Return the best result found, even if it has errors
    if (bestResult) {
      const finalResult = {
        ...bestResult,
        // Include schedule as partialSchedule for consistency with route handler
        partialSchedule: bestResult.schedule,
        iterations: iterationResults.length,
        iterationHistory: iterationResults,
        bestErrorCount,
        partialSuccess: bestErrorCount > 0,
        canManualEdit: true
      };

      // If there are errors, include recovery options
      if (bestErrorCount > 0 && bestResult.errors) {
        finalResult.options = this.generateRecoveryOptions(bestResult.errors);
        finalResult.message = `Best schedule found after ${iterationResults.length} iterations with ${bestErrorCount} issues. Manual editing available.`;
      }

      return finalResult;
    }

    // Fallback - should not reach here
    return this.handleFailure([{
      type: 'generation_failed',
      message: 'Failed to generate any schedule after all iterations'
    }], this.initializeSchedule());
  }

  /**
   * Single iteration of the solving algorithm with randomization
   */
  solveSingleIteration(iteration = 1) {
    this.violations = [];
    this.warnings = [];

    // Separate engineers by type
    const trainingEngineers = this.engineers.filter(e => e.inTraining);
    const regularEngineers = this.engineers.filter(e => !e.inTraining);

    // Shuffle core engineers for different orderings each iteration
    let coreEngineers = regularEngineers.filter(e => !e.isFloater);
    let floaters = regularEngineers.filter(e => e.isFloater);

    // Add randomization after first iteration
    if (iteration > 1) {
      coreEngineers = shuffleArray(coreEngineers);
      floaters = shuffleArray(floaters);
    }

    if (floaters.length > 2) {
      this.violations.push({
        type: 'configuration',
        message: `Too many floaters (${floaters.length}). Maximum is 2.`
      });
    }

    const days = this.getMonthDays();
    const weeks = this.getWeeks();
    let allErrors = [];

    // Initialize schedule
    let schedule = this.initializeSchedule();

    // Step 0: Assign training engineers (Mon-Fri Training shift, Sat-Sun Off)
    const trainingResult = this.assignTrainingShifts(schedule, trainingEngineers, days);
    schedule = trainingResult.schedule;

    // Step 1: Assign night shifts first (need continuity)
    const nightResult = this.assignNightShifts(schedule, coreEngineers, days, weeks);
    schedule = nightResult.schedule;
    if (nightResult.errors) {
      allErrors.push(...nightResult.errors);
    }

    // Step 2: Assign day shifts for core engineers (continue even with errors)
    const dayResult = this.assignDayShifts(schedule, coreEngineers, days, weeks);
    schedule = dayResult.schedule;
    if (dayResult.errors) {
      allErrors.push(...dayResult.errors);
    }

    // Step 3: Assign OFF days
    const offResult = this.assignOffDays(schedule, coreEngineers, days, weeks);
    schedule = offResult.schedule;
    if (offResult.errors) {
      allErrors.push(...offResult.errors);
    }

    // Step 4: Add floaters where beneficial
    const floaterResult = this.assignFloaters(schedule, floaters, days, weeks);
    schedule = floaterResult.schedule;
    if (floaterResult.warnings) {
      this.warnings.push(...floaterResult.warnings);
    }

    // Step 5: Fill any remaining gaps
    schedule = this.fillRemainingGaps(schedule, coreEngineers, days);

    // Step 6: Validate final schedule
    const validation = this.validateSchedule(schedule, days, weeks);
    if (validation.errors) {
      // Add only new unique errors
      for (const error of validation.errors) {
        const isDuplicate = allErrors.some(e =>
          e.type === error.type && e.date === error.date && e.shift === error.shift
        );
        if (!isDuplicate) {
          allErrors.push(error);
        }
      }
    }

    const success = allErrors.length === 0;

    return {
      success,
      schedule,
      errors: allErrors,
      warnings: this.warnings,
      stats: this.calculateStats(schedule, days, weeks)
    };
  }

  /**
   * Fill any remaining null slots in the schedule
   */
  fillRemainingGaps(schedule, engineers, days) {
    const dayShifts = [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE];

    for (const engineer of engineers) {
      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');

        // If slot is still null, assign something
        if (schedule[engineer.id][dateStr] === null) {
          // Try to assign a valid shift based on preferences and transitions
          const prevDay = addDays(day, -1);
          const prevDateStr = format(prevDay, 'yyyy-MM-dd');
          const prevShift = schedule[engineer.id][prevDateStr];

          // Check consecutive work days
          const consecutive = this.getConsecutiveWorkDays(schedule, engineer.id, prevDay, days);

          if (consecutive >= 5) {
            // Need an OFF day
            schedule[engineer.id][dateStr] = SHIFTS.OFF;
          } else {
            // Try to assign a valid shift
            let assigned = false;

            // Shuffle shifts for variety
            const shuffledShifts = shuffleArray(dayShifts);

            for (const shift of shuffledShifts) {
              if (this.canWorkShift(engineer, shift, day) &&
                  this.isValidTransition(prevShift, shift)) {
                schedule[engineer.id][dateStr] = shift;
                assigned = true;
                break;
              }
            }

            // If nothing worked, assign OFF
            if (!assigned) {
              schedule[engineer.id][dateStr] = SHIFTS.OFF;
            }
          }
        }
      }
    }

    return schedule;
  }

  /**
   * Assign training shifts for engineers in training
   * Training engineers work Mon-Fri on Training shift, with Sat-Sun Off
   */
  assignTrainingShifts(schedule, trainingEngineers, days) {
    for (const engineer of trainingEngineers) {
      for (const day of days) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeek = getDay(day);

        // Skip if already assigned (e.g., unavailable)
        if (schedule[engineer.id][dateStr] !== null) continue;

        // Saturday = 6, Sunday = 0
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          schedule[engineer.id][dateStr] = SHIFTS.OFF;
        } else {
          schedule[engineer.id][dateStr] = SHIFTS.TRAINING;
        }
      }
    }

    return { success: true, schedule };
  }

  /**
   * Assign night shifts with continuity
   */
  assignNightShifts(schedule, engineers, days, weeks) {
    const errors = [];

    // Find engineers who can work nights (check both weekday and weekend nights)
    const nightEligible = engineers.filter(e =>
      this.canWorkShift(e, SHIFTS.NIGHT) ||
      (e.preferences && e.preferences.includes('WeekendNight'))
    );

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
              this.isEngineerAvailable(engineer, day) &&
              this.canWorkShift(engineer, SHIFTS.NIGHT, day)) {
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
          if (!this.canWorkShift(e, shift, day)) return false;

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

        // Sort by: 1) shift consistency preference, 2) who has worked least this week
        eligible.sort((a, b) => {
          // Find current week index
          const currentWeekIndex = weeks.findIndex(w =>
            w.some(d => isSameDay(d, day))
          );

          // Get previous week's dominant shift group for consistency
          let aPreferredGroup = null;
          let bPreferredGroup = null;

          if (currentWeekIndex > 0) {
            const prevWeek = weeks[currentWeekIndex - 1];
            aPreferredGroup = this.getDominantShiftGroup(schedule, a.id, prevWeek).group;
            bPreferredGroup = this.getDominantShiftGroup(schedule, b.id, prevWeek).group;
          }

          // Check consistency match for this shift
          const aMatchesConsistency = this.matchesConsistencyPreference(shift, aPreferredGroup) ? 0 : 1;
          const bMatchesConsistency = this.matchesConsistencyPreference(shift, bPreferredGroup) ? 0 : 1;

          // Prefer engineers whose previous week matches this shift type
          if (aMatchesConsistency !== bMatchesConsistency) {
            return aMatchesConsistency - bMatchesConsistency;
          }

          // Secondary sort: who has worked least this week
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
   * Assign OFF days to ensure exactly 2 consecutive days off per week per engineer
   * Also ensures no more than 6 consecutive working days
   */
  assignOffDays(schedule, engineers, days, weeks) {
    const errors = [];

    for (const engineer of engineers) {
      // Skip training engineers - they have fixed weekends off
      if (engineer.inTraining) {
        for (const day of days) {
          const dayOfWeek = getDay(day);
          const dateStr = format(day, 'yyyy-MM-dd');
          // Saturday = 6, Sunday = 0
          if ((dayOfWeek === 0 || dayOfWeek === 6) &&
              schedule[engineer.id][dateStr] === null) {
            schedule[engineer.id][dateStr] = SHIFTS.OFF;
          }
        }
        continue;
      }

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

      // For each week, ensure exactly 2 CONSECUTIVE OFF days
      for (const week of weeks) {
        // Count unavailable days this week
        const unavailableDays = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          return schedule[engineer.id][dateStr] === SHIFTS.UNAVAILABLE;
        }).length;

        // Count existing OFF days
        const existingOffDays = week.filter(d => {
          const dateStr = format(d, 'yyyy-MM-dd');
          return schedule[engineer.id][dateStr] === SHIFTS.OFF;
        });

        const neededOff = MIN_OFF_DAYS_PER_WEEK - existingOffDays.length;

        if (neededOff > 0) {
          // Find pairs of consecutive unassigned days
          const unassigned = week.filter(d => {
            const dateStr = format(d, 'yyyy-MM-dd');
            return schedule[engineer.id][dateStr] === null;
          });

          // Find best consecutive pair for OFF days
          let bestPair = null;
          let bestScore = -1;

          for (let i = 0; i < unassigned.length - 1; i++) {
            const day1 = unassigned[i];
            const day2 = unassigned[i + 1];

            // Check if they are consecutive
            if (differenceInDays(day2, day1) === 1) {
              let score = 0;

              // Prefer weekend days
              if (this.isWeekend(day1)) score += 2;
              if (this.isWeekend(day2)) score += 2;

              // Prefer days that help avoid long consecutive work streaks
              const day1Index = days.findIndex(d => isSameDay(d, day1));
              if (day1Index > 0) {
                const prevConsecutive = this.getConsecutiveWorkDays(schedule, engineer.id, days[day1Index - 1], days);
                if (prevConsecutive >= 4) score += 3;
              }

              if (score > bestScore) {
                bestScore = score;
                bestPair = [day1, day2];
              }
            }
          }

          if (bestPair && neededOff >= 2) {
            // Assign both consecutive OFF days
            schedule[engineer.id][format(bestPair[0], 'yyyy-MM-dd')] = SHIFTS.OFF;
            schedule[engineer.id][format(bestPair[1], 'yyyy-MM-dd')] = SHIFTS.OFF;
          } else if (unassigned.length >= neededOff) {
            // Fallback: assign OFF days preferring weekend
            unassigned.sort((a, b) => {
              const aIsWeekend = this.isWeekend(a) ? 0 : 1;
              const bIsWeekend = this.isWeekend(b) ? 0 : 1;
              return aIsWeekend - bIsWeekend;
            });

            for (let i = 0; i < Math.min(neededOff, unassigned.length); i++) {
              const dateStr = format(unassigned[i], 'yyyy-MM-dd');
              schedule[engineer.id][dateStr] = SHIFTS.OFF;
            }
          }

          // Verify we achieved 2 OFF days
          const finalOffCount = week.filter(d => {
            const dateStr = format(d, 'yyyy-MM-dd');
            return schedule[engineer.id][dateStr] === SHIFTS.OFF;
          }).length;

          if (finalOffCount < MIN_OFF_DAYS_PER_WEEK && unavailableDays === 0) {
            errors.push({
              type: 'off_day_violation',
              engineer: engineer.name,
              week: format(week[0], 'yyyy-MM-dd'),
              message: `${engineer.name} has only ${finalOffCount} Off days in week starting ${format(week[0], 'yyyy-MM-dd')}`
            });
          }
        }
      }

      // Second pass: Ensure no more than 6 consecutive working days
      this.enforceMaxConsecutiveWorkDays(schedule, engineer, days, errors);
    }

    return { success: errors.length === 0, errors, schedule };
  }

  /**
   * Ensure no engineer works more than MAX_CONSECUTIVE_WORK_DAYS in a row
   */
  enforceMaxConsecutiveWorkDays(schedule, engineer, days, errors) {
    let consecutiveCount = 0;
    let streakStart = null;

    for (let i = 0; i < days.length; i++) {
      const dateStr = format(days[i], 'yyyy-MM-dd');
      const shift = schedule[engineer.id][dateStr];

      if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
        if (consecutiveCount === 0) {
          streakStart = i;
        }
        consecutiveCount++;

        // If we hit the limit, try to insert an OFF day
        if (consecutiveCount > MAX_CONSECUTIVE_WORK_DAYS) {
          // Find the best day in the streak to convert to OFF
          // Prefer days where we have adequate coverage
          let converted = false;

          // Try to find an unassigned day nearby that could become OFF
          for (let j = streakStart; j <= i && !converted; j++) {
            const checkDateStr = format(days[j], 'yyyy-MM-dd');
            const currentShift = schedule[engineer.id][checkDateStr];

            // Don't convert if it's the only one on that shift
            if (currentShift && currentShift !== SHIFTS.OFF && currentShift !== SHIFTS.UNAVAILABLE) {
              schedule[engineer.id][checkDateStr] = SHIFTS.OFF;
              converted = true;
              consecutiveCount = i - j; // Reset count from this point
            }
          }

          if (!converted) {
            errors.push({
              type: 'consecutive_days_violation',
              engineer: engineer.name,
              date: dateStr,
              message: `${engineer.name} has more than ${MAX_CONSECUTIVE_WORK_DAYS} consecutive working days ending ${dateStr}`
            });
          }
        }
      } else {
        consecutiveCount = 0;
      }
    }
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
              if (!this.canWorkShift(floater, shift, day)) continue;
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
