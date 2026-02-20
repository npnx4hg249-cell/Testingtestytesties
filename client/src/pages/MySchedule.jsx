import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import api from '../services/api';
import { format, subMonths, addMonths } from 'date-fns';

const SHIFT_TIMES = {
  Early: '07:00 - 15:30',
  Morning: '10:00 - 18:30',
  Late: '15:00 - 23:30',
  Night: '23:00 - 07:30'
};

function MySchedule() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('my-shifts'); // 'my-shifts' or 'team'

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  useEffect(() => {
    loadSchedule();
  }, [selectedYear, selectedMonth]);

  const loadSchedule = async () => {
    try {
      setLoading(true);
      setError('');

      const [scheduleData, holidayData] = await Promise.all([
        api.getEngineerViewSchedule(selectedYear, selectedMonth),
        api.getHolidaysForMonth(selectedYear, selectedMonth)
      ]);

      setSchedule(scheduleData);
      setHolidays(holidayData.holidays || []);
    } catch (err) {
      if (err.status === 404) {
        setSchedule(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (delta) => {
    let newMonth = selectedMonth + delta;
    let newYear = selectedYear;

    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    } else if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }

    // Check limits (3 months back for users)
    const limit = subMonths(new Date(), 3);
    const targetDate = new Date(newYear, newMonth - 1, 1);

    if (targetDate < limit) {
      setError('You can only view schedules up to 3 months back.');
      return;
    }

    setError('');
    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
  };

  const isHoliday = (dateStr) => {
    return holidays.find(h => h.date === dateStr);
  };

  const isWeekend = (dayOfWeek) => {
    return dayOfWeek === 'Sat' || dayOfWeek === 'Sun';
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  // Find current user's shifts
  const myShifts = schedule?.myShifts || {};
  const myEngineer = schedule?.engineers?.find(e => e.isCurrentUser);

  // Calculate stats
  const totalWorkShifts = Object.values(myShifts).filter(s => s && s !== 'Off' && s !== 'Unavailable').length;
  const offDays = Object.values(myShifts).filter(s => s === 'Off').length;
  const unavailDays = Object.values(myShifts).filter(s => s === 'Unavailable').length;

  // Group shifts by week for the list view
  const getWeekNumber = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const dayOfMonth = d.getDate();
    return Math.ceil(dayOfMonth / 7);
  };

  return (
    <div>
      <h1>My Schedule</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Month Navigation */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={() => changeMonth(-1)}>
            &larr; Previous
          </button>
          <h2 style={{ margin: 0 }}>
            {months[selectedMonth - 1]} {selectedYear}
          </h2>
          <button className="btn btn-outline" onClick={() => changeMonth(1)}>
            Next &rarr;
          </button>
        </div>
      </div>

      {!schedule ? (
        <div className="card">
          <p style={{ color: '#666', textAlign: 'center', padding: 40 }}>
            No published schedule found for {months[selectedMonth - 1]} {selectedYear}.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          {myEngineer && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="stats-grid">
                <div className="stat-box">
                  <h3>Work Shifts</h3>
                  <div className="value">{totalWorkShifts}</div>
                </div>
                <div className="stat-box">
                  <h3>Off Days</h3>
                  <div className="value">{offDays}</div>
                </div>
                <div className="stat-box">
                  <h3>Unavailable</h3>
                  <div className="value">{unavailDays}</div>
                </div>
              </div>
            </div>
          )}

          {/* View Toggle */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button
              className={`btn ${view === 'my-shifts' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setView('my-shifts')}
            >
              My Shifts
            </button>
            <button
              className={`btn ${view === 'team' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setView('team')}
            >
              Team Schedule
            </button>
          </div>

          {/* My Shifts List View */}
          {view === 'my-shifts' && (
            <div className="card">
              <div className="card-header">
                <h2>My Shifts &mdash; {months[selectedMonth - 1]} {selectedYear}</h2>
              </div>

              {!myEngineer ? (
                <p style={{ color: '#666', padding: 20 }}>
                  Your user account was not found in this schedule. Contact your manager if this is unexpected.
                </p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Date</th>
                      <th style={{ padding: '10px 12px' }}>Day</th>
                      <th style={{ padding: '10px 12px' }}>Shift</th>
                      <th style={{ padding: '10px 12px' }}>Hours</th>
                      <th style={{ padding: '10px 12px' }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.days.map((day, i) => {
                      const shift = myShifts[day.date];
                      const holiday = isHoliday(day.date);
                      const weekend = isWeekend(day.dayOfWeek);
                      const isWorkShift = shift && shift !== 'Off' && shift !== 'Unavailable';
                      const isOff = shift === 'Off';
                      const isUnavail = shift === 'Unavailable';

                      // Week separator
                      const prevDay = schedule.days[i - 1];
                      const showWeekSep = i > 0 && day.dayOfWeek === 'Mon';

                      return (
                        <React.Fragment key={day.date}>
                          {showWeekSep && (
                            <tr>
                              <td colSpan={5} style={{ padding: 0 }}>
                                <div style={{
                                  borderTop: '2px solid #e0e0e0',
                                  margin: '4px 0'
                                }} />
                              </td>
                            </tr>
                          )}
                          <tr style={{
                            borderBottom: '1px solid #f0f0f0',
                            background: isUnavail ? '#f9f9f9' :
                                        isOff ? '#fafafa' :
                                        weekend ? '#f5f8ff' : 'transparent',
                            opacity: isUnavail ? 0.6 : 1
                          }}>
                            <td style={{ padding: '8px 12px', fontVariantNumeric: 'tabular-nums' }}>
                              {day.date}
                            </td>
                            <td style={{
                              padding: '8px 12px',
                              fontWeight: weekend ? 'bold' : 'normal',
                              color: weekend ? '#1565c0' : 'inherit'
                            }}>
                              {day.dayOfWeek}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {shift ? (
                                <span
                                  className={`shift-cell shift-${shift}`}
                                  style={{ padding: '3px 12px', borderRadius: 4, fontSize: 13 }}
                                >
                                  {shift}
                                </span>
                              ) : (
                                <span style={{ color: '#999' }}>&mdash;</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#666', fontSize: 13 }}>
                              {isWorkShift ? SHIFT_TIMES[shift] || '' : ''}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: 12, color: '#888' }}>
                              {holiday && (
                                <span style={{
                                  background: '#fff3e0',
                                  padding: '2px 8px',
                                  borderRadius: 4,
                                  marginRight: 6
                                }}>
                                  {holiday.nameEn}
                                </span>
                              )}
                              {weekend && !holiday && (
                                <span style={{ color: '#aaa' }}>Weekend</span>
                              )}
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Team Schedule Grid View */}
          {view === 'team' && (
            <div className="card">
              <div className="card-header">
                <h2>Team Schedule</h2>
              </div>

              {/* Holiday Legend */}
              {holidays.length > 0 && (
                <div style={{ marginBottom: 15 }}>
                  <strong>Holidays:</strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 5 }}>
                    {holidays.map((h, i) => (
                      <span key={i} style={{ background: '#fff3e0', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                        {format(new Date(h.date), 'MMM d')}: {h.nameEn}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="schedule-grid">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th className="engineer-name">User</th>
                      {schedule.days.map(day => {
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
                    {schedule.engineers.map(eng => (
                      <tr key={eng.id} style={eng.isCurrentUser ? { background: '#e3f2fd' } : {}}>
                        <td className="engineer-name" style={{ backgroundColor: eng.tierColor }}>
                          {eng.name}
                          {eng.isCurrentUser && <strong style={{ marginLeft: 5 }}>(You)</strong>}
                          {eng.isFloater && <span style={{ fontSize: 10, marginLeft: 5 }}>(F)</span>}
                        </td>
                        {eng.shifts.map((shift, i) => {
                          const day = schedule.days[i];
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
              <div><span className="shift-cell shift-Off">O</span> Scheduled Off</div>
              <div><span className="shift-cell shift-Unavailable">U</span> Unavailable</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default MySchedule;
