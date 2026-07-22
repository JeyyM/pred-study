/** Build study trials in the browser from the mugshot pool. */

import { isAllowedPoolRecord } from './poolQuality';

function isFaceVisible(record) {
  return isAllowedPoolRecord(record);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickFoil(pool, usedImages, usedSourcesInTrial, gender) {
  const isFoil = (p) =>
    p.sourceType === 'county-jail' &&
    p.category !== 'sex' &&
    p.gender === gender &&
    isFaceVisible(p);
  const base = pool.filter(
    (p) => isFoil(p) && !usedImages.has(p.image) && !usedSourcesInTrial.has(p.sourceId),
  );
  const fallback = pool.filter((p) => isFoil(p) && !usedImages.has(p.image));
  const list = base.length ? base : fallback;
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function pickSex(pool, usedImages, usedSourcesInTrial, gender) {
  const sexPool = pool.filter(
    (p) =>
      p.category === 'sex' &&
      p.qualifyingMinor === true &&
      p.gender === gender &&
      isFaceVisible(p),
  );
  const preferred = sexPool.filter(
    (p) => !usedImages.has(p.image) && !usedSourcesInTrial.has(p.sourceId),
  );
  if (!preferred.length) return null;
  return preferred[Math.floor(Math.random() * preferred.length)];
}

function toSuspect(rec) {
  return {
    image: rec.image,
    offense: rec.offense,
    category: rec.category,
    year: rec.year,
    gender: rec.gender,
  };
}

function buildGenderPlan(targetTrialCount, maleCap, femaleCap, femaleSexCount) {
  if (femaleSexCount === 0 || femaleCap === 0) {
    return Array(targetTrialCount).fill('male');
  }

  const plan = [];
  let maleLeft = maleCap;
  let femaleLeft = femaleCap;

  while (plan.length < targetTrialCount) {
    const remaining = targetTrialCount - plan.length;
    const preferFemale = plan.length % 2 === 1;

    if (preferFemale && femaleLeft > 0 && (femaleLeft >= remaining || maleLeft < remaining)) {
      plan.push('female');
      femaleLeft -= 1;
    } else if (maleLeft > 0 && (maleLeft >= remaining || femaleLeft < remaining)) {
      plan.push('male');
      maleLeft -= 1;
    } else if (femaleLeft > 0) {
      plan.push('female');
      femaleLeft -= 1;
    } else {
      plan.push('male');
      maleLeft -= 1;
    }
  }

  return plan;
}

export function assertUniqueTrialImages(trials) {
  const seen = new Set();
  for (const trial of trials) {
    for (const suspect of trial.suspects) {
      if (seen.has(suspect.image)) {
        throw new Error(`Duplicate image across trials: ${suspect.image}`);
      }
      seen.add(suspect.image);
    }
  }
  return seen.size;
}

export function assertTrialGenderHomogeneity(trials) {
  for (const trial of trials) {
    for (const suspect of trial.suspects) {
      if (suspect.gender !== trial.gender) {
        throw new Error(
          `Gender mismatch in ${trial.id}: ${suspect.image} is ${suspect.gender}, trial is ${trial.gender}`,
        );
      }
    }
  }
}

export function buildTrials(pool, targetTrialCount = 18) {
  const withGender = pool.filter(
    (p) => (p.gender === 'male' || p.gender === 'female') && isFaceVisible(p),
  );

  const femaleSexCount = withGender.filter(
    (p) => p.category === 'sex' && p.qualifyingMinor === true && p.gender === 'female',
  ).length;
  const maleOnly = femaleSexCount === 0;
  const eligible = maleOnly ? withGender.filter((p) => p.gender === 'male') : withGender;

  const foilPool = eligible.filter((p) => p.sourceType === 'county-jail' && p.category !== 'sex');

  const sexByGender = {
    male: eligible.filter(
      (p) => p.category === 'sex' && p.qualifyingMinor === true && p.gender === 'male',
    ),
    female: eligible.filter(
      (p) => p.category === 'sex' && p.qualifyingMinor === true && p.gender === 'female',
    ),
  };
  const foilsByGender = {
    male: foilPool.filter((p) => p.gender === 'male'),
    female: foilPool.filter((p) => p.gender === 'female'),
  };

  const maxTrialsFor = (gender) =>
    Math.min(sexByGender[gender].length, Math.floor(foilsByGender[gender].length / 2));

  const maleCap = maxTrialsFor('male');
  const femaleCap = maleOnly ? 0 : maxTrialsFor('female');
  const totalCap = maleCap + femaleCap;

  if (totalCap < targetTrialCount) {
    return { trials: [], error: `Need ${targetTrialCount} rounds but pool supports ${totalCap}.` };
  }

  const genderPlan = buildGenderPlan(targetTrialCount, maleCap, femaleCap, femaleSexCount);
  const trials = [];
  const usedImages = new Set();

  for (let i = 0; i < genderPlan.length; i += 1) {
    const gender = genderPlan[i];
    const trialSources = new Set();
    const suspects = [];

    const sexRec = pickSex(eligible, usedImages, trialSources, gender);
    if (!sexRec) return { trials: [], error: `Could not find unused ${gender} target for round ${i + 1}.` };
    usedImages.add(sexRec.image);
    trialSources.add(sexRec.sourceId);
    suspects.push(toSuspect(sexRec));

    while (suspects.length < 3) {
      const foil = pickFoil(foilPool, usedImages, trialSources, gender);
      if (!foil) break;
      usedImages.add(foil.image);
      trialSources.add(foil.sourceId);
      suspects.push(toSuspect(foil));
    }

    if (suspects.length < 3) {
      return { trials: [], error: `Could not fill round ${i + 1} with unique ${gender} photos.` };
    }

    trials.push({
      id: `t${String(i + 1).padStart(2, '0')}`,
      hasTarget: true,
      gender,
      suspects,
    });
  }

  assertUniqueTrialImages(trials);
  assertTrialGenderHomogeneity(trials);
  return { trials, error: null, maleOnly };
}

export function eligiblePoolRecords(records, seenImages = new Set(), rejectedImages = new Set()) {
  return records.filter(
    (rec) => isFaceVisible(rec) && !seenImages.has(rec.image) && !rejectedImages.has(rec.image),
  );
}

export function buildSessionFromPool(
  records,
  { seenImages = new Set(), rejectedImages = new Set(), targetTrialCount = 18 } = {},
) {
  const available = shuffle(eligiblePoolRecords(records, seenImages, rejectedImages));
  return buildTrials(available, targetTrialCount);
}

export { shuffle };
