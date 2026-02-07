#!/usr/bin/env node

/**
 * CC Shifter - Test Data Seeder
 *
 * Run this script to populate the database with sample engineers
 * so you can immediately test the schedule generation.
 *
 * Usage: node seed-test-data.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'server/data/storage');
const DATA_FILE = join(DATA_DIR, 'data.json');

// German states
const STATES = ['BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV', 'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'];

// Sample engineer names
const ENGINEER_NAMES = [
  'Anna Schmidt', 'Max Mueller', 'Sophie Weber', 'Leon Fischer',
  'Emma Wagner', 'Paul Becker', 'Mia Hoffmann', 'Felix Schulz',
  'Lena Koch', 'Jonas Richter', 'Laura Klein', 'David Wolf',
  'Sarah Braun', 'Tim Zimmermann', 'Julia Krause', 'Lukas Hartmann',
  'Hannah Meyer', 'Jan Lehmann', 'Lisa Werner', 'Niklas Schmitt',
  'Marie Lang', 'Tom Schwarz', 'Josh Migura' // Special case from requirements
];

function createEngineer(name, index) {
  const tiers = ['T1', 'T2', 'T3'];
  const shifts = ['Early', 'Morning', 'Late', 'Night'];

  // First 2 engineers are floaters
  const isFloater = index < 2;

  // Assign tiers: first few T1, middle T2, rest T3
  let tier;
  if (index < 5) tier = 'T1';
  else if (index < 15) tier = 'T2';
  else tier = 'T3';

  // Random state
  const state = STATES[Math.floor(Math.random() * STATES.length)];

  // Random preferences (at least 2 shifts)
  let preferences;
  if (name === 'Josh Migura') {
    // Josh can work all shifts
    preferences = [...shifts];
  } else {
    // Random 2-4 shift preferences
    const numPrefs = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...shifts].sort(() => Math.random() - 0.5);
    preferences = shuffled.slice(0, numPrefs);
  }

  return {
    id: uuidv4(),
    name,
    email: name.toLowerCase().replace(' ', '.') + '@example.com',
    tier,
    isFloater,
    state,
    preferences,
    unavailableDays: [],
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function createData() {
  const adminPassword = bcrypt.hashSync('Admin123!@#', 10);

  // Create engineers
  const engineers = ENGINEER_NAMES.map((name, index) => createEngineer(name, index));

  // Create admin user
  const adminUser = {
    id: uuidv4(),
    email: 'admin@example.com',
    password: adminPassword,
    name: 'Admin',
    role: 'admin',
    engineerId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Create manager user linked to first non-floater engineer
  const managerEngineer = engineers[2]; // First non-floater
  const managerUser = {
    id: uuidv4(),
    email: managerEngineer.email,
    password: bcrypt.hashSync('manager123', 10),
    name: managerEngineer.name,
    role: 'manager',
    engineerId: managerEngineer.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Create engineer users for the first 5 engineers
  const engineerUsers = engineers.slice(3, 8).map(eng => ({
    id: uuidv4(),
    email: eng.email,
    password: bcrypt.hashSync('password123', 10),
    name: eng.name,
    role: 'engineer',
    engineerId: eng.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }));

  return {
    users: [adminUser, managerUser, ...engineerUsers],
    engineers,
    schedules: [],
    requests: [],
    preferences: [],
    settings: {
      defaultCoverage: {
        weekday: { Early: 3, Morning: 3, Late: 3, Night: 2 },
        weekend: { Early: 2, Morning: 2, Late: 2, Night: 2 }
      }
    }
  };
}

// Main
console.log('CC Shifter - Test Data Seeder');
console.log('==============================\n');

// Create directory
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created data directory');
}

// Generate and save data
const data = createData();
writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

console.log(`Created ${data.engineers.length} engineers:`);
console.log(`  - Floaters: ${data.engineers.filter(e => e.isFloater).length}`);
console.log(`  - Core Engineers: ${data.engineers.filter(e => !e.isFloater).length}`);
console.log(`  - T1: ${data.engineers.filter(e => e.tier === 'T1').length}`);
console.log(`  - T2: ${data.engineers.filter(e => e.tier === 'T2').length}`);
console.log(`  - T3: ${data.engineers.filter(e => e.tier === 'T3').length}`);
console.log('');
console.log(`Created ${data.users.length} user accounts:`);
console.log('');
console.log('Login Credentials:');
console.log('------------------');
console.log('Admin:    admin@example.com / Admin123!@#');
console.log(`Manager:  ${data.users[1].email} / manager123`);
console.log(`Engineer: ${data.users[2].email} / password123`);
console.log('');
console.log('Data saved to: ' + DATA_FILE);
console.log('');
console.log('You can now run the application with: npm run dev');
