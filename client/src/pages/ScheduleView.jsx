import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import { format } from 'date-fns';

function ScheduleView() {
  const { id } = useParams();
  const [schedule, setSchedule] = useState(null);
  const [exportData, setExportData] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const isHoliday = (dateStr) => {
    return holidays.find(h => h.date === dateStr);
  };

  const isWeekend = (dayOfWeek) => {
    return dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="alert alert-error">{error}</div>
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
          <Link to="/schedules" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>
            ← Back to Schedules
          </Link>
          <h1 style={{ marginTop: 10 }}>
            {monthName} {year} Schedule
            <span
              className={`request-card-badge badge-${schedule.status === 'published' ? 'approved' : 'pending'}`}
              style={{ marginLeft: 15, fontSize: 14 }}
            >
              {schedule.status}
            </span>
          </h1>
        </div>
        {schedule.status === 'draft' && (
          <button
            className="btn btn-success"
            onClick={async () => {
              await api.publishSchedule(id);
              loadSchedule();
            }}
          >
            Publish Schedule
          </button>
        )}
      </div>

      {/* Stats */}
      {exportData?.stats && (
        <div className="stats-grid" style={{ marginBottom: 20 }}>
          <div className="stat-box">
            <h3>Total Engineers</h3>
            <div className="value">{exportData.engineers?.length || 0}</div>
          </div>
          <div className="stat-box">
            <h3>Days in Month</h3>
            <div className="value">{exportData.days?.length || 0}</div>
          </div>
        </div>
      )}

      {/* Holiday Legend */}
      {holidays.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <h2>Holidays This Month</h2>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {holidays.map((h, i) => (
              <div key={i} style={{ background: '#fff3e0', padding: '5px 12px', borderRadius: 4 }}>
                <strong>{format(new Date(h.date), 'MMM d')}</strong>: {h.nameEn}
                {h.type === 'state' && (
                  <span style={{ fontSize: 11, marginLeft: 5, color: '#888' }}>
                    ({h.states?.join(', ')})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Schedule Grid */}
      <div className="card">
        <div className="card-header">
          <h2>Schedule Grid</h2>
        </div>
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
                      return (
                        <td
                          key={day.date}
                          className={`${weekend ? 'weekend' : ''} ${holiday ? 'holiday' : ''}`}
                        >
                          {shift.shift && (
                            <span
                              className={`shift-cell shift-${shift.shift}`}
                              title={shift.shift}
                            >
                              {shift.shift === 'Unavailable' ? 'U' : shift.shift[0]}
                            </span>
                          )}
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

      {/* Coverage Summary */}
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
          <div><span className="shift-cell shift-Unavailable">U</span> Unavailable/Vacation</div>
        </div>
      </div>

      {/* Engineer Stats */}
      {exportData?.stats?.engineerStats && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-header">
            <h2>Engineer Statistics</h2>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Engineer</th>
                <th>Total Shifts</th>
                <th>Early</th>
                <th>Morning</th>
                <th>Late</th>
                <th>Night</th>
                <th>OFF Days</th>
                <th>Unavailable</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(exportData.stats.engineerStats).map(stat => (
                <tr key={stat.name}>
                  <td><strong>{stat.name}</strong></td>
                  <td>{stat.totalShifts}</td>
                  <td>{stat.shiftBreakdown?.Early || 0}</td>
                  <td>{stat.shiftBreakdown?.Morning || 0}</td>
                  <td>{stat.shiftBreakdown?.Late || 0}</td>
                  <td>{stat.shiftBreakdown?.Night || 0}</td>
                  <td>{stat.offDays}</td>
                  <td>{stat.unavailableDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ScheduleView;
