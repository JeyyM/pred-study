/** Validation groups: same jail, separate target vs foil queues. */

export function poolRoleForRecord(rec) {
  if (rec.poolRole === 'target' || rec.poolRole === 'foil') return rec.poolRole;
  return rec.category === 'sex' ? 'target' : 'foil';
}

export function validationGroupKey(rec) {
  const jailSourceId = rec.sourceId || 'unknown';
  return `${jailSourceId}::${poolRoleForRecord(rec)}`;
}

/** @returns {{ groupKey: string, jailSourceId: string, poolRole: 'target' | 'foil' | null }} */
export function parseValidationGroupKey(key) {
  if (!key || !String(key).includes('::')) {
    return { groupKey: key, jailSourceId: key, poolRole: null };
  }
  const [jailSourceId, poolRole] = String(key).split('::');
  const role = poolRole === 'target' || poolRole === 'foil' ? poolRole : null;
  return { groupKey: key, jailSourceId, poolRole: role };
}
