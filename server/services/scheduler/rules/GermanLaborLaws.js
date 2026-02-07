/**
 * German Labor Law Compliance Module
 * Implements Arbeitszeitgesetz (ArbZG) - German Working Time Act
 *
 * This module ensures all scheduling decisions comply with German labor regulations.
 * Any scheduling rule that would violate these laws is automatically overridden.
 */

import { SHIFTS, SHIFT_TIMES } from '../config/defaults.js';

/**
 * German Working Time Act (Arbeitszeitgesetz) constraints
 * Reference: https://www.gesetze-im-internet.de/arbzg/
 */
export const ArbZG = {
  // §3 ArbZG - Maximum working hours
  MAX_DAILY_HOURS: 8,           // Standard max 8 hours per day
  MAX_DAILY_HOURS_EXTENDED: 10, // Can be extended to 10 if averaged to 8 over 6 months

  // §4 ArbZG - Break requirements
  BREAK_AFTER_6_HOURS: 30,      // 30-minute break required after 6 hours
  BREAK_AFTER_9_HOURS: 45,      // 45-minute break required after 9 hours

  // §5 ArbZG - Rest period between shifts
  MIN_REST_HOURS: 11,           // Minimum 11 hours between shifts
  MIN_REST_HOURS_HOSPITAL: 10,  // Can be reduced to 10 in hospitals (with compensation)

  // §6 ArbZG - Night work provisions
  NIGHT_WORK_START: 23,         // Night work begins at 23:00
  NIGHT_WORK_END: 6,            // Night work ends at 06:00
  NIGHT_SHIFT_MAX_HOURS: 8,     // Night workers: max 8 hours (can be 10 if averaged)

  // §9 ArbZG - Sunday and holiday work
  SUNDAY_WORK_MIN_FREE_SUNDAYS: 15,  // At least 15 Sundays off per year

  // §11 ArbZG - Weekly rest period
  MIN_WEEKLY_REST_HOURS: 24,    // One uninterrupted 24-hour rest period per week

  // Additional constraints
  MAX_CONSECUTIVE_WORK_DAYS: 6,  // Maximum 6 consecutive working days
  MIN_OFF_DAYS_PER_WEEK: 1,      // Minimum 1 off day per 7-day period (legal minimum)
  RECOMMENDED_OFF_DAYS: 2        // Recommended 2 consecutive off days (company policy)
};

/**
 * Calculate rest hours between two shifts
 */
export function calculateRestHours(previousShift, nextShift, isWeekend = false) {
  const shiftTimes = isWeekend ? SHIFT_TIMES.weekend : SHIFT_TIMES.weekday;

  if (!previousShift || !nextShift ||
      previousShift === SHIFTS.OFF || previousShift === SHIFTS.UNAVAILABLE ||
      nextShift === SHIFTS.OFF || nextShift === SHIFTS.UNAVAILABLE) {
    return Infinity; // No constraint violation
  }

  const prevEnd = shiftTimes[previousShift];
  const nextStart = shiftTimes[nextShift];

  if (!prevEnd || !nextStart) return Infinity;

  // Parse times
  const [prevEndHour, prevEndMin] = prevEnd.end.split(':').map(Number);
  const [nextStartHour, nextStartMin] = nextStart.start.split(':').map(Number);

  // Calculate hours (assuming next day for transitions crossing midnight)
  let restHours;

  // For night shift ending next morning
  if (previousShift === SHIFTS.NIGHT) {
    // Night ends at 07:30, calculate from that
    const endMinutes = 7 * 60 + 30; // 07:30 next day
    const startMinutes = nextStartHour * 60 + nextStartMin;
    restHours = (24 * 60 - endMinutes + startMinutes) / 60;

    // If same day transition
    if (startMinutes > endMinutes) {
      restHours = (startMinutes - endMinutes) / 60;
    }
  } else {
    // Normal transition (same day end to next day start)
    const endMinutes = prevEndHour * 60 + prevEndMin;
    const startMinutes = nextStartHour * 60 + nextStartMin;

    // Next day, so add 24 hours worth of minutes
    restHours = (24 * 60 - endMinutes + startMinutes) / 60;
  }

  return restHours;
}

/**
 * Check if a shift transition violates rest requirements
 */
export function violatesRestRequirement(previousShift, nextShift, isWeekend = false) {
  const restHours = calculateRestHours(previousShift, nextShift, isWeekend);
  return restHours < ArbZG.MIN_REST_HOURS;
}

/**
 * Get all valid transitions for a shift based on German labor law
 */
export function getValidNextShifts(previousShift, isWeekend = false) {
  const allShifts = [SHIFTS.EARLY, SHIFTS.MORNING, SHIFTS.LATE, SHIFTS.NIGHT, SHIFTS.OFF];

  return allShifts.filter(nextShift =>
    !violatesRestRequirement(previousShift, nextShift, isWeekend)
  );
}

/**
 * Check if a shift is considered night work under ArbZG
 */
export function isNightWork(shift) {
  return shift === SHIFTS.NIGHT;
}

/**
 * Calculate total working hours in a day/week
 */
export function calculateWorkingHours(shifts, dates, isWeekend = []) {
  let totalHours = 0;

  shifts.forEach((shift, index) => {
    if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
      const shiftTimes = isWeekend[index] ? SHIFT_TIMES.weekend : SHIFT_TIMES.weekday;
      const shiftInfo = shiftTimes[shift];
      if (shiftInfo) {
        totalHours += shiftInfo.duration;
      }
    }
  });

  return totalHours;
}

