/**
 * User Routes for Shifter for ICES
 *
 * Unified user management - replaces separate engineers/users
 * Every user can have flags: isAdmin, isManager, isFloater, inTraining
 */

import { Router } from 'express';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';
import {
  getAll,
  getById,
  create,
  update,
  remove,
  createUser,
  findUserByEmail,
  getActiveUsers,
  addNotification
} from '../data/store.js';
import {
  authenticate,
  requireManager,
  requireAdmin,
  generateStrongPassword,
  validatePasswordStrength
} from '../middleware/auth.js';
import { getAllStates, getHolidaysForEngineer } from '../services/germanHolidays.js';
import { sendPasswordEmail } from '../services/emailService.js';

const router = Router();

// Valid shift preferences
const WEEKDAY_SHIFTS = ['Early', 'Morning', 'Late', 'Night'];
const WEEKEND_SHIFTS = ['WeekendEarly', 'WeekendMorning', 'WeekendLate', 'WeekendNight'];
const ALL_VALID_SHIFTS = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];

/**
 * GET /api/users
 * Get all users
 */
router.get('/', authenticate, (req, res) => {
  const { active, schedulable } = req.query;

  let users = getAll('users');

  if (active === 'true') {
    users = users.filter(u => u.isActive);
  }

  if (schedulable === 'true') {
    // Get only users who participate in scheduling (not admin-only)
    users = users.filter(u => u.isActive && !u.isAdmin);
  }

  // Don't return sensitive data
  users = users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isAdmin: u.isAdmin || false,
    isManager: u.isManager || false,
    isFloater: u.isFloater || false,
    inTraining: u.inTraining || false,
    tier: u.tier || 'T2',
    state: u.state,
    preferences: u.preferences || [],
    isActive: u.isActive !== false,
    twoFactorEnabled: u.twoFactorEnabled || false,
    twoFactorForced: u.twoFactorForced || false,
    emailNotifications: u.emailNotifications !== false,
    createdAt: u.createdAt
  }));

  res.json(users);
});

/**
 * GET /api/users/states
 * Get list of German states
 */
router.get('/states', (req, res) => {
  res.json(getAllStates());
});

/**
 * GET /api/users/shift-options
 * Get available shift preference options
 */
router.get('/shift-options', (req, res) => {
  res.json({
    weekday: WEEKDAY_SHIFTS.map(s => ({
      id: s,
      name: s,
      description: getShiftDescription(s, false)
    })),
    weekend: WEEKEND_SHIFTS.map(s => ({
      id: s,
      name: s.replace('Weekend', ''),
      description: getShiftDescription(s, true)
    })),
    all: ALL_VALID_SHIFTS
  });
});

/**
 * GET /api/users/csv-template
 * Download CSV template for bulk upload
 */
router.get('/csv-template', (req, res) => {
  const template = `name,email,password,tier,isFloater,inTraining,isManager,state,preferences
"John Doe",john.doe@example.com,SecurePass123!,T2,false,false,false,BY,"Early,Morning,Late,Night,WeekendEarly,WeekendMorning,WeekendLate,WeekendNight"
"Jane Smith",jane.smith@example.com,StrongPass456!,T1,false,true,false,NW,"Early,Morning,WeekendMorning"
"Bob Manager",bob.manager@example.com,ManagerPass789!,T2,false,false,true,BE,"Late,Night,WeekendLate,WeekendNight"`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=users-template.csv');
  res.send(template);
});

/**
 * GET /api/users/excel-template
 * Download Excel template for bulk upload
 */
