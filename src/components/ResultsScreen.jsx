import BinomialChart from './BinomialChart';
import { binomialSummary, formatChancePct } from '../utils/binomial';
import { SESSION_TRIAL_COUNT } from '../utils/protocol';
import { pct } from '../utils/study';

export default function ResultsScreen({ stats, onEndQuiz }) {
  const chance = 33;
  const n = stats.answered || SESSION_TRIAL_COUNT;
  const k = stats.correct || 0;
  const summary = binomialSummary(n, k, 1 / 3);
  const tailLabel = summary.aboveExpected
    ? `This well or better: ${formatChancePct(summary.atLeast)}`
    : `This low or lower: ${formatChancePct(summary.atMost)}`;
  const roomLine =
    summary.per10k === 0
      ? 'In a room of 10,000 people guessing at random, fewer than 1 would land this far from chance.'
      : summary.aboveExpected
        ? `In a room of 10,000 people guessing at random, about ${summary.per10k.toLocaleString()} would match or beat your score.`
        : `In a room of 10,000 people guessing at random, about ${summary.per10k.toLocaleString()} would score this low or lower.`;

  return (
    <section className="screen active results-screen">
      <div className="panel results-panel">
        <h1>Your results</h1>

        <div className="results-shot">
          <div className="results-grid results-grid--compact">
            <div className="result-card">
              <div className="big">
                {stats.correct}/{stats.answered}
              </div>
              <div className="label">Correct</div>
            </div>
            <div className="result-card">
              <div className="big">{pct(stats.correct, stats.answered)}</div>
              <div className="label">Accuracy</div>
            </div>
            <div className="result-card">
              <div className="big">{stats.misses}</div>
              <div className="label">Misses</div>
            </div>
            <div className="result-card">
              <div className="big">{chance}%</div>
              <div className="label">Chance</div>
            </div>
          </div>

          <div className="info-box binomial-card binomial-card--compact">
            <h2>Vs random guessing (1 in 3)</h2>
            <p className="binomial-headline">
              You <strong>{k}/{n}</strong> · expected about <strong>{Math.round(summary.expected)}/{n}</strong>
            </p>
            <BinomialChart n={n} k={k} compact />
            <p className="binomial-stats-line">
              Exact by guessing: <strong>{formatChancePct(summary.exact)}</strong>
              <span className="binomial-sep"> · </span>
              {tailLabel}
            </p>
            <p className="binomial-room">{roomLine}</p>
          </div>
        </div>

        <div className="info-box debrief results-debrief">
          <h2>Debrief</h2>
          <p>
            Research consistently finds that people <strong>cannot reliably identify sex offenders from appearance alone</strong>. Accuracy in tasks like this is usually near chance, especially when foils include other serious crimes.
          </p>
          <p>
            What feels like “intuition” is often <strong>stereotype matching</strong>: choosing faces that fit a pre-existing mental image of a “predator,” then treating that as evidence. That is reasoning backward from a perceived threat, not detecting a hidden phenotype.
          </p>
          <p>Offending is not visible on a face. Public safety depends on behavior, context, and systems — not looks.</p>
        </div>

        {onEndQuiz ? (
          <button type="button" className="btn secondary results-end" onClick={onEndQuiz}>
            End quiz
          </button>
        ) : null}
      </div>
    </section>
  );
}
