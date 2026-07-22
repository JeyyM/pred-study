/**
 * Sources with non-standard booking photos (selfies, odd crops, frequent bad rotation).
 * Excluded from the pool so trials use sheriff roster-style mugshots only.
 */
export const BLOCKED_SOURCES = new Set(['ia-winneshiek-jail']);

export function isAllowedPoolRecord(record) {
  if (!record) return false;
  if (BLOCKED_SOURCES.has(record.sourceId)) return false;
  if (record.faceVisible === false) return false;
  return record.gender === 'male' || record.gender === 'female';
}

export function filterPoolRecords(records, { rejectedImages = new Set(), maleOnly = false } = {}) {
  return records.filter((rec) => {
    if (!isAllowedPoolRecord(rec)) return false;
    if (rejectedImages.has(rec.image)) return false;
    if (maleOnly && rec.gender === 'female') return false;
    return true;
  });
}