router.get('/excel-template', (req, res) => {
  const templateData = [
    {
      Name: 'John Doe',
      Email: 'john.doe@example.com',
      Password: 'SecurePass123!',
      Tier: 'T2',
      IsFloater: 'false',
      InTraining: 'false',
      IsManager: 'false',
      State: 'BY',
      Preferences: 'Early,Morning,Late,Night,WeekendEarly,WeekendMorning,WeekendLate,WeekendNight'
    },
    {
      Name: 'Jane Smith',
      Email: 'jane.smith@example.com',
      Password: 'StrongPass456!',
      Tier: 'T1',
      IsFloater: 'false',
      InTraining: 'true',
      IsManager: 'false',
      State: 'NW',
      Preferences: 'Early,Morning,WeekendMorning'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateData);
  XLSX.utils.book_append_sheet(wb, ws, 'Users');

  const instructions = [
    ['Shifter for ICES - User Import Template'],
    [''],
    ['Instructions:'],
    ['1. Fill in user data in the Users sheet'],
    ['2. Required fields: Name, Email, Password'],
    ['3. Password requirements: Min 10 chars, special character, number'],
    ['4. Tier: T1, T2, or T3 (default: T2)'],
    ['5. IsFloater, InTraining, IsManager: true or false'],
    ['6. State: German state code (BY, NW, BE, etc.)'],
    [''],
    ['Valid States:'],
    ...getAllStates().map(s => [`${s.code}: ${s.name}`])
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=users-template.xlsx');
  res.send(buffer);
});

/**
 * GET /api/users/export/csv
 * Export all users as CSV
 */
router.get('/export/csv', authenticate, requireManager, (req, res) => {
  const users = getAll('users');

  const header = 'name,email,tier,isFloater,inTraining,isManager,isAdmin,state,preferences,isActive';
  const rows = users.map(u => {
    const prefs = (u.preferences || []).join(',');
    return `"${u.name}","${u.email}","${u.tier}","${u.isFloater}","${u.inTraining}","${u.isManager}","${u.isAdmin}","${u.state || ''}","${prefs}","${u.isActive}"`;
  });

  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
  res.send(csv);
});

/**
 * GET /api/users/export/excel
 * Export all users as Excel
 */
router.get('/export/excel', authenticate, requireManager, (req, res) => {
  const users = getAll('users');

  const data = users.map(u => ({
    Name: u.name,
    Email: u.email,
    Tier: u.tier,
    IsFloater: u.isFloater,
    InTraining: u.inTraining,
    IsManager: u.isManager,
    IsAdmin: u.isAdmin,
    State: u.state || '',
    Preferences: (u.preferences || []).join(', '),
    IsActive: u.isActive,
    CreatedAt: u.createdAt
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Users');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=users-export.xlsx');
  res.send(buffer);
});

/**
 * GET /api/users/:id
 * Get user by ID
 */
router.get('/:id', authenticate, (req, res) => {
  const user = getById('users', req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Regular users can only view their own profile (detailed)
  // Managers/Admins can view anyone
  const isOwn = req.user.id === req.params.id;
  const isPrivileged = req.user.isAdmin || req.user.isManager;

  if (!isOwn && !isPrivileged) {
    // Return limited info
    return res.json({
      id: user.id,
      name: user.name,
      tier: user.tier,
      isFloater: user.isFloater,
      inTraining: user.inTraining
    });
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin || false,
    isManager: user.isManager || false,
    isFloater: user.isFloater || false,
    inTraining: user.inTraining || false,
    tier: user.tier || 'T2',
    state: user.state,
    preferences: user.preferences || [],
    unavailableDays: user.unavailableDays || [],
    isActive: user.isActive !== false,
    twoFactorEnabled: user.twoFactorEnabled || false,
    twoFactorForced: user.twoFactorForced || false,
    darkMode: user.darkMode || false,
    emailNotifications: user.emailNotifications !== false,
    notifications: isOwn ? (user.notifications || []) : undefined,
    needsPasswordChange: user.needsPasswordChange || false,
    createdAt: user.createdAt
  });
});

/**
 * POST /api/users
 * Create a new user (managers/admins only)
 */
router.post('/', authenticate, requireManager, async (req, res) => {
  const {
    name, email, password, generatePassword,
    isAdmin, isManager, isFloater, inTraining,
    tier, state, preferences, sendEmail
  } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  // Password is required for new users
  let userPassword = password;
  if (generatePassword) {
    userPassword = generateStrongPassword(16);
  }

  if (!userPassword) {
    return res.status(400).json({
      error: 'Password is required. Provide a password or set generatePassword to true.'
    });
  }

  // Validate password strength
  const passwordValidation = validatePasswordStrength(userPassword);
  if (!passwordValidation.valid) {
    return res.status(400).json({
      error: 'Password does not meet requirements',
      details: passwordValidation.errors
    });
  }

  // Check email uniqueness
  const existingUser = findUserByEmail(email);
  if (existingUser) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  // Validate tier
  const validTiers = ['T1', 'T2', 'T3'];
  if (tier && !validTiers.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier. Must be T1, T2, or T3' });
  }

  // Validate state
  const validStates = getAllStates().map(s => s.code);
  if (state && !validStates.includes(state)) {
    return res.status(400).json({ error: 'Invalid state code' });
  }

  // Validate preferences
  if (preferences && preferences.some(p => !ALL_VALID_SHIFTS.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be one of: ' + ALL_VALID_SHIFTS.join(', ')
    });
  }

  // Only admins can create other admins
  if (isAdmin && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Only admins can create admin users' });
  }

  const newUser = createUser({
    name,
    email,
    password: userPassword,
    isAdmin: isAdmin || false,
    isManager: isManager || false,
    isFloater: isFloater || false,
    inTraining: inTraining || false,
    tier: tier || 'T2',
    state: state || null,
    preferences: preferences || [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS]
  });

  // Send password email if requested
  let emailSent = false;
  if (sendEmail) {
    try {
      await sendPasswordEmail({
        to: email,
        name,
        password: userPassword,
        isReset: false
      });
      emailSent = true;
    } catch (error) {
      console.error('Failed to send password email:', error.message);
    }
  }

  res.status(201).json({
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      isAdmin: newUser.isAdmin,
      isManager: newUser.isManager,
      isFloater: newUser.isFloater,
      inTraining: newUser.inTraining,
      tier: newUser.tier
    },
    generatedPassword: generatePassword ? userPassword : undefined,
    emailSent
  });
});

/**
 * PUT /api/users/:id
 * Update a user
 */
router.put('/:id', authenticate, async (req, res) => {
  const user = getById('users', req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const isOwn = req.user.id === req.params.id;
  const isPrivileged = req.user.isAdmin || req.user.isManager;

  // Users can update their own limited fields
  // Managers/Admins can update most fields
  if (!isOwn && !isPrivileged) {
    return res.status(403).json({ error: 'Not authorized to update this user' });
  }

  const {
    name, email, isAdmin, isManager, isFloater, inTraining,
    tier, state, preferences, isActive, twoFactorForced,
    darkMode, emailNotifications
  } = req.body;

  const updates = {};

  // Fields users can update for themselves
  if (name !== undefined) updates.name = name;
  if (darkMode !== undefined) updates.darkMode = darkMode;
  if (emailNotifications !== undefined) updates.emailNotifications = emailNotifications;

  // Fields only managers/admins can update
  if (isPrivileged) {
    if (email !== undefined && email !== user.email) {
      // Check email uniqueness
      const existingUser = findUserByEmail(email);
      if (existingUser && existingUser.id !== req.params.id) {
        return res.status(400).json({ error: 'A user with this email already exists' });
      }
      updates.email = email;
    }

    if (isManager !== undefined) updates.isManager = isManager;
    if (isFloater !== undefined) updates.isFloater = isFloater;
    if (inTraining !== undefined) updates.inTraining = inTraining;
    if (tier !== undefined) updates.tier = tier;
    if (state !== undefined) updates.state = state;
    if (preferences !== undefined) updates.preferences = preferences;
    if (isActive !== undefined) updates.isActive = isActive;
    if (twoFactorForced !== undefined) updates.twoFactorForced = twoFactorForced;

    // Only admins can change admin status
    if (req.user.isAdmin && isAdmin !== undefined) {
      // Prevent removing your own admin status
      if (isOwn && !isAdmin) {
        return res.status(400).json({ error: 'You cannot remove your own admin status' });
      }
      updates.isAdmin = isAdmin;
    }
  }

  const updated = update('users', req.params.id, updates);

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    isAdmin: updated.isAdmin,
    isManager: updated.isManager,
    isFloater: updated.isFloater,
    inTraining: updated.inTraining,
    tier: updated.tier,
    state: updated.state,
    preferences: updated.preferences,
    isActive: updated.isActive,
    darkMode: updated.darkMode,
    emailNotifications: updated.emailNotifications
  });
});

/**
 * DELETE /api/users/:id
 * Deactivate a user
 */
router.delete('/:id', authenticate, requireManager, (req, res) => {
  const user = getById('users', req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent deleting yourself
  if (req.user.id === req.params.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  // Prevent deleting admins unless you're an admin
  if (user.isAdmin && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Only admins can deactivate admin users' });
  }

  // Soft delete - just deactivate
  update('users', req.params.id, { isActive: false });

  res.json({ message: 'User deactivated successfully' });
});

/**
 * POST /api/users/:id/reset-password
 * Reset password for a user (managers/admins)
 */
router.post('/:id/reset-password', authenticate, requireManager, async (req, res) => {
  const user = getById('users', req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { newPassword, generateNew, sendEmail: shouldSendEmail } = req.body;

  let password = newPassword;
  if (generateNew) {
    password = generateStrongPassword(16);
  }

  if (!password) {
    return res.status(400).json({
      error: 'Please provide a password or set generateNew to true'
    });
  }

  // Validate password strength
  const validation = validatePasswordStrength(password);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'Password does not meet requirements',
      details: validation.errors
    });
  }

  // Update password
  const hashedPassword = bcrypt.hashSync(password, 10);
  update('users', user.id, {
    password: hashedPassword,
    needsPasswordChange: true
  });

  // Add notification
  addNotification(user.id, {
    type: 'password_reset',
    message: 'Your password has been reset by an administrator.'
  });

  // Send email if requested
  let emailSent = false;
  if (shouldSendEmail && user.email) {
    try {
      await sendPasswordEmail({
        to: user.email,
        name: user.name,
        password,
        isReset: true
      });
      emailSent = true;
    } catch (error) {
      console.error('Failed to send password email:', error.message);
    }
  }

  res.json({
    message: 'Password has been reset',
    generatedPassword: generateNew ? password : undefined,
    emailSent
  });
});

/**
 * PUT /api/users/:id/preferences
 * Update user's shift preferences
 */
router.put('/:id/preferences', authenticate, (req, res) => {
  const isOwn = req.user.id === req.params.id;
  const isPrivileged = req.user.isAdmin || req.user.isManager;

  if (!isOwn && !isPrivileged) {
    return res.status(403).json({ error: 'You can only update your own preferences' });
  }

  const user = getById('users', req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { preferences } = req.body;

  if (!preferences || !Array.isArray(preferences)) {
    return res.status(400).json({ error: 'Preferences must be an array of shift types' });
  }

  if (preferences.some(p => !ALL_VALID_SHIFTS.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be one of: ' + ALL_VALID_SHIFTS.join(', ')
    });
  }

  const updated = update('users', req.params.id, { preferences });

  res.json({
    id: updated.id,
    name: updated.name,
    preferences: updated.preferences
  });
});

/**
 * PUT /api/users/:id/unavailable
 * Update user's unavailable days
 */
router.put('/:id/unavailable', authenticate, (req, res) => {
  const isOwn = req.user.id === req.params.id;
  const isPrivileged = req.user.isAdmin || req.user.isManager;

  if (!isOwn && !isPrivileged) {
    return res.status(403).json({ error: 'You can only update your own unavailable days' });
  }

  const user = getById('users', req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { unavailableDays } = req.body;

  if (!unavailableDays || !Array.isArray(unavailableDays)) {
    return res.status(400).json({
      error: 'unavailableDays must be an array of date strings (YYYY-MM-DD)'
    });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (unavailableDays.some(d => !dateRegex.test(d))) {
    return res.status(400).json({ error: 'All dates must be in YYYY-MM-DD format' });
  }

  const updated = update('users', req.params.id, { unavailableDays });

  res.json({
    id: updated.id,
    name: updated.name,
    unavailableDays: updated.unavailableDays
  });
});

/**
 * GET /api/users/:id/holidays
 * Get holidays for a user based on their state
 */
router.get('/:id/holidays', authenticate, (req, res) => {
  const user = getById('users', req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const year = parseInt(req.query.year) || new Date().getFullYear();

  if (!user.state) {
    return res.json({
      userId: user.id,
      userName: user.name,
      state: null,
      year,
      holidays: [],
      message: 'No state assigned. Only federal holidays will apply.'
    });
  }

  const holidays = getHolidaysForEngineer(year, user.state);

  res.json({
    userId: user.id,
    userName: user.name,
    state: user.state,
    year,
    holidays
  });
});

/**
 * GET /api/users/:id/notifications
 * Get user notifications
 */
router.get('/:id/notifications', authenticate, (req, res) => {
  if (req.user.id !== req.params.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'You can only view your own notifications' });
  }

  const user = getById('users', req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json(user.notifications || []);
});

/**
 * PUT /api/users/:id/notifications/read
 * Mark notifications as read
 */
router.put('/:id/notifications/read', authenticate, (req, res) => {
  if (req.user.id !== req.params.id) {
    return res.status(403).json({ error: 'You can only update your own notifications' });
  }

  const { notificationIds } = req.body;
  const user = getById('users', req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const notifications = (user.notifications || []).map(n => {
    if (!notificationIds || notificationIds.includes(n.id)) {
      return { ...n, read: true };
    }
    return n;
  });

  update('users', req.params.id, { notifications });

  res.json({ message: 'Notifications marked as read' });
});

/**
 * POST /api/users/:id/duplicate
 * Duplicate a user (managers/admins only)
 */
router.post('/:id/duplicate', authenticate, requireManager, (req, res) => {
  const sourceUser = getById('users', req.params.id);

  if (!sourceUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Generate a temporary password
  const tempPassword = generateStrongPassword(16);

  const newUser = createUser({
    name: `${sourceUser.name} (Copy)`,
    email: `copy.${sourceUser.email}`,
    password: tempPassword,
    isFloater: sourceUser.isFloater,
    inTraining: sourceUser.inTraining,
    tier: sourceUser.tier,
    state: sourceUser.state,
    preferences: [...(sourceUser.preferences || [])]
  });

  res.status(201).json({
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email
    },
    generatedPassword: tempPassword,
    message: 'User duplicated. Please update email and share password with user.'
  });
});

/**
 * POST /api/users/bulk-upload
 * Bulk upload users from CSV
 *
 * Required columns: name, email, password
 * Optional columns: tier, isFloater, inTraining, isManager, state, preferences
 */
router.post('/bulk-upload', authenticate, requireManager, async (req, res) => {
  const { csvData } = req.body;

  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({ error: 'CSV data is required as a string' });
  }

  const lines = csvData.trim().split('\n');

  if (lines.length < 2) {
    return res.status(400).json({
      error: 'CSV must have a header row and at least one data row'
    });
  }

  const header = parseCSVLine(lines[0].toLowerCase());
  const requiredColumns = ['name', 'email', 'password'];
  const missingColumns = requiredColumns.filter(col => !header.includes(col));

  if (missingColumns.length > 0) {
    return res.status(400).json({
      error: `Missing required columns: ${missingColumns.join(', ')}`
    });
  }

  const validStates = getAllStates().map(s => s.code);
  const results = { success: [], errors: [] };

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const values = parseCSVLine(line);
      const row = {};
      header.forEach((col, idx) => {
        row[col] = values[idx] || '';
      });

      // Validate required fields
      if (!row.name || !row.email || !row.password) {
        results.errors.push({
          row: i + 1,
          error: 'Name, email, and password are required',
          data: row
        });
        continue;
      }

      // Check email uniqueness
      if (findUserByEmail(row.email)) {
        results.errors.push({
          row: i + 1,
          error: `Email already exists: ${row.email}`,
          data: row
        });
        continue;
      }

      // Validate password
      const passwordValidation = validatePasswordStrength(row.password);
      if (!passwordValidation.valid) {
        results.errors.push({
          row: i + 1,
          error: `Password invalid: ${passwordValidation.errors.join(', ')}`,
          data: row
        });
        continue;
      }

      // Parse optional fields
      const tier = (row.tier || 'T2').toUpperCase();
      if (!['T1', 'T2', 'T3'].includes(tier)) {
        results.errors.push({
          row: i + 1,
          error: `Invalid tier: ${row.tier}`,
          data: row
        });
        continue;
      }

      const isFloater = ['true', '1', 'yes'].includes((row.isfloater || '').toLowerCase());
      const inTraining = ['true', '1', 'yes'].includes((row.intraining || '').toLowerCase());
      const isManager = ['true', '1', 'yes'].includes((row.ismanager || '').toLowerCase());

      const state = (row.state || '').toUpperCase() || null;
      if (state && !validStates.includes(state)) {
        results.errors.push({
          row: i + 1,
          error: `Invalid state: ${row.state}`,
          data: row
        });
        continue;
      }

      let preferences = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];
      if (row.preferences) {
        preferences = row.preferences.split(',').map(p => p.trim());
        const invalidPrefs = preferences.filter(p => !ALL_VALID_SHIFTS.includes(p));
        if (invalidPrefs.length > 0) {
          results.errors.push({
            row: i + 1,
            error: `Invalid preferences: ${invalidPrefs.join(', ')}`,
            data: row
          });
          continue;
        }
      }

      const user = createUser({
        name: row.name,
        email: row.email,
        password: row.password,
        isManager,
        isFloater,
        inTraining,
        tier,
        state,
        preferences
      });

      results.success.push({
        row: i + 1,
        user: { id: user.id, name: user.name, email: user.email }
      });

    } catch (err) {
      results.errors.push({
        row: i + 1,
        error: `Parse error: ${err.message}`,
        data: line
      });
    }
  }

  res.status(results.errors.length > 0 ? 207 : 201).json({
    message: `Created ${results.success.length} users, ${results.errors.length} errors`,
    created: results.success.length,
    failed: results.errors.length,
    results
  });
});

