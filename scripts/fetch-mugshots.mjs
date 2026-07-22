/**
 * Download real public mugshots from many sheriff jurisdictions.
 * Run: node scripts/fetch-mugshots.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  guessGenderFromName,
  parseGenderFromBjmRosterHtml,
  parseGenderFromBjmSorHtml,
} from './lib/gender.mjs';
import { buildTrials } from './lib/trial-builder.mjs';
import { decodeOffenseText, isQualifyingMinorSexOffense } from './lib/offense-qualify.mjs';
import { isFaceVisible } from './lib/face-visible.mjs';
import { normalizeDownloadedImage } from './lib/normalize-image.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const BJM_ROSTER_SITES = [
  { id: 'al-chilton-jail', state: 'AL', base: 'https://www.chiltoncountyso.org', pages: 3 },
  { id: 'ar-logan-jail', state: 'AR', base: 'https://www.loganso.com', pages: 3 },
  { id: 'mo-stone-jail', state: 'MO', base: 'https://www.stonecountymosheriff.com', pages: 3 },
  { id: 'al-pickens-jail', state: 'AL', base: 'https://www.pcsoal.org', pages: 3 },
];

const BJM_SOR_SITES = [
  { id: 'al-chilton-sor', state: 'AL', base: 'https://www.chiltoncountyso.org' },
  { id: 'ar-logan-sor', state: 'AR', base: 'https://www.loganso.com' },
  { id: 'al-pickens-sor', state: 'AL', base: 'https://www.pcsoal.org' },
];

const IOwa_SITES = [
  { id: 'ia-winneshiek-jail', state: 'IA', base: 'https://winneshiekcounty.iowa.gov/departments/sheriff/current-inmates' },
];

const SEX_PATTERNS =
  /\b(sexual|sex offender|rape|sodomy|molest|lewd|indecent|child.*(sex|porn|abuse|molest)|exploitation of a minor|solicit.*minor|aggravated sexual|criminal sexual|sex act|sex abuse)\b/i;

const CATEGORY_RULES = [
  ['sex', SEX_PATTERNS],
  ['drug', /\b(drug|narcotic|meth|marijuana|cannabis|cocaine|heroin|controlled substance|paraphernalia)\b/i],
  ['traffic', /\b(dui|dwi|ovi|owi|driving|traffic|vehicular|license|speeding|hit and run|seatbelt|red light)\b/i],
  ['financial', /\b(fraud|forgery|identity theft|embezzlement|counterfeit|wire fraud|credit card|check)\b/i],
  ['property', /\b(theft|burglary|robbery|larceny|shoplift|arson|vandal|trespass|breaking)\b/i],
  ['violent', /\b(assault|battery|murder|manslaughter|kidnap|domestic|contempt)\b/i],
  ['weapons', /\b(weapon|firearm|gun|contraband)\b/i],
  ['misdemeanor', /\b(disorderly|intoxication|misdemeanor|public)\b/i],
];

function categorizeCharge(text, forceSex = false) {
  if (forceSex || SEX_PATTERNS.test(text)) return 'sex';
  for (const [category, pattern] of CATEGORY_RULES) {
    if (category === 'sex') continue;
    if (pattern.test(text)) return category;
  }
  return 'violent';
}

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
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/Charge:\s*/gi, '')
    .trim()
    .slice(0, 140);
}

