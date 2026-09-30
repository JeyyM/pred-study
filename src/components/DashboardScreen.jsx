import { useEffect, useState } from 'react';

function formatPct(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${Math.round(value * (value <= 1 ? 100 : 1))}%`;
}

function formatMs(value) {
  if (value == null || Number.isNaN(value)) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

export default function DashboardScreen() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Could not load dashboard');
        return body;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="screen active dashboard-screen">
      <div className="panel dashboard-panel">
        <header className="dashboard-top">
          <div>
            <p className="validation-kicker">Localhost only</p>
            <h1>Study dashboard</h1>
          </div>
          <a className="btn secondary" href="/">
            Back to study
          </a>
        </header>

        {error ? <p className="save-status is-error">{error}</p> : null}
        {!data && !error ? <p className="save-status">Loading…</p> : null}

        {data ? (
          <>
            <div className="results-grid">
              <div className="result-card">
                <div className="big">{data.sessionCount}</div>
                <div className="label">Completed sessions</div>
              </div>
              <div className="result-card">
                <div className="big">{formatPct(data.meanAccuracy)}</div>
                <div className="label">Mean accuracy</div>
              </div>
              <div className="result-card">
                <div className="big">{formatMs(data.meanReactionMs)}</div>
                <div className="label">Mean pick time</div>
              </div>
              <div className="result-card">
                <div className="big">{data.stimulusCount}</div>
                <div className="label">Accepted IDs in database</div>
              </div>
            </div>

            <div className="info-box">
              <h2>Protocols</h2>
              <p>
                Feedback: <strong>{data.arms.feedback.n}</strong> sessions,{' '}
                {formatPct(data.arms.feedback.meanAccuracy)} mean, {formatMs(data.arms.feedback.meanReactionMs)} picks.
                Silent: <strong>{data.arms.silent.n}</strong> sessions,{' '}
                {formatPct(data.arms.silent.meanAccuracy)} mean, {formatMs(data.arms.silent.meanReactionMs)} picks.
              </p>
              <p className="dashboard-note">
                Each device gets one random arm (50/50) on first start and keeps it for later visits. Face counts do not change who is shown.
              </p>
            </div>

            <div className="info-box">
              <h2>Sample</h2>
              <p>
                Mean age: <strong>{data.meanAge == null ? '—' : Math.round(data.meanAge)}</strong>
              </p>
              <ul className="dashboard-inline">
                {Object.entries(data.genders || {}).length
                  ? Object.entries(data.genders).map(([type, count]) => (
                    <li key={type}>
                      {type.replace('_', ' ')}: <strong>{count}</strong>
                    </li>
                  ))
                  : <li>No demographics yet.</li>}
              </ul>
            </div>

            <div className="info-box">
              <h2>Devices</h2>
              <ul className="dashboard-inline">
                {Object.entries(data.devices).length
                  ? Object.entries(data.devices).map(([type, count]) => (
                    <li key={type}>
                      {type}: <strong>{count}</strong>
                    </li>
                  ))
                  : <li>No sessions yet.</li>}
              </ul>
            </div>

            <div className="info-box">
              <h2>Most selected faces by dataset</h2>
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Dataset</th>
                      <th>Faces</th>
                      <th>Played</th>
                      <th>Selected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.datasets.map((row) => (
                      <tr key={row.sourceId}>
                        <td>{row.title}</td>
                        <td>{row.faces}</td>
                        <td>{row.played}</td>
                        <td>{row.selected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="info-box">
              <h2>Face play and select counts</h2>
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Photo</th>
                      <th>ID</th>
                      <th>Dataset</th>
                      <th>Role</th>
                      <th>Played</th>
                      <th>Selected</th>
                      <th>Select rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.faces.map((row) => (
                      <tr key={row.image}>
                        <td>
                          <img
                            className="dashboard-thumb"
                            src={`/images/${row.image}`}
                            alt=""
                          />
                        </td>
                        <td className="dashboard-id">{row.image}</td>
                        <td>{row.sourceTitle}</td>
                        <td>{row.poolRole || '—'}</td>
                        <td>{row.timesPlayed}</td>
                        <td>{row.timesSelected}</td>
                        <td>{row.selectRate == null ? '—' : `${Math.round(row.selectRate)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="info-box">
              <h2>Recent sessions</h2>
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Arm</th>
                      <th>Device</th>
                      <th>Gender</th>
                      <th>Age</th>
                      <th>IP</th>
                      <th>Score</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((row) => (
                      <tr key={row.id}>
                        <td>{row.completedAt ? new Date(row.completedAt).toLocaleString() : '—'}</td>
                        <td>{row.arm}</td>
                        <td>{row.deviceType || '—'}</td>
                        <td>{row.gender ? String(row.gender).replace('_', ' ') : '—'}</td>
                        <td>{row.age ?? '—'}</td>
                        <td>{row.ipAddress || '—'}</td>
                        <td>
                          {row.correct}/{row.answered} ({formatPct(row.accuracy)})
                        </td>
                        <td>{formatMs(row.durationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
