import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { format } from 'date-fns';

function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [generationResult, setGenerationResult] = useState(null);
  const navigate = useNavigate();

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const data = await api.getSchedules();
      setSchedules(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setGenerationResult(null);

    try {
      const result = await api.generateSchedule(selectedYear, selectedMonth);
      if (result.success) {
        setGenerationResult({
          type: 'success',
          message: 'Schedule generated successfully!',
          schedule: result.schedule,
          warnings: result.warnings
        });
        await loadSchedules();
      }
    } catch (err) {
      if (err.data && err.data.options) {
        setGenerationResult({
          type: 'failure',
          errors: err.data.errors,
          options: err.data.options,
          message: err.data.message
        });
      } else {
        setError(err.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyOption = async (optionId) => {
    if (optionId === 'manual_edit') {
      // Navigate to manual editor with partial schedule
      navigate(`/schedules/new?manual=true&year=${selectedYear}&month=${selectedMonth}`);
      return;
    }

    setGenerating(true);
    setError('');

    try {
      const result = await api.generateWithOption(selectedYear, selectedMonth, optionId);
      if (result.success) {
        setGenerationResult({
          type: 'success',
          message: `Schedule generated with "${optionId}" option applied!`,
          schedule: result.schedule,
          warnings: result.warnings
        });
        await loadSchedules();
      }
    } catch (err) {
      setError(err.message || 'Failed to generate with option');
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async (id) => {
    if (!confirm('Are you sure you want to publish this schedule? This will make it visible to all engineers.')) return;

    try {
      await api.publishSchedule(id);
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
      </div>
    );
  }

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Schedules</h1>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Generation Card */}
      <div className="card">
        <div className="card-header">
          <h2>Generate New Schedule</h2>
        </div>

        <div style={{ display: 'flex', gap: 15, alignItems: 'flex-end', marginBottom: 20 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Year</label>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label>Month</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
              {months.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating...' : 'Generate Schedule'}
          </button>
        </div>

        {/* Generation Result */}
        {generationResult && (
          <div>
            {generationResult.type === 'success' && (
              <div className="alert alert-success">
                <strong>{generationResult.message}</strong>
                {generationResult.warnings?.length > 0 && (
                  <ul style={{ marginTop: 10, marginBottom: 0 }}>
                    {generationResult.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <div style={{ marginTop: 15 }}>
                  <Link to={`/schedules/${generationResult.schedule.id}`} className="btn btn-primary">
                    View Schedule
                  </Link>
                </div>
              </div>
            )}

            {generationResult.type === 'failure' && (
              <div>
                <div className="alert alert-error">
                  <strong>Schedule generation failed</strong>
                  <p>{generationResult.message}</p>
                  <details style={{ marginTop: 10 }}>
                    <summary>View Errors ({generationResult.errors?.length || 0})</summary>
                    <ul style={{ marginTop: 10 }}>
                      {generationResult.errors?.map((e, i) => (
                        <li key={i}>{e.message}</li>
                      ))}
                    </ul>
                  </details>
                </div>

                <h3 style={{ marginTop: 20, marginBottom: 15 }}>Recovery Options</h3>
                <p style={{ marginBottom: 15, color: '#666' }}>
                  Choose one of the following options to resolve the scheduling conflict:
                </p>

                {generationResult.partialSchedule && (
                  <div style={{ marginBottom: 20 }}>
                    <p>A partial schedule has been saved for review and manual editing:</p>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                      <Link
                        to={`/schedules/${generationResult.partialSchedule.id}`}
                        className="btn btn-outline"
                        style={{ textDecoration: 'none' }}
                      >
                        View Preview
                      </Link>
                      <Link
                        to={`/schedules/${generationResult.partialSchedule.id}/edit`}
                        className="btn btn-primary"
                        style={{ textDecoration: 'none' }}
                      >
                        Edit Manually
                      </Link>
                    </div>
                  </div>
                )}

                <div className="options-list">
                  {generationResult.options?.map(option => (
                    <div
                      key={option.id}
                      className="option-card"
                      onClick={() => handleApplyOption(option.id)}
                    >
                      <h4>{option.title}</h4>
                      <p>{option.description}</p>
                      <div className="impact">
                        Impact: {option.impact}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Existing Schedules */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <h2>Existing Schedules</h2>
        </div>

        {schedules.length === 0 ? (
          <p style={{ color: '#666' }}>No schedules created yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Status</th>
                <th>Created</th>
                <th>Published</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map(schedule => (
                <tr key={schedule.id}>
                  <td>
                    <strong>
                      {months[parseInt(schedule.month.split('-')[1]) - 1]} {schedule.month.split('-')[0]}
                    </strong>
                  </td>
                  <td>
                    <span className={`request-card-badge badge-${schedule.status === 'published' ? 'approved' : schedule.status === 'draft' ? 'pending' : 'rejected'}`}>
                      {schedule.status}
                    </span>
                  </td>
                  <td>{format(new Date(schedule.createdAt), 'MMM d, yyyy HH:mm')}</td>
                  <td>{schedule.publishedAt ? format(new Date(schedule.publishedAt), 'MMM d, yyyy HH:mm') : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <Link
                        to={`/schedules/${schedule.id}`}
                        className="btn btn-outline"
                        style={{ padding: '5px 10px', textDecoration: 'none' }}
                      >
                        View
                      </Link>
                      {schedule.status === 'draft' && (
                        <>
                          <Link
                            to={`/schedules/${schedule.id}/edit`}
                            className="btn btn-outline"
                            style={{ padding: '5px 10px', textDecoration: 'none' }}
                          >
                            Edit
                          </Link>
                          <button
                            className="btn btn-success"
                            style={{ padding: '5px 10px' }}
                            onClick={() => handlePublish(schedule.id)}
                          >
                            Publish
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Schedules;
