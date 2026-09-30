/**
 * Test sheriff domains for BJM roster + SOR markup (same parsers as production scrape).
 * Run: node scripts/probe-bjm-candidates.mjs
 */

import { fetchText } from './lib/mugshot-scrape.mjs';

const CANDIDATES = [
  { id: 'al-autauga-jail', state: 'AL', base: 'https://www.autaugasheriff.org' },
  { id: 'al-baldwin-jail', state: 'AL', base: 'https://www.baldwincosheriff.com' },
  { id: 'al-barbour-jail', state: 'AL', base: 'https://www.barboursheriff.org' },
  { id: 'al-calhoun-jail', state: 'AL', base: 'https://www.calhouncountyso.org' },
  { id: 'al-cherokee-jail', state: 'AL', base: 'https://www.cherokeecounty-al.gov/sheriff' },
  { id: 'al-cleburne-jail', state: 'AL', base: 'https://www.cleburnesheriff.org' },
  { id: 'al-coffee-jail', state: 'AL', base: 'https://www.coffeecountysheriff.org' },
  { id: 'al-colbert-jail', state: 'AL', base: 'https://www.colbertsheriff.net' },
  { id: 'al-conecuh-jail', state: 'AL', base: 'https://www.conecuhsheriff.org' },
  { id: 'al-covington-jail', state: 'AL', base: 'https://www.covingtonsheriff.net' },
  { id: 'al-cullman-jail', state: 'AL', base: 'https://www.cullmansheriff.org' },
  { id: 'al-dale-jail', state: 'AL', base: 'https://www.dalecountysheriff.org' },
  { id: 'al-dekalb-jail', state: 'AL', base: 'https://www.dekalsobs.com' },
  { id: 'al-elmore-jail', state: 'AL', base: 'https://www.elmoreso.org' },
  { id: 'al-escambia-jail', state: 'AL', base: 'https://www.escambiacountysheriffal.org' },
  { id: 'al-etowah-jail', state: 'AL', base: 'https://www.etowahcountysheriff.org' },
  { id: 'al-fayette-jail', state: 'AL', base: 'https://www.fayettesheriff.org' },
  { id: 'al-franklin-jail', state: 'AL', base: 'https://www.franklinsheriff.org' },
  { id: 'al-geneva-jail', state: 'AL', base: 'https://www.genevacountyso.org' },
  { id: 'al-houston-jail', state: 'AL', base: 'https://www.houstoncountysheriffal.com' },
  { id: 'al-jackson-jail', state: 'AL', base: 'https://www.jacksoncountysheriffal.org' },
  { id: 'al-laurel-jail', state: 'AL', base: 'https://www.laurensheriff.org' },
  { id: 'al-limestone-jail', state: 'AL', base: 'https://www.limestonesheriff.com' },
  { id: 'al-marshall-jail', state: 'AL', base: 'https://www.marshallcountysheriffal.org' },
  { id: 'al-mobile-jail', state: 'AL', base: 'https://www.mobileso.com' },
  { id: 'al-monroe-jail', state: 'AL', base: 'https://www.monroecountysheriffal.org' },
  { id: 'al-morgan-jail', state: 'AL', base: 'https://www.morgancountysheriffal.org' },
  { id: 'al-pike-jail', state: 'AL', base: 'https://www.pikecountysheriffal.org' },
  { id: 'al-russell-jail', state: 'AL', base: 'https://www.russellcountysheriff.org' },
  { id: 'al-shelby-jail', state: 'AL', base: 'https://www.shelbyso.com' },
  { id: 'al-talladega-jail', state: 'AL', base: 'https://www.talladegasheriff.com' },
  { id: 'al-tallapoosa-jail', state: 'AL', base: 'https://www.tallapoosasheriff.org' },
  { id: 'al-walker-jail', state: 'AL', base: 'https://www.walkercountysheriff.com' },
  { id: 'al-winston-jail', state: 'AL', base: 'https://www.winstoncountysheriffal.org' },
  { id: 'ar-sebastian-jail', state: 'AR', base: 'https://www.sebastiancountyar.gov/sheriff' },
  { id: 'ar-craighead-jail', state: 'AR', base: 'https://www.craigheadso.org' },
  { id: 'ar-garland-jail', state: 'AR', base: 'https://www.garlandcountysheriff.com' },
  { id: 'ar-pulaski-jail', state: 'AR', base: 'https://www.pcso.org' },
  { id: 'mo-greene-jail', state: 'MO', base: 'https://www.greenecountymosheriff.org' },
];

const cardRe =
  /<img src='([^']*templates\/[^']*\/images\/inmates\/[^']+)'[\s\S]*?href="roster_view\.php\?booking_num=([^"]+)"/gi;

async function probe(site) {
  const out = { jail: 0, sor: false, err: null };
  try {
    const html = await fetchText(`${site.base}/roster.php`);
    let m;
    while ((m = cardRe.exec(html)) !== null) out.jail += 1;
  } catch (err) {
    out.err = err.message;
    return out;
  }
  try {
    const sorHtml = await fetchText(`${site.base}/sex_offenders.php`);
    out.sor = /sex_offender_view\.php\?id=/i.test(sorHtml);
  } catch {
    out.sor = false;
  }
  return out;
}

const ok = [];
for (const site of CANDIDATES) {
  process.stdout.write(`${site.id} ... `);
  const r = await probe(site);
  if (r.err) console.log('fail', r.err.slice(0, 40));
  else if (r.jail >= 3) {
    console.log(`jail cards ${r.jail}, sor=${r.sor}`);
    ok.push({ ...site, sor: r.sor, jailCards: r.jail });
  } else console.log(`weak jail=${r.jail}`);
}

console.log('\n--- WORKING BJM (jail>=3) ---');
console.log(JSON.stringify(ok, null, 2));
