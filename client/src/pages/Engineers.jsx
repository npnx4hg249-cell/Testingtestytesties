import React, { useState, useEffect } from 'react';
import api from '../services/api';

function Engineers() {
  const [engineers, setEngineers] = useState([]);
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingEngineer, setEditingEngineer] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    tier: 'T2',
    isFloater: false,
    state: '',
    preferences: ['Early', 'Morning', 'Late', 'Night']
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [engineerList, stateList] = await Promise.all([
        api.getEngineers(),
        api.getStates()
      ]);
      setEngineers(engineerList);
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
      if (editingEngineer) {
        await api.updateEngineer(editingEngineer.id, formData);
      } else {
        await api.createEngineer(formData);
      }
      await loadData();
      closeModal();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to deactivate this engineer?')) return;

    try {
      await api.deleteEngineer(id);
      await loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openModal = (engineer = null) => {
    if (engineer) {
      setEditingEngineer(engineer);
      setFormData({
        name: engineer.name,
        email: engineer.email,
        tier: engineer.tier,
        isFloater: engineer.isFloater,
        state: engineer.state || '',
        preferences: engineer.preferences || ['Early', 'Morning', 'Late', 'Night']
      });
    } else {
      setEditingEngineer(null);
      setFormData({
        name: '',
        email: '',
        tier: 'T2',
        isFloater: false,
        state: '',
        preferences: ['Early', 'Morning', 'Late', 'Night']
      });
    }
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEngineer(null);
    setFormData({
      name: '',
      email: '',
      tier: 'T2',
      isFloater: false,
      state: '',
      preferences: ['Early', 'Morning', 'Late', 'Night']
    });
  };

  const togglePreference = (shift) => {
    setFormData(prev => ({
      ...prev,
      preferences: prev.preferences.includes(shift)
        ? prev.preferences.filter(p => p !== shift)
        : [...prev.preferences, shift]
    }));
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const activeEngineers = engineers.filter(e => e.isActive);
  const inactiveEngineers = engineers.filter(e => !e.isActive);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1>Engineers</h1>
        <button className="btn btn-primary" onClick={() => openModal()}>
          + Add Engineer
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h2>Active Engineers ({activeEngineers.length})</h2>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Tier</th>
              <th>Type</th>
              <th>State</th>
              <th>Preferences</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeEngineers.map(eng => (
              <tr key={eng.id}>
                <td>
                  {eng.name}
                  <span className={`tier-badge tier-${eng.tier}`}>{eng.tier}</span>
                </td>
                <td>{eng.email}</td>
                <td>{eng.tier}</td>
                <td>{eng.isFloater ? 'Floater' : 'Core'}</td>
                <td>{eng.state ? states.find(s => s.code === eng.state)?.name || eng.state : '-'}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {eng.preferences?.map(p => (
                      <span key={p} className={`shift-cell shift-${p}`}>{p[0]}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <button className="btn btn-outline" style={{ marginRight: 5, padding: '5px 10px' }} onClick={() => openModal(eng)}>
                    Edit
                  </button>
                  <button className="btn btn-danger" style={{ padding: '5px 10px' }} onClick={() => handleDelete(eng.id)}>
                    Deactivate
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inactiveEngineers.length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Inactive Engineers ({inactiveEngineers.length})</h2>
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
              {inactiveEngineers.map(eng => (
                <tr key={eng.id} style={{ opacity: 0.6 }}>
                  <td>{eng.name}</td>
                  <td>{eng.email}</td>
                  <td>
                    <button className="btn btn-success" style={{ padding: '5px 10px' }} onClick={async () => {
                      await api.updateEngineer(eng.id, { isActive: true });
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingEngineer ? 'Edit Engineer' : 'Add Engineer'}</h2>
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

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={formData.isFloater}
                      onChange={e => setFormData(prev => ({ ...prev, isFloater: e.target.checked }))}
                      style={{ width: 'auto' }}
                    />
                    Floater (max 2.5 shifts/week, flexible scheduling)
                  </label>
                </div>

                <div className="form-group">
                  <label>Shift Preferences (allowed shifts)</label>
                  <div className="preferences-grid">
                    {['Early', 'Morning', 'Late', 'Night'].map(shift => (
                      <label key={shift} className="preference-item">
                        <input
                          type="checkbox"
                          checked={formData.preferences.includes(shift)}
                          onChange={() => togglePreference(shift)}
                          style={{ width: 'auto' }}
                        />
                        <span className={`shift-cell shift-${shift}`}>{shift}</span>
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
                  {editingEngineer ? 'Save Changes' : 'Add Engineer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Engineers;
