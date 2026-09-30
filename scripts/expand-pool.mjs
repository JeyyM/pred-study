/**
 * Append mugshots from new sheriff sources without deleting existing pool images.
 * Run: node scripts/expand-pool.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTrials } from './lib/trial-builder.mjs';
import { classifyRecord } from './lib/offense.mjs';
import { inmateImageBasename, scrapeSite } from './lib/mugshot-scrape.mjs';
import { expandScrapeSites } from './lib/sources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadPool() {
  if (!fs.existsSync(POOL_PATH)) {
    return { fetchedAt: null, count: 0, sources: [], records: [] };
  }
  return JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
}

function maxMugIndex(records) {
  let max = 0;
  for (const rec of records) {
    const n = parseInt(String(rec.image).replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

async function downloadImage(url, destPath) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*',
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 900) throw new Error('Image too small');
    fs.writeFileSync(destPath, buf);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const existing = loadPool();
  const existingKeys = new Set();
  for (const r of existing.records) {
    existingKeys.add(`${r.sourceId}|${r.sourceBookingId || ''}|${r.sourceInmateImage || ''}`);
    existingKeys.add(`${r.sourceId}|${r.image}|${r.offense}`);
  }

  console.log('Expanding pool from new sources (existing images kept)...\n');
  const sites = expandScrapeSites();
  let scraped = [];

  for (const site of sites) {
    const isJail = site.cms === 'bjm-roster' || site.cms === 'green-roster' || site.cms === 'iowa-roster';
    if (isJail) {
      process.stdout.write(`• Jail roster ${site.id} ... `);
      try {
        const rows = await scrapeSite(site, { rosterRole: 'all' });
        console.log(`${rows.length} scraped`);
        scraped = scraped.concat(rows);
      } catch (err) {
        console.log(`fail (${err.message})`);
      }
      await sleep(400);
      continue;
    }
    process.stdout.write(`• Full SOR ${site.id} ... `);
    try {
      const rows = await scrapeSite(site, { includeSor: true });
      console.log(`${rows.length} scraped`);
      scraped = scraped.concat(rows);
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(400);
  }

  const seenUrl = new Set();
  scraped = scraped.filter((row) => {
    const inmateImg = inmateImageBasename(row.imageUrl);
    const bookingKey = `${row.sourceId}|${row.sourceBookingId || ''}|${inmateImg}`;
    if (existingKeys.has(bookingKey)) return false;
    const legacyKey = `${row.sourceId}|${row.sourceBookingId || row.name || row.imageUrl}|${row.offense}`;
    if (existingKeys.has(legacyKey)) return false;
    if (seenUrl.has(row.imageUrl)) return false;
    seenUrl.add(row.imageUrl);
    row.sourceInmateImage = inmateImg;
    return true;
  });

  if (!scraped.length) {
    console.log('\nNo new records to add (sites may be blocked or already in pool).');
    return;
  }

  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  let index = maxMugIndex(existing.records);
  const added = [];

  for (const rec of scraped) {
    index += 1;
    const filename = `mug-${String(index).padStart(4, '0')}.jpg`;
    const dest = path.join(IMAGE_DIR, filename);
    process.stdout.write(`Downloading ${filename} [${rec.sourceId}] ... `);
    try {
      await downloadImage(rec.imageUrl, dest);
      added.push(classifyRecord({ ...rec, image: filename }));
      console.log('ok');
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(180);
  }

  if (!added.length) {
    console.log('\nScrape succeeded but no images downloaded.');
    return;
  }

  const merged = [...existing.records, ...added.map(({ imageUrl, ...rest }) => rest)];
  const payload = {
    fetchedAt: new Date().toISOString(),
    count: merged.length,
    sources: [...new Set(merged.map((p) => p.sourceId))],
    records: merged,
  };
  fs.writeFileSync(POOL_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const trials = buildTrials(merged);
  fs.writeFileSync(
    TRIALS_PATH,
    JSON.stringify(
      {
        meta: {
          version: 5,
          description: payload.sources.length + ' sheriff sources (AL, AR, MO, IA, TX).',
          sourceCount: payload.sources.length,
          fetchedAt: payload.fetchedAt,
        },
        trials,
      },
      null,
      2,
    ),
  );

  console.log(`\nAdded ${added.length} records (${merged.length} total).`);
  console.log(`Sources: ${payload.sources.join(', ')}`);
  console.log('Rebuild validation queue in the app (refresh /validation).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
