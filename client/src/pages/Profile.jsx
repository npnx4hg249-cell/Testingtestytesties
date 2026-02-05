import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../App';
import { format } from 'date-fns';

function Profile() {
  const { user } = useAuth();
  const [engineer, setEngineer] = useState(null);
  const [states, setStates] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [preferences, setPreferences] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const stateList = await api.getStates();
      setStates(stateList);

      if (user.engineerId) {
        const engineerData = await api.getEngineer(user.engineerId);
        setEngineer(engineerData);
        setPreferences(engineerData.preferences || []);

        if (engineerData.state) {
          const holidayData = await api.getEngineerHolidays(user.engineerId, new Date().getFullYear());
          setHolidays(holidayData.holidays || []);
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
      await api.updateEngineerPreferences(user.engineerId, preferences);
      setSuccess('Preferences saved successfully!');
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
                <td>{user.name}</td>
              </tr>
              <tr>
                <td><strong>Email</strong></td>
                <td>{user.email}</td>
              </tr>
              <tr>
                <td><strong>Role</strong></td>
                <td>{user.role}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Engineer Info */}
        {engineer && (
          <div className="card">
            <div className="card-header">
              <h2>Engineer Details</h2>
            </div>
            <table className="data-table">
              <tbody>
                <tr>
                  <td><strong>Tier</strong></td>
                  <td>
                    <span className={`tier-badge tier-${engineer.tier}`}>{engineer.tier}</span>
                  </td>
                </tr>
                <tr>
                  <td><strong>Type</strong></td>
                  <td>{engineer.isFloater ? 'Floater' : 'Core Engineer'}</td>
                </tr>
                <tr>
                  <td><strong>State</strong></td>
                  <td>
                    {engineer.state
                      ? states.find(s => s.code === engineer.state)?.name || engineer.state
                      : 'Not set'
                    }
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shift Preferences */}
      {engineer && (
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
      {engineer && engineer.state && holidays.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Your Holidays ({new Date().getFullYear()})</h2>
          </div>
          <p style={{ marginBottom: 15, color: '#666' }}>
            Based on your location in {states.find(s => s.code === engineer.state)?.name || engineer.state},
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

      {/* No engineer linked */}
      {!engineer && (
        <div className="alert alert-warning" style={{ marginTop: 20 }}>
          <strong>Note:</strong> Your account is not linked to an engineer profile.
          Please contact your administrator to link your account.
        </div>
      )}
    </div>
  );
}

export default Profile;
