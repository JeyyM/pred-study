/**
 * Backfill gender on mugshot-pool.json by re-scraping public sheriff pages.
 * Run: node scripts/enrich-gender.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  guessGenderFromName,
  parseGenderFromBjmRosterHtml,
  parseGenderFromBjmSorHtml,
} from './lib/gender.mjs';
import { BJM_ROSTER_SITES, BJM_SOR_SITES, IOWA_ROSTER_SITES } from './lib/sources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const IOwa_SITES = IOWA_ROSTER_SITES;

const SEX_PATTERNS =
  /\b(sexual|sex offender|rape|sodomy|molest|lewd|indecent|child.*(sex|porn|abuse|molest)|exploitation of a minor|solicit.*minor|aggravated sexual|criminal sexual|sex act|sex abuse)\b/i;

function categorizeCharge(text) {
  if (SEX_PATTERNS.test(text)) return 'sex';
  return 'other';
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseBjmRosterPage(html, site) {
  const records = [];
  const cardRe =
    /<img src='([^']*templates\/[^']*\/images\/inmates\/[^']+)'[\s\S]*?href="roster_view\.php\?booking_num=([^"]+)"/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    records.push({ bookingNum: m[2] });
  }
  return records;
}

async function scrapeBjmRosterGenders(site, limit = 14) {
  const seen = new Set();
  const records = [];

  for (let page = 0; page < site.pages; page += 1) {
    const grp = page === 0 ? '' : `?grp=${page * 10}`;
    const html = await fetchText(`${site.base}/roster.php${grp}`);
    const cards = parseBjmRosterPage(html, site);

    for (const card of cards) {
      if (seen.has(card.bookingNum)) continue;
      seen.add(card.bookingNum);
      try {
        const detail = await fetchText(`${site.base}/roster_view.php?booking_num=${encodeURIComponent(card.bookingNum)}`);
        const block = detail.match(/<span class="text2">([\s\S]*?)<\/span>/i)?.[1] || '';
        const charges = block.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').trim();
        if (categorizeCharge(charges) === 'sex') continue;
        const gender = parseGenderFromBjmRosterHtml(detail);
        records.push({ sourceId: site.id, gender });
        if (records.length >= limit) return records;
      } catch {
        /* skip */
      }
      await sleep(120);
    }
  }
  return records;
}

function parseIowaInmateList(html, site) {
  const records = [];
  const blockRe =
    /<img[^>]+src="([^"]*\/inmates\/mugshots\/[^"]+)"[\s\S]*?<h3 class="inmate-first-last-name">([^<]+)<\/h3>[\s\S]*?<div class="inmate-hold-reason">([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = blockRe.exec(html)) !== null) {
    const [, , name, chargesRaw] = match;
    const charges = chargesRaw.replace(/<[^>]+>/g, ' ').trim();
    if (categorizeCharge(charges) === 'sex') continue;
    records.push({
      sourceId: site.id,
      gender: guessGenderFromName(name),
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

async function scrapeBjmSexOffenderGenders(site, limit = 6) {
  const html = await fetchText(`${site.base}/sex_offenders.php`);
  const ids = parseSexOffenderIds(html).slice(0, limit + 4);
  const records = [];
  for (const id of ids) {
    try {
      const detail = await fetchText(`${site.base}/sex_offender_view.php?id=${id}`);
      records.push({
        sourceId: site.id,
        gender: parseGenderFromBjmSorHtml(detail),
      });
      if (records.length >= limit) break;
    } catch {
      /* skip */
    }
    await sleep(150);
  }
  return records;
}

async function scrapeAllGenders() {
  const bySource = {};

  for (const site of BJM_ROSTER_SITES) {
    process.stdout.write(`• Gender ${site.id} ... `);
    try {
      bySource[site.id] = await scrapeBjmRosterGenders(site, 14);
      console.log(`${bySource[site.id].length} records`);
    } catch (err) {
      console.log(`fail (${err.message})`);
      bySource[site.id] = [];
    }
    await sleep(400);
  }

  for (const site of IOwa_SITES) {
    process.stdout.write(`• Gender ${site.id} ... `);
    try {
      bySource[site.id] = await scrapeIowa(site);
      console.log(`${bySource[site.id].length} records`);
    } catch (err) {
      console.log(`fail (${err.message})`);
      bySource[site.id] = [];
    }
  }

  for (const site of BJM_SOR_SITES) {
    process.stdout.write(`• Gender ${site.id} ... `);
    try {
      bySource[site.id] = await scrapeBjmSexOffenderGenders(site, 6);
      console.log(`${bySource[site.id].length} records`);
    } catch (err) {
      console.log(`fail (${err.message})`);
      bySource[site.id] = [];
    }
    await sleep(400);
  }

  return bySource;
}

function imageSortKey(image) {
  const n = parseInt(String(image).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function applyGenders(poolRecords, bySource) {
  const grouped = {};
  for (const rec of poolRecords) {
    if (!grouped[rec.sourceId]) grouped[rec.sourceId] = [];
    grouped[rec.sourceId].push(rec);
  }

  for (const sourceId of Object.keys(grouped)) {
    grouped[sourceId].sort((a, b) => imageSortKey(a.image) - imageSortKey(b.image));
    const scraped = bySource[sourceId] || [];
    const n = Math.min(grouped[sourceId].length, scraped.length);
    for (let i = 0; i < n; i += 1) {
      if (scraped[i].gender) grouped[sourceId][i].gender = scraped[i].gender;
    }
  }

  return poolRecords;
}

async function main() {
  const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const bySource = await scrapeAllGenders();
  const records = applyGenders(poolData.records, bySource);

  const withGender = records.filter((r) => r.gender === 'male' || r.gender === 'female');
  const male = withGender.filter((r) => r.gender === 'male').length;
  const female = withGender.filter((r) => r.gender === 'female').length;
  const missing = records.length - withGender.length;

  poolData.records = records;
  poolData.genderEnrichedAt = new Date().toISOString();
  fs.writeFileSync(POOL_PATH, JSON.stringify(poolData, null, 2));

  console.log(`\nUpdated ${withGender.length}/${records.length} records with gender (male=${male}, female=${female}, missing=${missing})`);
  if (missing) {
    console.warn('Some records lack gender — same-gender trials may fail until re-run or re-fetch.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
