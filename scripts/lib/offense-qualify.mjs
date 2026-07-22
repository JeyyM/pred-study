/** Whether a charge qualifies as a sex offense involving a minor (study target). */

export function decodeOffenseText(text) {
  return String(text || '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractStatedVictimAge(text) {
  const clean = decodeOffenseText(text);
  const patterns = [
    /victim\s+was\s+(?:a\s+)?(\d{1,2})\s*(?:-|\s)?year\s*old/i,
    /(\d{1,2})\s*(?:-|\s)?year\s*old\s+(?:male|female|victim|child)/i,
    /victim\s+(?:is|was)\s+(?:a\s+)?(\d{1,2})\b/i,
  ];
  for (const re of patterns) {
    const match = clean.match(re);
    if (match) return Number(match[1]);
  }
  return null;
}

const MINOR_KEYWORDS =
  /\b(child|children|minor|under\s*18|underage|juvenile|entic(?:e|ing)\s*(?:a\s*)?child|indenc(?:y|ent)\s+with\s+(?:a\s+)?(?:child|minor)|sexual\s+abuse\s+of\s+a\s+child|molest(?:ation)?|exploitation\s+of\s+a\s+minor|solicit(?:ation)?\s+.*\s+minor|child\s+porn|cp\s+charge)\b/i;

export function isQualifyingMinorSexOffense(text) {
  const clean = decodeOffenseText(text);
  const age = extractStatedVictimAge(clean);
  if (age !== null) return age < 18;

  if (MINOR_KEYWORDS.test(clean)) return true;
  if (/\bless\s+than\s+1[0-7]\b/i.test(clean)) return true;

  return false;
}

export function categorizeForStudy(offenseText, { forceSexRegistry = false } = {}) {
  const qualifying = isQualifyingMinorSexOffense(offenseText);
  if (qualifying) {
    return { category: 'sex', qualifyingMinor: true };
  }
  if (forceSexRegistry) {
    return { category: 'violent', qualifyingMinor: false };
  }
  return { category: null, qualifyingMinor: false };
}
