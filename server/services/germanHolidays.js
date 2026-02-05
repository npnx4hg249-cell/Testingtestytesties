/**
 * German Holiday Service
 *
 * Provides federal and state-specific holidays for Germany.
 * All 16 German states (Bundesländer) are supported.
 */

import { addDays, getYear, format } from 'date-fns';

// German state codes
export const GERMAN_STATES = {
  BW: 'Baden-Württemberg',
  BY: 'Bavaria (Bayern)',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hesse (Hessen)',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Lower Saxony (Niedersachsen)',
  NW: 'North Rhine-Westphalia (Nordrhein-Westfalen)',
  RP: 'Rhineland-Palatinate (Rheinland-Pfalz)',
  SL: 'Saarland',
  SN: 'Saxony (Sachsen)',
  ST: 'Saxony-Anhalt (Sachsen-Anhalt)',
  SH: 'Schleswig-Holstein',
  TH: 'Thuringia (Thüringen)'
};

/**
 * Calculate Easter Sunday using the Anonymous Gregorian algorithm
 */
function calculateEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

/**
 * Get fixed-date federal holidays
 */
function getFixedFederalHolidays(year) {
  return [
    { date: `${year}-01-01`, name: 'Neujahrstag', nameEn: 'New Year\'s Day', type: 'federal' },
    { date: `${year}-05-01`, name: 'Tag der Arbeit', nameEn: 'Labour Day', type: 'federal' },
    { date: `${year}-10-03`, name: 'Tag der Deutschen Einheit', nameEn: 'German Unity Day', type: 'federal' },
    { date: `${year}-12-25`, name: '1. Weihnachtsfeiertag', nameEn: 'Christmas Day', type: 'federal' },
    { date: `${year}-12-26`, name: '2. Weihnachtsfeiertag', nameEn: 'St. Stephen\'s Day', type: 'federal' }
  ];
}

/**
 * Get Easter-dependent federal holidays
 */
function getEasterDependentFederalHolidays(year) {
  const easter = calculateEasterSunday(year);

  return [
    {
      date: format(addDays(easter, -2), 'yyyy-MM-dd'),
      name: 'Karfreitag',
      nameEn: 'Good Friday',
      type: 'federal'
    },
    {
      date: format(easter, 'yyyy-MM-dd'),
      name: 'Ostersonntag',
      nameEn: 'Easter Sunday',
      type: 'federal'
    },
    {
      date: format(addDays(easter, 1), 'yyyy-MM-dd'),
      name: 'Ostermontag',
      nameEn: 'Easter Monday',
      type: 'federal'
    },
    {
      date: format(addDays(easter, 39), 'yyyy-MM-dd'),
      name: 'Christi Himmelfahrt',
      nameEn: 'Ascension Day',
      type: 'federal'
    },
    {
      date: format(addDays(easter, 49), 'yyyy-MM-dd'),
      name: 'Pfingstsonntag',
      nameEn: 'Whit Sunday',
      type: 'federal'
    },
    {
      date: format(addDays(easter, 50), 'yyyy-MM-dd'),
      name: 'Pfingstmontag',
      nameEn: 'Whit Monday',
      type: 'federal'
    }
  ];
}

/**
 * Get state-specific holidays
 */
