import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../App';
import { format, addDays } from 'date-fns';

function MyRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    type: 'time_off',
    dates: [],
    details: {},
    reason: ''
  });
  const [dateInput, setDateInput] = useState('');

  // Calculate minimum date (15 days from today)
  const minDate = format(addDays(new Date(), 15), 'yyyy-MM-dd');

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await api.getRequests();
      setRequests(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await api.createRequest(formData);
      await loadRequests();
      closeModal();
    } catch (err) {
      setError(err.data?.error || err.message);
      if (err.data?.violations) {
        const violationMsg = err.data.violations.map(v =>
          `${v.date}: only ${v.leadDays} days lead time`
        ).join(', ');
        setError(`${err.message}. Violations: ${violationMsg}. Earliest allowed date: ${err.data.earliestAllowedDate}`);
      }
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Are you sure you want to cancel this request?')) return;

    try {
      await api.cancelRequest(id);
      await loadRequests();
    } catch (err) {
      setError(err.message);
    }
  };

  const addDate = () => {
    if (dateInput && !formData.dates.includes(dateInput)) {
      setFormData(prev => ({
        ...prev,
        dates: [...prev.dates, dateInput].sort()
      }));
      setDateInput('');
    }
  };

  const removeDate = (date) => {
    setFormData(prev => ({
      ...prev,
      dates: prev.dates.filter(d => d !== date)
    }));
  };

  const openModal = () => {
    setFormData({
      type: 'time_off',
      dates: [],
      details: {},
      reason: ''
    });
    setDateInput('');
    setError('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setFormData({
      type: 'time_off',
      dates: [],
      details: {},
      reason: ''
    });
    setError('');
  };

  const getRequestTypeName = (type) => {
    switch (type) {
      case 'time_off': return 'Time Off';
      case 'shift_change': return 'Shift Change';
      case 'preference_update': return 'Preference Update';
      default: return type;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending': return 'badge-pending';
      case 'approved': return 'badge-approved';
      case 'rejected': return 'badge-rejected';
      case 'cancelled': return 'badge-rejected';
      default: return 'badge-pending';
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const pastRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>My Requests</h1>
        <button className="btn btn-primary" onClick={openModal}>
          + New Request
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <strong>Note:</strong> All scheduling requests require at least 15 days lead time.
        The earliest date you can request is <strong>{format(new Date(minDate), 'MMMM d, yyyy')}</strong>.
      </div>

      {/* Pending Requests */}
      <div className="card">
        <div className="card-header">
          <h2>Pending Requests ({pendingRequests.length})</h2>
        </div>

        {pendingRequests.length === 0 ? (
          <p style={{ color: '#666' }}>You have no pending requests.</p>
        ) : (
          <div>
            {pendingRequests.map(req => (
              <div key={req.id} className={`request-card ${req.type}`}>
                <div className="request-card-header">
                  <h3>{getRequestTypeName(req.type)}</h3>
                  <span className={`request-card-badge ${getStatusBadge(req.status)}`}>
                    {req.status}
                  </span>
                </div>
                <div className="request-card-body">
                  {req.dates && req.dates.length > 0 && (
                    <div className="date-list">
                      {req.dates.map(d => (
                        <span key={d} className="date-tag">
                          {format(new Date(d), 'MMM d, yyyy')}
                        </span>
                      ))}
                    </div>
                  )}
                  {req.reason && (
                    <p style={{ marginTop: 10 }}>Reason: {req.reason}</p>
                  )}
                  <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
                    Submitted: {format(new Date(req.createdAt), 'MMM d, yyyy HH:mm')}
                  </div>
                </div>
                <div className="request-card-footer">
                  <button
                    className="btn btn-danger"
                    onClick={() => handleCancel(req.id)}
                  >
                    Cancel Request
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Past Requests */}
      {pastRequests.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Past Requests</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Details</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Review Notes</th>
              </tr>
            </thead>
            <tbody>
              {pastRequests.map(req => (
                <tr key={req.id}>
                  <td>{getRequestTypeName(req.type)}</td>
                  <td>
                    {req.dates && req.dates.length > 0 && (
                      <span>{req.dates.slice(0, 3).map(d => format(new Date(d), 'MMM d')).join(', ')}</span>
                    )}
                    {req.dates && req.dates.length > 3 && ` +${req.dates.length - 3} more`}
                  </td>
                  <td>
                    <span className={`request-card-badge ${getStatusBadge(req.status)}`}>
                      {req.status}
                    </span>
                  </td>
                  <td>{format(new Date(req.createdAt), 'MMM d, yyyy')}</td>
                  <td>{req.reviewNotes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Request Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Request</h2>
              <button className="btn btn-outline" onClick={closeModal} style={{ padding: '5px 10px' }}>
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {error && <div className="alert alert-error" style={{ marginBottom: 15 }}>{error}</div>}

                <div className="form-group">
                  <label>Request Type</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      type: e.target.value,
                      details: e.target.value === 'preference_update'
                        ? { preferences: ['Early', 'Morning', 'Late', 'Night'] }
                        : e.target.value === 'shift_change'
                        ? { currentShift: 'Early', requestedShift: 'Morning' }
                        : {}
                    }))}
                  >
                    <option value="time_off">Time Off Request</option>
                    <option value="shift_change">Shift Change Request</option>
                    <option value="preference_update">Update Shift Preferences</option>
                  </select>
                </div>

                {/* Time Off - Date Selection */}
                {(formData.type === 'time_off' || formData.type === 'shift_change') && (
                  <div className="form-group">
                    <label>Select Dates (minimum 15 days lead time)</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <input
                        type="date"
                        value={dateInput}
                        onChange={e => setDateInput(e.target.value)}
                        min={minDate}
                      />
                      <button type="button" className="btn btn-outline" onClick={addDate}>
                        Add Date
                      </button>
                    </div>
                    {formData.dates.length > 0 && (
                      <div className="date-list" style={{ marginTop: 10 }}>
                        {formData.dates.map(d => (
                          <span key={d} className="date-tag">
                            {format(new Date(d), 'MMM d, yyyy')}
                            <button type="button" onClick={() => removeDate(d)}>×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Shift Change Details */}
                {formData.type === 'shift_change' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                    <div className="form-group">
                      <label>Current Shift</label>
                      <select
                        value={formData.details.currentShift || 'Early'}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          details: { ...prev.details, currentShift: e.target.value }
                        }))}
                      >
                        <option value="Early">Early</option>
                        <option value="Morning">Morning</option>
                        <option value="Late">Late</option>
                        <option value="Night">Night</option>
                        <option value="OFF">OFF</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Requested Shift</label>
                      <select
                        value={formData.details.requestedShift || 'Morning'}
                        onChange={e => setFormData(prev => ({
                          ...prev,
                          details: { ...prev.details, requestedShift: e.target.value }
                        }))}
                      >
                        <option value="Early">Early</option>
                        <option value="Morning">Morning</option>
                        <option value="Late">Late</option>
                        <option value="Night">Night</option>
                        <option value="OFF">OFF</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Preference Update */}
                {formData.type === 'preference_update' && (
                  <div className="form-group">
                    <label>Shift Preferences (select shifts you can work)</label>
                    <div className="preferences-grid">
                      {['Early', 'Morning', 'Late', 'Night'].map(shift => (
                        <label key={shift} className="preference-item">
                          <input
                            type="checkbox"
                            checked={formData.details.preferences?.includes(shift)}
                            onChange={() => {
                              const prefs = formData.details.preferences || [];
                              setFormData(prev => ({
                                ...prev,
                                details: {
                                  ...prev.details,
                                  preferences: prefs.includes(shift)
                                    ? prefs.filter(p => p !== shift)
                                    : [...prefs, shift]
                                }
                              }));
                            }}
                            style={{ width: 'auto' }}
                          />
                          <span className={`shift-cell shift-${shift}`}>{shift}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label>Reason (optional)</label>
                  <textarea
                    value={formData.reason}
                    onChange={e => setFormData(prev => ({ ...prev, reason: e.target.value }))}
                    rows={3}
                    placeholder="Provide any additional context for your request..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    (formData.type !== 'preference_update' && formData.dates.length === 0) ||
                    (formData.type === 'preference_update' && formData.details.preferences?.length === 0)
                  }
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default MyRequests;
