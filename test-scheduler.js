#!/usr/bin/env node

/**
 * CC Shifter - Standalone Scheduler Test
 *
 * This script tests the constraint solver directly without starting the server.
 * It creates sample engineers and attempts to generate a schedule.
 *
 * Usage: node test-scheduler.js
 */

import { ShiftScheduler, SHIFTS, COLORS } from './server/services/constraintSolver.js';
import { getHolidaysForMonth, getAllStates } from './server/services/germanHolidays.js';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDay } from 'date-fns';

// Sample engineers (23 total: 2 floaters + 21 core)
const engineers = [
  // Floaters (2)
  { id: '1', name: 'Floater One', tier: 'T2', isFloater: true, state: 'BY', preferences: ['Early', 'Morning', 'Late'] },
  { id: '2', name: 'Floater Two', tier: 'T2', isFloater: true, state: 'NW', preferences: ['Morning', 'Late', 'Night'] },

  // Core Engineers - Night shift capable (6)
  { id: '3', name: 'Night Team Lead', tier: 'T1', isFloater: false, state: 'BE', preferences: ['Night'] },
  { id: '4', name: 'Night Engineer A', tier: 'T2', isFloater: false, state: 'HH', preferences: ['Night'] },
  { id: '5', name: 'Night Engineer B', tier: 'T2', isFloater: false, state: 'SN', preferences: ['Night', 'Late'] },
  { id: '6', name: 'Night Engineer C', tier: 'T3', isFloater: false, state: 'TH', preferences: ['Night', 'Late'] },
  { id: '7', name: 'Night Backup A', tier: 'T2', isFloater: false, state: 'BW', preferences: ['Night', 'Late'] },
  { id: '8', name: 'Night Backup B', tier: 'T3', isFloater: false, state: 'HE', preferences: ['Night'] },

  // Core Engineers - Day shifts (15)
  { id: '9', name: 'Senior Engineer A', tier: 'T1', isFloater: false, state: 'BY', preferences: ['Early', 'Morning'] },
  { id: '10', name: 'Senior Engineer B', tier: 'T1', isFloater: false, state: 'NW', preferences: ['Morning', 'Late'] },
  { id: '11', name: 'Mid Engineer A', tier: 'T2', isFloater: false, state: 'RP', preferences: ['Early', 'Morning', 'Late'] },
  { id: '12', name: 'Mid Engineer B', tier: 'T2', isFloater: false, state: 'SL', preferences: ['Early', 'Late'] },
  { id: '13', name: 'Mid Engineer C', tier: 'T2', isFloater: false, state: 'NI', preferences: ['Morning', 'Late'] },
  { id: '14', name: 'Mid Engineer D', tier: 'T2', isFloater: false, state: 'SH', preferences: ['Early', 'Morning'] },
  { id: '15', name: 'Mid Engineer E', tier: 'T2', isFloater: false, state: 'MV', preferences: ['Late'] },
  { id: '16', name: 'Mid Engineer F', tier: 'T2', isFloater: false, state: 'BB', preferences: ['Early', 'Late'] },
  { id: '17', name: 'Junior Engineer A', tier: 'T3', isFloater: false, state: 'ST', preferences: ['Early', 'Morning', 'Late'] },
  { id: '18', name: 'Junior Engineer B', tier: 'T3', isFloater: false, state: 'HB', preferences: ['Morning', 'Late'] },
  { id: '19', name: 'Junior Engineer C', tier: 'T3', isFloater: false, state: 'BY', preferences: ['Early', 'Morning'] },
  { id: '20', name: 'Junior Engineer D', tier: 'T3', isFloater: false, state: 'NW', preferences: ['Morning', 'Late'] },
  { id: '21', name: 'Junior Engineer E', tier: 'T3', isFloater: false, state: 'HE', preferences: ['Early', 'Late'] },
  { id: '22', name: 'Josh Migura', tier: 'T2', isFloater: false, state: 'BE', preferences: ['Early', 'Morning', 'Late', 'Night'] },
  { id: '23', name: 'Junior Engineer F', tier: 'T3', isFloater: false, state: 'SN', preferences: ['Early', 'Morning', 'Late'] }
];

// Add some unavailable days (vacation) for a few engineers
const today = new Date();
const year = today.getFullYear();
const month = today.getMonth() + 1; // 1-indexed

// Engineer 9 is on vacation days 5-7
engineers[8].unavailableDays = [
  `${year}-${String(month).padStart(2, '0')}-05`,
  `${year}-${String(month).padStart(2, '0')}-06`,
  `${year}-${String(month).padStart(2, '0')}-07`
];

// Engineer 15 is on vacation days 15-20
engineers[14].unavailableDays = [
  `${year}-${String(month).padStart(2, '0')}-15`,
  `${year}-${String(month).padStart(2, '0')}-16`,
  `${year}-${String(month).padStart(2, '0')}-17`,
  `${year}-${String(month).padStart(2, '0')}-18`,
  `${year}-${String(month).padStart(2, '0')}-19`,
  `${year}-${String(month).padStart(2, '0')}-20`
];

