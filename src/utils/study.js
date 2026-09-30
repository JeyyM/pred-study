import validatedPool from '../data/validated-pool.json' with { type: 'json' };
import { SESSION_TRIAL_COUNT } from './protocol';

export const LABELS = ['A', 'B', 'C'];
export { SESSION_TRIAL_COUNT };

export const CATEGORY_LABELS = {
  sex: 'Sex offense involving a child',
  'sex-adult': 'Sex offense (adult victim)',
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

function pickRandom(list) {
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function toSuspect(rec) {
  return {
    image: rec.image,
    offense: rec.offense,
    category: rec.category,
    year: rec.year,
  };
}

function isChildVictimTarget(rec) {
  return rec.poolRole === 'target' || rec.category === 'sex';
}

function sessionEligible(rec) {
  if (!rec?.image || rec.studyEligible === false) return false;
  if (rec.gender && rec.gender !== 'male') return false;
  return true;
}

function matchingAge(rec) {
  const n = Number(rec?.ageForMatching);
  return Number.isFinite(n) ? n : null;
}

function pickAgeMatchedFoil(foils, usedImages, target) {
  const open = foils.filter((p) => !usedImages.has(p.image));
  if (!open.length) return null;
  const targetAge = matchingAge(target);
  if (targetAge == null) return pickRandom(open);

  for (const maxGap of [12, 18]) {
    const close = open.filter((p) => {
      const age = matchingAge(p);
      return age != null && Math.abs(age - targetAge) <= maxGap;
    });
    if (close.length) return pickRandom(close);
  }

  if (target.ageBand) {
    const sameBand = open.filter((p) => p.ageBand === target.ageBand);
    if (sameBand.length) return pickRandom(sameBand);
  }

  const known = open.filter((p) => matchingAge(p) != null);
  return pickRandom(known.length ? known : open);
}

/**
 * Each session: random approved photos, no image reuse.
 * Foils prefer a similar age to the target (official age wins over the model).
 */
export function buildSessionTrials(targetCount = SESSION_TRIAL_COUNT) {
  const records = (validatedPool.records || []).filter(sessionEligible);
  const targets = shuffle(records.filter(isChildVictimTarget));
  const foils = records.filter((p) => !isChildVictimTarget(p));

  const usedImages = new Set();
  const built = [];

  for (const target of targets) {
    if (built.length >= targetCount) break;
    if (usedImages.has(target.image)) continue;

    const used = new Set(usedImages);
    used.add(target.image);
    const suspects = [toSuspect(target)];

    while (suspects.length < 3) {
      const foil = pickAgeMatchedFoil(foils, used, target);
      if (!foil) break;
      used.add(foil.image);
      suspects.push(toSuspect(foil));
    }

    if (suspects.length < 3) continue;

    used.forEach((image) => usedImages.add(image));
    built.push({
      id: `t${String(built.length + 1).padStart(2, '0')}`,
      hasTarget: true,
      gender: target.gender || 'male',
      suspects,
    });
  }

  if (built.length < targetCount) return [];
  return shuffle(built).map(prepareTrial);
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

/** @deprecated Prefer buildSessionTrials — kept for any leftover trials.json callers. */
export function buildTrialOrder(trials) {
  if (Array.isArray(trials) && trials.length) {
    const eligible = trials.filter(
      (t) => t.hasTarget !== false && t.suspects.some((s) => s.category === 'sex'),
    );
    return shuffle(eligible).map(prepareTrial);
  }
  return buildSessionTrials();
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
    return 'Correct — you identified the person with a child-victim sex offense.';
  }
  return `Incorrect — the qualifying offense was ${LABELS[trial.targetIndex]}, not ${LABELS[choice]}.`;
}

export function getBiasLabel(stats) {
  if (stats.falseAlarms > stats.hits) return 'Tended to over-identify';
  if (stats.falseAlarms < stats.hits) return 'Tended to under-identify';
  return 'Balanced';
}
