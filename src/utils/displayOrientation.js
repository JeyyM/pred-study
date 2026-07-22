/**
 * Browser-side gender checks for session prep.
 * Photo orientation is normalized on the server (npm run fix-orientation) — no CSS rotation here.
 */

let faceApiReady = false;
let faceApiFailed = false;
let genderModelReady = false;
let faceApiModule = null;

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function drawPortrait(img) {
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#eef2f7';
  ctx.fillRect(0, 0, 240, 320);
  const scale = Math.max(240 / img.width, 320 / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (240 - w) / 2, (320 - h) / 2, w, h);
  return canvas;
}

async function initFaceApi() {
  if (faceApiReady || faceApiFailed) return faceApiReady;
  try {
    faceApiModule = await import('@vladmandic/face-api');
    await faceApiModule.nets.tinyFaceDetector.loadFromUri('/models');
    try {
      await faceApiModule.nets.ageGenderNet.loadFromUri('/models');
      genderModelReady = true;
    } catch {
      genderModelReady = false;
    }
    faceApiReady = true;
    return true;
  } catch {
    faceApiFailed = true;
    return false;
  }
}

export async function initOrientationEngine() {
  await initFaceApi();
}

export function isGenderCheckAvailable() {
  return genderModelReady;
}

/** Preload image bytes into the browser cache before trials. */
export async function preloadImage(imageUrl) {
  await loadImage(imageUrl);
}

/** Returns { gender, probability } or null if uncertain / unavailable. */
export async function detectApparentGender(imageUrl) {
  if (!isGenderCheckAvailable()) return null;

  const img = await loadImage(imageUrl);
  const canvas = drawPortrait(img);
  const det = await faceApiModule
    .detectSingleFace(
      canvas,
      new faceApiModule.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.35 }),
    )
    .withAgeAndGender();

  const probability = det?.genderProbability ?? 0;
  if (!det?.gender || probability < 0.72) {
    return null;
  }

  return { gender: det.gender, probability };
}

/** Reject only when we are confident the face is the opposite sex from the trial. */
export function findConfidentGenderMismatches(trials, apparentByImage) {
  const rejected = new Set();
  for (const trial of trials) {
    for (const suspect of trial.suspects) {
      const reading = apparentByImage.get(suspect.image);
      if (!reading) continue;
      if (reading.gender !== trial.gender && reading.probability >= 0.72) {
        rejected.add(suspect.image);
      }
    }
  }
  return rejected;
}
