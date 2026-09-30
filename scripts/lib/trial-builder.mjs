/**
 * Build forced-choice trials where all three photos share the same gender.
 * Prefers foils in the same coarse ageBand as the target when ageForMatching is known.
 */

import { ageBandForRecord, isStudyEligible } from './age-matching.mjs';

function isTrialTarget(rec) {
  return rec.category === 'sex';
}

function eligible(pool) {
  return pool.filter((p) => isStudyEligible(p));
}

function pickFoil(pool, usedImages, usedSourcesInTrial, gender, targetBand) {
  const isFoil = (p) => p.category !== 'sex' && p.gender === gender && !usedImages.has(p.image);

  const pickFirst = (list) => {
    if (!list.length) return null;
    list.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    return list[0];
  };

  const uniqueSource = pool.filter((p) => isFoil(p) && !usedSourcesInTrial.has(p.sourceId));
  if (targetBand) {
    const sameBand = uniqueSource.filter((p) => ageBandForRecord(p) === targetBand);
    const picked = pickFirst(sameBand);
    if (picked) return picked;
  }
  const pickedUnique = pickFirst(uniqueSource);
  if (pickedUnique) return pickedUnique;

  if (targetBand) {
    const sameBandAnySource = pool.filter((p) => isFoil(p) && ageBandForRecord(p) === targetBand);
    const picked = pickFirst(sameBandAnySource);
    if (picked) return picked;
  }

  return pickFirst(pool.filter(isFoil));
}

function pickSex(pool, usedImages, usedSourcesInTrial, gender, sexIndex) {
  const sexPool = pool.filter((p) => isTrialTarget(p) && p.gender === gender);
  if (!sexPool.length) return null;
  const preferred = sexPool.filter((p) => !usedImages.has(p.image) && !usedSourcesInTrial.has(p.sourceId));
  return preferred[sexIndex % preferred.length] || sexPool[sexIndex % sexPool.length] || null;
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
    if (rec.category === 'sex') bucket.sex += 1;
    else bucket.foil += 1;
  }
  return tally;
}

export function buildTrials(pool, targetTrialCount = 30) {
  const eligiblePool = eligible(pool);
  const withGender = eligiblePool.filter((p) => p.gender === 'male' || p.gender === 'female');
  const foilPool = withGender.filter((p) => p.category !== 'sex');

  const sexByGender = {
    male: withGender.filter((p) => isTrialTarget(p) && p.gender === 'male'),
    female: withGender.filter((p) => isTrialTarget(p) && p.gender === 'female'),
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

  const trialCount = Math.min(targetTrialCount, totalCap);
  if (trialCount === 0) {
    throw new Error(
      `No same-gender trials possible (male=${maleCap}, female=${femaleCap}). Need at least one sex target and two foils per gender.`,
    );
  }

  const genderPlan = [];
  let maleLeft = maleCap;
  let femaleLeft = femaleCap;

  while (genderPlan.length < trialCount) {
    const remaining = trialCount - genderPlan.length;
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
    const targetBand = ageBandForRecord(sexRec);

    while (suspects.length < 3) {
      const foil = pickFoil(foilPool, usedImages, trialSources, gender, targetBand);
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

  return trials;
}
