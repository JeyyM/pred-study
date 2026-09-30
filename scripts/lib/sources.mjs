/**
 * Sheriff source registry for fetch / expand / profile enrichment.
 * cms: bjm-roster | bjm-sor | iowa-roster | green-roster
 *
 * Full public crawl: no per-site caps. Jail = every unique booking on the
 * public roster. SOR = every registrant listed on sex_offenders.php.
 * Internal jail/court databases and NSOPW bulk dumps are not public.
 */

function jail(id, state, base, extra = {}) {
  return {
    id,
    state,
    base,
    cms: 'bjm-roster',
    pages: extra.pages ?? 50,
    foilLimit: extra.foilLimit ?? null,
    targetLimit: extra.targetLimit ?? null,
    preferred: extra.preferred ?? false,
  };
}

function sor(id, state, base, extra = {}) {
  return {
    id,
    state,
    base,
    cms: 'bjm-sor',
    pages: extra.pages ?? 200,
    sorLimit: extra.sorLimit ?? null,
    preferred: extra.preferred ?? false,
  };
}

/** Counties with consistently usable BJM booking photos. */
export const BJM_ROSTER_SITES = [
  jail('al-blount-jail', 'AL', 'https://www.blountalsheriff.org', { preferred: true }),
  jail('al-pickens-jail', 'AL', 'https://www.pcsoal.org', { preferred: true }),
  jail('al-colbert-jail', 'AL', 'https://www.colbertsheriff.net', { preferred: true }),
  jail('al-franklin-jail', 'AL', 'https://www.franklinsheriff.org', { preferred: true }),
  jail('al-escambia-jail', 'AL', 'https://www.escambiacountysheriffal.org', { preferred: true }),
  jail('al-randolph-jail', 'AL', 'https://www.randolphcountysheriff.org', { preferred: true }),
  jail('ar-scott-jail', 'AR', 'https://www.scottcountysheriff.org', { preferred: true }),
  jail('al-chilton-jail', 'AL', 'https://www.chiltoncountyso.org'),
  jail('ar-logan-jail', 'AR', 'https://www.loganso.com'),
  jail('mo-stone-jail', 'MO', 'https://www.stonecountymosheriff.com'),
  jail('ar-jefferson-jail', 'AR', 'https://www.jeffcoso.org'),
  jail('tx-kendall-jail', 'TX', 'https://www.kendallcountysheriff.com'),
];

export const BJM_SOR_SITES = [
  sor('al-blount-sor', 'AL', 'https://www.blountalsheriff.org', { preferred: true }),
  sor('al-pickens-sor', 'AL', 'https://www.pcsoal.org', { preferred: true }),
  sor('al-colbert-sor', 'AL', 'https://www.colbertsheriff.net', { preferred: true }),
  sor('al-franklin-sor', 'AL', 'https://www.franklinsheriff.org', { preferred: true }),
  sor('al-escambia-sor', 'AL', 'https://www.escambiacountysheriffal.org', { preferred: true }),
  sor('al-randolph-sor', 'AL', 'https://www.randolphcountysheriff.org', { preferred: true }),
  sor('ar-scott-sor', 'AR', 'https://www.scottcountysheriff.org', { preferred: true }),
  sor('al-chilton-sor', 'AL', 'https://www.chiltoncountyso.org'),
  sor('ar-logan-sor', 'AR', 'https://www.loganso.com'),
  sor('mo-stone-sor', 'MO', 'https://www.stonecountymosheriff.com'),
  sor('ar-jefferson-sor', 'AR', 'https://www.jeffcoso.org'),
  sor('tx-kendall-sor', 'TX', 'https://www.kendallcountysheriff.com'),
  sor('ar-craighead-sor', 'AR', 'https://www.craigheadso.org'),
  sor('al-cherokee-sor', 'AL', 'https://www.cherokeecountyalsheriff.com'),
  sor('ar-boone-sor', 'AR', 'https://www.boonesheriff.com'),
  sor('ms-tishomingo-sor', 'MS', 'https://www.tishso.org'),
  sor('ms-lauderdale-sor', 'MS', 'https://www.lauderdaleso.org'),
];

