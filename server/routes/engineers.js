/**
 * Engineer Routes for ICES-Shifter
 */

import { Router } from 'express';
import * as XLSX from 'xlsx';
import {
  getAll,
  getById,
  create,
  update,
  remove,
  createEngineer,
  getActiveEngineers
} from '../data/store.js';
import { authenticate, requireManager, requireEngineerOrManager } from '../middleware/auth.js';
import { getAllStates, getHolidaysForEngineer } from '../services/germanHolidays.js';

const router = Router();

// Valid shift preferences (weekday and weekend)
const WEEKDAY_SHIFTS = ['Early', 'Morning', 'Late', 'Night'];
const WEEKEND_SHIFTS = ['WeekendEarly', 'WeekendMorning', 'WeekendLate', 'WeekendNight'];
const ALL_VALID_SHIFTS = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];

/**
 * GET /api/engineers
 * Get all engineers
 */
router.get('/', authenticate, (req, res) => {
  const { active } = req.query;

  let engineers = active === 'true'
    ? getActiveEngineers()
    : getAll('engineers');

  // Don't return sensitive data
  engineers = engineers.map(e => ({
    id: e.id,
    name: e.name,
    email: e.email,
    tier: e.tier,
    isFloater: e.isFloater,
    state: e.state,
    preferences: e.preferences,
    isActive: e.isActive,
    createdAt: e.createdAt
  }));

  res.json(engineers);
});

/**
 * GET /api/engineers/states
 * Get list of German states
 */
router.get('/states', (req, res) => {
  res.json(getAllStates());
});

/**
 * GET /api/engineers/:id
 * Get engineer by ID
 */
router.get('/:id', authenticate, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  res.json({
    id: engineer.id,
    name: engineer.name,
    email: engineer.email,
    tier: engineer.tier,
    isFloater: engineer.isFloater,
    state: engineer.state,
    preferences: engineer.preferences,
    unavailableDays: engineer.unavailableDays,
    isActive: engineer.isActive,
    createdAt: engineer.createdAt
  });
});

/**
 * POST /api/engineers
 * Create a new engineer (managers/admins only)
 */
router.post('/', authenticate, requireManager, (req, res) => {
  const { name, email, tier, isFloater, state, preferences } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      error: 'Name and email are required'
    });
  }

  // Validate tier
  const validTiers = ['T1', 'T2', 'T3'];
  if (tier && !validTiers.includes(tier)) {
    return res.status(400).json({
      error: 'Invalid tier. Must be T1, T2, or T3'
    });
  }

  // Validate state if provided
  const validStates = getAllStates().map(s => s.code);
  if (state && !validStates.includes(state)) {
    return res.status(400).json({
      error: 'Invalid state code'
    });
  }

  // Validate preferences if provided
  if (preferences && preferences.some(p => !ALL_VALID_SHIFTS.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be one of: ' + ALL_VALID_SHIFTS.join(', ')
    });
  }

  const engineer = createEngineer({
    name,
    email,
    tier: tier || 'T2',
    isFloater: isFloater || false,
    state,
    preferences: preferences || [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS] // Default to all shifts
  });

  res.status(201).json(engineer);
});

/**
 * PUT /api/engineers/:id
 * Update an engineer
 */
router.put('/:id', authenticate, requireManager, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const { name, email, tier, isFloater, state, preferences, isActive } = req.body;

  // Validate tier
  const validTiers = ['T1', 'T2', 'T3'];
  if (tier && !validTiers.includes(tier)) {
    return res.status(400).json({
      error: 'Invalid tier. Must be T1, T2, or T3'
    });
  }

  // Validate state if provided
  const validStates = getAllStates().map(s => s.code);
  if (state && !validStates.includes(state)) {
    return res.status(400).json({
      error: 'Invalid state code'
    });
  }

  const updated = update('engineers', req.params.id, {
    name: name !== undefined ? name : engineer.name,
    email: email !== undefined ? email : engineer.email,
    tier: tier !== undefined ? tier : engineer.tier,
    isFloater: isFloater !== undefined ? isFloater : engineer.isFloater,
    state: state !== undefined ? state : engineer.state,
    preferences: preferences !== undefined ? preferences : engineer.preferences,
    isActive: isActive !== undefined ? isActive : engineer.isActive
  });

  res.json(updated);
});

