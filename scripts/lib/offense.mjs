/**
 * Classify charges and decide whether a record qualifies as a minor-victim sex target.
 * Study targets are child-predation charges only. Adult sex offenses are foils.
 */

import childCharges from './idoc-child-charges.json' with { type: 'json' };

const CHILD_CHARGE_SET = new Set((childCharges.include || []).map((s) => String(s).trim().toUpperCase()));

const MINOR_VICTIM_PATTERNS =
  /\b(minor|minors|child(?:ren)?|juvenile|under\s+\d+|less than \d+|yrs?\.|years? old|pedophil|grooming)\b/i;

const CHILD_STATUTE_PATTERNS = [
  /\b13a-6-69(?:\.\d+)?\b/i,
  /\b13a-12-19[12]\b/i,
  /\b13a-6-8[12]\b/i,
  /\b18\s*u\.?s\.?c\.?\s*2252/i,
  /\b750\.520c\b/i,
];

const MINOR_SEX_RULES = [
  /\bentic(?:e|es|ed|ing|ement)\b/i,
  /\bchild\s+solicit/i,
  /\bsolicit(?:ation|ing)?\s+(?:of\s+)?(?:a\s+)?(?:child|minor)/i,
  /\bsex\s*solic\w*child/i,
  /\bsolicindecchild/i,
  /\bchild\s+porn/i,
  /\bpornograph(?:y)?\s+involving\s+a\s+(?:child|minor)/i,
  /\bchild\s+molest/i,
  /\bmolest(?:ing|ation)?\s+(?:a\s+)?(?:child|minor)/i,
  /\bannoying and molesting a child/i,
  /\bchild\s+expl/i,
  /\bexploit(?:ation|ing)?\s+of\s+a\s+(?:child|minor)/i,
  /\bchild\s+seduc/i,
  /\bobscene\s+material\s+to\s+a\s+(?:child|minor)/i,
  /\btransmitt\w*\s+(?:of\s+)?obscene/i,
  /\bperson\s+under\s+(?:thirteen|13|seventeen|17|eighteen|18)\b/i,
  /\bunder\s+(?:the\s+age\s+of\s+)?(?:13|16|17|18)\b/i,
  /\bv(?:ictim)?\s*<\s*16/i,
  /\bschool\s+employee.{0,60}(?:sexual|student)/i,
  /\bsexual\s+contact\s+with\s+a\s+student/i,
  /\bdepict(?:ing|ion).{0,80}(?:child|minor)/i,
  /\bpersons?\s+under\s+17\b/i,
  /\bindecen(?:t|cy).{0,40}(?:child|minor)/i,
  /\blewd.{0,40}(?:child|minor)/i,
  /\blascivious.{0,40}(?:child|minor)/i,
  /\bsexual\s+(?:abuse|assault|battery|contact).{0,40}(?:child|minor)/i,
  /\b(?:child|minor).{0,20}sexual\s+abuse/i,
  /\btraveling to meet a (?:child|minor)/i,
  /\bharmful to minors/i,
  /\bsexual performance by a child/i,
  /\bviolation of a minor/i,
  /\btouching,\s*handling.{0,40}child/i,
  /\bporn\w*.{0,24}minors?/i,
  /\bminors?.{0,24}porn/i,
  /\blascivious molestation/i,
  /\bincest.{0,24}minor/i,
];

const GENERIC_SEX_PATTERNS =
  /\b(sexual|sex offender|sex off|crim(?:inal)?\s*sex|predatory|rape|sodomy|molest(?:ing|ation)?|lewd|indecent(?:\s+liberties)?|aggravated sexual|criminal sexual|sex act|sex abuse|sexual assault|sexual battery|incest|child\s+porn|pornograph)\b/i;

const IL_CHILD_PREDATION_PATTERNS =
  /\b(pred(?:atory)?\s+crim(?:inal)?\s+sex|pred\s+crim\s+sex|child\s+porn|chil\s+porn|indecent\s+sol|ind\s+lib(?:erties)?.*child|grooming|travel(?:ing|ling)\s+to\s+meet\s+a\s+minor|sol\s+to\s+meet\s+a\s+child|sex\s+abuse\s+chil|invol\s+sex\s+serv\s+minor|contrib\s+sex\s+delinq\s+minor|prom\s+juv\s+pro|vic(?:tim)?\s*(?:9-13|13-16|13-17|13-18)|super\s+vic\s+13-17)\b/i;

