import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../App';
import { format } from 'date-fns';

function Dashboard() {
  const { isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [latestSchedule, setLatestSchedule] = useState(null);
  const [lockedAccounts, setLockedAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const promises = [
        api.getEngineers(true),
        api.getSchedules(),
        api.getPendingRequests(),
        api.getLatestPublishedSchedule().catch(() => null)
      ];

      if (isAdmin) {
        promises.push(api.getLockedAccounts().catch(() => []));
      }

      const results = await Promise.all(promises);
      const [engineers, schedules, pending, latest] = results;
      const locked = results[4] || [];

      setStats({
        totalUsers: engineers.length,
        floaters: engineers.filter(e => e.isFloater).length,
        inTraining: engineers.filter(e => e.inTraining).length,
        totalSchedules: schedules.length,
        publishedSchedules: schedules.filter(s => s.status === 'published').length
      });

      setPendingRequests(pending.requests || []);
      setLatestSchedule(latest);
      setLockedAccounts(locked);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockAccount = async (email) => {
    try {
      await api.unlockAccount(email);
      setLockedAccounts(prev => prev.filter(a => a.email !== email));
    } catch (err) {
      setError(err.message);
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

      {/* Admin Alert: Locked Accounts */}
      {isAdmin && lockedAccounts.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <strong>Security Alert:</strong> {lockedAccounts.length} account(s) locked due to failed login attempts
          <div style={{ marginTop: 10 }}>
            {lockedAccounts.map(account => (
              <div key={account.email} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
                <span>{account.email} ({account.attemptCount} attempts)</span>
                <button
                  className="btn btn-outline"
                  style={{ padding: '2px 8px', fontSize: 12 }}
                  onClick={() => handleUnlockAccount(account.email)}
                >
                  Unlock
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-box">
          <h3>Active Users</h3>
          <div className="value">{stats?.totalUsers || 0}</div>
        </div>
        <div className="stat-box">
          <h3>Floaters</h3>
          <div className="value">{stats?.floaters || 0}</div>
        </div>
        <div className="stat-box">
          <h3>In Training</h3>
          <div className="value" style={{ color: stats?.inTraining > 0 ? '#9c27b0' : undefined }}>
            {stats?.inTraining || 0}
          </div>
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
            <Link to="/users" className="btn btn-outline" style={{ textDecoration: 'none', justifyContent: 'center' }}>
              Manage Users
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
                    <h3>{req.userName || req.engineerName || 'Unknown User'}</h3>
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

      {/* Latest Published Schedule */}
      {latestSchedule && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Latest Published Schedule: {latestSchedule.month}</h2>
            <Link to={`/schedules/${latestSchedule.id}`} style={{ fontSize: 14 }}>View Full Schedule</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="schedule-table" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: '#f5f5f5', zIndex: 1 }}>User</th>
                  {latestSchedule.days.slice(0, 14).map(day => (
                    <th key={day.date} style={{ textAlign: 'center', minWidth: 35 }}>
                      <div>{day.dayOfWeek}</div>
                      <div>{day.dayNumber}</div>
                    </th>
                  ))}
                  {latestSchedule.days.length > 14 && (
                    <th style={{ textAlign: 'center' }}>...</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {latestSchedule.engineers.slice(0, 10).map(eng => (
                  <tr key={eng.id}>
                    <td style={{
                      position: 'sticky',
                      left: 0,
                      background: '#fff',
                      zIndex: 1,
                      fontWeight: 500,
                      whiteSpace: 'nowrap'
                    }}>
                      {eng.name.split(' ')[0]}
                      {eng.inTraining && <span style={{ color: '#9c27b0', marginLeft: 4 }}>T</span>}
                    </td>
                    {eng.shifts.slice(0, 14).map((shift, i) => (
                      <td key={i} style={{ padding: 2, textAlign: 'center' }}>
                        {shift.shift && (
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '2px 4px',
                              borderRadius: 3,
                              fontSize: 10,
                              fontWeight: 500,
                              background: shift.color?.bg || '#eee',
                              color: shift.color?.text || '#333'
                            }}
                          >
                            {shift.shift[0]}
                          </span>
                        )}
                      </td>
                    ))}
                    {latestSchedule.days.length > 14 && (
                      <td style={{ textAlign: 'center' }}>...</td>
                    )}
                  </tr>
                ))}
                {latestSchedule.engineers.length > 10 && (
                  <tr>
                    <td colSpan={16} style={{ textAlign: 'center', color: '#666' }}>
                      ... and {latestSchedule.engineers.length - 10} more users
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
            <span className="shift-cell shift-OFF">Off</span>
            <span>Scheduled day off</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="shift-cell shift-Training" style={{ background: '#e6cff2' }}>Training</span>
            <span>In training</span>
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
