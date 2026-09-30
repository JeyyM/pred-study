import { guessGenderFromName, parseGenderFromBjmSorHtml } from './gender.mjs';
import { parseBjmRosterProfile, parseBjmSorCharge, parseBjmSorProfile } from './profile.mjs';
import { scrapeGreenRoster } from './green-roster.mjs';
import { categorizeCharge, classifyRecord } from './offense.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function extractYear(text) {
  const m = text.match(/\b(20\d{2})\b/);
  if (m) return Number(m[1]);
  const m2 = text.match(/\b(\d{2})[/-](\d{2})[/-](\d{2,4})\b/);
  if (m2) {
    const yr = Number(m2[3].length === 2 ? m2[3] : m2[3]);
    return yr < 100 ? (yr < 50 ? 2000 + yr : 1900 + yr) : yr;
  }
  return new Date().getFullYear() - 3;
}

function cleanOffense(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Charge:\s*/gi, '')
    .trim()
    .slice(0, 4000);
}

export async function fetchText(url, timeoutMs = 22000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function resolveLimit(value) {
  if (value == null || value === Infinity) return Number.POSITIVE_INFINITY;
  return value;
}

function roleMatches(rosterRole, isSexBooking) {
  if (rosterRole === 'all') return true;
  if (rosterRole === 'target') return isSexBooking;
  return !isSexBooking;
}

function parseBjmRosterPage(html, site) {
  const records = [];
  const cardRe =
    /<img src='([^']*templates\/[^']*\/images\/inmates\/[^']+)'[\s\S]*?href="roster_view\.php\?booking_num=([^"]+)"/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const [, relImg, bookingNum] = m;
    records.push({
      bookingNum,
      imageUrl: new URL(relImg, site.base).href,
    });
  }
  return records;
}