/**
 * DELETE /api/engineers/:id
 * Delete (deactivate) an engineer
 */
router.delete('/:id', authenticate, requireManager, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  // Soft delete - just deactivate
  update('engineers', req.params.id, { isActive: false });

  res.json({ message: 'Engineer deactivated successfully' });
});

/**
 * PUT /api/engineers/:id/preferences
 * Update engineer's shift preferences
 */
router.put('/:id/preferences', authenticate, (req, res) => {
  // Allow engineers to update their own preferences, or managers to update any
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.engineerId !== req.params.id) {
    return res.status(403).json({
      error: 'You can only update your own preferences'
    });
  }

  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const { preferences } = req.body;

  if (!preferences || !Array.isArray(preferences)) {
    return res.status(400).json({
      error: 'Preferences must be an array of shift types'
    });
  }

  if (preferences.some(p => !ALL_VALID_SHIFTS.includes(p))) {
    return res.status(400).json({
      error: 'Invalid shift preference. Must be one of: ' + ALL_VALID_SHIFTS.join(', ')
    });
  }

  const updated = update('engineers', req.params.id, { preferences });

  res.json({
    id: updated.id,
    name: updated.name,
    preferences: updated.preferences
  });
});

/**
 * PUT /api/engineers/:id/unavailable
 * Update engineer's unavailable days
 */
router.put('/:id/unavailable', authenticate, (req, res) => {
  // Allow engineers to update their own, or managers to update any
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.engineerId !== req.params.id) {
    return res.status(403).json({
      error: 'You can only update your own unavailable days'
    });
  }

  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const { unavailableDays } = req.body;

  if (!unavailableDays || !Array.isArray(unavailableDays)) {
    return res.status(400).json({
      error: 'unavailableDays must be an array of date strings (YYYY-MM-DD)'
    });
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (unavailableDays.some(d => !dateRegex.test(d))) {
    return res.status(400).json({
      error: 'All dates must be in YYYY-MM-DD format'
    });
  }

  const updated = update('engineers', req.params.id, { unavailableDays });

  res.json({
    id: updated.id,
    name: updated.name,
    unavailableDays: updated.unavailableDays
  });
});

/**
 * GET /api/engineers/:id/holidays
 * Get holidays applicable to an engineer based on their state
 */
router.get('/:id/holidays', authenticate, (req, res) => {
  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  const year = parseInt(req.query.year) || new Date().getFullYear();

  if (!engineer.state) {
    return res.status(400).json({
      error: 'Engineer has no state assigned. Only federal holidays will apply.'
    });
  }

  const holidays = getHolidaysForEngineer(year, engineer.state);

  res.json({
    engineerId: engineer.id,
    engineerName: engineer.name,
    state: engineer.state,
    year,
    holidays
  });
});

/**
 * POST /api/engineers/:id/duplicate
 * Duplicate an existing engineer (managers/admins only)
 */
router.post('/:id/duplicate', authenticate, requireManager, (req, res) => {
  const sourceEngineer = getById('engineers', req.params.id);

  if (!sourceEngineer) {
    return res.status(404).json({
      error: 'Engineer not found'
    });
  }

  // Create a copy with modified name and email
  const newEngineer = createEngineer({
    name: `${sourceEngineer.name} (Copy)`,
    email: `copy.${sourceEngineer.email}`,
    tier: sourceEngineer.tier,
    isFloater: sourceEngineer.isFloater,
    state: sourceEngineer.state,
    preferences: [...(sourceEngineer.preferences || [])]
  });

  res.status(201).json(newEngineer);
});

/**
 * POST /api/engineers/bulk-upload
 * Bulk upload engineers from CSV (managers/admins only)
 *
 * CSV Format:
 * name,email,tier,isFloater,state,preferences
 * "John Doe",john@example.com,T2,false,BY,"Early,Morning,Late"
 */
