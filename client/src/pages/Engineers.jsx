import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

// Shift definitions
const WEEKDAY_SHIFTS = ['Early', 'Morning', 'Late', 'Night'];
const WEEKEND_SHIFTS = ['WeekendEarly', 'WeekendMorning', 'WeekendLate', 'WeekendNight'];
const ALL_SHIFTS = [...WEEKDAY_SHIFTS, ...WEEKEND_SHIFTS];

// Default preferences (all shifts)
const DEFAULT_PREFERENCES = [...ALL_SHIFTS];

function Engineers() {
  const [engineers, setEngineers] = useState([]);
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [editingEngineer, setEditingEngineer] = useState(null);
  const [csvData, setCsvData] = useState('');
  const [csvResults, setCsvResults] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    tier: 'T2',
    isFloater: false,
    state: '',
    preferences: DEFAULT_PREFERENCES
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
        setSuccess('Engineer updated successfully');
      } else {
        await api.createEngineer(formData);
        setSuccess('Engineer created successfully');
      }
      await loadData();
      closeModal();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to deactivate this engineer?')) return;

    try {
      await api.deleteEngineer(id);
      await loadData();
      setSuccess('Engineer deactivated');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDuplicate = async (engineer) => {
    try {
      const response = await api.request(`/engineers/${engineer.id}/duplicate`, {
        method: 'POST'
      });
      await loadData();
      setSuccess(`Duplicated "${engineer.name}" - please update the copy's details`);
      setTimeout(() => setSuccess(''), 5000);
      // Open the edit modal for the new engineer
      openModal(response);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCsvUpload = async () => {
    setError('');
    setCsvResults(null);

    try {
      const response = await api.request('/engineers/bulk-upload', {
        method: 'POST',
        body: JSON.stringify({ csvData })
      });
      setCsvResults(response);
      if (response.created > 0) {
        await loadData();
      }
    } catch (err) {
      setError(err.data?.error || err.message);
    }
  };

  const downloadTemplate = () => {
    const template = `name,email,tier,isFloater,state,preferences
"John Doe",john.doe@example.com,T2,false,BY,"Early,Morning,Late,Night,WeekendEarly,WeekendMorning,WeekendLate,WeekendNight"
"Jane Smith",jane.smith@example.com,T1,false,NW,"Early,Morning,WeekendMorning"
"Bob Wilson",bob.wilson@example.com,T3,true,BE,"Late,Night,WeekendLate,WeekendNight"`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'engineers-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = async () => {
    try {
      const blob = await api.exportEngineersCSV();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'engineers-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExportExcel = async () => {
    try {
      const blob = await api.exportEngineersExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'engineers-export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleExcelUpload = async (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      try {
        const response = await api.bulkUploadEngineersExcel(base64);
        setCsvResults(response);
        if (response.created > 0) {
          await loadData();
        }
      } catch (err) {
        setError(err.data?.error || err.message);
      }
    };
    reader.readAsDataURL(file);
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
        preferences: engineer.preferences || DEFAULT_PREFERENCES
      });
    } else {
      setEditingEngineer(null);
      setFormData({
        name: '',
        email: '',
        tier: 'T2',
        isFloater: false,
        state: '',
        preferences: DEFAULT_PREFERENCES
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
      preferences: DEFAULT_PREFERENCES
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

  const selectAllWeekday = () => {
    setFormData(prev => ({
      ...prev,
      preferences: [...new Set([...prev.preferences, ...WEEKDAY_SHIFTS])]
    }));
  };

  const selectAllWeekend = () => {
    setFormData(prev => ({
      ...prev,
      preferences: [...new Set([...prev.preferences, ...WEEKEND_SHIFTS])]
    }));
  };

  const clearWeekday = () => {
    setFormData(prev => ({
      ...prev,
      preferences: prev.preferences.filter(p => !WEEKDAY_SHIFTS.includes(p))
    }));
  };

  const clearWeekend = () => {
    setFormData(prev => ({
      ...prev,
      preferences: prev.preferences.filter(p => !WEEKEND_SHIFTS.includes(p))
    }));
  };

  const formatPreferences = (prefs) => {
    if (!prefs || prefs.length === 0) return '-';
    const weekday = prefs.filter(p => WEEKDAY_SHIFTS.includes(p));
    const weekend = prefs.filter(p => WEEKEND_SHIFTS.includes(p));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {weekday.length > 0 && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#666', width: 20 }}>WD:</span>
            {weekday.map(p => (
              <span key={p} className={`shift-cell shift-${p}`} style={{ fontSize: 10 }}>{p[0]}</span>
            ))}
          </div>
        )}
        {weekend.length > 0 && (
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#666', width: 20 }}>WE:</span>
            {weekend.map(p => (
              <span key={p} className={`shift-cell shift-${p.replace('Weekend', '')}`} style={{ fontSize: 10 }}>{p.replace('Weekend', '')[0]}</span>
            ))}
          </div>
        )}
      </div>
    );
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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={handleExportCSV}>
            Export CSV
          </button>
          <button className="btn btn-outline" onClick={handleExportExcel}>
            Export Excel
          </button>
          <button className="btn btn-outline" onClick={() => setShowCsvModal(true)}>
            Import
          </button>
          <button className="btn btn-primary" onClick={() => openModal()}>
            + Add Engineer
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

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
                <td>{formatPreferences(eng.preferences)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" style={{ padding: '5px 10px' }} onClick={() => openModal(eng)} title="Edit">
                      Edit
                    </button>
                    <Link to={`/engineers/${eng.id}/unavailability`} className="btn btn-outline" style={{ padding: '5px 10px', textDecoration: 'none' }} title="Calendar">
                      Calendar
                    </Link>
                    <button className="btn btn-outline" style={{ padding: '5px 10px' }} onClick={() => handleDuplicate(eng)} title="Duplicate">
                      Copy
                    </button>
                    <button className="btn btn-danger" style={{ padding: '5px 10px' }} onClick={() => handleDelete(eng.id)} title="Deactivate">
                      ✕
                    </button>
                  </div>
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

      {/* Add/Edit Engineer Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
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

                {/* Weekday Preferences */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ margin: 0 }}>Weekday Shift Preferences</label>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button type="button" className="btn btn-outline" style={{ padding: '2px 8px', fontSize: 12 }} onClick={selectAllWeekday}>
                        Select All
                      </button>
                      <button type="button" className="btn btn-outline" style={{ padding: '2px 8px', fontSize: 12 }} onClick={clearWeekday}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="preferences-grid">
                    {WEEKDAY_SHIFTS.map(shift => (
                      <label key={shift} className="preference-item">
                        <input
                          type="checkbox"
                          checked={formData.preferences.includes(shift)}
                          onChange={() => togglePreference(shift)}
                          style={{ width: 'auto' }}
                        />
                        <span className={`shift-cell shift-${shift}`}>{shift}</span>
                        <span style={{ fontSize: 11, color: '#666', marginLeft: 'auto' }}>
                          {shift === 'Early' && '07:00-15:30'}
                          {shift === 'Morning' && '10:00-18:30'}
                          {shift === 'Late' && '15:00-23:30'}
                          {shift === 'Night' && '23:00-07:30'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Weekend Preferences */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ margin: 0 }}>Weekend Shift Preferences</label>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button type="button" className="btn btn-outline" style={{ padding: '2px 8px', fontSize: 12 }} onClick={selectAllWeekend}>
                        Select All
                      </button>
                      <button type="button" className="btn btn-outline" style={{ padding: '2px 8px', fontSize: 12 }} onClick={clearWeekend}>
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="preferences-grid">
                    {WEEKEND_SHIFTS.map(shift => (
                      <label key={shift} className="preference-item">
                        <input
                          type="checkbox"
                          checked={formData.preferences.includes(shift)}
                          onChange={() => togglePreference(shift)}
                          style={{ width: 'auto' }}
                        />
                        <span className={`shift-cell shift-${shift.replace('Weekend', '')}`}>{shift.replace('Weekend', '')}</span>
                        <span style={{ fontSize: 11, color: '#666', marginLeft: 'auto' }}>
                          {shift === 'WeekendEarly' && '07:00-15:30'}
                          {shift === 'WeekendMorning' && '10:00-18:30'}
                          {shift === 'WeekendLate' && '15:00-22:30'}
                          {shift === 'WeekendNight' && '23:00-07:30'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p style={{ fontSize: 12, color: '#666', marginTop: 10 }}>
                    Leave weekend shifts unchecked if engineer cannot work weekends.
                  </p>
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

      {/* Import Modal (CSV/Excel) */}
      {showCsvModal && (
        <div className="modal-overlay" onClick={() => { setShowCsvModal(false); setCsvResults(null); setCsvData(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700 }}>
            <div className="modal-header">
              <h2>Import Engineers (CSV/Excel)</h2>
              <button className="btn btn-outline" onClick={() => { setShowCsvModal(false); setCsvResults(null); setCsvData(''); }} style={{ padding: '5px 10px' }}>×</button>
            </div>
            <div className="modal-body">
              {!csvResults ? (
                <>
                  <div className="alert alert-info" style={{ marginBottom: 15 }}>
                    <strong>Format:</strong> name, email, tier, isFloater, state, preferences
                    <br />
                    <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ padding: '5px 15px' }}
                        onClick={downloadTemplate}
                      >
                        CSV Template
                      </button>
                      <a
                        href="/api/engineers/excel-template"
                        className="btn btn-outline"
                        style={{ padding: '5px 15px', textDecoration: 'none' }}
                      >
                        Excel Template
                      </a>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Upload Excel File (.xlsx)</label>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={e => {
                        const file = e.target.files[0];
                        if (file) {
                          handleExcelUpload(file);
                        }
                      }}
                    />
                  </div>

                  <div style={{ borderTop: '1px solid #ddd', paddingTop: 15, marginTop: 15 }}>
                    <p style={{ color: '#666', marginBottom: 10 }}>Or import via CSV:</p>
                    <div className="form-group">
                      <label>Paste CSV Data</label>
                      <textarea
                        value={csvData}
                        onChange={e => setCsvData(e.target.value)}
                        rows={8}
                        placeholder={`name,email,tier,isFloater,state,preferences
"John Doe",john@example.com,T2,false,BY,"Early,Morning,Late,Night"
"Jane Smith",jane@example.com,T1,false,NW,"Early,Morning,WeekendMorning"`}
                        style={{ fontFamily: 'monospace', fontSize: 12 }}
                      />
                    </div>

                    <div className="form-group">
                      <label>Or Upload CSV File</label>
                      <input
                        type="file"
                        accept=".csv"
                        onChange={e => {
                          const file = e.target.files[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setCsvData(event.target.result);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ background: '#f5f5f5', padding: 15, borderRadius: 4, fontSize: 13, marginTop: 15 }}>
                    <strong>Valid Preferences:</strong>
                    <br />
                    <em>Weekday:</em> Early, Morning, Late, Night
                    <br />
                    <em>Weekend:</em> WeekendEarly, WeekendMorning, WeekendLate, WeekendNight
                    <br /><br />
                    <strong>Valid Tiers:</strong> T1, T2, T3
                    <br />
                    <strong>isFloater:</strong> true or false
                  </div>
                </>
              ) : (
                <div>
                  <div className={`alert ${csvResults.failed > 0 ? 'alert-warning' : 'alert-success'}`}>
                    <strong>{csvResults.message}</strong>
                  </div>

                  {csvResults.results.success.length > 0 && (
                    <div style={{ marginTop: 15 }}>
                      <h4>Created ({csvResults.results.success.length})</h4>
                      <ul style={{ fontSize: 13 }}>
                        {csvResults.results.success.map((s, i) => (
                          <li key={i}>Row {s.row}: {s.engineer.name} ({s.engineer.email})</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {csvResults.results.errors.length > 0 && (
                    <div style={{ marginTop: 15 }}>
                      <h4 style={{ color: '#c62828' }}>Errors ({csvResults.results.errors.length})</h4>
                      <ul style={{ fontSize: 13, color: '#c62828' }}>
                        {csvResults.results.errors.map((e, i) => (
                          <li key={i}>Row {e.row}: {e.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              {!csvResults ? (
                <>
                  <button type="button" className="btn btn-outline" onClick={() => { setShowCsvModal(false); setCsvData(''); }}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCsvUpload}
                    disabled={!csvData.trim()}
                  >
                    Upload
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => { setShowCsvModal(false); setCsvResults(null); setCsvData(''); }}>
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Engineers;
