import React, { useState, useEffect } from 'react';
import api from '../services/api';

function AdminSettings() {
  const [version, setVersion] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [engineers, setEngineers] = useState([]);
  const [emailConfig, setEmailConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [versionData, updateData, usersData, engineersData, emailData] = await Promise.all([
        api.getFullVersion(),
        api.getUpdateStatus(),
        api.getUsers(),
        api.getEngineers(),
        api.getEmailConfig()
      ]);
      setVersion(versionData);
      setUpdateStatus(updateData);
      setUsers(usersData);
      setEngineers(engineersData);
      setEmailConfig(emailData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckUpdate = async () => {
    setChecking(true);
    setError('');
    try {
      const result = await api.checkForUpdate();
      setUpdateStatus(prev => ({
        ...prev,
        ...result,
        lastCheck: result.checkedAt
      }));
      if (result.updateAvailable) {
        setSuccess('Update available! Version ' + result.latestVersion);
      } else {
        setSuccess('You are running the latest version.');
      }
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setChecking(false);
    }
  };

  const handleApplyUpdate = async () => {
    if (!confirm('Are you sure you want to apply the update? The application may need to restart.')) return;

    setApplying(true);
    setError('');
    try {
      const result = await api.applyUpdate();
      setSuccess(result.message);
      if (result.requiresRestart) {
        setSuccess('Update applied! Please restart the application.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const handleUpdateCheckInterval = async (interval) => {
    try {
      await api.configureUpdateCheck(interval);
      setUpdateStatus(prev => ({ ...prev, interval }));
      setSuccess('Update check interval saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleNotifications = async (userId, enabled) => {
    try {
      await api.updateUserNotifications(userId, enabled);
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, emailNotifications: enabled } : u
      ));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLinkEngineer = async (userId, engineerId) => {
    try {
      await api.linkUserToEngineer(userId, engineerId || null);
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, engineerId, isAlsoEngineer: !!engineerId } : u
      ));
      setSuccess('User updated successfully');
      setTimeout(() => setSuccess(''), 3000);
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

  return (
    <div>
      <h1>Admin Settings</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Version Info */}
      <div className="card">
        <div className="card-header">
          <h2>Version Information</h2>
        </div>
        {version && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, marginBottom: 20 }}>
              <strong>Name:</strong> <span>{version.name}</span>
              <strong>Version:</strong> <span>{version.version}</span>
              <strong>Released:</strong> <span>{version.releaseDate}</span>
              <strong>Description:</strong> <span>{version.description}</span>
            </div>

            {version.changelog && (
              <details style={{ marginTop: 15 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Changelog</summary>
                <div style={{ marginTop: 10, maxHeight: 300, overflow: 'auto' }}>
                  {version.changelog.map((entry, i) => (
                    <div key={i} style={{ marginBottom: 15 }}>
                      <h4>v{entry.version} ({entry.date})</h4>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {entry.changes.map((change, j) => (
                          <li key={j}>{change}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Update Management */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Update Management</h2>
        </div>
        {updateStatus && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, marginBottom: 20 }}>
              <strong>Current Version:</strong> <span>{updateStatus.currentVersion}</span>
              <strong>Latest Version:</strong> <span>{updateStatus.latestVersion || 'Unknown'}</span>
              <strong>Update Available:</strong>
              <span>{updateStatus.updateAvailable ? 'Yes' : 'No'}</span>
              <strong>Last Check:</strong>
              <span>{updateStatus.lastCheck ? new Date(updateStatus.lastCheck).toLocaleString() : 'Never'}</span>
              <strong>Docker Mode:</strong>
              <span>{updateStatus.isDockerEnvironment ? 'Yes' : 'No'}</span>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button
                className="btn btn-primary"
                onClick={handleCheckUpdate}
                disabled={checking}
              >
                {checking ? 'Checking...' : 'Check for Updates'}
              </button>

              {updateStatus.updateAvailable && (
                <button
                  className="btn btn-success"
                  onClick={handleApplyUpdate}
                  disabled={applying}
                >
                  {applying ? 'Applying...' : 'Apply Update'}
                </button>
              )}
            </div>

            <div className="form-group">
              <label>Automatic Update Check Interval</label>
              <select
                value={updateStatus.interval || 'day'}
                onChange={e => handleUpdateCheckInterval(e.target.value)}
                style={{ maxWidth: 200 }}
              >
                <option value="hour">Every Hour</option>
                <option value="8hour">Every 8 Hours</option>
                <option value="day">Daily</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Email Configuration */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Email Configuration</h2>
        </div>
        {emailConfig && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10 }}>
              <strong>Configured:</strong>
              <span>{emailConfig.configured ? 'Yes' : 'No'}</span>
              {emailConfig.configured && (
                <>
                  <strong>SMTP Port:</strong> <span>{emailConfig.port}</span>
                  <strong>Secure:</strong> <span>{emailConfig.secure ? 'Yes (TLS)' : 'No'}</span>
                </>
              )}
            </div>
            {!emailConfig.configured && (
              <p style={{ marginTop: 15, color: '#666' }}>
                Email notifications require SMTP configuration via environment variables:
                <code style={{ display: 'block', marginTop: 10, padding: 10, background: '#f5f5f5' }}>
                  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
                </code>
              </p>
            )}
          </div>
        )}
      </div>

      {/* User Management */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>User Management</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Linked Engineer</th>
              <th>Email Notifications</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <span className={`request-card-badge badge-${user.role === 'admin' ? 'approved' : 'pending'}`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  {(user.role === 'admin' || user.role === 'manager') ? (
                    <select
                      value={user.engineerId || ''}
                      onChange={e => handleLinkEngineer(user.id, e.target.value)}
                      style={{ padding: '4px 8px', fontSize: 13 }}
                    >
                      <option value="">-- Not an Engineer --</option>
                      {engineers.filter(e => e.isActive).map(eng => (
                        <option key={eng.id} value={eng.id}>{eng.name}</option>
                      ))}
                    </select>
                  ) : (
                    <span>{engineers.find(e => e.id === user.engineerId)?.name || '-'}</span>
                  )}
                </td>
                <td>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <input
                      type="checkbox"
                      checked={user.emailNotifications !== false}
                      onChange={e => handleToggleNotifications(user.id, e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    Enabled
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminSettings;
