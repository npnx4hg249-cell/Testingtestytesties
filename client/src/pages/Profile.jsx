import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../App';
import { format } from 'date-fns';

function Profile() {
  const { user, refreshUser } = useAuth();
  const [userData, setUserData] = useState(null);
  const [states, setStates] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preferences, setPreferences] = useState([]);
  const [saving, setSaving] = useState(false);

  // Password change state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    useGenerated: false,
    generatedPassword: ''
  });

  // 2FA state
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');

  // Email state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [stateList, currentUser] = await Promise.all([
        api.request('/users/states'),
        api.request('/auth/me')
      ]);
      setStates(stateList);
      setUserData(currentUser);
      setPreferences(currentUser.preferences || []);

      if (currentUser.state) {
        try {
          const holidayData = await api.request(`/users/${currentUser.id}/holidays?year=${new Date().getFullYear()}`);
          setHolidays(holidayData.holidays || []);
        } catch (e) {
          // Holidays endpoint may not exist for all users
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSavePreferences = async () => {
    if (preferences.length === 0) {
      setError('You must select at least one shift preference');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await api.request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ preferences })
      });
      setSuccess('Preferences saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePreference = (shift) => {
    setPreferences(prev =>
      prev.includes(shift)
        ? prev.filter(p => p !== shift)
        : [...prev, shift]
    );
  };

  // Password management
  const handleGeneratePassword = async () => {
    try {
      const response = await api.request('/auth/generate-password', { method: 'POST' });
      setPasswordData(prev => ({
        ...prev,
        useGenerated: true,
        generatedPassword: response.password,
        newPassword: response.password,
        confirmPassword: response.password
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      await api.request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      });
      setSuccess('Password changed successfully!');
      setShowPasswordModal(false);
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        useGenerated: false,
        generatedPassword: ''
      });
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // 2FA management
  const handleSetup2FA = async () => {
    try {
      const response = await api.request('/auth/2fa/setup', { method: 'POST' });
      setTwoFactorSetup(response);
      setShow2FAModal(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    try {
      await api.request('/auth/2fa/verify', {
        method: 'POST',
        body: JSON.stringify({ code: verifyCode })
      });
      setSuccess('Two-factor authentication enabled successfully!');
      setShow2FAModal(false);
      setTwoFactorSetup(null);
      setVerifyCode('');
      await loadData();
      if (refreshUser) refreshUser();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    try {
      await api.request('/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password: disablePassword })
      });
      setSuccess('Two-factor authentication disabled');
      setShow2FAModal(false);
      setDisablePassword('');
      await loadData();
      if (refreshUser) refreshUser();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Email change
  const handleChangeEmail = async (e) => {
    e.preventDefault();
    try {
      await api.request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ email: newEmail })
      });
      setSuccess('Email updated successfully!');
      setShowEmailModal(false);
      setNewEmail('');
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle notifications
  const handleToggleNotifications = async () => {
    try {
      await api.request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ emailNotifications: !userData.emailNotifications })
      });
      setSuccess(userData.emailNotifications ? 'Email notifications disabled' : 'Email notifications enabled');
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle dark mode
  const handleToggleDarkMode = async () => {
    try {
      await api.request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ darkMode: !userData.darkMode })
      });
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const getUserType = () => {
    if (!userData) return 'User';
    const types = [];
    if (userData.isAdmin) types.push('Admin');
    if (userData.isManager) types.push('Manager');
    if (userData.isFloater) types.push('Floater');
    if (userData.inTraining) types.push('Training');
    return types.length > 0 ? types.join(', ') : 'User';
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
      <h1 style={{ marginBottom: 20 }}>My Profile</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Account Info */}
        <div className="card">
          <div className="card-header">
            <h2>Account Information</h2>
          </div>
          <table className="data-table">
            <tbody>
              <tr>
                <td><strong>Name</strong></td>
                <td>{userData?.name || user.name}</td>
              </tr>
              <tr>
                <td><strong>Email</strong></td>
                <td>
                  {userData?.email || user.email}
                  <button
                    className="btn btn-outline"
                    style={{ marginLeft: 10, padding: '2px 8px', fontSize: 12 }}
                    onClick={() => {
                      setNewEmail(userData?.email || user.email);
                      setShowEmailModal(true);
                    }}
                  >
                    Change
                  </button>
                </td>
              </tr>
              <tr>
                <td><strong>Role</strong></td>
                <td>{getUserType()}</td>
              </tr>
              <tr>
                <td><strong>Two-Factor Auth</strong></td>
                <td>
                  {userData?.twoFactorEnabled ? (
                    <span style={{ color: 'green' }}>✓ Enabled</span>
                  ) : (
                    <span style={{ color: '#999' }}>Not enabled</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* User Details */}
        {userData && (
          <div className="card">
            <div className="card-header">
              <h2>User Details</h2>
            </div>
            <table className="data-table">
              <tbody>
                <tr>
                  <td><strong>Tier</strong></td>
                  <td>
                    <span className={`tier-badge tier-${userData.tier}`}>{userData.tier || 'T2'}</span>
                  </td>
                </tr>
                <tr>
                  <td><strong>Type</strong></td>
                  <td>
                    {userData.isFloater ? 'Floater' : userData.inTraining ? 'In Training' : 'Core User'}
                  </td>
                </tr>
                <tr>
                  <td><strong>State</strong></td>
                  <td>
                    {userData.state
                      ? states.find(s => s.code === userData.state)?.name || userData.state
                      : 'Not set'
                    }
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Settings */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Security Settings</h2>
        </div>
        <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap', padding: 15 }}>
          <button className="btn btn-outline" onClick={() => setShowPasswordModal(true)}>
            Change Password
          </button>
          {userData?.twoFactorEnabled ? (
            <button
              className="btn btn-danger"
              onClick={() => {
                setDisablePassword('');
                setShow2FAModal(true);
              }}
            >
              Disable 2FA
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleSetup2FA}>
              Enable Two-Factor Authentication
            </button>
          )}
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Notification Preferences</h2>
        </div>
        <div style={{ padding: 15 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={userData?.emailNotifications || false}
              onChange={handleToggleNotifications}
              style={{ width: 'auto' }}
            />
            Email Notifications
          </label>
          <p style={{ fontSize: 12, color: '#666', marginTop: 5, marginLeft: 25 }}>
            Receive email notifications for schedule changes, request updates, and system alerts.
          </p>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 15 }}>
            <input
              type="checkbox"
              checked={userData?.darkMode || false}
              onChange={handleToggleDarkMode}
              style={{ width: 'auto' }}
            />
            Dark Mode
          </label>
        </div>
      </div>

      {/* Shift Preferences */}
      {userData && !userData.isAdmin && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Shift Preferences</h2>
          </div>
          <p style={{ marginBottom: 15, color: '#666' }}>
            Select the shifts you are available to work. The scheduler will only assign you to shifts you've selected.
          </p>
          <div className="preferences-grid" style={{ maxWidth: 500 }}>
            {['Early', 'Morning', 'Late', 'Night'].map(shift => (
              <label key={shift} className="preference-item">
                <input
                  type="checkbox"
                  checked={preferences.includes(shift)}
                  onChange={() => togglePreference(shift)}
                  style={{ width: 'auto' }}
                />
                <span className={`shift-cell shift-${shift}`}>{shift}</span>
                <span style={{ fontSize: 12, color: '#666', marginLeft: 'auto' }}>
                  {shift === 'Early' && '07:00-15:30'}
                  {shift === 'Morning' && '10:00-18:30'}
                  {shift === 'Late' && '15:00-23:30'}
                  {shift === 'Night' && '23:00-07:30'}
                </span>
              </label>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={handleSavePreferences}
            disabled={saving}
            style={{ marginTop: 15 }}
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      )}

      {/* Holidays */}
      {userData && userData.state && holidays.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Your Holidays ({new Date().getFullYear()})</h2>
          </div>
          <p style={{ marginBottom: 15, color: '#666' }}>
            Based on your location in {states.find(s => s.code === userData.state)?.name || userData.state},
            these holidays apply to you:
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Holiday</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h, i) => (
                <tr key={i}>
                  <td>{format(new Date(h.date), 'EEEE, MMMM d')}</td>
                  <td>
                    <strong>{h.nameEn}</strong>
                    <br />
                    <span style={{ fontSize: 12, color: '#666' }}>{h.name}</span>
                  </td>
                  <td>
                    <span className={`request-card-badge ${h.type === 'federal' ? 'badge-approved' : 'badge-pending'}`}>
                      {h.type === 'federal' ? 'Federal' : 'State'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2>Change Password</h2>
              <button className="btn btn-outline" onClick={() => setShowPasswordModal(false)} style={{ padding: '5px 10px' }}>×</button>
            </div>
            <form onSubmit={handleChangePassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Current Password *</label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={e => setPasswordData(prev => ({ ...prev, currentPassword: e.target.value }))}
                    required
                  />
                </div>

                <div style={{ background: '#f5f5f5', padding: 15, borderRadius: 8, marginBottom: 15 }}>
                  <button type="button" className="btn btn-outline" onClick={handleGeneratePassword}>
                    Generate Strong Password
                  </button>
                  {passwordData.generatedPassword && (
                    <div style={{ marginTop: 10 }}>
                      <code style={{ background: '#fff', padding: '5px 10px', borderRadius: 4, display: 'block' }}>
                        {passwordData.generatedPassword}
                      </code>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ marginTop: 5, padding: '2px 8px', fontSize: 12 }}
                        onClick={() => navigator.clipboard.writeText(passwordData.generatedPassword)}
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>

                {!passwordData.useGenerated && (
                  <>
                    <div className="form-group">
                      <label>New Password *</label>
                      <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={e => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="Min 10 chars, special char, number"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Confirm New Password *</label>
                      <input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={e => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        required
                      />
                    </div>
                  </>
                )}

                <p style={{ fontSize: 12, color: '#666' }}>
                  Password requirements: minimum 10 characters, at least one special character, at least one number.
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2FA Modal */}
      {show2FAModal && (
        <div className="modal-overlay" onClick={() => setShow2FAModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 450 }}>
            <div className="modal-header">
              <h2>{userData?.twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}</h2>
              <button className="btn btn-outline" onClick={() => setShow2FAModal(false)} style={{ padding: '5px 10px' }}>×</button>
            </div>
            <div className="modal-body">
              {userData?.twoFactorEnabled ? (
                <form onSubmit={handleDisable2FA}>
                  <p style={{ marginBottom: 15 }}>
                    Enter your password to disable two-factor authentication.
                  </p>
                  <div className="form-group">
                    <label>Password *</label>
                    <input
                      type="password"
                      value={disablePassword}
                      onChange={e => setDisablePassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="modal-footer" style={{ padding: 0, marginTop: 15 }}>
                    <button type="button" className="btn btn-outline" onClick={() => setShow2FAModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-danger">
                      Disable 2FA
                    </button>
                  </div>
                </form>
              ) : twoFactorSetup ? (
                <form onSubmit={handleVerify2FA}>
                  <p style={{ marginBottom: 15 }}>
                    Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):
                  </p>
                  <div style={{ textAlign: 'center', marginBottom: 15 }}>
                    <img src={twoFactorSetup.qrCode} alt="2FA QR Code" style={{ maxWidth: 200 }} />
                  </div>
                  <p style={{ fontSize: 12, color: '#666', marginBottom: 15 }}>
                    Or enter this secret manually: <code>{twoFactorSetup.secret}</code>
                  </p>
                  <div className="form-group">
                    <label>Verification Code *</label>
                    <input
                      type="text"
                      value={verifyCode}
                      onChange={e => setVerifyCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      required
                    />
                  </div>
                  <div className="modal-footer" style={{ padding: 0, marginTop: 15 }}>
                    <button type="button" className="btn btn-outline" onClick={() => setShow2FAModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Verify & Enable
                    </button>
                  </div>
                </form>
              ) : (
                <p>Loading...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Email Change Modal */}
      {showEmailModal && (
        <div className="modal-overlay" onClick={() => setShowEmailModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Change Email</h2>
              <button className="btn btn-outline" onClick={() => setShowEmailModal(false)} style={{ padding: '5px 10px' }}>×</button>
            </div>
            <form onSubmit={handleChangeEmail}>
              <div className="modal-body">
                <div className="form-group">
                  <label>New Email Address *</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowEmailModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Profile;