router.post('/bulk-upload', authenticate, requireManager, (req, res) => {
  const { csvData } = req.body;

  if (!csvData || typeof csvData !== 'string') {
    return res.status(400).json({
      error: 'CSV data is required as a string'
    });
  }

  const lines = csvData.trim().split('\n');

  if (lines.length < 2) {
    return res.status(400).json({
      error: 'CSV must have a header row and at least one data row'
    });
  }

  // Parse header
  const header = parseCSVLine(lines[0].toLowerCase());
  const requiredColumns = ['name', 'email'];
  const missingColumns = requiredColumns.filter(col => !header.includes(col));

  if (missingColumns.length > 0) {
    return res.status(400).json({
      error: `Missing required columns: ${missingColumns.join(', ')}`
    });
  }

  const validStates = getAllStates().map(s => s.code);
  const results = {
    success: [],
    errors: []
  };

  // Process each row
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
      if (!row.name || !row.email) {
        results.errors.push({
          row: i + 1,
          error: 'Name and email are required',
          data: row
        });
        continue;
      }

      // Parse and validate tier
      const tier = row.tier?.toUpperCase() || 'T2';
      if (!['T1', 'T2', 'T3'].includes(tier)) {
        results.errors.push({
          row: i + 1,
          error: `Invalid tier: ${row.tier}. Must be T1, T2, or T3`,
          data: row
        });
        continue;
      }

      // Parse isFloater
      const isFloater = row.isfloater?.toLowerCase() === 'true' || row.isfloater === '1';

      // Validate state
      const state = row.state?.toUpperCase() || null;
      if (state && !validStates.includes(state)) {
        results.errors.push({
          row: i + 1,
          error: `Invalid state: ${row.state}`,
          data: row
        });
        continue;
      }

      // Parse preferences
      let preferences = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS]; // Default to all
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

      // Create engineer
      const engineer = createEngineer({
        name: row.name,
        email: row.email,
        tier,
        isFloater,
        state,
        preferences
      });

      results.success.push({
        row: i + 1,
        engineer: {
          id: engineer.id,
          name: engineer.name,
          email: engineer.email
        }
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
    message: `Created ${results.success.length} engineers, ${results.errors.length} errors`,
    created: results.success.length,
    failed: results.errors.length,
    results
  });
});

/**
 * GET /api/engineers/csv-template
 * Get CSV template for bulk upload
 */
router.get('/csv-template', (req, res) => {
  const template = `name,email,tier,isFloater,state,preferences
"John Doe",john.doe@example.com,T2,false,BY,"Early,Morning,Late,Night,WeekendEarly,WeekendMorning,WeekendLate,WeekendNight"
"Jane Smith",jane.smith@example.com,T1,false,NW,"Early,Morning,WeekendMorning"
"Bob Wilson",bob.wilson@example.com,T3,true,BE,"Late,Night,WeekendLate,WeekendNight"`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=engineers-template.csv');
  res.send(template);
});

/**
 * GET /api/engineers/shift-options
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
 * Helper: Parse CSV line handling quoted values
 */
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

/**
 * Helper: Get shift description
 */
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

/**
 * POST /api/engineers/bulk-upload-excel
 * Bulk upload engineers from Excel file (managers/admins only)
 */
router.post('/bulk-upload-excel', authenticate, requireManager, (req, res) => {
  const { excelData } = req.body; // Base64 encoded Excel file

  if (!excelData) {
    return res.status(400).json({
      error: 'Excel data is required as base64 string'
    });
  }

  try {
    const buffer = Buffer.from(excelData, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return res.status(400).json({
        error: 'Excel file must have at least one data row'
      });
    }

    const validStates = getAllStates().map(s => s.code);
    const results = { success: [], errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel rows start at 1, plus header

      try {
        // Normalize column names (case-insensitive)
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.toLowerCase().trim()] = row[key];
        });

        const name = normalizedRow.name || '';
        const email = normalizedRow.email || '';

        if (!name || !email) {
          results.errors.push({
            row: rowNum,
            error: 'Name and email are required',
            data: normalizedRow
          });
          continue;
        }

        const tier = (normalizedRow.tier || 'T2').toString().toUpperCase();
        if (!['T1', 'T2', 'T3'].includes(tier)) {
          results.errors.push({
            row: rowNum,
            error: `Invalid tier: ${tier}. Must be T1, T2, or T3`,
            data: normalizedRow
          });
          continue;
        }

        const isFloater = ['true', '1', 'yes'].includes(
          (normalizedRow.isfloater || '').toString().toLowerCase()
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

        const engineer = createEngineer({
          name,
          email,
          tier,
          isFloater,
          state,
          preferences
        });

        results.success.push({
          row: rowNum,
          engineer: { id: engineer.id, name: engineer.name, email: engineer.email }
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
      message: `Created ${results.success.length} engineers, ${results.errors.length} errors`,
      created: results.success.length,
      failed: results.errors.length,
      results
    });

  } catch (error) {
    res.status(400).json({
      error: 'Failed to parse Excel file: ' + error.message
    });
  }
});

