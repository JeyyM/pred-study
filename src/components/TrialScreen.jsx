import { useEffect, useRef } from 'react';
import Scoreboard from './Scoreboard';
import SuspectCard from './SuspectCard';
import RevealPanel from './RevealPanel';
import { LABELS } from '../utils/study';
import { useMaxWidth, useTrialLineupLayout } from '../utils/useTrialLineupLayout.js';

export default function TrialScreen({
  trial,
  trialIndex,
  totalTrials,
  stats,
  answered,
  choice,
  pendingChoice,
  correct,
  feedback,
  revealAnswer = true,
  onSelect,
  onConfirm,
  onNext,
}) {
  const stageRef = useRef(null);
  const actionsRef = useRef(null);
  const narrowLayout = useMaxWidth(900);
  const lineupLayout = useTrialLineupLayout(stageRef, narrowLayout);

  const stageStyle =
    lineupLayout?.cardWidth > 0
      ? {
          '--trial-card-w': `${lineupLayout.cardWidth}px`,
          '--trial-card-h': `${lineupLayout.cardHeight}px`,
        }
      : undefined;

  useEffect(() => {
    if (pendingChoice === null || pendingChoice === undefined) return;
    actionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [pendingChoice]);

  return (
    <section className="screen active trial-screen">
      <div className="trial-scroll">
        <header className="trial-top">
          <Scoreboard
            stats={stats}
            trialIndex={trialIndex}
            totalTrials={totalTrials}
            revealAnswer={revealAnswer}
          />
        </header>

        <main className="trial-body">
          <p className="prompt">
            Which person do you believe was convicted of a sex offense involving a child?
          </p>

          <div className="trial-stage" ref={stageRef} style={stageStyle}>
            <div className="suspect-grid">
              {trial.suspects.map((suspect, i) => (
                <SuspectCard
                  key={`${trial.id}-${LABELS[i]}`}
                  suspect={suspect}
                  label={LABELS[i]}
                  index={i}
                  answered={answered}
                  choice={choice}
                  pendingChoice={pendingChoice}
                  correct={correct}
                  targetIndex={trial.targetIndex}
                  revealAnswer={revealAnswer}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>

          <footer className="trial-actions" ref={actionsRef}>
            {!answered && pendingChoice !== null && pendingChoice !== undefined ? (
              <div className="confirm-bar">
                <p className="confirm-hint">
                  You selected <strong>{LABELS[pendingChoice]}</strong>. Confirm to lock in your answer.
                </p>
                <button type="button" className="btn primary" onClick={onConfirm}>
                  Confirm choice
                </button>
              </div>
            ) : null}

            {answered ? (
              <RevealPanel
                trial={trial}
                feedback={feedback}
                correct={correct}
                choice={choice}
                isLast={trialIndex >= totalTrials - 1}
                revealAnswer={revealAnswer}
                onNext={onNext}
              />
            ) : null}
          </footer>
        </main>
      </div>
    </section>
  );
}
