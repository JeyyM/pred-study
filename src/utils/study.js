export const LABELS = ['A', 'B', 'C'];

export const CATEGORY_LABELS = {
  sex: 'Sex offense (minor)',
  property: 'Property crime',
  drug: 'Drug offense',
  violent: 'Violent crime (non-sexual)',
  financial: 'Financial crime',
  traffic: 'Traffic offense',
  misdemeanor: 'Misdemeanor',
  weapons: 'Weapons offense',
};

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function prepareTrial(raw) {
  const suspects = shuffle(raw.suspects.map((s, i) => ({ ...s, originalIndex: i })));
  const targetIndex = suspects.findIndex((s) => s.category === 'sex');
  return {
    id: raw.id,
    hasTarget: true,
    gender: raw.gender,
    suspects,
    targetIndex,
  };
}

export function pct(num, den) {
  if (den === 0) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

export function createInitialStats() {
  return {
    correct: 0,
    answered: 0,
    hits: 0,
    misses: 0,
    targetPresent: 0,
    falseAlarms: 0,
    responses: [],
  };
}

export function buildTrialOrder(trials) {
  const eligible = trials.filter(
    (t) => t.hasTarget !== false && t.suspects.some((s) => s.category === 'sex'),
  );
  assertUniqueTrialImages(eligible);
  return shuffle(eligible).map(prepareTrial);
}

/** Ensures no mugshot filename appears in more than one slot across all trials. */
export function assertUniqueTrialImages(trials) {
  const seen = new Set();
  for (const trial of trials) {
    for (const suspect of trial.suspects) {
      if (seen.has(suspect.image)) {
        throw new Error(`Study data error: duplicate photo ${suspect.image}`);
      }
      seen.add(suspect.image);
    }
  }
  return seen.size;
}

export function scoreAnswer(trial, choice) {
  const correct = choice === trial.targetIndex;
  const delta = {
    correct: correct ? 1 : 0,
    hits: correct ? 1 : 0,
    misses: correct ? 0 : 1,
    targetPresent: 1,
    falseAlarms: correct ? 0 : 1,
  };

  return {
    correct,
    delta,
    response: {
      trialId: trial.id,
      choice: LABELS[choice],
      correct,
    },
  };
}

export function getFeedback(trial, choice, correct) {
  if (correct) {
    return 'Correct — you identified the person with the qualifying sex offense.';
  }
  return `Incorrect — the qualifying offense was ${LABELS[trial.targetIndex]}, not ${LABELS[choice]}.`;
}

export function getBiasLabel(stats) {
  if (stats.falseAlarms > stats.hits) return 'Tended to over-identify';
  if (stats.falseAlarms < stats.hits) return 'Tended to under-identify';
  return 'Balanced';
}