export const IOWA_ROSTER_SITES = [
  {
    id: 'ia-winneshiek-jail',
    state: 'IA',
    base: 'https://winneshiekcounty.iowa.gov/departments/sheriff/current-inmates',
    cms: 'iowa-roster',
  },
];

export const GREEN_ROSTER_SITES = [
  {
    id: 'ar-faulkner-jail',
    state: 'AR',
    base: 'https://www.fcso.ar.gov',
    rosterUrl: 'https://www.fcso.ar.gov/inmate-roster',
    cms: 'green-roster',
  },
];

export const SOURCE_TITLES = {
  'al-blount-jail': 'Blount County Jail',
  'al-pickens-jail': 'Pickens County Jail',
  'al-colbert-jail': 'Colbert County Jail',
  'al-franklin-jail': 'Franklin County Jail',
  'al-escambia-jail': 'Escambia County Jail',
  'al-randolph-jail': 'Randolph County Jail',
  'ar-scott-jail': 'Scott County Jail',
  'al-chilton-jail': 'Chilton County Jail',
  'ar-logan-jail': 'Logan County Jail',
  'mo-stone-jail': 'Stone County Jail',
  'ar-jefferson-jail': 'Jefferson County Jail',
  'tx-kendall-jail': 'Kendall County Jail',
  'al-cullman-jail': 'Cullman County Jail',
  'al-elmore-jail': 'Elmore County Jail',
  'al-coffee-jail': 'Coffee County Jail',
  'ar-craighead-jail': 'Craighead County Jail',
  'ia-winneshiek-jail': 'Winneshiek County Jail',
  'ar-faulkner-jail': 'Faulkner County Jail',
  'ar-greene-jail': 'Greene County Jail',
  'al-blount-sor': 'Blount County Sex Offender Registry',
  'al-pickens-sor': 'Pickens County Sex Offender Registry',
  'al-colbert-sor': 'Colbert County Sex Offender Registry',
  'al-franklin-sor': 'Franklin County Sex Offender Registry',
  'al-escambia-sor': 'Escambia County Sex Offender Registry',
  'al-randolph-sor': 'Randolph County Sex Offender Registry',
  'ar-scott-sor': 'Scott County Sex Offender Registry',
  'al-chilton-sor': 'Chilton County Sex Offender Registry',
  'ar-logan-sor': 'Logan County Sex Offender Registry',
  'mo-stone-sor': 'Stone County Sex Offender Registry',
  'ar-jefferson-sor': 'Jefferson County Sex Offender Registry',
  'tx-kendall-sor': 'Kendall County Sex Offender Registry',
  'al-cullman-sor': 'Cullman County Sex Offender Registry',
  'al-elmore-sor': 'Elmore County Sex Offender Registry',
  'al-coffee-sor': 'Coffee County Sex Offender Registry',
  'ar-craighead-sor': 'Craighead County Sex Offender Registry',
  'al-cherokee-sor': 'Cherokee County Sex Offender Registry',
  'ar-boone-sor': 'Boone County Sex Offender Registry',
  'ms-tishomingo-sor': 'Tishomingo County Sex Offender Registry',
  'ms-lauderdale-sor': 'Lauderdale County Sex Offender Registry',
};

export const LEGACY_SOURCE_TITLES = SOURCE_TITLES;

export const PREFERRED_SOURCE_IDS = new Set(
  [...BJM_ROSTER_SITES, ...BJM_SOR_SITES].filter((s) => s.preferred).map((s) => s.id),
);

export const EXPAND_SOURCE_IDS = [
  ...BJM_ROSTER_SITES,
  ...BJM_SOR_SITES,
  ...IOWA_ROSTER_SITES,
  ...GREEN_ROSTER_SITES,
].map((s) => s.id);

export function allScrapeSites() {
  return [...BJM_ROSTER_SITES, ...BJM_SOR_SITES, ...IOWA_ROSTER_SITES, ...GREEN_ROSTER_SITES];
}

export function sorScrapeSites() {
  return [...BJM_SOR_SITES];
}

export function expandScrapeSites() {
  return allScrapeSites();
}
