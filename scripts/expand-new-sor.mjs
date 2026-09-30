/**
 * Append new BJM SOR sources only if they have both child-victim and adult/other records.
 * Does not wipe images or keep/reject decisions.
 *
 *   node scripts/expand-new-sor.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './lib/age-matching.mjs';
import { classifyRecord } from './lib/offense.mjs';
import { scrapeSite } from './lib/mugshot-scrape.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');

const CANDIDATES = [
  { id: 'al-cherokee-sor', state: 'AL', base: 'https://www.cherokeecountyalsheriff.com' },
  { id: 'ar-boone-sor', state: 'AR', base: 'https://www.boonesheriff.com' },
  { id: 'ar-hempstead-sor', state: 'AR', base: 'https://www.hempsteadcountysheriff.org' },
  { id: 'ar-marion-sor', state: 'AR', base: 'https://www.marioncountysheriffar.gov' },
  { id: 'ar-phillips-sor', state: 'AR', base: 'https://www.phillipscountysheriffar.org' },
  { id: 'ms-tishomingo-sor', state: 'MS', base: 'https://www.tishso.org' },
  { id: 'ms-lauderdale-sor', state: 'MS', base: 'https://www.lauderdaleso.org' },
  { id: 'ok-mayes-sor', state: 'OK', base: 'https://www.mayessheriff.org' },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadPool() {
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

function splitRoles(rows) {
  const child = rows.filter((r) => r.poolRole === 'target' || r.category === 'sex');
  const adult = rows.filter((r) => r.poolRole !== 'target' && r.category !== 'sex');
  return { child, adult };
}

const existing = loadPool();
const existingKeys = new Set(
  (existing.records || []).map((r) => `${r.sourceId}|${r.sourceOffenderId || ''}`),
);

const accepted = [];
console.log('Checking new registries for both child-victim and adult/other charges...\n');

for (const raw of CANDIDATES) {
  const site = { ...raw, cms: 'bjm-sor', pages: 200 };
  process.stdout.write(`• ${site.id} ... `);
  try {
    const rows = await scrapeSite(site, { includeSor: true });
    const { child, adult } = splitRoles(rows);
    if (!child.length || !adult.length) {
      console.log(
        `${rows.length} male — skip (child ${child.length}, adult/other ${adult.length})`,
      );
      continue;
    }
    console.log(`${rows.length} male — keep (child ${child.length}, adult/other ${adult.length})`);
    accepted.push({ site, rows });
  } catch (err) {
    console.log(`fail (${err.message})`);
  }
  await sleep(400);
}

if (!accepted.length) {
  console.log('\nNo new registries had both groups.');
  process.exit(0);
}

fs.mkdirSync(IMAGE_DIR, { recursive: true });
let index = maxMugIndex(existing.records);
const added = [];

for (const { site, rows } of accepted) {
  for (const rec of rows) {
    const key = `${rec.sourceId}|${rec.sourceOffenderId || ''}`;
    if (existingKeys.has(key) || existingKeys.has(`${rec.sourceId}|${rec.imageUrl}`)) continue;
    index += 1;
    const filename = `mug-${String(index).padStart(4, '0')}.jpg`;
    process.stdout.write(`Downloading ${filename} [${site.id}] ${rec.poolRole} ... `);
    try {
      await downloadImage(rec.imageUrl, path.join(IMAGE_DIR, filename));
      added.push(
        classifyRecord({
          ...rec,
          image: filename,
        }),
      );
      existingKeys.add(key);
      console.log('ok');
    } catch (err) {
      console.log(`fail (${err.message})`);
      index -= 1;
    }
    await sleep(160);
  }
}

if (!added.length) {
  console.log('\nQualified sites were already in the pool or images failed.');
  process.exit(0);
}

const aged = applyAgeMatchingToPool(added);
const merged = [...existing.records, ...aged.map(({ imageUrl, ...rest }) => rest)];
fs.writeFileSync(
  POOL_PATH,
  `${JSON.stringify(
    {
      ...existing,
      fetchedAt: new Date().toISOString(),
      count: merged.length,
      sources: [...new Set(merged.map((p) => p.sourceId))],
      records: merged,
    },
    null,
    2,
  )}\n`,
);

const childN = merged.filter((p) => p.poolRole === 'target' || p.category === 'sex').length;
const adultN = merged.length - childN;
console.log(`\nAdded ${aged.length} photos from ${accepted.map((a) => a.site.id).join(', ')}`);
console.log(`Bank now: ${merged.length} total, ${childN} child-victim, ${adultN} adult/other`);
console.log('Keep/reject decisions were not reset.');
