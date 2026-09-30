import { pct } from '../utils/study';

export default function Scoreboard({ stats, trialIndex, totalTrials, revealAnswer = true }) {
  return (
    <header className="scoreboard">
      <div className={`scoreboard-grid ${revealAnswer ? 'scoreboard-grid--feedback' : 'scoreboard-grid--silent'}`}>
        {revealAnswer ? (
          <div className="stat">
            <span className="stat-label">Score</span>
            <span className="stat-value">{stats.correct}</span>
            <span className="stat-sub">/ {stats.answered}</span>
          </div>
        ) : (
          <div className="stat">
            <span className="stat-label">Answered</span>
            <span className="stat-value">{stats.answered}</span>
            <span className="stat-sub">of {totalTrials}</span>
          </div>
        )}
        <div className="stat">
          <span className="stat-label">Round</span>
          <span className="stat-value">{Math.min(trialIndex + 1, totalTrials)}</span>
          <span className="stat-sub">/ {totalTrials}</span>
        </div>
        {revealAnswer ? (
          <div className="stat">
            <span className="stat-label">Hit rate</span>
            <span className="stat-value">{pct(stats.hits, stats.targetPresent)}</span>
            <span className="stat-sub">overall</span>
          </div>
        ) : null}
      </div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${totalTrials ? (trialIndex / totalTrials) * 100 : 0}%` }}
        />
      </div>
    </header>
  );
}
