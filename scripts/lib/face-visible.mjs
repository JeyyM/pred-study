/**
 * Heuristics for excluding photos where the face is not usable for identification.
 */

/** Manual review flags for known bad images in the local pool. */
export const FACE_OBSCURED_IMAGES = new Set([
  'mug-081.jpg', // COVID mask covering nose/mouth
]);

export function isFaceVisible(record) {
  if (record?.faceVisible === false) return false;
  if (record?.image && FACE_OBSCURED_IMAGES.has(record.image)) return false;
  return true;
}

export function applyFaceVisibility(record) {
  const faceVisible = isFaceVisible(record);
  return { ...record, faceVisible };
}
