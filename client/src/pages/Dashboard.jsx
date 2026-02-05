import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [engineers, schedules, pending] = await Promise.all([
        api.getEngineers(true),
        api.getSchedules(),
        api.getPendingRequests()
      ]);

      setStats({
        totalEngineers: engineers.length,
        floaters: engineers.filter(e => e.isFloater).length,
        totalSchedules: schedules.length,
        publishedSchedules: schedules.filter(s => s.status === 'published').length
      });

      setPendingRequests(pending.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const currentMonth = format(new Date(), 'MMMM yyyy');

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Dashboard</h1>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-grid">
        <div className="stat-box">
          <h3>Active Engineers</h3>
          <div className="value">{stats?.totalEngineers || 0}</div>
        </div>
        <div className="stat-box">
          <h3>Floaters</h3>
          <div className="value">{stats?.floaters || 0}</div>
        </div>
        <div className="stat-box">
          <h3>Total Schedules</h3>
          <div className="value">{stats?.totalSchedules || 0}</div>
        </div>
        <div className="stat-box">
          <h3>Pending Requests</h3>
          <div className="value" style={{ color: pendingRequests.length > 0 ? '#ff9800' : undefined }}>
            {pendingRequests.length}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <h2>Quick Actions</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/schedules" className="btn btn-primary" style={{ textDecoration: 'none', justifyContent: 'center' }}>
              Generate {currentMonth} Schedule
            </Link>
            <Link to="/engineers" className="btn btn-outline" style={{ textDecoration: 'none', justifyContent: 'center' }}>
              Manage Engineers
            </Link>
            <Link to="/requests" className="btn btn-outline" style={{ textDecoration: 'none', justifyContent: 'center' }}>
              Review Requests ({pendingRequests.length} pending)
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Recent Requests</h2>
            <Link to="/requests" style={{ fontSize: 14 }}>View All</Link>
          </div>
          {pendingRequests.length === 0 ? (
            <p style={{ color: '#666' }}>No pending requests</p>
          ) : (
            <div>
              {pendingRequests.slice(0, 5).map(req => (
                <div key={req.id} className={`request-card ${req.type}`} style={{ marginBottom: 10 }}>
                  <div className="request-card-header">
                    <h3>{req.engineerName}</h3>
                    <span className="request-card-badge badge-pending">Pending</span>
                  </div>
                  <div className="request-card-body">
                    <strong>{req.type.replace('_', ' ').toUpperCase()}</strong>
                    {req.dates && req.dates.length > 0 && (
                      <p>Dates: {req.dates.slice(0, 3).join(', ')}{req.dates.length > 3 ? '...' : ''}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Shift Legend</h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="shift-cell shift-Early">Early</span>
            <span>07:00 - 15:30</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="shift-cell shift-Morning">Morning</span>
            <span>10:00 - 18:30</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="shift-cell shift-Late">Late</span>
            <span>15:00 - 23:30</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="shift-cell shift-Night">Night</span>
            <span>23:00 - 07:30</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="shift-cell shift-OFF">OFF</span>
            <span>Scheduled day off</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="shift-cell shift-Unavailable">Unavailable</span>
            <span>Vacation/Time off</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
