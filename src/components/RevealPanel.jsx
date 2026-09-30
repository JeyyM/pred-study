import { CATEGORY_LABELS, LABELS } from '../utils/study';

function revealItemClass(index, suspect, choice, correct, targetIndex) {
  const classes = ['reveal-item'];
  if (suspect.category === 'sex') classes.push('sex-offense');
  if (correct && index === choice) classes.push('reveal-correct');
  if (!correct && index === choice) classes.push('reveal-wrong');
  if (!correct && index === targetIndex) classes.push('reveal-answer');
  return classes.join(' ');
}

export default function RevealPanel({
  trial,
  feedback,
  correct,
  choice,
  isLast,
  revealAnswer = true,
  onNext,
}) {
  return (
    <div className={`reveal-panel${revealAnswer ? '' : ' reveal-panel--silent'}`}>
      {revealAnswer ? (
        <>
          <h2>Convictions revealed</h2>
          <div className="reveal-list">
            {trial.suspects.map((suspect, i) => (
              <div
                key={LABELS[i]}
                className={revealItemClass(i, suspect, choice, correct, trial.targetIndex)}
              >
                <span className="letter">{LABELS[i]}</span>
                <div>
                  <div className="offense">{suspect.offense}</div>
                  <div className="meta">
                    {CATEGORY_LABELS[suspect.category] || suspect.category} · {suspect.year}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className={`feedback ${correct ? 'correct' : 'incorrect'}`}>
            {correct ? '✓ ' : '✗ '}
            {feedback}
          </p>
        </>
      ) : null}
      <div className="reveal-panel-actions">
        <button type="button" className="btn primary" onClick={onNext}>
          {isLast ? 'See results' : 'Next round'}
        </button>
      </div>
    </div>
  );
}