/**
 * POST /api/users/bulk-upload-excel
 * Bulk upload users from Excel file
 */
router.post('/bulk-upload-excel', authenticate, requireManager, async (req, res) => {
  const { excelData } = req.body;

  if (!excelData) {
    return res.status(400).json({ error: 'Excel data is required as base64 string' });
  }

  try {
    const buffer = Buffer.from(excelData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file must have at least one data row' });
    }

    const validStates = getAllStates().map(s => s.code);
    const results = { success: [], errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      try {
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.toLowerCase().trim()] = row[key];
        });

        const name = normalizedRow.name || '';
        const email = normalizedRow.email || '';
        const password = normalizedRow.password || '';

        if (!name || !email || !password) {
          results.errors.push({
            row: rowNum,
            error: 'Name, email, and password are required',
            data: normalizedRow
          });
          continue;
        }

        if (findUserByEmail(email)) {
          results.errors.push({
            row: rowNum,
            error: `Email already exists: ${email}`,
            data: normalizedRow
          });
          continue;
        }

        const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.valid) {
          results.errors.push({
            row: rowNum,
            error: `Password invalid: ${passwordValidation.errors.join(', ')}`,
            data: normalizedRow
          });
          continue;
        }

        const tier = (normalizedRow.tier || 'T2').toString().toUpperCase();
        if (!['T1', 'T2', 'T3'].includes(tier)) {
          results.errors.push({
            row: rowNum,
            error: `Invalid tier: ${tier}`,
            data: normalizedRow
          });
          continue;
        }

        const isFloater = ['true', '1', 'yes'].includes(
          (normalizedRow.isfloater || '').toString().toLowerCase()
        );
        const inTraining = ['true', '1', 'yes'].includes(
          (normalizedRow.intraining || '').toString().toLowerCase()
        );
        const isManager = ['true', '1', 'yes'].includes(
          (normalizedRow.ismanager || '').toString().toLowerCase()
        );

        const state = (normalizedRow.state || '').toString().toUpperCase() || null;
        if (state && !validStates.includes(state)) {
          results.errors.push({
            row: rowNum,
            error: `Invalid state: ${state}`,
            data: normalizedRow
          });
          continue;
        }

        let preferences = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];
        if (normalizedRow.preferences) {
          preferences = normalizedRow.preferences.toString().split(',').map(p => p.trim());
          const invalidPrefs = preferences.filter(p => !ALL_VALID_SHIFTS.includes(p));
          if (invalidPrefs.length > 0) {
            results.errors.push({
              row: rowNum,
              error: `Invalid preferences: ${invalidPrefs.join(', ')}`,
              data: normalizedRow
            });
            continue;
          }
        }

        const user = createUser({
          name,
          email,
          password,
          isManager,
          isFloater,
          inTraining,
          tier,
          state,
          preferences
        });

        results.success.push({
          row: rowNum,
          user: { id: user.id, name: user.name, email: user.email }
        });

      } catch (err) {
        results.errors.push({
          row: rowNum,
          error: `Parse error: ${err.message}`,
          data: row
        });
      }
    }

    res.status(results.errors.length > 0 ? 207 : 201).json({
      message: `Created ${results.success.length} users, ${results.errors.length} errors`,
      created: results.success.length,
      failed: results.errors.length,
      results
    });

  } catch (error) {
    res.status(400).json({ error: 'Failed to parse Excel file: ' + error.message });
  }
});

// ============== Helper Functions ==============

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function getShiftDescription(shift, isWeekend) {
  const times = {
    'Early': '07:00 - 15:30',
    'Morning': '10:00 - 18:30',
    'Late': isWeekend ? '15:00 - 22:30' : '15:00 - 23:30',
    'Night': '23:00 - 07:30',
    'WeekendEarly': '07:00 - 15:30',
    'WeekendMorning': '10:00 - 18:30',
    'WeekendLate': '15:00 - 22:30',
    'WeekendNight': '23:00 - 07:30'
  };
  return times[shift] || '';
}

export default router;