const SOR_RESTRICTION_PATTERNS =
  /\b(loiter|school zone|reside\s+500|public park|regis|name chang|false info|commu internet)\b/i;

const NON_SEX_CATEGORY_RULES = [
  ['drug', /\b(drug|narcotic|meth|marijuana|cannabis|cocaine|heroin|controlled substance|paraphernalia)\b/i],
  ['traffic', /\b(dui|dwi|ovi|owi|driving|traffic|vehicular|license|speeding|hit and run|seatbelt|red light)\b/i],
  ['financial', /\b(fraud|forgery|identity theft|embezzlement|counterfeit|wire fraud|credit card|check)\b/i],
  ['property', /\b(theft|burglary|robbery|larceny|shoplift|arson|vandal|trespass|breaking)\b/i],
  ['violent', /\b(assault|battery|murder|manslaughter|kidnap|domestic|contempt|menacing)\b/i],
  ['weapons', /\b(weapon|firearm|gun|contraband)\b/i],
  ['misdemeanor', /\b(disorderly|intoxication|misdemeanor|public)\b/i],
];

function normalizeOffense(text) {
  return String(text || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseVictimAges(text) {
  if (!text) return [];
  const ages = [];
  const re = /(\d{1,2})[-\s]*(?:and[-\s]+(\d{1,2})[-\s]*)?years?[-\s]*old/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    ages.push(Number(match[1]));
    if (match[2]) ages.push(Number(match[2]));
  }
  return ages;
}

function chargeParts(text) {
  return String(text)
    .split(/[,;|]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isChildPredationCharge(name) {
  const n = String(name || '').trim().toUpperCase();
  if (!n) return false;
  if (CHILD_CHARGE_SET.has(n)) return true;
  if (SOR_RESTRICTION_PATTERNS.test(n) && !/CHILD PORN|INDECENT SOL|PRED(?:ATORY)?|IND LIB/.test(n)) {
    return false;
  }
  if (IL_CHILD_PREDATION_PATTERNS.test(n)) return true;
  return false;
}

export function isMinorSexOffense(text) {
  const raw = normalizeOffense(text);
  if (!raw) return false;
  if (chargeParts(raw).some((part) => isChildPredationCharge(part))) return true;
  if (CHILD_STATUTE_PATTERNS.some((pattern) => pattern.test(raw))) return true;
  if (MINOR_SEX_RULES.some((pattern) => pattern.test(raw))) return true;
  if (IL_CHILD_PREDATION_PATTERNS.test(raw)) return true;

  const ages = parseVictimAges(raw);
  if (ages.length && ages.every((age) => age < 18) && GENERIC_SEX_PATTERNS.test(raw)) return true;
  if (MINOR_VICTIM_PATTERNS.test(raw) && GENERIC_SEX_PATTERNS.test(raw)) return true;

  return false;
}

export function categorizeCharge(text) {
  if (isMinorSexOffense(text)) return 'sex';

  for (const [category, pattern] of NON_SEX_CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }

  return 'violent';
}

export function isAdultSexOffense(text) {
  if (!text) return false;
  const ages = parseVictimAges(text);
  if (ages.length && ages.some((age) => age >= 18)) return true;
  return GENERIC_SEX_PATTERNS.test(text) && !isMinorSexOffense(text);
}

export function applyPoolRole(record, role) {
  const minorTarget = role === 'target';
  return {
    ...record,
    category: minorTarget ? 'sex' : 'sex-adult',
    minorTarget,
    qualifyingMinor: minorTarget,
    poolRole: minorTarget ? 'target' : 'foil',
  };
}

export function classifyRecord(record) {
  if (record.classificationOverride === 'target' || record.classificationOverride === 'foil') {
    return applyPoolRole(record, record.classificationOverride);
  }

  const offense = record.offense || '';
  const detail = record.additionalInfo || '';
  const minorTarget = isMinorSexOffense(`${offense}\n${detail}`);
  const registry = record.sourceType === 'sex-offender-registry' || record.sourceType === 'sor';
  const adultSex = !minorTarget && (isAdultSexOffense(offense) || registry);

  let category;
  if (minorTarget) category = 'sex';
  else if (adultSex) category = 'sex-adult';
  else category = record.category || categorizeCharge(offense);

  return {
    ...record,
    category,
    minorTarget,
    qualifyingMinor: minorTarget,
    poolRole: minorTarget ? 'target' : 'foil',
  };
}
