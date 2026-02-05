import React, { useState, useEffect } from 'react';
import { useAuth } from '../App';
import api from '../services/api';
import { format, subMonths, addMonths } from 'date-fns';

function MySchedule() {
  const { user } = useAuth();
  const [schedule, setSchedule] = useState(null);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

    // Check limits (3 months back for engineers)
    const limit = subMonths(new Date(), 3);
    const targetDate = new Date(newYear, newMonth - 1, 1);

    if (targetDate < limit) {
      setError('You can only view schedules up to 3 months back.');
      return;
    }

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

  return (
    <div>
      <h1>My Schedule</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Month Navigation */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={() => changeMonth(-1)}>
            ← Previous
          </button>
          <h2 style={{ margin: 0 }}>
            {months[selectedMonth - 1]} {selectedYear}
          </h2>
          <button className="btn btn-outline" onClick={() => changeMonth(1)}>
            Next →
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
          {/* My Shifts Summary */}
          {myEngineer && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <h2>My Shifts This Month</h2>
              </div>
              <div className="stats-grid">
                <div className="stat-box">
                  <h3>Total Shifts</h3>
                  <div className="value">
                    {Object.values(myShifts).filter(s => s && s !== 'OFF' && s !== 'Unavailable').length}
                  </div>
                </div>
                <div className="stat-box">
                  <h3>OFF Days</h3>
                  <div className="value">
                    {Object.values(myShifts).filter(s => s === 'OFF').length}
                  </div>
                </div>
                <div className="stat-box">
                  <h3>Unavailable</h3>
                  <div className="value">
                    {Object.values(myShifts).filter(s => s === 'Unavailable').length}
                  </div>
                </div>
              </div>

              {/* My shifts list */}
              <div style={{ marginTop: 20 }}>
                <h4>Upcoming Shifts</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
                  {schedule.days
                    .filter(d => myShifts[d.date] && myShifts[d.date] !== 'OFF' && myShifts[d.date] !== 'Unavailable')
                    .slice(0, 14)
                    .map(d => (
                      <div
                        key={d.date}
                        style={{
                          padding: 10,
                          borderRadius: 4,
                          background: '#f5f5f5',
                          border: '1px solid #ddd'
                        }}
                      >
                        <div style={{ fontWeight: 'bold' }}>{d.dayOfWeek}, {d.dayNumber}</div>
                        <span className={`shift-cell shift-${myShifts[d.date]}`}>
                          {myShifts[d.date]}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Full Schedule Grid */}
          <div className="card">
            <div className="card-header">
              <h2>Full Team Schedule</h2>
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
                    <th className="engineer-name">Engineer</th>
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
        </>
      )}
    </div>
  );
}

export default MySchedule;