console.log('');
console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  CC Shifter - Constraint Solver Test                      ║');
console.log('╚═══════════════════════════════════════════════════════════╝');
console.log('');

// Get all unique states from engineers
const engineerStates = [...new Set(engineers.map(e => e.state))];

// Get holidays
const holidays = getHolidaysForMonth(year, month, engineerStates);

console.log(`Testing schedule generation for: ${format(new Date(year, month - 1, 1), 'MMMM yyyy')}`);
console.log('');
console.log('Engineer Summary:');
console.log(`  Total: ${engineers.length}`);
console.log(`  Core: ${engineers.filter(e => !e.isFloater).length}`);
console.log(`  Floaters: ${engineers.filter(e => e.isFloater).length}`);
console.log(`  Night-capable: ${engineers.filter(e => e.preferences.includes('Night')).length}`);
console.log('');
console.log(`Holidays this month: ${holidays.length}`);
holidays.forEach(h => {
  console.log(`  - ${h.date}: ${h.nameEn} (${h.type})`);
});
console.log('');

// Create scheduler
const scheduler = new ShiftScheduler({
  engineers,
  month: new Date(year, month - 1, 1),
  holidays,
  approvedRequests: []
});

console.log('Running constraint solver...');
console.log('');

const startTime = Date.now();
const result = scheduler.solve();
const endTime = Date.now();

console.log(`Solver completed in ${endTime - startTime}ms`);
console.log('');

if (result.success) {
  console.log('✅ SUCCESS! Schedule generated successfully.');
  console.log('');

  if (result.warnings && result.warnings.length > 0) {
    console.log('Warnings:');
    result.warnings.forEach(w => console.log(`  ⚠️  ${w}`));
    console.log('');
  }

  // Print schedule summary
  const days = eachDayOfInterval({
    start: startOfMonth(new Date(year, month - 1, 1)),
    end: endOfMonth(new Date(year, month - 1, 1))
  });

  // Print compact schedule grid
  console.log('Schedule Grid (E=Early, M=Morning, L=Late, N=Night, O=Off, U=Unavailable):');
  console.log('');

  // Header
  let header = 'Engineer'.padEnd(20);
  days.slice(0, 15).forEach(d => {
    header += format(d, 'd').padStart(3);
  });
  console.log(header);
  console.log('-'.repeat(header.length));

  // First 10 engineers
  engineers.slice(0, 10).forEach(eng => {
    let row = eng.name.substring(0, 19).padEnd(20);
    days.slice(0, 15).forEach(d => {
      const dateStr = format(d, 'yyyy-MM-dd');
      const shift = result.schedule[eng.id]?.[dateStr];
      let symbol = '-';
      if (shift === 'Early') symbol = 'E';
      else if (shift === 'Morning') symbol = 'M';
      else if (shift === 'Late') symbol = 'L';
      else if (shift === 'Night') symbol = 'N';
      else if (shift === 'OFF') symbol = 'O';
      else if (shift === 'Unavailable') symbol = 'U';
      row += symbol.padStart(3);
    });
    console.log(row);
  });
  console.log('... (showing first 10 engineers, first 15 days)');
  console.log('');

  // Stats
  console.log('Coverage Summary (sample days):');
  [1, 8, 15, 22].forEach(dayNum => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayData = result.stats?.coverageByDay?.[dateStr];
    if (dayData) {
      const dayOfWeek = format(new Date(dateStr), 'EEE');
      console.log(`  Day ${dayNum} (${dayOfWeek}): Early=${dayData.Early}, Morning=${dayData.Morning}, Late=${dayData.Late}, Night=${dayData.Night}`);
    }
  });
  console.log('');

  // Engineer stats sample
  console.log('Engineer Statistics (sample):');
  Object.values(result.stats?.engineerStats || {}).slice(0, 5).forEach(stat => {
    console.log(`  ${stat.name}: ${stat.totalShifts} shifts, ${stat.offDays} OFF, ${stat.unavailableDays} unavailable`);
  });

} else {
  console.log('❌ FAILED! Could not generate valid schedule.');
  console.log('');
  console.log('Errors:');
  result.errors?.forEach(e => {
    console.log(`  - [${e.type}] ${e.message}`);
  });
  console.log('');

  console.log('Recovery Options:');
  result.options?.forEach((opt, i) => {
    console.log(`  ${i + 1}. ${opt.title}`);
    console.log(`     ${opt.description}`);
    console.log(`     Impact: ${opt.impact}`);
    console.log('');
  });
}

console.log('');
console.log('Test complete!');
console.log('');
console.log('To run the full application:');
console.log('  1. npm install');
console.log('  2. cd client && npm install && cd ..');
console.log('  3. npm run dev');
console.log('');
