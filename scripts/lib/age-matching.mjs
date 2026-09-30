/** Age fields for lineup construction (never shown to participants). */

export const AGE_MODEL_ID = '@vladmandic/human';
export const AGE_MODEL_VERSION = '3.3.6';

export const AGE_BANDS = [
  { id: '18-29', min: 18, max: 29 },
  { id: '30-44', min: 30, max: 44 },
  { id: '45-59', min: 45, max: 59 },
  { id: '60+', min: 60, max: 120 },
];

export function parseAgeValue(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 120) return null;
  return rounded;
}

/** Booking age wins; else model estimate. */
export function ageForMatching(record) {
  const booking = parseAgeValue(record?.age);
  if (booking != null) return booking;
  return parseAgeValue(record?.estimatedAge);
}

export function ageSource(record) {
  if (parseAgeValue(record?.age) != null) return 'booking';
  if (parseAgeValue(record?.estimatedAge) != null) return 'estimated';
  return 'missing';
}

export function ageBandId(age) {
  const n = parseAgeValue(age);
  if (n == null) return null;
  if (n < 18) return 'under-18';
  for (const band of AGE_BANDS) {
    if (n >= band.min && n <= band.max) return band.id;
  }
  return null;
}

export function ageBandForRecord(record) {
  return ageBandId(ageForMatching(record));
}

/** Exclude when we know they are under 18. Unknown age stays eligible. */
export function isStudyEligible(record) {
  const age = ageForMatching(record);
  if (age == null) return true;
  return age >= 18;
}

export function applyAgeMatchingFields(record) {
  const matching = ageForMatching(record);
  return {
    ...record,
    ageForMatching: matching,
    ageBand: ageBandForRecord(record),
    ageSource: ageSource(record),
    studyEligible: isStudyEligible(record),
  };
}

export function applyAgeMatchingToPool(records) {
  return records.map(applyAgeMatchingFields);
}
