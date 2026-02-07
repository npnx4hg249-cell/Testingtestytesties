/**
 * Night Shift Assignment Strategy
 * Handles night shift scheduling with 2-week continuity requirement
 */

import { SHIFTS, NIGHT_SHIFT_CONFIG } from '../config/defaults.js';
import { toDateString, isWeekend, getPreviousDay } from '../utils/DateUtils.js';
import { getTransitionViolation } from '../rules/GermanLaborLaws.js';

/**
 * Night Shift Strategy
 * Assigns night shifts in cohorts for 2-week blocks to maintain continuity
 */
export class NightShiftStrategy {
  constructor(options = {}) {
    this.minEngineers = options.minEngineers || NIGHT_SHIFT_CONFIG.minEngineers;
    this.consistencyWeeks = options.consistencyWeeks || NIGHT_SHIFT_CONFIG.consistencyWeeks;
    this.preferredEngineers = options.preferredEngineers || 3;
  }

  /**
   * Get engineers eligible for night shifts
   */
  getEligibleEngineers(engineers) {
    return engineers.filter(e => {
      // Must not be floater or in training
      if (e.isFloater || e.inTraining) return false;

      // Check preferences
      if (e.preferences && e.preferences.length > 0) {
        return e.preferences.includes(SHIFTS.NIGHT) ||
               e.preferences.includes('WeekendNight');
      }

      // If no preferences, can work any shift
      return true;
    });
  }

  /**
   * Group weeks into 2-week blocks for cohort rotation
   */
  createNightBlocks(weeks) {
    const blocks = [];
    let currentBlock = [];

    weeks.forEach((week, index) => {
      currentBlock.push(week);
      if (currentBlock.length === this.consistencyWeeks || index === weeks.length - 1) {
        blocks.push({
          weeks: [...currentBlock],
          days: currentBlock.flat()
        });
        currentBlock = [];
      }
    });

    return blocks;
  }

  /**
   * Select cohort for a night block
   */
  selectCohort(eligibleEngineers, block, schedule, previousCohort = []) {
    const cohort = [];
    const cohortSize = Math.min(this.preferredEngineers, eligibleEngineers.length);

    // Score engineers based on:
    // 1. Availability during the block
    // 2. Not in previous cohort (for rotation)
    // 3. Night shift preference in their profile
    const scored = eligibleEngineers.map(engineer => {
      let score = 0;

      // Availability score
      const availableDays = block.days.filter(day => {
        const dateStr = toDateString(day);
        return schedule[engineer.id]?.[dateStr] !== SHIFTS.UNAVAILABLE;
      }).length;
      const availabilityRatio = availableDays / block.days.length;
      score += availabilityRatio * 50;

      // Rotation bonus (not in previous cohort)
      if (!previousCohort.includes(engineer.id)) {
        score += 30;
      }

      // Preference bonus
      if (engineer.preferences?.includes(SHIFTS.NIGHT)) {
        score += 20;
      }

      return { engineer, score, availabilityRatio };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Select top engineers with adequate availability
    for (const { engineer, availabilityRatio } of scored) {
      if (cohort.length >= cohortSize) break;
      if (availabilityRatio >= 0.5) { // At least 50% availability
        cohort.push(engineer);
      }
    }

    return cohort;
  }

  /**
   * Assign night shifts for a block
   */
  assignNightShiftsForBlock(schedule, cohort, block, days) {
    const errors = [];
    const assignments = [];

    for (const day of block.days) {
      const dateStr = toDateString(day);
      const isWknd = isWeekend(day);
      const minRequired = this.minEngineers;
      let assigned = 0;

      for (const engineer of cohort) {
        if (assigned >= this.preferredEngineers) break;

        // Check current state
        const currentValue = schedule[engineer.id]?.[dateStr];
        if (currentValue !== null && currentValue !== undefined) continue;

        // Check availability
        if (currentValue === SHIFTS.UNAVAILABLE) continue;

        // Check preference
        if (!this.canWorkNight(engineer, isWknd)) continue;

        // Check transition from previous day
        const prevDateStr = toDateString(getPreviousDay(day));
        const prevShift = schedule[engineer.id]?.[prevDateStr];
        const violation = getTransitionViolation(prevShift, SHIFTS.NIGHT);
        if (violation) continue;

        // Assign night shift
        schedule[engineer.id][dateStr] = SHIFTS.NIGHT;
        assigned++;
        assignments.push({ engineerId: engineer.id, date: dateStr, shift: SHIFTS.NIGHT });
      }

      if (assigned < minRequired) {
        errors.push({
          type: 'coverage_failure',
          shift: SHIFTS.NIGHT,
          date: dateStr,
          message: `Night shift on ${dateStr}: only ${assigned} engineers, need ${minRequired}`,
          shortfall: minRequired - assigned
        });
      }
    }

    return { errors, assignments };
  }

  /**
   * Check if engineer can work night shift
   */
  canWorkNight(engineer, isWeekend) {
    if (!engineer.preferences || engineer.preferences.length === 0) {
      return true;
    }

    if (isWeekend) {
      return engineer.preferences.includes('WeekendNight') ||
             (!engineer.preferences.some(p => p.startsWith('Weekend')) &&
              engineer.preferences.includes(SHIFTS.NIGHT));
    }

    return engineer.preferences.includes(SHIFTS.NIGHT);
  }

  /**
   * Execute night shift strategy
   */
  execute(schedule, engineers, days, weeks) {
    const eligible = this.getEligibleEngineers(engineers);
    const errors = [];
    const warnings = [];

    if (eligible.length < this.minEngineers) {
      errors.push({
        type: 'insufficient_coverage',
        shift: SHIFTS.NIGHT,
        message: `Only ${eligible.length} engineers can work nights. Minimum ${this.minEngineers} required.`
      });
      return { success: false, errors, schedule };
    }

    const blocks = this.createNightBlocks(weeks);
    let previousCohort = [];

    for (const block of blocks) {
      const cohort = this.selectCohort(eligible, block, schedule, previousCohort);

      if (cohort.length < this.minEngineers) {
        warnings.push({
          type: 'reduced_cohort',
          message: `Night cohort reduced to ${cohort.length} engineers for block starting ${toDateString(block.days[0])}`
        });
      }

      const result = this.assignNightShiftsForBlock(schedule, cohort, block, days);
      errors.push(...result.errors);

      // Update previous cohort for rotation
      previousCohort = cohort.map(e => e.id);
    }

    return {
      success: errors.filter(e => e.type === 'coverage_failure').length === 0,
      errors,
      warnings,
      schedule
    };
  }
}

export default NightShiftStrategy;