/**
 * GET /api/engineers/export/csv
 * Export all engineers as CSV
 */
router.get('/export/csv', authenticate, requireManager, (req, res) => {
  const engineers = getAll('engineers');

  const header = 'name,email,tier,isFloater,state,preferences,isActive';
  const rows = engineers.map(e => {
    const prefs = (e.preferences || []).join(',');
    return `"${e.name}","${e.email}","${e.tier}","${e.isFloater}","${e.state || ''}","${prefs}","${e.isActive}"`;
  });

  const csv = [header, ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=engineers-export.csv');
  res.send(csv);
});

/**
 * GET /api/engineers/export/excel
 * Export all engineers as Excel file
 */
router.get('/export/excel', authenticate, requireManager, (req, res) => {
  const engineers = getAll('engineers');

  const data = engineers.map(e => ({
    Name: e.name,
    Email: e.email,
    Tier: e.tier,
    IsFloater: e.isFloater,
    State: e.state || '',
    Preferences: (e.preferences || []).join(', '),
    IsActive: e.isActive,
    CreatedAt: e.createdAt
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Engineers');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=engineers-export.xlsx');
  res.send(buffer);
});

/**
 * GET /api/engineers/:id/unavailable-dates
 * Get detailed unavailable dates for an engineer (with types)
 * Designed for future SAP WFM integration
 */
router.get('/:id/unavailable-dates', authenticate, (req, res) => {
  // Allow engineers to view their own, or managers to view any
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.engineerId !== req.params.id) {
    return res.status(403).json({
      error: 'You can only view your own unavailable dates'
    });
  }

  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({ error: 'Engineer not found' });
  }

  // Return unavailable dates with metadata
  // Future: This structure supports SAP WFM sync
  const unavailableDates = (engineer.unavailableDays || []).map(date => ({
    date,
    type: engineer.unavailableTypes?.[date] || 'unavailable', // sick, vacation, other
    source: engineer.unavailableSources?.[date] || 'manual', // manual, sap_wfm, api
    notes: engineer.unavailableNotes?.[date] || ''
  }));

  res.json({
    engineerId: engineer.id,
    engineerName: engineer.name,
    unavailableDates,
    // Metadata for WFM integration
    lastSyncedFromWFM: engineer.lastWFMSync || null,
    wfmEnabled: engineer.wfmEnabled || false
  });
});

/**
 * POST /api/engineers/:id/unavailable-dates
 * Add unavailable dates with types (vacation, sick, etc.)
 */
router.post('/:id/unavailable-dates', authenticate, (req, res) => {
  // Allow engineers to update their own, or managers to update any
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.engineerId !== req.params.id) {
    return res.status(403).json({
      error: 'You can only update your own unavailable dates'
    });
  }

  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({ error: 'Engineer not found' });
  }

  const { dates } = req.body;

  if (!dates || !Array.isArray(dates)) {
    return res.status(400).json({
      error: 'dates must be an array of {date, type, notes} objects'
    });
  }

  // Validate and process dates
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const validTypes = ['sick', 'vacation', 'unavailable', 'personal', 'other'];

  const currentDays = new Set(engineer.unavailableDays || []);
  const currentTypes = { ...(engineer.unavailableTypes || {}) };
  const currentNotes = { ...(engineer.unavailableNotes || {}) };
  const currentSources = { ...(engineer.unavailableSources || {}) };

  for (const item of dates) {
    if (!item.date || !dateRegex.test(item.date)) {
      return res.status(400).json({
        error: `Invalid date format: ${item.date}. Must be YYYY-MM-DD`
      });
    }

    const type = item.type || 'unavailable';
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `Invalid type: ${type}. Must be: ${validTypes.join(', ')}`
      });
    }

    currentDays.add(item.date);
    currentTypes[item.date] = type;
    currentNotes[item.date] = item.notes || '';
    currentSources[item.date] = 'manual';
  }

  const updated = update('engineers', req.params.id, {
    unavailableDays: [...currentDays].sort(),
    unavailableTypes: currentTypes,
    unavailableNotes: currentNotes,
    unavailableSources: currentSources
  });

  res.json({
    id: updated.id,
    name: updated.name,
    unavailableDays: updated.unavailableDays,
    addedCount: dates.length
  });
});

