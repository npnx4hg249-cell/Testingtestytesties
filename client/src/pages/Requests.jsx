import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { format } from 'date-fns';

function Requests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState(null);
  const [rejectNotes, setRejectNotes] = useState('');

  useEffect(() => {
    loadRequests();
  }, [filter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const data = await api.getRequests({ status: filter || undefined });
      setRequests(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.approveRequest(id);
      await loadRequests();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async () => {
    if (!rejectNotes.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    try {
      await api.rejectRequest(rejectingRequest.id, rejectNotes);
      setShowRejectModal(false);
      setRejectingRequest(null);
      setRejectNotes('');
      await loadRequests();
    } catch (err) {
      setError(err.message);
    }
  };

  const openRejectModal = (request) => {
    setRejectingRequest(request);
    setRejectNotes('');
    setShowRejectModal(true);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

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
      default: return 'badge-pending';
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Scheduling Requests</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {['pending', 'approved', 'rejected', ''].map(status => (
          <button
            key={status || 'all'}
            className={`btn ${filter === status ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setFilter(status)}
          >
            {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {/* Request Cards */}
      {requests.length === 0 ? (
        <div className="card">
          <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>
            No {filter || ''} requests found.
          </p>
        </div>
      ) : (
        <div>
          {requests.map(req => (
            <div key={req.id} className={`request-card ${req.type}`}>
              <div className="request-card-header">
                <div>
                  <h3>{req.engineerName}</h3>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {getRequestTypeName(req.type)}
                  </span>
                </div>
                <span className={`request-card-badge ${getStatusBadge(req.status)}`}>
                  {req.status}
                </span>
              </div>

              <div className="request-card-body">
                {req.type === 'time_off' && req.dates && (
                  <div>
                    <strong>Requested Dates:</strong>
                    <div className="date-list" style={{ marginTop: 5 }}>
                      {req.dates.map(d => (
                        <span key={d} className="date-tag">
                          {format(new Date(d), 'MMM d, yyyy')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {req.type === 'shift_change' && (
                  <div>
                    <strong>Shift Change:</strong>{' '}
                    <span className={`shift-cell shift-${req.details.currentShift}`}>
                      {req.details.currentShift}
                    </span>
                    {' → '}
                    <span className={`shift-cell shift-${req.details.requestedShift}`}>
                      {req.details.requestedShift}
                    </span>
                    {req.dates && req.dates.length > 0 && (
                      <div style={{ marginTop: 5 }}>
                        <strong>Date(s):</strong> {req.dates.join(', ')}
                      </div>
                    )}
                  </div>
                )}

                {req.type === 'preference_update' && req.details.preferences && (
                  <div>
                    <strong>New Preferences:</strong>
                    <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                      {req.details.preferences.map(p => (
                        <span key={p} className={`shift-cell shift-${p}`}>{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {req.reason && (
                  <div style={{ marginTop: 10 }}>
                    <strong>Reason:</strong> {req.reason}
                  </div>
                )}

                <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
                  Submitted: {format(new Date(req.createdAt), 'MMM d, yyyy HH:mm')}
                  {req.leadTimeDays && (
                    <span> | Lead time: {req.leadTimeDays} days</span>
                  )}
                </div>

                {req.reviewedAt && (
                  <div style={{ marginTop: 5, fontSize: 12, color: '#666' }}>
                    Reviewed: {format(new Date(req.reviewedAt), 'MMM d, yyyy HH:mm')}
                    {req.reviewNotes && (
                      <div style={{ marginTop: 5, fontStyle: 'italic' }}>
                        Notes: {req.reviewNotes}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {req.status === 'pending' && (
                <div className="request-card-footer">
                  <button
                    className="btn btn-success"
                    onClick={() => handleApprove(req.id)}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => openRejectModal(req)}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-overlay" onClick={() => setShowRejectModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reject Request</h2>
              <button className="btn btn-outline" onClick={() => setShowRejectModal(false)} style={{ padding: '5px 10px' }}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 15 }}>
                You are rejecting the request from <strong>{rejectingRequest?.engineerName}</strong>.
              </p>
              <div className="form-group">
                <label>Reason for Rejection (required)</label>
                <textarea
                  value={rejectNotes}
                  onChange={e => setRejectNotes(e.target.value)}
                  rows={4}
                  placeholder="Please provide a reason for rejecting this request..."
                  required
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowRejectModal(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleReject}>
                Reject Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Requests;
