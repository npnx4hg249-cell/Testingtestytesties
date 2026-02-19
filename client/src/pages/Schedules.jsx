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
      } else if (result.partialSuccess || result.schedule || result.partialSchedule) {
        // Partial success - schedule generated with issues
        const schedule = result.schedule || result.partialSchedule;
        setGenerationResult({
          type: 'partial',
          message: result.message || `Schedule generated with ${result.bestErrorCount || result.errors?.length || 0} issues. Review and edit manually.`,
          errors: result.errors,
          options: result.options,
          schedule: schedule,
          partialSchedule: schedule,
          iterations: result.iterations,
          bestErrorCount: result.bestErrorCount
        });
        await loadSchedules();
      } else {
        // Complete failure
        setGenerationResult({
          type: 'failure',
          errors: result.errors,
          options: result.options,
          message: result.message || 'Schedule generation failed.'
        });
      }
    } catch (err) {
      if (err.data && (err.data.options || err.data.partialSchedule)) {
        const schedule = err.data.schedule || err.data.partialSchedule;
        setGenerationResult({
          type: schedule ? 'partial' : 'failure',
          errors: err.data.errors,
          options: err.data.options,
          message: err.data.message,
          schedule: schedule,
          partialSchedule: schedule
        });
        if (schedule) {
          await loadSchedules();
        }
      } else {
        setError(err.message);
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleApplyOption = async (optionId) => {
    if (optionId === 'manual_edit') {
      // Navigate to manual editor with the existing partial schedule
      const scheduleId = generationResult?.schedule?.id || generationResult?.partialSchedule?.id;
      if (scheduleId) {
        navigate(`/schedules/${scheduleId}/edit`);
      } else {
        navigate(`/schedules/new?manual=true&year=${selectedYear}&month=${selectedMonth}`);
      }
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
      } else if (result.partialSuccess || result.schedule || result.partialSchedule) {
        // Partial success with option applied
        const schedule = result.schedule || result.partialSchedule;
        setGenerationResult({
          type: 'partial',
          message: result.message || `Schedule generated with option "${optionId}" but still has issues. Review and edit manually.`,
          errors: result.errors,
          options: result.options,
          schedule: schedule,
          partialSchedule: schedule,
          appliedOption: optionId
        });
        await loadSchedules();
      }
    } catch (err) {
      if (err.data && (err.data.schedule || err.data.partialSchedule)) {
        const schedule = err.data.schedule || err.data.partialSchedule;
        setGenerationResult({
          type: 'partial',
          errors: err.data.errors,
          options: err.data.options,
          message: err.data.message,
          schedule: schedule,
          partialSchedule: schedule
        });
        await loadSchedules();
      } else {
        setError(err.message || 'Failed to generate with option');
      }
    } finally {
      setGenerating(false);
    }
  };

  const handlePublish = async (id) => {
    if (!confirm('Are you sure you want to publish this schedule? This will make it visible to all users.')) return;

    try {
      await api.publishSchedule(id);
      await loadSchedules();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id, status) => {
    const action = status === 'published' ? 'archive' : 'delete';
    if (!confirm(`Are you sure you want to ${action} this schedule?`)) return;

    try {
      await api.deleteSchedule(id);
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

            {(generationResult.type === 'partial' || generationResult.type === 'failure') && (
              <div>
                <div className={`alert ${generationResult.type === 'partial' ? 'alert-warning' : 'alert-error'}`}
                     style={generationResult.type === 'partial' ? { background: '#fff3cd', borderColor: '#ffc107', color: '#856404' } : {}}>
                  <strong>
                    {generationResult.type === 'partial'
                      ? `Schedule Generated with ${generationResult.bestErrorCount || generationResult.errors?.length || 0} Issues`
                      : 'Schedule generation failed'}
                  </strong>
                  <p>{generationResult.message}</p>
                  {generationResult.iterations && (
                    <p style={{ fontSize: 13, marginTop: 5 }}>
                      Attempted {generationResult.iterations} iterations to optimize.
                    </p>
                  )}
                  <details style={{ marginTop: 10 }}>
                    <summary>View Issues ({generationResult.errors?.length || 0})</summary>
                    <ul style={{ marginTop: 10 }}>
                      {generationResult.errors?.map((e, i) => (
                        <li key={i}>{e.message}</li>
                      ))}
                    </ul>
                  </details>
                </div>

                {/* Schedule Actions - Always show if schedule exists */}
                {(generationResult.schedule || generationResult.partialSchedule) && (
                  <div className="card" style={{ marginTop: 20, background: '#e8f5e9', borderColor: '#4caf50' }}>
                    <h3 style={{ marginTop: 0, marginBottom: 10 }}>Schedule Ready for Review</h3>
                    <p style={{ marginBottom: 15 }}>
                      A schedule has been saved. You can view it, edit it manually to fix issues, or try recovery options below.
                    </p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Link
                        to={`/schedules/${(generationResult.schedule || generationResult.partialSchedule).id}`}
                        className="btn btn-outline"
                        style={{ textDecoration: 'none' }}
                      >
                        View Schedule
                      </Link>
                      <Link
                        to={`/schedules/${(generationResult.schedule || generationResult.partialSchedule).id}/edit`}
                        className="btn btn-primary"
                        style={{ textDecoration: 'none' }}
                      >
                        Edit Manually
                      </Link>
                    </div>
                  </div>
                )}

                {generationResult.options && generationResult.options.length > 0 && (
                  <>
                    <h3 style={{ marginTop: 20, marginBottom: 15 }}>Recovery Options</h3>
                    <p style={{ marginBottom: 15, color: '#666' }}>
                      Or try one of these options to regenerate with relaxed constraints:
                    </p>
                    <div className="options-list">
                      {generationResult.options?.filter(o => o.id !== 'manual_edit').map(option => (
                        <div
                          key={option.id}
                          className="option-card"
                          onClick={() => handleApplyOption(option.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <h4>{option.title}</h4>
                          <p>{option.description}</p>
                          <div className="impact">
                            Impact: {option.impact}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
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
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      <Link
                        to={`/schedules/${schedule.id}`}
                        className="btn btn-outline"
                        style={{ padding: '5px 10px', textDecoration: 'none' }}
                      >
                        View
                      </Link>
                      <Link
                        to={`/schedules/${schedule.id}/edit`}
                        className="btn btn-outline"
                        style={{ padding: '5px 10px', textDecoration: 'none' }}
                      >
                        Edit
                      </Link>
                      {schedule.status === 'draft' && (
                        <button
                          className="btn btn-success"
                          style={{ padding: '5px 10px' }}
                          onClick={() => handlePublish(schedule.id)}
                        >
                          Publish
                        </button>
                      )}
                      <button
                        className="btn btn-danger"
                        style={{ padding: '5px 10px' }}
                        onClick={() => handleDelete(schedule.id, schedule.status)}
                      >
                        {schedule.status === 'published' ? 'Archive' : 'Delete'}
                      </button>
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
