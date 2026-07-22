/**
 * Build forced-choice trials where all three photos share the same gender.
 */

import { isFaceVisible } from './face-visible.mjs';

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
  list.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return list[0];
}

function pickSex(pool, usedImages, usedSourcesInTrial, gender, sexIndex) {
  const sexPool = pool.filter(
    (p) =>
      p.category === 'sex' &&
      p.qualifyingMinor === true &&
      p.gender === gender &&
      isFaceVisible(p),
  );
  if (!sexPool.length) return null;
  const preferred = sexPool.filter((p) => !usedImages.has(p.image) && !usedSourcesInTrial.has(p.sourceId));
  if (!preferred.length) return null;
  return preferred[sexIndex % preferred.length] || null;
}

function toSuspect(rec) {
  return {
    image: rec.image,
    offense: rec.offense,
    category: rec.category,
    year: rec.year,
  };
}

export function countByGender(pool) {
  const tally = { male: { sex: 0, foil: 0 }, female: { sex: 0, foil: 0 }, unknown: 0 };
  for (const rec of pool) {
    if (!rec.gender) {
      tally.unknown += 1;
      continue;
    }
    const bucket = tally[rec.gender];
    if (rec.category === 'sex' && rec.qualifyingMinor) bucket.sex += 1;
    else bucket.foil += 1;
  }
  return tally;
}

export function buildTrials(pool, targetTrialCount = 18) {
  const withGender = pool.filter(
    (p) => (p.gender === 'male' || p.gender === 'female') && isFaceVisible(p),
  );
  const foilPool = withGender.filter((p) => p.sourceType === 'county-jail' && p.category !== 'sex');

  const sexByGender = {
    male: withGender.filter((p) => p.category === 'sex' && p.qualifyingMinor === true && p.gender === 'male'),
    female: withGender.filter((p) => p.category === 'sex' && p.qualifyingMinor === true && p.gender === 'female'),
  };
  const foilsByGender = {
    male: foilPool.filter((p) => p.gender === 'male'),
    female: foilPool.filter((p) => p.gender === 'female'),
  };

  const maxTrialsFor = (gender) =>
    Math.min(sexByGender[gender].length, Math.floor(foilsByGender[gender].length / 2));

  const maleCap = maxTrialsFor('male');
  const femaleCap = maxTrialsFor('female');
  const totalCap = maleCap + femaleCap;

  if (totalCap < targetTrialCount) {
    throw new Error(
      `Can only build ${totalCap} same-gender trials (male=${maleCap}, female=${femaleCap}). Need ${targetTrialCount}.`,
    );
  }

  const genderPlan = [];
  let maleLeft = maleCap;
  let femaleLeft = femaleCap;

  while (genderPlan.length < targetTrialCount) {
    const remaining = targetTrialCount - genderPlan.length;
    const preferFemale = genderPlan.length % 2 === 1;

    if (preferFemale && femaleLeft > 0 && (femaleLeft >= remaining || maleLeft < remaining)) {
      genderPlan.push('female');
      femaleLeft -= 1;
    } else if (maleLeft > 0 && (maleLeft >= remaining || femaleLeft < remaining)) {
      genderPlan.push('male');
      maleLeft -= 1;
    } else if (femaleLeft > 0) {
      genderPlan.push('female');
      femaleLeft -= 1;
    } else {
      genderPlan.push('male');
      maleLeft -= 1;
    }
  }

  const trials = [];
  const usedImages = new Set();
  const sexIndex = { male: 0, female: 0 };

  for (let i = 0; i < genderPlan.length; i += 1) {
    const gender = genderPlan[i];
    const trialSources = new Set();
    const suspects = [];

    const sexRec = pickSex(withGender, usedImages, trialSources, gender, sexIndex[gender]);
    sexIndex[gender] += 1;
    if (!sexRec) {
      throw new Error(`No unused ${gender} sex-offense photo for trial ${i + 1}`);
    }
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
      throw new Error(
        `Could not fill trial ${i + 1} (${gender}-only). Need more ${gender} foils with unique sources.`,
      );
    }

    trials.push({
      id: `t${String(i + 1).padStart(2, '0')}`,
      hasTarget: true,
      gender,
      suspects,
    });
  }

  assertUniqueTrialImages(trials);
  return trials;
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
