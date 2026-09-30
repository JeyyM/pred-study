import { getBiasLabel, pct } from '../utils/study';

export default function ResultsScreen({ stats, totalTrials, onRestart, saveStatus, onRetrySave }) {
  const chance = 33;

  return (
    <section className="screen active">
      <div className="panel">
        <h1>Your results</h1>
        {saveStatus === 'saving' ? <p className="save-status">Saving your results…</p> : null}
        {saveStatus === 'saved' ? <p className="save-status">Your results were saved.</p> : null}
        {saveStatus === 'error' ? (
          <p className="save-status is-error">
            Could not save your results.
            {onRetrySave ? (
              <button type="button" className="btn secondary" onClick={onRetrySave}>
                Try again
              </button>
            ) : null}
          </p>
        ) : null}

        <div className="results-grid">
          <div className="result-card">
            <div className="big">
              {stats.correct}/{stats.answered}
            </div>
            <div className="label">Total correct</div>
          </div>
          <div className="result-card">
            <div className="big">{pct(stats.correct, stats.answered)}</div>
            <div className="label">Overall accuracy</div>
          </div>
          <div className="result-card">
            <div className="big">{pct(stats.hits, stats.targetPresent)}</div>
            <div className="label">Hit rate</div>
          </div>
          <div className="result-card">
            <div className="big">{stats.misses}</div>
            <div className="label">Misses</div>
          </div>
        </div>

        <div className="info-box debrief">
          <h2>Debrief</h2>
          <p>
            Research consistently finds that people <strong>cannot reliably identify sex offenders from appearance alone</strong>. Accuracy in tasks like this is usually near chance, especially when foils include other serious crimes.
          </p>
          <p>
            What feels like “intuition” is often <strong>stereotype matching</strong>: choosing faces that fit a pre-existing mental image of a “predator,” then treating that as evidence. That is reasoning backward from a perceived threat, not detecting a hidden phenotype.
          </p>
          <p>Offending is not visible on a face. Public safety depends on behavior, context, and systems — not looks.</p>
        </div>

        <div className="metrics-box">
          <h2>Signal detection summary</h2>
          <dl>
            <dt>Hits</dt>
            <dd>{stats.hits}</dd>
            <dt>Misses</dt>
            <dd>{stats.misses}</dd>
            <dt>Chance baseline (3 options)</dt>
            <dd>{chance}%</dd>
            <dt>Bias check</dt>
            <dd>{getBiasLabel(stats)}</dd>
          </dl>
        </div>

        <button type="button" className="btn secondary" onClick={onRestart}>
          Restart study
        </button>
      </div>
    </section>
  );
}
