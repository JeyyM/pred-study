import { buildTrialOrder } from './study';
import { buildSessionFromPool } from './trialBuilder';
import {
  clearSeenImages,
  loadSeenImages,
  TRIALS_PER_SESSION,
} from './sessionPool';
import { filterPoolRecords } from './poolQuality';
import {
  detectApparentGender,
  findConfidentGenderMismatches,
  initOrientationEngine,
  preloadImage,
} from './displayOrientation';

function collectSessionImages(trials) {
  const images = new Set();
  for (const trial of trials) {
    for (const suspect of trial.suspects) {
      images.add(suspect.image);
    }
  }
  return [...images];
}

export async function prepareSession(
  records,
  { imageVersion = '1', onProgress, signal } = {},
) {
  await initOrientationEngine();
  onProgress?.({ phase: 'init', message: 'Loading face detection…' });

  const rejectedImages = new Set();
  let seenImages = loadSeenImages();
  const maxAttempts = 30;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (signal?.aborted) {
      return { error: 'Cancelled' };
    }

    const pool = filterPoolRecords(records, { rejectedImages, maleOnly: true });
    let result = buildSessionFromPool(pool, {
      seenImages,
      targetTrialCount: TRIALS_PER_SESSION,
    });

    if (result.error && seenImages.size > 0) {
      clearSeenImages();
      seenImages = new Set();
      result = buildSessionFromPool(filterPoolRecords(records, { rejectedImages, maleOnly: true }), {
        seenImages,
        targetTrialCount: TRIALS_PER_SESSION,
      });
    }

    if (result.error) {
      return { error: result.error };
    }

    onProgress?.({
      phase: 'select',
      message: attempt > 0 ? 'Replacing photos that failed checks…' : 'Building your lineup…',
    });

    const images = collectSessionImages(result.trials);
    const apparentGenders = new Map();
    let loadFailed = null;

    for (let i = 0; i < images.length; i += 1) {
      if (signal?.aborted) {
        return { error: 'Cancelled' };
      }

      const filename = images[i];
      onProgress?.({
        phase: 'preload',
        current: i + 1,
        total: images.length,
        message: `Loading photos (${i + 1} / ${images.length})…`,
      });

      const url = `/images/${filename}?v=${imageVersion}`;
      try {
        await preloadImage(url);
        const apparentGender = await detectApparentGender(url);
        if (apparentGender) {
          apparentGenders.set(filename, apparentGender);
        }
      } catch {
        loadFailed = filename;
        break;
      }
    }

    if (loadFailed) {
      rejectedImages.add(loadFailed);
      continue;
    }

    const genderMismatches = findConfidentGenderMismatches(result.trials, apparentGenders);
    if (genderMismatches.size > 0) {
      for (const image of genderMismatches) {
        rejectedImages.add(image);
      }
      continue;
    }

    onProgress?.({ phase: 'done', message: 'Ready!' });
    return {
      rawTrials: result.trials,
      order: buildTrialOrder(result.trials),
      maleOnly: result.maleOnly === true,
      rejectedCount: rejectedImages.size,
    };
  }

  return {
    error:
      'Could not assemble 18 rounds after filtering photos. Clear your browser data for this site or try again later.',
  };
}
