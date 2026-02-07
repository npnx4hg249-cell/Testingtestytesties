/**
 * Date Utilities for Schedule Generation
 * Provides consistent date handling across the scheduler
 */

import {
  startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  format, startOfWeek, endOfWeek, addDays, isSameDay,
  differenceInDays, isWeekend as dateFnsIsWeekend,
  parseISO, isValid
} from 'date-fns';

/**
 * Format a date to YYYY-MM-DD string
 */
export function toDateString(date) {
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return format(date, 'yyyy-MM-dd');
}

/**
 * Parse a date string to Date object
 */
export function parseDate(dateStr) {
  if (dateStr instanceof Date) return dateStr;
  const parsed = parseISO(dateStr);
  return isValid(parsed) ? parsed : new Date(dateStr);
}

/**
 * Get all days in a month
 */
export function getMonthDays(monthDate) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  return eachDayOfInterval({ start, end });
}

/**
 * Get weeks in a month (Monday-Sunday)
 */
export function getWeeks(monthDate) {
  const days = getMonthDays(monthDate);
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
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date) {
  const d = parseDate(date);
  return dateFnsIsWeekend(d);
}

/**
 * Check if a date is a Saturday
 */
export function isSaturday(date) {
  const d = parseDate(date);
  return getDay(d) === 6;
}

/**
 * Check if a date is a Sunday
 */
export function isSunday(date) {
  const d = parseDate(date);
  return getDay(d) === 0;
}

/**
 * Get day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
export function getDayOfWeek(date) {
  const d = parseDate(date);
  return getDay(d);
}

/**
 * Get previous day
 */
export function getPreviousDay(date) {
  return addDays(parseDate(date), -1);
}

/**
 * Get next day
 */
export function getNextDay(date) {
  return addDays(parseDate(date), 1);
}

/**
 * Check if two dates are the same day
 */
export function areSameDay(date1, date2) {
  return isSameDay(parseDate(date1), parseDate(date2));
}

/**
 * Get the difference in days between two dates
 */
export function daysDifference(date1, date2) {
  return differenceInDays(parseDate(date1), parseDate(date2));
}

/**
 * Get start of week (Monday)
 */
export function getWeekStart(date) {
  return startOfWeek(parseDate(date), { weekStartsOn: 1 });
}

/**
 * Get end of week (Sunday)
 */
export function getWeekEnd(date) {
  return endOfWeek(parseDate(date), { weekStartsOn: 1 });
}

/**
 * Get all days in a week containing the given date
 */
export function getWeekDays(date) {
  const start = getWeekStart(date);
  const end = getWeekEnd(date);
  return eachDayOfInterval({ start, end });
}

/**
 * Check if a date falls within a range (inclusive)
 */
export function isDateInRange(date, startDate, endDate) {
  const d = parseDate(date);
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return d >= start && d <= end;
}

/**
 * Get the month and year from a date
 */
export function getMonthYear(date) {
  const d = parseDate(date);
  return {
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    monthName: format(d, 'MMMM'),
    formatted: format(d, 'yyyy-MM')
  };
}

/**
 * Generate a range of dates
 */
export function dateRange(startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  return eachDayOfInterval({ start, end });
}

/**
 * Find which week a day belongs to within the month's weeks
 */
export function findWeekIndex(weeks, date) {
  const d = parseDate(date);
  return weeks.findIndex(week =>
    week.some(weekDay => isSameDay(weekDay, d))
  );
}

/**
 * Group days by weeks for processing
 */
export function groupDaysByWeek(days) {
  const weeks = [];
  let currentWeek = [];

  days.forEach(day => {
    const dayOfWeek = getDay(day);
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

export default {
  toDateString,
  parseDate,
  getMonthDays,
  getWeeks,
  isWeekend,
  isSaturday,
  isSunday,
  getDayOfWeek,
  getPreviousDay,
  getNextDay,
  areSameDay,
  daysDifference,
  getWeekStart,
  getWeekEnd,
  getWeekDays,
  isDateInRange,
  getMonthYear,
  dateRange,
  findWeekIndex,
  groupDaysByWeek
};
