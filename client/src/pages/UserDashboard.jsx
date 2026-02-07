import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../App';

function UserDashboard() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [latestSchedule, setLatestSchedule] = useState(null);
  const [pastSchedules, setPastSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Get user notifications
      const userData = await api.getCurrentUser();
      setNotifications(userData.notifications || []);

      // Get latest published schedule
      try {
        const schedules = await api.request('/schedules?status=published');
        const published = schedules.filter(s => s.status === 'published')
          .sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));

        if (published.length > 0) {
          setLatestSchedule(published[0]);
          setPastSchedules(published.slice(1, 5)); // Get 4 past schedules
        }
      } catch (err) {
        console.error('Could not load schedules:', err);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const markNotificationsRead = async () => {
    try {
      await api.request(`/users/${user.id}/notifications/read`, {
        method: 'PUT',
        body: JSON.stringify({})
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Welcome, {user?.name}</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Password change reminder */}
      {user?.needsPasswordChange && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <strong>Password Reset Required:</strong> Please change your password in your{' '}
          <Link to="/profile">Profile</Link> settings.
        </div>
      )}

      {/* 2FA reminder */}
      {user?.twoFactorForced && !user?.twoFactorEnabled && (
        <div className="alert alert-warning" style={{ marginBottom: 20 }}>
          <strong>Two-Factor Authentication Required:</strong> Please set up 2FA in your{' '}
          <Link to="/profile">Profile</Link> settings.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Notifications */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  background: '#e53935',
                  color: 'white',
                  borderRadius: '50%',
                  padding: '2px 8px',
                  fontSize: 12,
                  marginLeft: 10
                }}>
                  {unreadCount}
                </span>
              )}
            </h2>
            {unreadCount > 0 && (
              <button className="btn btn-outline" style={{ padding: '5px 10px' }} onClick={markNotificationsRead}>
                Mark All Read
              </button>
            )}
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <p style={{ padding: 20, color: '#666' }}>No notifications</p>
            ) : (
              <div>
                {notifications.slice(0, 10).map((n, i) => (
                  <div
                    key={n.id || i}
                    style={{
                      padding: '10px 15px',
                      borderBottom: '1px solid #eee',
                      background: n.read ? 'white' : '#e3f2fd'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontWeight: n.read ? 'normal' : 'bold', fontSize: 13 }}>
                        {n.type === 'password_reset' && '🔐 Password Reset'}
                        {n.type === 'schedule_change' && '📅 Schedule Update'}
                        {n.type === 'system' && '⚙️ System'}
                        {!['password_reset', 'schedule_change', 'system'].includes(n.type) && '📌 Notice'}
                      </span>
                      <span style={{ fontSize: 11, color: '#666' }}>
                        {new Date(n.date).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: '#444' }}>{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2>Quick Actions</h2>
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link to="/my-schedule" className="btn btn-primary" style={{ textAlign: 'center', textDecoration: 'none' }}>
                View My Schedule
              </Link>
              <Link to="/my-requests" className="btn btn-outline" style={{ textAlign: 'center', textDecoration: 'none' }}>
                Submit Request
              </Link>
              <Link to="/profile" className="btn btn-outline" style={{ textAlign: 'center', textDecoration: 'none' }}>
                Update Profile
              </Link>
            </div>

            <div style={{ marginTop: 30 }}>
              <h3 style={{ fontSize: 14, marginBottom: 10, color: '#666' }}>Your Info</h3>
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '5px 0', color: '#666' }}>Email:</td>
                    <td style={{ padding: '5px 0' }}>{user?.email}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '5px 0', color: '#666' }}>Tier:</td>
                    <td style={{ padding: '5px 0' }}>{user?.tier || 'T2'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '5px 0', color: '#666' }}>2FA:</td>
                    <td style={{ padding: '5px 0' }}>{user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '5px 0', color: '#666' }}>Status:</td>
                    <td style={{ padding: '5px 0' }}>
                      {user?.inTraining ? 'In Training' : user?.isFloater ? 'Floater' : 'Regular'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Current Schedule Preview */}
      {latestSchedule && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Current Schedule: {latestSchedule.month}</h2>
            <Link to={`/schedules/${latestSchedule.id}`} className="btn btn-outline" style={{ textDecoration: 'none' }}>
              View Full Schedule
            </Link>
          </div>
          <div style={{ padding: 20 }}>
            <p style={{ color: '#666' }}>
              Published: {new Date(latestSchedule.publishedAt || latestSchedule.createdAt).toLocaleDateString()}
            </p>
            <Link to="/my-schedule" className="btn btn-primary" style={{ marginTop: 10, textDecoration: 'none' }}>
              View My Shifts
            </Link>
          </div>
        </div>
      )}

      {/* Past Schedules */}
      {pastSchedules.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Past Schedules</h2>
          </div>
          <div style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Published</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pastSchedules.map(schedule => (
                  <tr key={schedule.id}>
                    <td>{schedule.month}</td>
                    <td>{new Date(schedule.publishedAt || schedule.createdAt).toLocaleDateString()}</td>
                    <td>
                      <Link to={`/schedules/${schedule.id}`} className="btn btn-outline" style={{ padding: '5px 10px', textDecoration: 'none' }}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserDashboard;
