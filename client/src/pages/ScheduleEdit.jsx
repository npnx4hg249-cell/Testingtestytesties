import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { format } from 'date-fns';

const SHIFTS = ['Early', 'Morning', 'Late', 'Night', 'OFF', 'Unavailable', null];
const SHIFT_LABELS = {
  'Early': 'E',
  'Morning': 'M',
  'Late': 'L',
  'Night': 'N',
  'OFF': 'O',
  'Unavailable': 'U',
  null: '-'
};

function ScheduleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState(null);
  const [exportData, setExportData] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedCell, setSelectedCell] = useState(null);
  const [unsavedChanges, setUnsavedChanges] = useState([]);

  useEffect(() => {
    loadSchedule();
  }, [id]);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const scheduleData = await api.getSchedule(id);
      setSchedule(scheduleData);

      const [year, month] = scheduleData.month.split('-');
      const [exportResult, holidayResult] = await Promise.all([
        api.exportSchedule(id),
        api.getHolidaysForMonth(year, month)
      ]);

      setExportData(exportResult);
      setHolidays(holidayResult.holidays || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleShiftChange = async (engineerId, date, newShift) => {
    setSaving(true);
    setError('');

    try {
      const result = await api.updateScheduleShift(id, engineerId, date, newShift);

      // Update local state
      setSchedule(result.schedule);

      // Reload export data to refresh the grid
      const exportResult = await api.exportSchedule(id);
      setExportData(exportResult);

      setSelectedCell(null);

      if (!result.validation.valid) {
        setError(`Warning: ${result.validation.errors.map(e => e.message).join(', ')}`);
      } else {
        setSuccess('Shift updated');
        setTimeout(() => setSuccess(''), 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isHoliday = (dateStr) => {
    return holidays.find(h => h.date === dateStr);
  };

  const isWeekend = (dayOfWeek) => {
    return dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
  };

  const handleCellClick = (engineerId, date, currentShift) => {
    if (schedule.status === 'published') {
      setError('Cannot edit published schedule. Create a new version first.');
      return;
    }
    setSelectedCell({ engineerId, date, currentShift });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!schedule) {
    return (
      <div>
        <div className="alert alert-error">Schedule not found</div>
        <Link to="/schedules" className="btn btn-outline">Back to Schedules</Link>
      </div>
    );
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const [year, month] = schedule.month.split('-');
  const monthName = months[parseInt(month) - 1];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Link to={`/schedules/${id}`} style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>
            ← Back to Schedule View
          </Link>
          <h1 style={{ marginTop: 10 }}>
            Edit Schedule: {monthName} {year}
            <span
              className={`request-card-badge badge-${schedule.status === 'published' ? 'approved' : schedule.status === 'draft' ? 'pending' : 'rejected'}`}
              style={{ marginLeft: 15, fontSize: 14 }}
            >
              {schedule.status}
            </span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {schedule.status === 'draft' && (
            <button
              className="btn btn-success"
              onClick={async () => {
                if (confirm('Publish this schedule? It will be visible to all engineers.')) {
                  await api.publishSchedule(id);
                  navigate(`/schedules/${id}`);
                }
              }}
            >
              Publish Schedule
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Validation Errors */}
      {schedule.validationErrors?.length > 0 && (
        <div className="card" style={{ marginBottom: 20, background: '#fff3e0' }}>
          <div className="card-header">
            <h2 style={{ color: '#e65100' }}>Validation Issues ({schedule.validationErrors.length})</h2>
          </div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {schedule.validationErrors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Instructions */}
      <div className="card" style={{ marginBottom: 20 }}>
        <p style={{ margin: 0 }}>
          <strong>Click any cell</strong> to change the shift assignment.
          {schedule.status === 'published' && (
            <span style={{ color: '#c62828', marginLeft: 10 }}>
              Note: This schedule is published and cannot be edited.
            </span>
          )}
        </p>
      </div>

      {/* Schedule Grid */}
      <div className="card">
        <div className="schedule-grid">
          {exportData && (
            <table className="schedule-table">
              <thead>
                <tr>
                  <th className="engineer-name">Engineer</th>
                  {exportData.days.map(day => {
                    const holiday = isHoliday(day.date);
                    const weekend = isWeekend(day.dayOfWeek);
                    return (
                      <th
                        key={day.date}
                        className={`${weekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''}`}
                        title={holiday ? holiday.nameEn : day.date}
                      >
                        <div>{day.dayOfWeek}</div>
                        <div>{day.dayNumber}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {exportData.engineers.map(eng => (
                  <tr key={eng.id}>
                    <td className="engineer-name" style={{ backgroundColor: eng.tierColor }}>
                      {eng.name}
                      {eng.isFloater && <span style={{ fontSize: 10, marginLeft: 5 }}>(F)</span>}
                    </td>
                    {eng.shifts.map((shift, i) => {
                      const day = exportData.days[i];
                      const holiday = isHoliday(day.date);
                      const weekend = isWeekend(day.dayOfWeek);
                      const isSelected = selectedCell?.engineerId === eng.id && selectedCell?.date === day.date;

                      return (
                        <td
                          key={day.date}
                          className={`${weekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''}`}
                          onClick={() => handleCellClick(eng.id, day.date, shift.shift)}
                          style={{
                            cursor: schedule.status !== 'published' ? 'pointer' : 'default',
                            border: isSelected ? '2px solid #1976d2' : undefined,
                            background: isSelected ? '#e3f2fd' : undefined
                          }}
                        >
                          {shift.shift && (
                            <span
                              className={`shift-cell shift-${shift.shift}`}
                              title={shift.shift}
                            >
                              {shift.shift === 'Unavailable' ? 'U' : shift.shift[0]}
                            </span>
                          )}
                          {!shift.shift && <span style={{ color: '#ccc' }}>-</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Shift Selector Modal */}
      {selectedCell && (
        <div className="modal-overlay" onClick={() => setSelectedCell(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Select Shift</h2>
              <button className="btn btn-outline" onClick={() => setSelectedCell(null)}>×</button>
            </div>
            <div className="modal-body">
              <p>
                <strong>Date:</strong> {selectedCell.date}<br />
                <strong>Engineer:</strong> {exportData?.engineers.find(e => e.id === selectedCell.engineerId)?.name}<br />
                <strong>Current:</strong> {selectedCell.currentShift || 'None'}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 15 }}>
                {SHIFTS.map(shift => (
                  <button
                    key={shift || 'clear'}
                    className={`btn ${selectedCell.currentShift === shift ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => handleShiftChange(selectedCell.engineerId, selectedCell.date, shift)}
                    disabled={saving}
                    style={{ padding: '15px 10px' }}
                  >
                    {shift ? (
                      <span className={`shift-cell shift-${shift}`} style={{ marginRight: 5 }}>
                        {SHIFT_LABELS[shift]}
                      </span>
                    ) : null}
                    {shift || 'Clear'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shift Legend */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Shift Legend</h2>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          <div><span className="shift-cell shift-Early">E</span> Early (07:00-15:30)</div>
          <div><span className="shift-cell shift-Morning">M</span> Morning (10:00-18:30)</div>
          <div><span className="shift-cell shift-Late">L</span> Late (15:00-23:30)</div>
          <div><span className="shift-cell shift-Night">N</span> Night (23:00-07:30)</div>
          <div><span className="shift-cell shift-OFF">O</span> Scheduled Off</div>
          <div><span className="shift-cell shift-Unavailable">U</span> Unavailable</div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleEdit;