/**
 * DELETE /api/engineers/:id/unavailable-dates
 * Remove specific unavailable dates
 */
router.delete('/:id/unavailable-dates', authenticate, (req, res) => {
  // Allow engineers to update their own, or managers to update any
  if (req.user.role !== 'admin' && req.user.role !== 'manager' && req.user.engineerId !== req.params.id) {
    return res.status(403).json({
      error: 'You can only update your own unavailable dates'
    });
  }

  const engineer = getById('engineers', req.params.id);

  if (!engineer) {
    return res.status(404).json({ error: 'Engineer not found' });
  }

  const { dates } = req.body;

  if (!dates || !Array.isArray(dates)) {
    return res.status(400).json({
      error: 'dates must be an array of date strings (YYYY-MM-DD)'
    });
  }

  const currentDays = new Set(engineer.unavailableDays || []);
  const currentTypes = { ...(engineer.unavailableTypes || {}) };
  const currentNotes = { ...(engineer.unavailableNotes || {}) };
  const currentSources = { ...(engineer.unavailableSources || {}) };

  let removedCount = 0;
  for (const date of dates) {
    if (currentDays.has(date)) {
      currentDays.delete(date);
      delete currentTypes[date];
      delete currentNotes[date];
      delete currentSources[date];
      removedCount++;
    }
  }

  const updated = update('engineers', req.params.id, {
    unavailableDays: [...currentDays].sort(),
    unavailableTypes: currentTypes,
    unavailableNotes: currentNotes,
    unavailableSources: currentSources
  });

  res.json({
    id: updated.id,
    name: updated.name,
    unavailableDays: updated.unavailableDays,
    removedCount
  });
});

/**
 * GET /api/engineers/excel-template
 * Download Excel template for bulk upload
 */
router.get('/excel-template', (req, res) => {
  const templateData = [
    {
      Name: 'John Doe',
      Email: 'john.doe@example.com',
      Tier: 'T2',
      IsFloater: 'false',
      State: 'BY',
      Preferences: 'Early,Morning,Late,Night,WeekendEarly,WeekendMorning,WeekendLate,WeekendNight'
    },
    {
      Name: 'Jane Smith',
      Email: 'jane.smith@example.com',
      Tier: 'T1',
      IsFloater: 'false',
      State: 'NW',
      Preferences: 'Early,Morning,WeekendMorning'
    },
    {
      Name: 'Bob Wilson',
      Email: 'bob.wilson@example.com',
      Tier: 'T3',
      IsFloater: 'true',
      State: 'BE',
      Preferences: 'Late,Night,WeekendLate,WeekendNight'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(templateData);
  XLSX.utils.book_append_sheet(wb, ws, 'Engineers');

  // Add instructions sheet
  const instructions = [
    ['ICES-Shifter Engineer Import Template'],
    [''],
    ['Instructions:'],
    ['1. Fill in engineer data in the Engineers sheet'],
    ['2. Required fields: Name, Email'],
    ['3. Tier: T1, T2, or T3 (default: T2)'],
    ['4. IsFloater: true or false (default: false)'],
    ['5. State: German state code (BY, NW, BE, etc.)'],
    ['6. Preferences: Comma-separated shift preferences'],
    [''],
    ['Valid Shift Preferences:'],
    ['Weekday: Early, Morning, Late, Night'],
    ['Weekend: WeekendEarly, WeekendMorning, WeekendLate, WeekendNight'],
    [''],
    ['Valid German States:'],
    ...getAllStates().map(s => [`${s.code}: ${s.name}`])
  ];

  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=engineers-template.xlsx');
  res.send(buffer);
});

export default router;
