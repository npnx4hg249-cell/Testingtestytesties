import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, parseISO } from 'date-fns';

function EngineerUnavailability() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [unavailableDates, setUnavailableDates] = useState([]);
  const [selectedDates, setSelectedDates] = useState(new Set());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [unavailableType, setUnavailableType] = useState('vacation');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [userData, datesData] = await Promise.all([
        api.getUser(id),
        api.getUserUnavailableDates(id)
      ]);
      setUser(userData);
      setUnavailableDates(datesData.unavailableDates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDate = (dateStr) => {
    setSelectedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateStr)) {
        newSet.delete(dateStr);
      } else {
        newSet.add(dateStr);
      }
      return newSet;
    });
  };

  const selectWeek = (weekDates) => {
    setSelectedDates(prev => {
      const newSet = new Set(prev);
      weekDates.forEach(d => {
        const dateStr = format(d, 'yyyy-MM-dd');
        if (!isUnavailable(dateStr)) {
          newSet.add(dateStr);
        }
      });
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedDates(new Set());
  };

  const isUnavailable = (dateStr) => {
    return unavailableDates.some(d => d.date === dateStr);
  };

  const getUnavailableInfo = (dateStr) => {
    return unavailableDates.find(d => d.date === dateStr);
  };

  const handleSaveUnavailable = async () => {
    if (selectedDates.size === 0) return;

    setSaving(true);
    setError('');
    try {
      const dates = [...selectedDates].map(date => ({
        date,
        type: unavailableType,
        notes: ''
      }));

      await api.addUserUnavailableDates(id, dates);
      setSuccess(`Added ${dates.length} unavailable date(s)`);
      setSelectedDates(new Set());
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveDates = async (datesToRemove) => {
    if (!confirm(`Remove ${datesToRemove.length} unavailable date(s)?`)) return;

    setSaving(true);
    setError('');
    try {
      await api.removeUserUnavailableDates(id, datesToRemove);
      setSuccess(`Removed ${datesToRemove.length} date(s)`);
      await loadData();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Add padding for days before month starts
    const startDay = getDay(monthStart);
    const paddingDays = startDay === 0 ? 6 : startDay - 1; // Monday = 0 padding

    const weeks = [];
    let currentWeek = [];

    // Add padding
    for (let i = 0; i < paddingDays; i++) {
      currentWeek.push(null);
    }

    // Add actual days
    days.forEach(day => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    // Finish last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return (
      <div className="calendar-grid">
        <div className="calendar-header" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
            <div key={d} style={{ textAlign: 'center', padding: 8, fontWeight: 'bold', background: '#f5f5f5' }}>
              {d}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {week.map((day, dayIndex) => {
              if (!day) {
                return <div key={dayIndex} style={{ padding: 10, background: '#fafafa' }}></div>;
              }

              const dateStr = format(day, 'yyyy-MM-dd');
              const isSelected = selectedDates.has(dateStr);
              const unavailInfo = getUnavailableInfo(dateStr);
              const isWeekendDay = dayIndex >= 5;

              let bgColor = isWeekendDay ? '#f0f0f0' : '#fff';
              let textColor = '#000';

              if (unavailInfo) {
                bgColor = unavailInfo.type === 'sick' ? '#ffcdd2' :
                          unavailInfo.type === 'vacation' ? '#c8e6c9' :
                          unavailInfo.type === 'personal' ? '#b3e5fc' : '#e0e0e0';
              } else if (isSelected) {
                bgColor = '#bbdefb';
              }

              return (
                <div
                  key={dayIndex}
                  onClick={() => !unavailInfo && toggleDate(dateStr)}
                  style={{
                    padding: 10,
                    background: bgColor,
                    color: textColor,
                    cursor: unavailInfo ? 'default' : 'pointer',
                    border: isSelected ? '2px solid #1976d2' : '1px solid #ddd',
                    borderRadius: 4,
                    textAlign: 'center',
                    minHeight: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}
                  title={unavailInfo ? `${unavailInfo.type}: ${unavailInfo.notes || 'No notes'}` : 'Click to select'}
                >
                  <div style={{ fontWeight: 'bold' }}>{format(day, 'd')}</div>
                  {unavailInfo && (
                    <div style={{ fontSize: 10, marginTop: 2 }}>
                      {unavailInfo.type === 'sick' ? 'S' :
                       unavailInfo.type === 'vacation' ? 'V' :
                       unavailInfo.type === 'personal' ? 'P' : 'U'}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              className="btn btn-outline"
              style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => selectWeek(week.filter(d => d && !isUnavailable(format(d, 'yyyy-MM-dd'))))}
            >
              +Week
            </button>
          </div>
        ))}
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

  if (!user) {
    return <div className="alert alert-error">User not found</div>;
  }

  return (
    <div>
      <Link to="/users" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>
        ← Back to Users
      </Link>
      <h1 style={{ marginTop: 10 }}>Unavailability Calendar: {user.name}</h1>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Calendar Navigation */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <button className="btn btn-outline" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            ← Previous
          </button>
          <h2 style={{ margin: 0 }}>{format(currentMonth, 'MMMM yyyy')}</h2>
          <button className="btn btn-outline" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            Next →
          </button>
        </div>

        {renderCalendar()}

        {/* Selection Actions */}
        <div style={{ marginTop: 20, padding: 15, background: '#f5f5f5', borderRadius: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
            <span><strong>{selectedDates.size}</strong> date(s) selected</span>

            <select
              value={unavailableType}
              onChange={e => setUnavailableType(e.target.value)}
              style={{ padding: '6px 12px' }}
            >
              <option value="vacation">Vacation</option>
              <option value="sick">Sick Leave</option>
              <option value="personal">Personal</option>
              <option value="predetermined_off">Predetermined Off</option>
            </select>

            <button
              className="btn btn-primary"
              onClick={handleSaveUnavailable}
              disabled={selectedDates.size === 0 || saving}
            >
              {saving ? 'Saving...' : 'Mark as Unavailable'}
            </button>

            <button
              className="btn btn-outline"
              onClick={clearSelection}
              disabled={selectedDates.size === 0}
            >
              Clear Selection
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Legend</h2>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, background: '#c8e6c9', border: '1px solid #ddd' }}></div>
            <span>Vacation (V)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, background: '#ffcdd2', border: '1px solid #ddd' }}></div>
            <span>Sick Leave (S)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, background: '#b3e5fc', border: '1px solid #ddd' }}></div>
            <span>Personal (P)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, background: '#e0e0e0', border: '1px solid #ddd' }}></div>
            <span>Unavailable (U)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 20, height: 20, background: '#bbdefb', border: '2px solid #1976d2' }}></div>
            <span>Selected</span>
          </div>
        </div>
      </div>

      {/* Existing Unavailable Dates */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Scheduled Unavailable Dates</h2>
        </div>
        {unavailableDates.length === 0 ? (
          <p style={{ color: '#666' }}>No unavailable dates scheduled.</p>
        ) : (
          <div>
            <p style={{ marginBottom: 15, color: '#666' }}>
              Total: {unavailableDates.length} date(s)
            </p>
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Source</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unavailableDates.sort((a, b) => a.date.localeCompare(b.date)).map(item => (
                    <tr key={item.date}>
                      <td>{format(parseISO(item.date), 'EEE, MMM d, yyyy')}</td>
                      <td>
                        <span className={`request-card-badge badge-${
                          item.type === 'vacation' ? 'approved' :
                          item.type === 'sick' ? 'rejected' : 'pending'
                        }`}>
                          {item.type}
                        </span>
                      </td>
                      <td>{item.source || 'manual'}</td>
                      <td>
                        <button
                          className="btn btn-danger"
                          style={{ padding: '4px 8px', fontSize: 12 }}
                          onClick={() => handleRemoveDates([item.date])}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Future Integration Note */}
      <div className="card" style={{ marginTop: 20, background: '#fff3e0' }}>
        <div className="card-header">
          <h2>WFM Integration (Future)</h2>
        </div>
        <p style={{ color: '#666' }}>
          This calendar is designed to support future integration with workforce management systems like SAP.
          When integrated, unavailable dates will sync automatically via API.
        </p>
        <p style={{ marginTop: 10, fontSize: 13 }}>
          <strong>Last WFM Sync:</strong> {user.lastWFMSync || 'Never'}<br />
          <strong>WFM Enabled:</strong> {user.wfmEnabled ? 'Yes' : 'No'}
        </p>
      </div>
    </div>
  );
}

export default EngineerUnavailability;