async function fetchBjmRosterCharges(site, bookingNum) {
  const html = await fetchText(`${site.base}/roster_view.php?booking_num=${encodeURIComponent(bookingNum)}`);
  const block = html.match(/<span class="text2">([\s\S]*?)<\/span>/i)?.[1] || '';
  const charges = block
    .split(/<br\s*\/?>/i)
    .map((part) => cleanOffense(part))
    .filter(Boolean);
  let offense = charges[0] || 'Pending booking charge';
  let category = categorizeCharge(offense);
  for (const charge of charges) {
    if (categorizeCharge(charge) === 'sex') {
      offense = charge;
      category = 'sex';
      break;
    }
  }
  const bookDateMatch = html.match(/Booking Date:[\s\S]*?inmate_profile_data_content">([^<]+)/i);
  const profile = parseBjmRosterProfile(html);
  return {
    offense,
    year: extractYear(bookDateMatch?.[1] || html),
    category,
    gender: profile.gender,
    name: profile.name,
    age: profile.age,
    race: profile.race,
  };
}

async function collectBjmRosterCards(site) {
  const seen = new Set();
  const cards = [];
  const maxPages = site.pages ?? 50;

  for (let page = 0; page < maxPages; page += 1) {
    const grp = page === 0 ? '' : `?grp=${page * 10}`;
    const html = await fetchText(`${site.base}/roster.php${grp}`);
    const pageCards = parseBjmRosterPage(html, site);
    let newBookingsOnPage = 0;
    for (const card of pageCards) {
      if (seen.has(card.bookingNum)) continue;
      seen.add(card.bookingNum);
      cards.push(card);
      newBookingsOnPage += 1;
    }
    if (pageCards.length === 0) break;
    if (page > 0 && newBookingsOnPage === 0) break;
  }
  return cards;
}

/**
 * @param {'foil' | 'target' | 'all'} rosterRole
 *   foil — non-sex booking mugshots
 *   target — booking charge classified as sex
 *   all — every unique inmate on the public roster (classified after charge parse)
 */
async function scrapeBjmRoster(site, limit = Number.POSITIVE_INFINITY, rosterRole = 'foil') {
  const cards = await collectBjmRosterCards(site);
  const records = [];

  for (const card of cards) {
    try {
      const meta = await fetchBjmRosterCharges(site, card.bookingNum);
      const isSexBooking = meta.category === 'sex';
      if (!roleMatches(rosterRole, isSexBooking)) continue;
      records.push({
        sourceId: site.id,
        sourceState: site.state,
        sourceType: 'county-jail',
        poolRole: isSexBooking ? 'target' : 'foil',
        imageUrl: card.imageUrl,
        sourceInmateImage: inmateImageBasename(card.imageUrl),
        offense: meta.offense,
        category: meta.category,
        year: meta.year,
        gender: meta.gender,
        name: meta.name,
        age: meta.age,
        race: meta.race,
        sourceBookingId: card.bookingNum,
      });
      if (records.length >= limit) return records;
    } catch {
      /* skip bad booking */
    }
    await sleep(80);
  }
  return records;
}

export function inmateImageBasename(imageUrl) {
  try {
    return new URL(imageUrl).pathname.split('/').pop()?.toLowerCase() || '';
  } catch {
    return '';
  }
}

function parseIowaInmateList(html, site) {
  const records = [];
  const blockRe =
    /<img[^>]+src="([^"]*\/inmates\/mugshots\/[^"]+)"[\s\S]*?<h3 class="inmate-first-last-name">([^<]+)<\/h3>[\s\S]*?<div class="inmate-hold-reason">([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = blockRe.exec(html)) !== null) {
    const [, imageUrl, name, chargesRaw] = match;
    const charges = chargesRaw.replace(/<[^>]+>/g, ' ').trim();
    const offense = cleanOffense(charges) || 'Booking charge';
    const category = categorizeCharge(offense);
    records.push({
      sourceId: site.id,
      sourceState: site.state,
      sourceType: 'county-jail',
      poolRole: category === 'sex' ? 'target' : 'foil',
      imageUrl: imageUrl.startsWith('http') ? imageUrl : new URL(imageUrl, site.base).href,
      offense,
      category,
      year: extractYear(charges),
      gender: guessGenderFromName(name),
      name,
    });
  }
  return records;
}

async function scrapeIowa(site) {
  const html = await fetchText(site.base);
  return parseIowaInmateList(html, site);
}

function parseSexOffenderIds(html) {
  const ids = [];
  const re = /sex_offender_view\.php\?id=(\d+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

async function fetchBjmSexOffender(site, id) {
  const html = await fetchText(`${site.base}/sex_offender_view.php?id=${id}`);
  const { offense, additionalInfo } = parseBjmSorCharge(html);
  const rel =
    html.match(/src="(\/?plugins\/show_image\.php\?id=\d+&type=orig)"/i)?.[1] ||
    html.match(/content="(https:\/\/[^"]+\/plugins\/show_image\.php\?id=\d+&type=min200)"/i)?.[1];
  if (!rel) throw new Error('no image');
  const imageUrl = rel.startsWith('http') ? rel.replace('type=min200', 'type=orig') : new URL(rel, site.base).href;
  const profile = parseBjmSorProfile(html);
  const classified = classifyRecord({
    offense,
    additionalInfo,
    sourceType: 'sex-offender-registry',
  });
  return {
    sourceId: site.id,
    sourceState: site.state,
    sourceType: 'sex-offender-registry',
    imageUrl,
    offense,
    additionalInfo,
    category: classified.category,
    year: extractYear(html),
    gender: profile.gender,
    name: profile.name,
    age: profile.age,
    race: profile.race,
    sourceOffenderId: id,
    poolRole: classified.poolRole,
    minorTarget: classified.minorTarget,
    qualifyingMinor: classified.qualifyingMinor,
  };
}

async function collectBjmSorIds(site) {
  const seen = new Set();
  const ids = [];
  const maxPages = site.pages ?? 50;

  for (let page = 0; page < maxPages; page += 1) {
    const grp = page === 0 ? '' : `?grp=${page * 10}`;
    const html = await fetchText(`${site.base}/sex_offenders.php${grp}`);
    const pageIds = parseSexOffenderIds(html);
    let newCount = 0;
    for (const id of pageIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      newCount += 1;
    }
    if (pageIds.length === 0) break;
    if (page > 0 && newCount === 0) break;
  }
  return ids;
}

async function scrapeBjmSexOffenders(site, limit = Number.POSITIVE_INFINITY) {
  const ids = await collectBjmSorIds(site);
  const records = [];
  let skippedFemale = 0;
  for (const id of ids) {
    try {
      const rec = await fetchBjmSexOffender(site, id);
      if (rec?.gender === 'female') {
        skippedFemale += 1;
        continue;
      }
      if (rec) records.push(rec);
      if (records.length >= limit) break;
    } catch {
      /* skip */
    }
    await sleep(80);
  }
  if (skippedFemale) {
    console.log(`  skipped ${skippedFemale} female ${site.id} registrants`);
  }
  return records;
}

function uniqueByImage(records) {
  const seen = new Set();
  return records.filter((r) => {
    const key = r.imageUrl;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** @param {{ rosterRole?: 'foil' | 'target' | 'all', includeSor?: boolean }} options */
export async function scrapeSite(site, options = {}) {
  const rosterRole = options.rosterRole || 'foil';
  if (site.cms === 'bjm-roster') {
    const limit =
      rosterRole === 'all'
        ? resolveLimit(null)
        : rosterRole === 'target'
          ? resolveLimit(site.targetLimit)
          : resolveLimit(site.foilLimit);
    return scrapeBjmRoster(site, limit, rosterRole);
  }
  if (site.cms === 'iowa-roster') {
    const rows = await scrapeIowa(site);
    if (rosterRole === 'all') return rows;
    if (rosterRole === 'target') return rows.filter((row) => row.category === 'sex');
    return rows.filter((row) => row.category !== 'sex');
  }
  if (site.cms === 'green-roster') {
    const limit = rosterRole === 'all' ? resolveLimit(null) : resolveLimit(site.targetLimit ?? site.foilLimit);
    return scrapeGreenRoster(site, fetchText, limit, rosterRole);
  }
  if (site.cms === 'bjm-sor') {
    if (options.includeSor === false) return [];
    return scrapeBjmSexOffenders(site, resolveLimit(site.sorLimit));
  }
  return [];
}

/** Jail booking mugshots for study targets (same look as foils). */
export async function scrapeJailTargets(site) {
  return scrapeSite(site, { rosterRole: 'target' });
}

export async function scrapeSites(sites) {
  let all = [];
  for (const site of sites) {
    try {
      const rows = await scrapeSite(site);
      all = all.concat(rows);
    } catch {
      /* logged by caller */
    }
    await sleep(400);
  }
  return uniqueByImage(all);
}
