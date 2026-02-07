import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

const WEEKDAY_SHIFTS = ['Early', 'Morning', 'Late', 'Night'];
const WEEKEND_SHIFTS = ['WeekendEarly', 'WeekendMorning', 'WeekendLate', 'WeekendNight'];
const ALL_SHIFTS = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];
const DEFAULT_PREFERENCES = [...ALL_SHIFTS];

function Users() {
  const [users, setUsers] = useState([]);
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    generatePassword: true,
    tier: 'T2',
    isAdmin: false,
    isManager: false,
    isFloater: false,
    inTraining: false,
    state: '',
    preferences: DEFAULT_PREFERENCES,
    sendEmail: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userList, stateList] = await Promise.all([
        api.request('/users'),
        api.request('/users/states')
      ]);
      setUsers(userList);
      setStates(stateList);
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
      if (editingUser) {
        await api.request(`/users/${editingUser.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            tier: formData.tier,
            isAdmin: formData.isAdmin,
            isManager: formData.isManager,
            isFloater: formData.isFloater,
            inTraining: formData.inTraining,
            state: formData.state,
            preferences: formData.preferences
          })
        });
        setSuccess('User updated successfully');
      } else {
        const response = await api.request('/users', {
          method: 'POST',
          body: JSON.stringify({
            ...formData,
            password: formData.generatePassword ? undefined : formData.password
          })
        });
        if (response.generatedPassword) {
          setGeneratedPassword(response.generatedPassword);
        }
        setSuccess('User created successfully');
      }
      await loadData();
      if (!formData.generatePassword || editingUser) {
        closeModal();
      }
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || err.error);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to deactivate this user?')) return;
    try {
      await api.request(`/users/${id}`, { method: 'DELETE' });
      await loadData();
      setSuccess('User deactivated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const openModal = (user = null) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        name: user.name,
        email: user.email,
        password: '',
        generatePassword: false,
        tier: user.tier || 'T2',
        isAdmin: user.isAdmin || false,
        isManager: user.isManager || false,
        isFloater: user.isFloater || false,
        inTraining: user.inTraining || false,
        state: user.state || '',
        preferences: user.preferences || DEFAULT_PREFERENCES,
        sendEmail: false
      });
    } else {
      setEditingUser(null);
      setFormData({
        name: '',
        email: '',
        password: '',
        generatePassword: true,
        tier: 'T2',
        isAdmin: false,
        isManager: false,
        isFloater: false,
        inTraining: false,
        state: '',
        preferences: DEFAULT_PREFERENCES,
        sendEmail: false
      });
    }
    setGeneratedPassword('');
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setGeneratedPassword('');
  };

  const openPasswordModal = (user) => {
    setSelectedUser(user);
    setGeneratedPassword('');
    setShowPasswordModal(true);
  };

  const handleGeneratePassword = async () => {
    try {
      const response = await api.request('/auth/generate-password', { method: 'POST' });
      setGeneratedPassword(response.password);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (sendEmail = false) => {
    if (!generatedPassword) {
      setError('Please generate a password first');
      return;
    }
    try {
      await api.request(`/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          newPassword: generatedPassword,
          generateNew: false,
          sendEmail
        })
      });
      setSuccess(`Password reset for ${selectedUser.name}${sendEmail ? ' (email sent)' : ''}`);
      setShowPasswordModal(false);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(err.message);
    }
  };

  const togglePreference = (shift) => {
    setFormData(prev => ({
      ...prev,
      preferences: prev.preferences.includes(shift)
        ? prev.preferences.filter(p => p !== shift)
        : [...prev.preferences, shift]
    }));
  };

  const getUserType = (user) => {
    const types = [];
    if (user.isAdmin) types.push('Admin');
    if (user.isManager) types.push('Manager');
    if (user.isFloater) types.push('Floater');
    if (user.inTraining) types.push('Training');
    return types.length > 0 ? types.join(', ') : 'User';
  };

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div></div>;
  }

  const activeUsers = users.filter(u => u.isActive !== false);
  const inactiveUsers = users.filter(u => u.isActive === false);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Users</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" onClick={() => openModal()}>
            + Add User
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div className="card-header">
          <h2>Active Users ({activeUsers.length})</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Type</th>
              <th>Tier</th>
              <th>2FA</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeUsers.map(user => (
              <tr key={user.id} style={user.inTraining ? { backgroundColor: '#f3e5f5' } : {}}>
                <td>
                  {user.name}
                  {user.tier && <span className={`tier-badge tier-${user.tier}`}>{user.tier}</span>}
                </td>
                <td>{user.email}</td>
                <td>{getUserType(user)}</td>
                <td>{user.tier || '-'}</td>
                <td>{user.twoFactorEnabled ? '✓' : '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" style={{ padding: '5px 10px' }} onClick={() => openModal(user)}>
                      Edit
                    </button>
                    <Link to={`/users/${user.id}/availability`} className="btn btn-outline" style={{ padding: '5px 10px', textDecoration: 'none' }}>
                      Availability
                    </Link>
                    <button className="btn btn-outline" style={{ padding: '5px 10px' }} onClick={() => openPasswordModal(user)}>
                      Password
                    </button>
                    <button className="btn btn-danger" style={{ padding: '5px 10px' }} onClick={() => handleDelete(user.id)}>
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inactiveUsers.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Inactive Users ({inactiveUsers.length})</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inactiveUsers.map(user => (
                <tr key={user.id} style={{ opacity: 0.6 }}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <button className="btn btn-success" style={{ padding: '5px 10px' }} onClick={async () => {
                      await api.request(`/users/${user.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({ isActive: true })
                      });
                      loadData();
                    }}>
                      Reactivate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit User Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'Add User'}</h2>
              <button className="btn btn-outline" onClick={closeModal} style={{ padding: '5px 10px' }}>×</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>

                {!editingUser && (
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={formData.generatePassword}
                        onChange={e => setFormData(prev => ({ ...prev, generatePassword: e.target.checked }))}
                        style={{ width: 'auto' }}
                      />
                      Generate strong password automatically
                    </label>
                    {!formData.generatePassword && (
                      <input
                        type="text"
                        value={formData.password}
                        onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="Enter password (min 10 chars, special char, number)"
                        style={{ marginTop: 10 }}
                        required={!formData.generatePassword}
                      />
                    )}
                  </div>
                )}

                {generatedPassword && !editingUser && (
                  <div className="alert alert-success" style={{ marginBottom: 15 }}>
                    <strong>Generated Password:</strong>{' '}
                    <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 4 }}>{generatedPassword}</code>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ marginLeft: 10, padding: '2px 8px' }}
                      onClick={() => navigator.clipboard.writeText(generatedPassword)}
                    >
                      Copy
                    </button>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                  <div className="form-group">
                    <label>Tier</label>
                    <select
                      value={formData.tier}
                      onChange={e => setFormData(prev => ({ ...prev, tier: e.target.value }))}
                    >
                      <option value="T1">T1</option>
                      <option value="T2">T2</option>
                      <option value="T3">T3</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>German State</label>
                    <select
                      value={formData.state}
                      onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
                    >
                      <option value="">-- Select State --</option>
                      {states.map(s => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15, marginTop: 15 }}>
                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={formData.isAdmin}
                        onChange={e => setFormData(prev => ({ ...prev, isAdmin: e.target.checked }))}
                        style={{ width: 'auto' }}
                      />
                      Admin (full system access)
                    </label>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={formData.isManager}
                        onChange={e => setFormData(prev => ({ ...prev, isManager: e.target.checked }))}
                        style={{ width: 'auto' }}
                      />
                      Manager (manage schedules)
                    </label>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={formData.isFloater}
                        onChange={e => setFormData(prev => ({ ...prev, isFloater: e.target.checked, inTraining: false }))}
                        style={{ width: 'auto' }}
                      />
                      Floater (max 2.5 shifts/week)
                    </label>
                  </div>

                  <div className="form-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={formData.inTraining}
                        onChange={e => setFormData(prev => ({ ...prev, inTraining: e.target.checked, isFloater: false }))}
                        style={{ width: 'auto' }}
                      />
                      In Training (Mon-Fri only)
                    </label>
                  </div>
                </div>

                {formData.inTraining && (
                  <div className="alert alert-info" style={{ marginTop: 10 }}>
                    Training users are assigned Training shift Mon-Fri and OFF on weekends.
                  </div>
                )}

                <div className="form-group" style={{ marginTop: 15 }}>
                  <label>Shift Preferences</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
                    {WEEKDAY_SHIFTS.map(shift => (
                      <label key={shift} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={formData.preferences.includes(shift)}
                          onChange={() => togglePreference(shift)}
                          style={{ width: 'auto' }}
                        />
                        {shift}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginTop: 10 }}>
                    {WEEKEND_SHIFTS.map(shift => (
                      <label key={shift} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={formData.preferences.includes(shift)}
                          onChange={() => togglePreference(shift)}
                          style={{ width: 'auto' }}
                        />
                        {shift.replace('Weekend', 'WE ')}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Management Modal */}
      {showPasswordModal && selectedUser && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2>Password Management</h2>
              <button className="btn btn-outline" onClick={() => setShowPasswordModal(false)} style={{ padding: '5px 10px' }}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>User:</strong> {selectedUser.name}</p>
              <p><strong>Email:</strong> {selectedUser.email}</p>

              <div style={{ background: '#f5f5f5', padding: 15, borderRadius: 8, marginTop: 15 }}>
                <button className="btn btn-outline" onClick={handleGeneratePassword}>
                  Generate Strong Password
                </button>

                {generatedPassword && (
                  <div style={{ marginTop: 15, background: '#fff', padding: 10, borderRadius: 4, border: '1px solid #ddd' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <code style={{ flex: 1, fontSize: 14 }}>{generatedPassword}</code>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '5px 10px' }}
                        onClick={() => {
                          navigator.clipboard.writeText(generatedPassword);
                          setSuccess('Copied!');
                          setTimeout(() => setSuccess(''), 2000);
                        }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => handleResetPassword(false)}
                  disabled={!generatedPassword}
                >
                  Reset Password
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => handleResetPassword(true)}
                  disabled={!generatedPassword || !selectedUser.email}
                >
                  Reset & Email Password
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline" onClick={() => setShowPasswordModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;
