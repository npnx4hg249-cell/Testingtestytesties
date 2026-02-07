/**
 * Unified Data Store for Shifter for ICES
 *
 * Single "users" collection replaces separate engineers/users.
 * Each user has flags: isAdmin, isManager, isFloater, inTraining
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
  schedules: [],
  requests: [],
  settings: {
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtpSecure: false,
    updateCheckInterval: 'daily',
    defaultCoverage: {
      weekday: { Early: 3, Morning: 3, Late: 3, Night: 2 },
      weekend: { Early: 2, Morning: 2, Late: 2, Night: 2 }
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

      // Migration: Convert old engineers to unified users
      if (store.engineers && store.engineers.length > 0) {
        migrateEngineersToUsers();
      }
    } catch (error) {
      console.error('Error loading data file, using defaults:', error);
      store = { ...defaultData };
    }
  } else {
    store = { ...defaultData };
    // Create default admin user with strong password
    const adminPassword = bcrypt.hashSync('Admin123!@#', 10);
    store.users.push({
      id: uuidv4(),
      email: 'admin@example.com',
      password: adminPassword,
      name: 'System Admin',
      isAdmin: true,
      isManager: true,
      isFloater: false,
      inTraining: false,
      tier: 'T1',
      state: null,
      preferences: [],
      unavailableDays: [],
      isActive: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorForced: false,
      darkMode: false,
      emailNotifications: true,
      notifications: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    saveStore();
  }

  return store;
}

/**
 * Migrate old engineers collection to unified users
 */
