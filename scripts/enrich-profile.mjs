/**
 * Backfill name, age, gender, and race on mugshot-pool.json from public sheriff pages.
 * Run: node scripts/enrich-profile.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './lib/age-matching.mjs';
import { parseGreenRosterList } from './lib/green-roster.mjs';
import {
  normalizeOffenseKey,
  parseBjmRosterProfile,
  parseBjmSorCharge,
  parseBjmSorProfile,
} from './lib/profile.mjs';
import { guessGenderFromName } from './lib/gender.mjs';
import {
  BJM_ROSTER_SITES,
  BJM_SOR_SITES,
  GREEN_ROSTER_SITES,
  IOWA_ROSTER_SITES,
} from './lib/sources.mjs';
import { fetchText } from './lib/mugshot-scrape.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const VALIDATED_POOL_PATH = path.join(ROOT, 'src', 'data', 'validated-pool.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function mergeProfile(record, profile) {
  if (!profile) return record;
  const next = { ...record };
  if (profile.name && !next.name) next.name = profile.name;
  if (profile.age != null && next.age == null) next.age = profile.age;
  if (profile.gender && !next.gender) next.gender = profile.gender;
  if (profile.race && !next.race) next.race = profile.race;
  if (profile.sourceBookingId && !next.sourceBookingId) next.sourceBookingId = profile.sourceBookingId;
  return next;
}

function parseBjmRosterCards(html) {
  const cardRe =
    /<img src='([^']*templates\/[^']*\/images\/inmates\/[^']+)'[\s\S]*?href="roster_view\.php\?booking_num=([^"]+)"/gi;
  const cards = [];
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    cards.push({ bookingNum: m[2] });
  }
  return cards;
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

async function buildBjmJailLookup(site, maxProfiles = 80) {
  const byBooking = new Map();
  const byOffense = new Map();
  const seen = new Set();

  for (let page = 0; page < site.pages; page += 1) {
    const grp = page === 0 ? '' : `?grp=${page * 10}`;
    let html;
    try {
      html = await fetchText(`${site.base}/roster.php${grp}`);
    } catch {
      continue;
    }
    const cards = parseBjmRosterCards(html);
    for (const card of cards) {
      if (seen.has(card.bookingNum)) continue;
      seen.add(card.bookingNum);
      try {
        const detail = await fetchText(
          `${site.base}/roster_view.php?booking_num=${encodeURIComponent(card.bookingNum)}`,
        );
        const block = detail.match(/<span class="text2">([\s\S]*?)<\/span>/i)?.[1] || '';
        const offense = block
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .trim();
        const profile = {
          ...parseBjmRosterProfile(detail),
          offense,
          sourceBookingId: card.bookingNum,
        };
        byBooking.set(String(card.bookingNum), profile);
        const key = normalizeOffenseKey(offense);
        if (!byOffense.has(key)) byOffense.set(key, []);
        byOffense.get(key).push(profile);
        if (byBooking.size >= maxProfiles) return { byBooking, byOffense };
      } catch {
        /* skip */
      }
      await sleep(100);
    }
  }
  return { byBooking, byOffense };
}

async function buildBjmSorLookup(site, maxProfiles = 120) {
  const byOffense = new Map();
  let html;
  try {
    html = await fetchText(`${site.base}/sex_offenders.php`);
  } catch {
    return byOffense;
  }
  const ids = parseSexOffenderIds(html).slice(0, maxProfiles);
  for (const id of ids) {
    try {
      const detail = await fetchText(`${site.base}/sex_offender_view.php?id=${id}`);
      const { offense } = parseBjmSorCharge(detail);
      const profile = {
        ...parseBjmSorProfile(detail),
        offense,
        sourceOffenderId: id,
      };
      const key = normalizeOffenseKey(offense);
      if (!byOffense.has(key)) byOffense.set(key, []);
      byOffense.get(key).push(profile);
    } catch {
      /* skip */
    }
    await sleep(120);
  }
  return byOffense;
}

async function buildGreenLookup(site) {
  const byOffense = new Map();
  try {
    const html = await fetchText(site.rosterUrl || `${site.base}/inmate-roster`);
    for (const row of parseGreenRosterList(html, site)) {
      const key = normalizeOffenseKey(row.offense);
      if (!byOffense.has(key)) byOffense.set(key, []);
      byOffense.get(key).push({
        name: row.name,
        age: row.age,
        gender: row.gender,
        offense: row.offense,
        sourceBookingId: row.sourceBookingId,
      });
    }
  } catch {
    /* ignore */
  }
  return byOffense;
}

