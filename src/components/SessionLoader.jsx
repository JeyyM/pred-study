export default function SessionLoader({ progress, error, onRetry, onBack }) {
  const pct =
    (progress?.phase === 'load' || progress?.phase === 'preload') && progress.total
      ? Math.round((progress.current / progress.total) * 100)
      : progress?.phase === 'done'
        ? 100
        : progress?.phase === 'select'
          ? 12
          : 4;

  return (
    <section className="screen active">
      <div className="panel loader-panel">
        <h1>Preparing your session</h1>
        <p className="lead">
          Picking photos you have not seen yet and grouping them into rounds before the study
          starts.
        </p>

        {error ? (
          <div className="loader-error">
            <p>{error}</p>
            <div className="loader-actions">
              <button type="button" className="btn primary" onClick={onRetry}>
                Try again
              </button>
              <button type="button" className="btn secondary" onClick={onBack}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="loader-bar" aria-hidden="true">
              <div className="loader-bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="loader-status">{progress?.message || 'Starting…'}</p>
            <p className="loader-note muted">
              Booking photos are pre-corrected for orientation, then preloaded and checked for
              lineup consistency. This usually takes 15–45 seconds.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
