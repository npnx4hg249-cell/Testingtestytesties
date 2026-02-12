/**
 * Request Routes
 *
 * Handles user scheduling requests with 15-day lead time requirement.
 */

import { Router } from 'express';
import {
  getById,
  create,
  update,
  find,
  createRequest,
  getPendingRequests,
  getRequestsForUser,
  reviewRequest
} from '../data/store.js';
import { authenticate, requireManager } from '../middleware/auth.js';
import { differenceInDays, parseISO, format, addDays } from 'date-fns';

const router = Router();

// Minimum lead time in days for scheduling requests
const MIN_LEAD_TIME_DAYS = 15;

/**
 * GET /api/requests
 * Get all requests (managers see all, users see their own)
 */
router.get('/', authenticate, (req, res) => {
  const { status, type } = req.query;

  let requests;

  if (req.user.isAdmin || req.user.isManager) {
    requests = find('requests', () => true);
  } else {
    requests = getRequestsForUser(req.user.id);
  }

  if (status) {
    requests = requests.filter(r => r.status === status);
  }

  if (type) {
    requests = requests.filter(r => r.type === type);
  }

  // Sort by creation date descending
  requests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json(requests);
});

/**
 * GET /api/requests/pending
 * Get pending requests (managers/admins only) - for approval cards
 */
router.get('/pending', authenticate, requireManager, (req, res) => {
  const requests = getPendingRequests();

  // Group by type for display
  const grouped = {
    time_off: requests.filter(r => r.type === 'time_off'),
    shift_change: requests.filter(r => r.type === 'shift_change'),
    preference_update: requests.filter(r => r.type === 'preference_update')
  };

  res.json({
    total: requests.length,
    grouped,
    requests
  });
});

/**
 * GET /api/requests/:id
 * Get request by ID
 */
router.get('/:id', authenticate, (req, res) => {
  const request = getById('requests', req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found'
    });
  }

  // Users can only view their own requests
  if (!req.user.isAdmin && !req.user.isManager &&
      req.user.id !== request.userId) {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  res.json(request);
});

/**
 * POST /api/requests
 * Create a new scheduling request
 */
router.post('/', authenticate, (req, res) => {
  const { type, dates, details, reason } = req.body;

  // Validate type
  const validTypes = ['time_off', 'shift_change', 'preference_update'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({
      error: 'Invalid request type. Must be: time_off, shift_change, or preference_update'
    });
  }

  // Get the user making the request
  const userId = req.user.id;
  const user = getById('users', userId);
  if (!user) {
    return res.status(400).json({
      error: 'User profile not found'
    });
  }

  // For time_off and shift_change, validate dates and lead time
  if (type === 'time_off' || type === 'shift_change') {
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        error: 'Dates are required for this request type'
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dates.some(d => !dateRegex.test(d))) {
      return res.status(400).json({
        error: 'All dates must be in YYYY-MM-DD format'
      });
    }

    // Check lead time for each date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const leadTimeViolations = [];

    dates.forEach(dateStr => {
      const requestDate = parseISO(dateStr);
      const leadDays = differenceInDays(requestDate, today);

      if (leadDays < MIN_LEAD_TIME_DAYS) {
        leadTimeViolations.push({
          date: dateStr,
          leadDays,
          required: MIN_LEAD_TIME_DAYS
        });
      }
    });

    if (leadTimeViolations.length > 0) {
      return res.status(400).json({
        error: `Requests require at least ${MIN_LEAD_TIME_DAYS} days lead time`,
        violations: leadTimeViolations,
        earliestAllowedDate: format(addDays(today, MIN_LEAD_TIME_DAYS), 'yyyy-MM-dd')
      });
    }
  }

  // For shift_change, validate details
  if (type === 'shift_change') {
    if (!details || !details.currentShift || !details.requestedShift) {
      return res.status(400).json({
        error: 'Shift change requests require currentShift and requestedShift in details'
      });
    }

    const validShifts = ['Early', 'Morning', 'Late', 'Night', 'OFF'];
    if (!validShifts.includes(details.currentShift) || !validShifts.includes(details.requestedShift)) {
      return res.status(400).json({
        error: 'Invalid shift type in details'
      });
    }
  }

  // For preference_update, validate details
  if (type === 'preference_update') {
    if (!details || !details.preferences || !Array.isArray(details.preferences)) {
      return res.status(400).json({
        error: 'Preference update requests require preferences array in details'
      });
    }

    const validShifts = ['Early', 'Morning', 'Late', 'Night'];
    if (details.preferences.some(p => !validShifts.includes(p))) {
      return res.status(400).json({
        error: 'Invalid shift preference in details'
      });
    }
  }

  // Calculate lead time for the earliest date
  let leadTimeDays = null;
  if (dates && dates.length > 0) {
    const earliestDate = dates.sort()[0];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    leadTimeDays = differenceInDays(parseISO(earliestDate), today);
  }

  // Create the request
  const request = createRequest({
    userId,
    userName: user.name,
    type,
    dates: dates || [],
    details: details || {},
    reason: reason || '',
    leadTimeDays
  });

  res.status(201).json({
    message: 'Request submitted successfully',
    request
  });
});

