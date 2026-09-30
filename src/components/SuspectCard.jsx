import { LABELS } from '../utils/study';

function cardClass(index, answered, choice, pendingChoice, correct, targetIndex, revealAnswer) {
  const classes = ['suspect-card'];
  if (answered) classes.push('disabled');
  if (!answered && pendingChoice === index) {
    classes.push('pick-chosen');
  }
  if (answered && choice === index) {
    if (!revealAnswer) {
      classes.push('pick-chosen');
    } else {
      classes.push(correct ? 'pick-correct' : 'pick-wrong');
    }
  }
  if (revealAnswer && answered && !correct && targetIndex === index && choice !== targetIndex) {
    classes.push('show-answer');
  }
  return classes.join(' ');
}

function resultBadge(index, answered, choice, correct, targetIndex, revealAnswer) {
  if (!answered || !revealAnswer) return null;
  if (choice === index) {
    return correct ? '✓ Correct' : '✗ Wrong';
  }
  if (!correct && targetIndex === index) {
    return 'Correct answer';
  }
  return null;
}

export default function SuspectCard({
  suspect,
  label,
  index,
  answered,
  choice,
  pendingChoice = null,
  correct,
  targetIndex,
  revealAnswer = true,
  onSelect,
}) {
  const badge = resultBadge(index, answered, choice, correct, targetIndex, revealAnswer);
  const badgeClass =
    choice === index ? (correct ? 'card-badge correct' : 'card-badge wrong') : 'card-badge answer';

  return (
    <button
      type="button"
      className={cardClass(index, answered, choice, pendingChoice, correct, targetIndex, revealAnswer)}
      disabled={answered}
      onClick={() => onSelect(index)}
    >
      <div className="suspect-label">
        {label}
        {badge && <span className={badgeClass}>{badge}</span>}
      </div>
      <div className="photo-wrap">
        <img src={`/images/${suspect.image}`} alt={`Booking photo ${label}`} loading="eager" />
      </div>
    </button>
  );
}

export { LABELS };