function getStateHolidays(year) {
  const easter = calculateEasterSunday(year);

  const stateHolidays = [];

  // Heilige Drei Könige (Epiphany) - January 6
  // States: BW, BY, ST
  stateHolidays.push({
    date: `${year}-01-06`,
    name: 'Heilige Drei Könige',
    nameEn: 'Epiphany',
    type: 'state',
    states: ['BW', 'BY', 'ST']
  });

  // Internationaler Frauentag (International Women's Day) - March 8
  // States: BE, MV
  stateHolidays.push({
    date: `${year}-03-08`,
    name: 'Internationaler Frauentag',
    nameEn: 'International Women\'s Day',
    type: 'state',
    states: ['BE', 'MV']
  });

  // Fronleichnam (Corpus Christi) - 60 days after Easter
  // States: BW, BY, HE, NW, RP, SL, SN (parts), TH (parts)
  stateHolidays.push({
    date: format(addDays(easter, 60), 'yyyy-MM-dd'),
    name: 'Fronleichnam',
    nameEn: 'Corpus Christi',
    type: 'state',
    states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']
  });

  // Mariä Himmelfahrt (Assumption of Mary) - August 15
  // States: BY (parts), SL
  stateHolidays.push({
    date: `${year}-08-15`,
    name: 'Mariä Himmelfahrt',
    nameEn: 'Assumption of Mary',
    type: 'state',
    states: ['SL']
  });

  // Weltkindertag (World Children's Day) - September 20
  // States: TH
  stateHolidays.push({
    date: `${year}-09-20`,
    name: 'Weltkindertag',
    nameEn: 'World Children\'s Day',
    type: 'state',
    states: ['TH']
  });

  // Reformationstag (Reformation Day) - October 31
  // States: BB, HB, HH, MV, NI, SN, ST, SH, TH
  stateHolidays.push({
    date: `${year}-10-31`,
    name: 'Reformationstag',
    nameEn: 'Reformation Day',
    type: 'state',
    states: ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']
  });

  // Allerheiligen (All Saints' Day) - November 1
  // States: BW, BY, NW, RP, SL
  stateHolidays.push({
    date: `${year}-11-01`,
    name: 'Allerheiligen',
    nameEn: 'All Saints\' Day',
    type: 'state',
    states: ['BW', 'BY', 'NW', 'RP', 'SL']
  });

  // Buß- und Bettag (Repentance Day) - Wednesday before Nov 23
  // States: SN
  const nov23 = new Date(year, 10, 23); // November 23
  let bussUndBettag = nov23;
  // Find the Wednesday before Nov 23
  while (bussUndBettag.getDay() !== 3) { // 3 = Wednesday
    bussUndBettag = addDays(bussUndBettag, -1);
  }
  stateHolidays.push({
    date: format(bussUndBettag, 'yyyy-MM-dd'),
    name: 'Buß- und Bettag',
    nameEn: 'Repentance Day',
    type: 'state',
    states: ['SN']
  });

  return stateHolidays;
}

/**
 * Get all holidays for a given year
 * @param {number} year - The year to get holidays for
 * @param {string[]} states - Optional array of state codes to include state holidays for
 * @returns {Array} Array of holiday objects
 */
export function getHolidaysForYear(year, states = null) {
  const holidays = [
    ...getFixedFederalHolidays(year),
    ...getEasterDependentFederalHolidays(year)
  ];

  // Add state holidays
  const stateHolidays = getStateHolidays(year);

  if (states && states.length > 0) {
    // Filter state holidays to only include relevant states
    stateHolidays.forEach(holiday => {
      const relevantStates = holiday.states.filter(s => states.includes(s));
      if (relevantStates.length > 0) {
        holidays.push({
          ...holiday,
          states: relevantStates
        });
      }
    });
  } else {
    // Include all state holidays
    holidays.push(...stateHolidays);
  }

  // Sort by date
  holidays.sort((a, b) => a.date.localeCompare(b.date));

  return holidays;
}

/**
 * Get holidays for a specific month
 * @param {number} year - The year
 * @param {number} month - The month (1-12)
 * @param {string[]} states - Optional array of state codes
 * @returns {Array} Array of holiday objects
 */
export function getHolidaysForMonth(year, month, states = null) {
  const allHolidays = getHolidaysForYear(year, states);
  const monthStr = month.toString().padStart(2, '0');

  return allHolidays.filter(h => h.date.startsWith(`${year}-${monthStr}`));
}

/**
 * Check if a date is a holiday
 * @param {string} dateStr - Date in 'yyyy-MM-dd' format
 * @param {string[]} states - Optional array of state codes
 * @returns {Object|null} Holiday object if found, null otherwise
 */
export function isHoliday(dateStr, states = null) {
  const year = parseInt(dateStr.substring(0, 4));
  const holidays = getHolidaysForYear(year, states);

  return holidays.find(h => h.date === dateStr) || null;
}

/**
 * Get holidays applicable to an engineer based on their state
 * @param {number} year - The year
 * @param {string} engineerState - The state code of the engineer
 * @returns {Array} Array of holiday objects
 */
export function getHolidaysForEngineer(year, engineerState) {
  const federalHolidays = [
    ...getFixedFederalHolidays(year),
    ...getEasterDependentFederalHolidays(year)
  ];

  const stateHolidays = getStateHolidays(year).filter(h =>
    h.states.includes(engineerState)
  );

  return [...federalHolidays, ...stateHolidays].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Get all German state codes and names
 */
export function getAllStates() {
  return Object.entries(GERMAN_STATES).map(([code, name]) => ({
    code,
    name
  }));
}

export default {
  getHolidaysForYear,
  getHolidaysForMonth,
  isHoliday,
  getHolidaysForEngineer,
  getAllStates,
  GERMAN_STATES
};