async function buildIowaLookup(site) {
  const byOffense = new Map();
  try {
    const html = await fetchText(site.base);
    const blockRe =
      /<img[^>]+src="([^"]*\/inmates\/mugshots\/[^"]+)"[\s\S]*?<h3 class="inmate-first-last-name">([^<]+)<\/h3>[\s\S]*?<div class="inmate-hold-reason">([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = blockRe.exec(html)) !== null) {
      const [, , name, chargesRaw] = match;
      const offense = chargesRaw.replace(/<[^>]+>/g, ' ').trim();
      const key = normalizeOffenseKey(offense);
      const profile = {
        name: name.trim(),
        age: null,
        gender: guessGenderFromName(name),
        offense,
      };
      if (!byOffense.has(key)) byOffense.set(key, []);
      byOffense.get(key).push(profile);
    }
  } catch {
    /* ignore */
  }
  return byOffense;
}

function takeFromOffenseMap(byOffense, offense) {
  const key = normalizeOffenseKey(offense);
  const list = byOffense.get(key);
  if (list?.length) return list.shift();

  const tokens = key.split(' ').filter((w) => w.length > 3);
  for (const [candidateKey, bucket] of byOffense.entries()) {
    if (!bucket.length) continue;
    const overlap = tokens.filter((t) => candidateKey.includes(t)).length;
    if (overlap >= Math.min(3, tokens.length)) return bucket.shift();
  }
  return null;
}

async function main() {
  const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const lookups = {
    jail: {},
    sor: {},
    green: {},
    iowa: {},
  };

  for (const site of BJM_ROSTER_SITES) {
    process.stdout.write(`• Jail profiles ${site.id} ... `);
    try {
      lookups.jail[site.id] = await buildBjmJailLookup(site);
      console.log(`${lookups.jail[site.id].byBooking.size} bookings`);
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(300);
  }

  for (const site of BJM_SOR_SITES) {
    process.stdout.write(`• SOR profiles ${site.id} ... `);
    try {
      lookups.sor[site.id] = await buildBjmSorLookup(site);
      console.log(`${lookups.sor[site.id].size} offense keys`);
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(300);
  }

  for (const site of GREEN_ROSTER_SITES) {
    process.stdout.write(`• Green roster ${site.id} ... `);
    lookups.green[site.id] = await buildGreenLookup(site);
    console.log('ok');
  }

  for (const site of IOWA_ROSTER_SITES) {
    process.stdout.write(`• Iowa roster ${site.id} ... `);
    lookups.iowa[site.id] = await buildIowaLookup(site);
    console.log('ok');
  }

  let updated = 0;
  const records = poolData.records.map((record) => {
    let profile = null;

    if (record.sourceBookingId && lookups.jail[record.sourceId]) {
      profile = lookups.jail[record.sourceId].byBooking.get(String(record.sourceBookingId));
    } else if (record.sourceType === 'county-jail' && lookups.jail[record.sourceId]) {
      profile = takeFromOffenseMap(lookups.jail[record.sourceId].byOffense, record.offense);
    } else if (record.sourceType === 'sex-offender-registry' && lookups.sor[record.sourceId]) {
      profile = takeFromOffenseMap(lookups.sor[record.sourceId], record.offense);
    } else if (lookups.green[record.sourceId]) {
      profile = takeFromOffenseMap(lookups.green[record.sourceId], record.offense);
    } else if (lookups.iowa[record.sourceId]) {
      profile = takeFromOffenseMap(lookups.iowa[record.sourceId], record.offense);
    }

    const before = JSON.stringify({ name: record.name, age: record.age, gender: record.gender });
    const next = mergeProfile(record, profile);
    const after = JSON.stringify({ name: next.name, age: next.age, gender: next.gender });
    if (before !== after) updated += 1;
    return next;
  });

  poolData.records = applyAgeMatchingToPool(records);
  poolData.profileEnrichedAt = new Date().toISOString();
  fs.writeFileSync(POOL_PATH, `${JSON.stringify(poolData, null, 2)}\n`, 'utf8');

  if (fs.existsSync(VALIDATED_POOL_PATH)) {
    const validated = JSON.parse(fs.readFileSync(VALIDATED_POOL_PATH, 'utf8'));
    const byImage = new Map(records.map((r) => [r.image, r]));
    validated.records = validated.records.map((row) => {
      const src = byImage.get(row.sourceImage || row.image.replace(/^validated\//, ''));
      if (!src) return row;
      return mergeProfile(row, src);
    });
    validated.updatedAt = poolData.profileEnrichedAt;
    fs.writeFileSync(VALIDATED_POOL_PATH, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
  }

  const withAge = records.filter((r) => r.age != null).length;
  const withGender = records.filter((r) => r.gender === 'male' || r.gender === 'female').length;
  const withName = records.filter((r) => r.name).length;

  console.log(`\nUpdated ${updated} records.`);
  console.log(`Pool now: name=${withName}/${records.length}, age=${withAge}/${records.length}, gender=${withGender}/${records.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