function migrateEngineersToUsers() {
  console.log('Migrating engineers to unified users...');

  for (const engineer of store.engineers) {
    // Check if user already exists with this email
    const existingUser = store.users.find(u =>
      u.email && u.email.toLowerCase() === (engineer.email || '').toLowerCase()
    );

    if (existingUser) {
      // Merge engineer data into existing user
      existingUser.tier = engineer.tier || existingUser.tier || 'T2';
      existingUser.isFloater = engineer.isFloater || false;
      existingUser.inTraining = engineer.inTraining || false;
      existingUser.state = engineer.state || existingUser.state;
      existingUser.preferences = engineer.preferences || existingUser.preferences || [];
      existingUser.unavailableDays = engineer.unavailableDays || existingUser.unavailableDays || [];
      existingUser.isActive = engineer.isActive !== false;
    } else {
      // Create new user from engineer (with temporary password)
      const tempPassword = bcrypt.hashSync('ChangeMe123!', 10);
      store.users.push({
        id: engineer.id, // Keep same ID for schedule compatibility
        email: engineer.email || `user-${engineer.id}@temp.local`,
        password: tempPassword,
        name: engineer.name,
        isAdmin: false,
        isManager: false,
        isFloater: engineer.isFloater || false,
        inTraining: engineer.inTraining || false,
        tier: engineer.tier || 'T2',
        state: engineer.state || null,
        preferences: engineer.preferences || [],
        unavailableDays: engineer.unavailableDays || [],
        unavailableTypes: engineer.unavailableTypes || {},
        unavailableNotes: engineer.unavailableNotes || {},
        isActive: engineer.isActive !== false,
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorForced: false,
        darkMode: false,
        emailNotifications: true,
        notifications: [{
          type: 'system',
          message: 'Your account was migrated. Please change your password.',
          date: new Date().toISOString(),
          read: false
        }],
        needsPasswordChange: true,
        createdAt: engineer.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }

  // Remove old engineers collection
  delete store.engineers;
  saveStore();
  console.log('Migration complete.');
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

// ============== Generic CRUD Functions ==============

export function getAll(collection) {
  return store[collection] || [];
}

export function getById(collection, id) {
  const items = store[collection] || [];
  return items.find(item => item.id === id);
}

export function find(collection, predicate) {
  const items = store[collection] || [];
  return items.filter(predicate);
}

export function findOne(collection, predicate) {
  const items = store[collection] || [];
  return items.find(predicate);
}

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

// ============== Settings Functions ==============

export function getSettings() {
  return store.settings || defaultData.settings;
}

export function updateSettings(settings) {
  store.settings = { ...store.settings, ...settings };
  saveStore();
  return store.settings;
}

// ============== User Functions ==============

/**
 * Create a new user
 */
export function createUser(userData) {
  const hashedPassword = bcrypt.hashSync(userData.password, 10);

  return create('users', {
    email: userData.email,
    password: hashedPassword,
    name: userData.name,
    isAdmin: userData.isAdmin || false,
    isManager: userData.isManager || false,
    isFloater: userData.isFloater || false,
    inTraining: userData.inTraining || false,
    tier: userData.tier || 'T2',
    state: userData.state || null,
    preferences: userData.preferences || [],
    unavailableDays: userData.unavailableDays || [],
    isActive: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorForced: userData.twoFactorForced || false,
    darkMode: false,
    emailNotifications: true,
    notifications: []
  });
}

/**
 * Find user by email
 */
export function findUserByEmail(email) {
  if (!email) return null;
  return findOne('users', u => u.email && u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Validate user password
 */
export function validatePassword(user, password) {
  if (!user || !user.password || !password) return false;
  return bcrypt.compareSync(password, user.password);
}

/**
 * Get active users (for scheduling)
 */
export function getActiveUsers() {
  return find('users', u => u.isActive && !u.isAdmin);
}

/**
 * Get users eligible for scheduling (not admin-only)
 */
export function getSchedulableUsers() {
  return find('users', u => u.isActive && !u.isAdmin);
}

/**
 * Add notification to user
 */
export function addNotification(userId, notification) {
  const user = getById('users', userId);
  if (!user) return null;

  const notifications = user.notifications || [];
  notifications.unshift({
    id: uuidv4(),
    ...notification,
    date: new Date().toISOString(),
    read: false
  });

  // Keep only last 50 notifications
  if (notifications.length > 50) {
    notifications.length = 50;
  }

  return update('users', userId, { notifications });
}

/**
 * Mark notifications as read
 */
export function markNotificationsRead(userId, notificationIds = null) {
  const user = getById('users', userId);
  if (!user) return null;

  const notifications = (user.notifications || []).map(n => {
    if (notificationIds === null || notificationIds.includes(n.id)) {
      return { ...n, read: true };
    }
    return n;
  });

  return update('users', userId, { notifications });
}

// ============== Schedule Functions ==============

export function createSchedule(scheduleData) {
  return create('schedules', {
    month: scheduleData.month,
    year: scheduleData.year,
    status: 'draft',
    data: scheduleData.data,
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

export function getScheduleForMonth(year, month) {
  const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
  return find('schedules', s => s.month === monthStr)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
}

export function getPublishedScheduleForMonth(year, month) {
  const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
  return findOne('schedules', s => s.month === monthStr && s.status === 'published');
}

export function getPublishedSchedules(limit = 5) {
  return find('schedules', s => s.status === 'published')
    .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt))
    .slice(0, limit);
}

// ============== Request Functions ==============

export function createRequest(requestData) {
  return create('requests', {
    userId: requestData.userId,
    userName: requestData.userName,
    type: requestData.type,
    status: 'pending',
    dates: requestData.dates || [],
    details: requestData.details || {},
    reason: requestData.reason || '',
    leadTimeDays: requestData.leadTimeDays,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null
  });
}

export function getPendingRequests() {
  return find('requests', r => r.status === 'pending')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function getRequestsForUser(userId) {
  return find('requests', r => r.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function reviewRequest(requestId, status, reviewerId, notes = '') {
  return update('requests', requestId, {
    status,
    reviewedBy: reviewerId,
    reviewedAt: new Date().toISOString(),
    reviewNotes: notes
  });
}

export function getApprovedRequestsForMonth(year, month) {
  const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
  return find('requests', r =>
    r.status === 'approved' &&
    r.dates.some(d => d.startsWith(monthStr))
  );
}

// Legacy compatibility aliases
export const createEngineer = createUser;
export const getActiveEngineers = getActiveUsers;
export const getRequestsForEngineer = getRequestsForUser;

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
  getActiveUsers,
  getSchedulableUsers,
  addNotification,
  markNotificationsRead,
  createSchedule,
  getScheduleForMonth,
  getPublishedScheduleForMonth,
  getPublishedSchedules,
  createRequest,
  getPendingRequests,
  getRequestsForUser,
  reviewRequest,
  getApprovedRequestsForMonth,
  // Legacy aliases
  createEngineer,
  getActiveEngineers,
  getRequestsForEngineer
};
