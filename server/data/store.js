/**
 * Simple JSON-based data store for ICES-Shifter
 *
 * In production, this would be replaced with a proper database.
 * This file provides in-memory storage with file persistence.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, 'storage');
const DATA_FILE = join(DATA_DIR, 'data.json');

// Default data structure
const defaultData = {
  users: [],
  engineers: [],
  schedules: [],
  requests: [],
  preferences: [],
  settings: {
    defaultCoverage: {
      weekday: {
        Early: 3,
        Morning: 3,
        Late: 3,
        Night: 2
      },
      weekend: {
        Early: 2,
        Morning: 2,
        Late: 2,
        Night: 2
      }
    }
  }
};

// In-memory store
let store = null;

/**
 * Initialize the store
 */
export function initStore() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  if (existsSync(DATA_FILE)) {
    try {
      const data = readFileSync(DATA_FILE, 'utf-8');
      store = JSON.parse(data);
    } catch (error) {
      console.error('Error loading data file, using defaults:', error);
      store = { ...defaultData };
    }
  } else {
    store = { ...defaultData };
    // Create default admin user
    const adminPassword = bcrypt.hashSync('admin123', 10);
    store.users.push({
      id: uuidv4(),
      email: 'admin@example.com',
      password: adminPassword,
      name: 'Admin',
      role: 'admin',
      createdAt: new Date().toISOString()
    });
    saveStore();
  }

  return store;
}

/**
 * Save store to disk
 */
export function saveStore() {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (error) {
    console.error('Error saving data file:', error);
  }
}

/**
 * Get all items from a collection
 */
export function getAll(collection) {
  return store[collection] || [];
}

/**
 * Get item by ID
 */
export function getById(collection, id) {
  const items = store[collection] || [];
  return items.find(item => item.id === id);
}

/**
 * Find items matching criteria
 */
export function find(collection, predicate) {
  const items = store[collection] || [];
  return items.filter(predicate);
}

/**
 * Find one item matching criteria
 */
export function findOne(collection, predicate) {
  const items = store[collection] || [];
  return items.find(predicate);
}

/**
 * Create new item
 */
export function create(collection, data) {
  const item = {
    id: uuidv4(),
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!store[collection]) {
    store[collection] = [];
  }

  store[collection].push(item);
  saveStore();

  return item;
}

/**
 * Update item
 */
export function update(collection, id, data) {
  const items = store[collection] || [];
  const index = items.findIndex(item => item.id === id);

  if (index === -1) {
    return null;
  }

  store[collection][index] = {
    ...store[collection][index],
    ...data,
    updatedAt: new Date().toISOString()
  };

  saveStore();
  return store[collection][index];
}

/**
 * Delete item
 */
export function remove(collection, id) {
  const items = store[collection] || [];
  const index = items.findIndex(item => item.id === id);

  if (index === -1) {
    return false;
  }

  store[collection].splice(index, 1);
  saveStore();
  return true;
}

/**
 * Get settings
 */
export function getSettings() {
  return store.settings;
}

/**
 * Update settings
 */
export function updateSettings(settings) {
  store.settings = {
    ...store.settings,
    ...settings
  };
  saveStore();
  return store.settings;
}

// ============== User-specific functions ==============

/**
 * Create a new user
 */
export function createUser(userData) {
  const hashedPassword = bcrypt.hashSync(userData.password, 10);

  return create('users', {
    email: userData.email,
    password: hashedPassword,
    name: userData.name,
    role: userData.role || 'engineer',
    engineerId: userData.engineerId || null
  });
}

/**
 * Find user by email
 */
export function findUserByEmail(email) {
  return findOne('users', u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Validate user password
 */
export function validatePassword(user, password) {
  return bcrypt.compareSync(password, user.password);
}

// ============== Engineer-specific functions ==============

/**
 * Create a new engineer
 */
export function createEngineer(engineerData) {
  return create('engineers', {
    name: engineerData.name,
    email: engineerData.email,
    tier: engineerData.tier || 'T2',
    isFloater: engineerData.isFloater || false,
    state: engineerData.state || null, // German state code
    preferences: engineerData.preferences || [], // Shift preferences
    unavailableDays: engineerData.unavailableDays || [],
    isActive: true
  });
}

/**
 * Get active engineers
 */
export function getActiveEngineers() {
  return find('engineers', e => e.isActive);
}

// ============== Schedule-specific functions ==============

/**
 * Create a new schedule
 */
export function createSchedule(scheduleData) {
  return create('schedules', {
    month: scheduleData.month, // 'YYYY-MM' format
    year: scheduleData.year,
    status: 'draft', // draft, published, archived
    data: scheduleData.data, // The actual schedule object
    stats: scheduleData.stats || null,
    createdBy: scheduleData.createdBy,
    publishedAt: null,
    archivedAt: null,
    isPartial: scheduleData.isPartial || false,
    generationErrors: scheduleData.generationErrors || [],
    validationErrors: scheduleData.validationErrors || [],
    editHistory: []
  });
}

/**
 * Get schedule for a month
 */
export function getScheduleForMonth(year, month) {
  const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
  return find('schedules', s => s.month === monthStr)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

/**
 * Get published schedule for a month
 */
export function getPublishedScheduleForMonth(year, month) {
  const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
  return findOne('schedules', s => s.month === monthStr && s.status === 'published');
}

// ============== Request-specific functions ==============

/**
 * Create a scheduling request
 */
export function createRequest(requestData) {
  return create('requests', {
    engineerId: requestData.engineerId,
    engineerName: requestData.engineerName,
    type: requestData.type, // 'time_off', 'shift_change', 'preference_update'
    status: 'pending', // pending, approved, rejected
    dates: requestData.dates || [],
    details: requestData.details || {},
    reason: requestData.reason || '',
    leadTimeDays: requestData.leadTimeDays,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null
  });
}

/**
 * Get pending requests
 */
export function getPendingRequests() {
  return find('requests', r => r.status === 'pending')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

/**
 * Get requests for an engineer
 */
export function getRequestsForEngineer(engineerId) {
  return find('requests', r => r.engineerId === engineerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Review a request (approve/reject)
 */
export function reviewRequest(requestId, status, reviewerId, notes = '') {
  return update('requests', requestId, {
    status,
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
    reviewNotes: notes
  });
}

/**
 * Get approved requests for schedule generation
 */
export function getApprovedRequestsForMonth(year, month) {
  const monthStr = `${year}-${month.toString().padStart(2, '0')}`;

  return find('requests', r =>
    r.status === 'approved' &&
    r.dates.some(d => d.startsWith(monthStr))
  );
}

export default {
  initStore,
  saveStore,
  getAll,
  getById,
  find,
  findOne,
  create,
  update,
  remove,
  getSettings,
  updateSettings,
  createUser,
  findUserByEmail,
  validatePassword,
  createEngineer,
  getActiveEngineers,
  createSchedule,
  getScheduleForMonth,
  getPublishedScheduleForMonth,
  createRequest,
  getPendingRequests,
  getRequestsForEngineer,
  reviewRequest,
  getApprovedRequestsForMonth
};