async function fetchText(url, timeoutMs = 22000) {
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

async function downloadImage(url, destPath) {
  const absolute = url.startsWith('http') ? url : null;
  if (!absolute) throw new Error('Relative URL unresolved');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(absolute, {
      headers: { 'User-Agent': UA, Accept: 'image/*,*/*' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 900) throw new Error('Image too small');
    const normalized = await normalizeDownloadedImage(buf, path.basename(destPath));
    fs.writeFileSync(destPath, normalized);
    return true;
  } finally {
    clearTimeout(timer);
  }
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
  const offense = charges[0] || 'Pending booking charge';
  const bookDateMatch = html.match(/Booking Date:[\s\S]*?inmate_profile_data_content">([^<]+)/i);
  return {
    offense,
    year: extractYear(bookDateMatch?.[1] || html),
    category: categorizeCharge(offense),
    gender: parseGenderFromBjmRosterHtml(html),
  };
}

async function scrapeBjmRoster(site, limit = 12) {
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
        const meta = await fetchBjmRosterCharges(site, card.bookingNum);
        if (meta.category === 'sex') continue;
        records.push({
          sourceId: site.id,
          sourceState: site.state,
          sourceType: 'county-jail',
          imageUrl: card.imageUrl,
          offense: meta.offense,
          category: meta.category,
          year: meta.year,
          gender: meta.gender,
        });
        if (records.length >= limit) return records;
      } catch {
        /* skip bad booking */
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
    const [, imageUrl, name, chargesRaw] = match;
    const charges = chargesRaw.replace(/<[^>]+>/g, ' ').trim();
    const offense = cleanOffense(charges) || 'Booking charge';
    records.push({
      sourceId: site.id,
      sourceState: site.state,
      sourceType: 'county-jail',
      imageUrl: imageUrl.startsWith('http') ? imageUrl : new URL(imageUrl, site.base).href,
      offense,
      category: categorizeCharge(offense),
      year: extractYear(charges),
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

async function fetchBjmSexOffender(site, id) {
  const html = await fetchText(`${site.base}/sex_offender_view.php?id=${id}`);
  const ogDesc = html.match(/property="og:description" content="([^"]+)"/i)?.[1];
  const levelBlock = html.match(/class="level_1"[^>]*>\s*<p>([\s\S]*?)<\/p>/i)?.[1];
  const offense = cleanOffense(decodeOffenseText(levelBlock || ogDesc || 'Sex offense'));
  if (!isQualifyingMinorSexOffense(offense)) {
    throw new Error('not a qualifying minor-victim offense');
  }
  const rel =
    html.match(/src="(\/?plugins\/show_image\.php\?id=\d+&type=orig)"/i)?.[1] ||
    html.match(/content="(https:\/\/[^"]+\/plugins\/show_image\.php\?id=\d+&type=min200)"/i)?.[1];
  if (!rel) throw new Error('no image');
  const imageUrl = rel.startsWith('http') ? rel.replace('type=min200', 'type=orig') : new URL(rel, site.base).href;
  const gender = parseGenderFromBjmSorHtml(html);
  if (!gender) throw new Error('no gender');
  const candidate = {
    sourceId: site.id,
    sourceState: site.state,
    sourceType: 'sex-offender-registry',
    imageUrl,
    offense,
    category: 'sex',
    qualifyingMinor: true,
    year: extractYear(html),
    gender,
  };
  if (!isFaceVisible(candidate)) {
    throw new Error('face obscured');
  }
  return candidate;
}

async function scrapeBjmSexOffenders(site, limit = 8) {
  const html = await fetchText(`${site.base}/sex_offenders.php`);
  const ids = parseSexOffenderIds(html);
  const records = [];
  for (const id of ids) {
    try {
      records.push(await fetchBjmSexOffender(site, id));
      if (records.length >= limit) break;
    } catch {
      /* skip non-qualifying or broken records */
    }
    await sleep(150);
  }
  return records;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function buildPool() {
  console.log('Fetching mugshots from multiple sheriff jurisdictions...\n');
  let all = [];

  for (const site of BJM_ROSTER_SITES) {
    process.stdout.write(`• Jail roster ${site.id} ... `);
    try {
      const rows = await scrapeBjmRoster(site, 14);
      console.log(`${rows.length} records`);
      all = all.concat(rows);
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(400);
  }

  for (const site of IOwa_SITES) {
    process.stdout.write(`• Jail roster ${site.id} ... `);
    try {
      const rows = await scrapeIowa(site);
      console.log(`${rows.length} records`);
      all = all.concat(rows);
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
  }

  for (const site of BJM_SOR_SITES) {
    process.stdout.write(`• Sex offender registry ${site.id} ... `);
    try {
      const rows = await scrapeBjmSexOffenders(site, 18);
      console.log(`${rows.length} records`);
      all = all.concat(rows);
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(400);
  }

  all = uniqueByImage(all);
  console.log(`\nUnique records scraped: ${all.length}`);

  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const legacy = fs.readdirSync(IMAGE_DIR).filter((f) => f.startsWith('mug-') || f.startsWith('face-'));
  for (const f of legacy) {
    try {
      fs.unlinkSync(path.join(IMAGE_DIR, f));
    } catch {
      /* ignore */
    }
  }

  const downloaded = [];
  for (let i = 0; i < all.length; i += 1) {
    const rec = all[i];
    let ext = path.extname(new URL(rec.imageUrl).pathname).toLowerCase();
    if (!ext || ext === '.php' || ext.length > 5) ext = '.jpg';
    const filename = `mug-${String(i + 1).padStart(3, '0')}${ext}`;
    const dest = path.join(IMAGE_DIR, filename);
    process.stdout.write(`Downloading ${filename} [${rec.sourceId}] ... `);
    try {
      await downloadImage(rec.imageUrl, dest);
      downloaded.push({ ...rec, image: filename });
      console.log('ok');
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(180);
  }

  return downloaded;
}

async function main() {
  const pool = await buildPool();

  if (pool.length < 30) {
    console.error(`\nOnly ${pool.length} images downloaded (need ~30+). Re-run script or check network.`);
    process.exit(1);
  }

  fs.writeFileSync(
    POOL_PATH,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        count: pool.length,
        sources: [...new Set(pool.map((p) => p.sourceId))],
        records: pool.map(({ imageUrl, ...rest }) => rest),
      },
      null,
      2,
    ),
  );

  const trials = buildTrials(pool);
  const payload = {
    meta: {
      version: 5,
      description:
        'Real public booking and registry photos from multiple sheriff offices (AL, AR, MO, IA). Each trial uses three people of the same gender. Trials prefer different source jurisdictions within each round to reduce jail-background confounds.',
      sourceCount: new Set(pool.map((p) => p.sourceId)).size,
      fetchedAt: new Date().toISOString(),
    },
    trials,
  };

  fs.writeFileSync(TRIALS_PATH, JSON.stringify(payload, null, 2));

  console.log(`\nSaved ${pool.length} images -> public/images/`);
  console.log(`Built ${trials.length} trials -> src/data/trials.json`);
  console.log(`Jurisdictions: ${payload.meta.sourceCount}`);
  console.log(`Sex-offense photos: ${pool.filter((p) => p.category === 'sex').length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