/**
 * POST /api/requests/:id/approve
 * Approve a request (managers/admins only)
 */
router.post('/:id/approve', authenticate, requireManager, (req, res) => {
  const request = getById('requests', req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found'
    });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({
      error: `Cannot approve a request with status: ${request.status}`
    });
  }

  const { notes } = req.body;

  const updated = reviewRequest(
    req.params.id,
    'approved',
    req.user.id,
    notes || ''
  );

  // If it's a preference update, apply it immediately
  if (request.type === 'preference_update' && request.details.preferences) {
    update('users', request.userId, {
      preferences: request.details.preferences
    });
  }

  // If it's a time_off request, add dates to user's unavailable days
  if (request.type === 'time_off') {
    const user = getById('users', request.userId);
    if (user) {
      // Update simple unavailableDays array
      const existingUnavailable = user.unavailableDays || [];
      const newUnavailable = [...new Set([...existingUnavailable, ...request.dates])];

      // Update detailed unavailableDates array
      const existingDates = user.unavailableDates || [];
      const newDates = [...existingDates];

      for (const dateStr of request.dates) {
        const exists = newDates.some(d =>
          (typeof d === 'string' ? d : d.date) === dateStr
        );
        if (!exists) {
          newDates.push({
            date: dateStr,
            type: 'vacation',
            notes: request.reason || '',
            source: 'approved_request',
            requestId: request.id,
            addedAt: new Date().toISOString()
          });
        }
      }

      update('users', request.userId, {
        unavailableDays: newUnavailable,
        unavailableDates: newDates
      });
    }
  }

  res.json({
    message: 'Request approved',
    request: updated
  });
});

/**
 * POST /api/requests/:id/reject
 * Reject a request (managers/admins only)
 */
router.post('/:id/reject', authenticate, requireManager, (req, res) => {
  const request = getById('requests', req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found'
    });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({
      error: `Cannot reject a request with status: ${request.status}`
    });
  }

  const { notes } = req.body;

  if (!notes) {
    return res.status(400).json({
      error: 'A reason (notes) is required when rejecting a request'
    });
  }

  const updated = reviewRequest(
    req.params.id,
    'rejected',
    req.user.id,
    notes
  );

  res.json({
    message: 'Request rejected',
    request: updated
  });
});

/**
 * DELETE /api/requests/:id
 * Cancel/delete a pending request (only by the user who created it)
 */
router.delete('/:id', authenticate, (req, res) => {
  const request = getById('requests', req.params.id);

  if (!request) {
    return res.status(404).json({
      error: 'Request not found'
    });
  }

  // Only the user who created it or a manager can delete
  if (!req.user.isAdmin && !req.user.isManager &&
      req.user.id !== request.userId) {
    return res.status(403).json({
      error: 'You can only cancel your own requests'
    });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({
      error: 'Only pending requests can be cancelled'
    });
  }

  update('requests', req.params.id, {
    status: 'cancelled',
    cancelledAt: new Date().toISOString()
  });

  res.json({
    message: 'Request cancelled successfully'
  });
});

/**
 * GET /api/requests/types
 * Get available request types
 */
router.get('/types/list', (req, res) => {
  res.json([
    {
      id: 'time_off',
      name: 'Time Off Request',
      description: 'Request vacation or unavailable days',
      requiresDates: true,
      requiresDetails: false
    },
    {
      id: 'shift_change',
      name: 'Shift Change Request',
      description: 'Request to swap a specific shift assignment',
      requiresDates: true,
      requiresDetails: true,
      detailsSchema: {
        currentShift: 'string (Early|Morning|Late|Night|OFF)',
        requestedShift: 'string (Early|Morning|Late|Night|OFF)'
      }
    },
    {
      id: 'preference_update',
      name: 'Preference Update',
      description: 'Update your shift preferences',
      requiresDates: false,
      requiresDetails: true,
      detailsSchema: {
        preferences: 'array of strings (Early|Morning|Late|Night)'
      }
    }
  ]);
});

export default router;
