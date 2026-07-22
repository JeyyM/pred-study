import { isAllowedPoolRecord } from './poolQuality';

const STORAGE_KEY = 'pred-test-seen-images';
export const TRIALS_PER_SESSION = 18;
export const PHOTOS_PER_SESSION = TRIALS_PER_SESSION * 3;

export function loadSeenImages() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export function saveSeenImages(seen) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
}

export function clearSeenImages() {
  localStorage.removeItem(STORAGE_KEY);
}

export function markSessionSeen(trials) {
  const seen = loadSeenImages();
  for (const trial of trials) {
    for (const suspect of trial.suspects) {
      seen.add(suspect.image);
    }
  }
  saveSeenImages(seen);
  return seen.size;
}

export function remainingFreshPhotos(poolRecords, seen = loadSeenImages()) {
  return poolRecords.filter((rec) => isAllowedPoolRecord(rec) && !seen.has(rec.image)).length;
}

export function estimateRemainingSessions(poolRecords, seen = loadSeenImages()) {
  const fresh = remainingFreshPhotos(poolRecords, seen);
  return Math.floor(fresh / PHOTOS_PER_SESSION);
}
