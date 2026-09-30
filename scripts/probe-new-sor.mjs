/**
 * Probe confirmed BJM SOR domains that are not already in the live pool.
 * Run: node scripts/probe-new-sor.mjs
 */

import { fetchText } from './lib/mugshot-scrape.mjs';

const CANDIDATES = [
  { id: 'al-cherokee-sor', state: 'AL', base: 'https://www.cherokeecountyalsheriff.com' },
  { id: 'ar-boone-sor', state: 'AR', base: 'https://www.boonesheriff.com' },
  { id: 'ar-cross-sor', state: 'AR', base: 'https://www.crosscountysheriff.org' },
  { id: 'ar-hempstead-sor', state: 'AR', base: 'https://www.hempsteadcountysheriff.org' },
  { id: 'ar-marion-sor', state: 'AR', base: 'https://www.marioncountysheriffar.gov' },
  { id: 'ar-phillips-sor', state: 'AR', base: 'https://www.phillipscountysheriffar.org' },
  { id: 'mo-johnson-sor', state: 'MO', base: 'https://www.jocomosheriff.org' },
  { id: 'ms-tishomingo-sor', state: 'MS', base: 'https://www.tishso.org' },
  { id: 'ms-lauderdale-sor', state: 'MS', base: 'https://www.lauderdaleso.org' },
  { id: 'ms-grenada-sor', state: 'MS', base: 'https://www.grenadacountysheriff.org' },
  { id: 'ok-mayes-sor', state: 'OK', base: 'https://www.mayessheriff.org' },
];

function parseIds(html) {
  const ids = new Set();
  const re = /sex_offender_view\.php\?id=(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return ids;
}

const live = [];
for (const site of CANDIDATES) {
  process.stdout.write(`${site.id} ... `);
  try {
    const html = await fetchText(`${site.base}/sex_offenders.php`);
    const ids = parseIds(html);
    const paged = /grp=\d+/i.test(html) || html.includes('?grp=');
    console.log(`${ids.size} first-page ids${paged ? ' (paged)' : ''}`);
    if (ids.size > 0) live.push({ ...site, firstPage: ids.size, paged });
  } catch (err) {
    console.log(`fail ${String(err.message).slice(0, 80)}`);
  }
}

console.log('\n--- LIVE ---');
console.log(JSON.stringify(live, null, 2));