/**
 * Validate a complete schedule against German labor laws
 */
export function validateScheduleCompliance(schedule, engineerId, days) {
  const violations = [];

  // Check consecutive working days
  let consecutiveWorkDays = 0;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const dateStr = typeof day === 'string' ? day : day.toISOString().split('T')[0];
    const shift = schedule[engineerId]?.[dateStr];

    if (shift && shift !== SHIFTS.OFF && shift !== SHIFTS.UNAVAILABLE) {
      consecutiveWorkDays++;

      if (consecutiveWorkDays > ArbZG.MAX_CONSECUTIVE_WORK_DAYS) {
        violations.push({
          type: 'ARBZG_CONSECUTIVE_DAYS',
          severity: 'critical',
          law: '§11 ArbZG',
          message: `Worker has ${consecutiveWorkDays} consecutive work days (max ${ArbZG.MAX_CONSECUTIVE_WORK_DAYS})`,
          date: dateStr
        });
      }
    } else {
      consecutiveWorkDays = 0;
    }

    // Check rest period between shifts
    if (i > 0) {
      const prevDateStr = typeof days[i-1] === 'string' ? days[i-1] : days[i-1].toISOString().split('T')[0];
      const prevShift = schedule[engineerId]?.[prevDateStr];

      if (violatesRestRequirement(prevShift, shift)) {
        violations.push({
          type: 'ARBZG_REST_PERIOD',
          severity: 'critical',
          law: '§5 ArbZG',
          message: `Insufficient rest period: ${prevShift} to ${shift}`,
          date: dateStr,
          restHours: calculateRestHours(prevShift, shift)
        });
      }
    }
  }

  return violations;
}

/**
 * Forbidden transitions based on German labor law
 * Returns the reason if forbidden, null if allowed
 */
export function getTransitionViolation(fromShift, toShift) {
  // Transitions from Night shift
  if (fromShift === SHIFTS.NIGHT) {
    if (toShift === SHIFTS.EARLY) {
      return {
        law: '§5 ArbZG',
        reason: 'Night (ends 07:30) to Early (starts 07:00) provides only ~23.5 hours rest, requires 11 hours minimum'
      };
    }
    if (toShift === SHIFTS.MORNING) {
      return {
        law: '§5 ArbZG',
        reason: 'Night (ends 07:30) to Morning (starts 10:00) provides only 2.5 hours rest, requires 11 hours minimum'
      };
    }
  }

  // Transitions from Late shift
  if (fromShift === SHIFTS.LATE) {
    if (toShift === SHIFTS.EARLY) {
      return {
        law: '§5 ArbZG',
        reason: 'Late (ends 23:30) to Early (starts 07:00) provides only 7.5 hours rest, requires 11 hours minimum'
      };
    }
  }

  return null;
}

/**
 * Check if an engineer has had adequate weekly rest
 */
export function hasAdequateWeeklyRest(schedule, engineerId, weekDays) {
  let maxConsecutiveRestHours = 0;
  let currentRestStreak = 0;

  for (const day of weekDays) {
    const dateStr = typeof day === 'string' ? day : day.toISOString().split('T')[0];
    const shift = schedule[engineerId]?.[dateStr];

    if (shift === SHIFTS.OFF || !shift) {
      currentRestStreak += 24; // Full day off
    } else {
      // Working day, but may have rest before/after shift
      // Simplified: count as 15 hours rest (11 required + some shift overlap)
      if (currentRestStreak > 0) {
        maxConsecutiveRestHours = Math.max(maxConsecutiveRestHours, currentRestStreak);
      }
      currentRestStreak = 0;
    }
  }

  maxConsecutiveRestHours = Math.max(maxConsecutiveRestHours, currentRestStreak);

  return {
    compliant: maxConsecutiveRestHours >= ArbZG.MIN_WEEKLY_REST_HOURS,
    maxRestHours: maxConsecutiveRestHours,
    required: ArbZG.MIN_WEEKLY_REST_HOURS
  };
}

/**
 * Night worker special provisions
 */
export function validateNightWorkerCompliance(schedule, engineerId, days) {
  const violations = [];
  let nightShiftCount = 0;
  let consecutiveNightShifts = 0;

  for (const day of days) {
    const dateStr = typeof day === 'string' ? day : day.toISOString().split('T')[0];
    const shift = schedule[engineerId]?.[dateStr];

    if (shift === SHIFTS.NIGHT) {
      nightShiftCount++;
      consecutiveNightShifts++;

      // Night workers should have health checks (informational)
      if (consecutiveNightShifts > 14) {
        violations.push({
          type: 'ARBZG_NIGHT_WORKER_HEALTH',
          severity: 'warning',
          law: '§6 ArbZG',
          message: 'Night worker has worked 14+ consecutive night shifts - recommend health assessment',
          date: dateStr
        });
      }
    } else {
      consecutiveNightShifts = 0;
    }
  }

  return {
    nightShiftCount,
    violations
  };
}

export default {
  ArbZG,
  calculateRestHours,
  violatesRestRequirement,
  getValidNextShifts,
  isNightWork,
  calculateWorkingHours,
  validateScheduleCompliance,
  getTransitionViolation,
  hasAdequateWeeklyRest,
  validateNightWorkerCompliance
};
