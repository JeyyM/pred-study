import Scoreboard from './Scoreboard';
import SuspectCard from './SuspectCard';
import RevealPanel from './RevealPanel';
import { LABELS } from '../utils/study';

export default function TrialScreen({
  trial,
  trialIndex,
  totalTrials,
  stats,
  answered,
  choice,
  correct,
  feedback,
  imageVersion,
  onSelect,
  onNext,
}) {
  return (
    <section className="screen active">
      <Scoreboard stats={stats} trialIndex={trialIndex} totalTrials={totalTrials} />

      <main className="trial-body">
        <p className="prompt">
          Which person do you believe was convicted of a sex offense involving a minor?
        </p>

        <div className="suspect-grid">
          {trial.suspects.map((suspect, i) => (
            <SuspectCard
              key={`${trial.id}-${suspect.image}`}
              suspect={suspect}
              label={LABELS[i]}
              index={i}
              answered={answered}
              choice={choice}
              correct={correct}
              targetIndex={trial.targetIndex}
              imageVersion={imageVersion}
              onSelect={onSelect}
            />
          ))}
        </div>

        {answered && (
          <RevealPanel
            trial={trial}
            feedback={feedback}
            correct={correct}
            choice={choice}
            isLast={trialIndex >= totalTrials - 1}
            onNext={onNext}
          />
        )}
      </main>
    </section>
  );
}
