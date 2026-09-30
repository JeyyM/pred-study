/**
 * Download real public mugshots from many sheriff jurisdictions.
 * Run: node scripts/fetch-mugshots.mjs
 *
 * Warning: replaces all mug-*.jpg in public/images/. To add sources without wiping,
 * use: node scripts/expand-pool.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './lib/age-matching.mjs';
import { buildTrials } from './lib/trial-builder.mjs';
import { classifyRecord } from './lib/offense.mjs';
import { scrapeSite } from './lib/mugshot-scrape.mjs';
import { allScrapeSites } from './lib/sources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextMugFilename(index) {
  return `mug-${String(index).padStart(4, '0')}.jpg`;
}

async function downloadRecords(records, startIndex = 1) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
  const downloaded = [];
  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    let ext = path.extname(new URL(rec.imageUrl).pathname).toLowerCase();
    if (!ext || ext === '.php' || ext.length > 5) ext = '.jpg';
    const filename = nextMugFilename(startIndex + i).replace(/\.jpg$/, ext === '.jpg' ? '.jpg' : ext);
    const dest = path.join(IMAGE_DIR, filename);
    process.stdout.write(`Downloading ${filename} [${rec.sourceId}] ... `);
    try {
      await downloadImage(rec.imageUrl, dest);
      downloaded.push(classifyRecord({ ...rec, image: filename }));
      console.log('ok');
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(180);
  }
  return downloaded;
}

async function collectScrapedRecords(sites) {
  let all = [];
  const seen = new Set();
  const pushRows = (rows) => {
    for (const row of rows) {
      if (seen.has(row.imageUrl)) continue;
      seen.add(row.imageUrl);
      all.push(row);
    }
  };

  for (const site of sites) {
    const isJail = site.cms === 'bjm-roster' || site.cms === 'green-roster' || site.cms === 'iowa-roster';
    if (isJail) {
      process.stdout.write(`• Jail roster ${site.id} ... `);
      try {
        const rows = await scrapeSite(site, { rosterRole: 'all' });
        const targets = rows.filter((r) => r.poolRole === 'target').length;
        const foils = rows.length - targets;
        console.log(`${rows.length} records (${targets} sex targets, ${foils} foils)`);
        pushRows(rows);
      } catch (err) {
        console.log(`fail (${err.message})`);
      }
      await sleep(400);
      continue;
    }
    if (site.cms === 'bjm-sor') {
      process.stdout.write(`• Full SOR ${site.id} ... `);
      try {
        const rows = await scrapeSite(site, { includeSor: true });
        console.log(`${rows.length} records`);
        pushRows(rows);
      } catch (err) {
        console.log(`fail (${err.message})`);
      }
      await sleep(400);
    }
  }
  return all;
}

async function buildPool() {
  console.log('Fetching mugshots from multiple sheriff jurisdictions...\n');
  const all = await collectScrapedRecords(allScrapeSites());
  console.log(`\nUnique records scraped: ${all.length}`);

  const legacy = fs.readdirSync(IMAGE_DIR).filter((f) => f.startsWith('mug-') || f.startsWith('face-'));
  for (const f of legacy) {
    try {
      fs.unlinkSync(path.join(IMAGE_DIR, f));
    } catch {
      /* ignore */
    }
  }

  return downloadRecords(all, 1);
}

async function main() {
  const pool = await buildPool();

  if (pool.length < 20) {
    console.error(`\nOnly ${pool.length} images downloaded (need ~20+). Re-run script or check network.`);
    process.exit(1);
  }

  const classified = applyAgeMatchingToPool(pool);
  const poolPayload = {
    fetchedAt: new Date().toISOString(),
    count: classified.length,
    sources: [...new Set(classified.map((p) => p.sourceId))],
    studyNote:
      'Full public jail rosters (poolRole target/foil from booking charges) plus full county SOR lists (registry photos). Groups stay separate in /validation. Not a county internal database. Prior pools: archive/pre-overhaul-*',
    records: classified.map(({ imageUrl, ...rest }) => rest),
  };
  fs.writeFileSync(POOL_PATH, `${JSON.stringify(poolPayload, null, 2)}\n`, 'utf8');

  const emptyValidation = { updatedAt: new Date().toISOString(), decisions: {} };
  fs.writeFileSync(path.join(ROOT, 'src', 'data', 'validation-decisions.json'), `${JSON.stringify(emptyValidation, null, 2)}\n`);
  fs.writeFileSync(
    path.join(ROOT, 'src', 'data', 'validated-pool.json'),
    `${JSON.stringify({ updatedAt: poolPayload.fetchedAt, count: 0, records: [] }, null, 2)}\n`,
  );

  const trials = buildTrials(classified);
  if (trials.length < 18) {
    console.warn(
      `\nWarning: only ${trials.length} trial(s) (need 18). Public rosters may still have few sex bookings.`,
    );
  }
  fs.writeFileSync(
    TRIALS_PATH,
    JSON.stringify(
      {
        meta: {
          version: 7,
          description:
            'Full public jail rosters plus county sex-offender registry lists. Validation splits jail foils, jail sex bookings, and registry photos. Same-gender 3AFC lineups.',
          sourceCount: new Set(classified.map((p) => p.sourceId)).size,
          trialCount: trials.length,
          fetchedAt: new Date().toISOString(),
        },
        trials,
      },
      null,
      2,
    ),
  );

  console.log(`\nSaved ${classified.length} images -> public/images/`);
  console.log(`Built ${trials.length} trials -> src/data/trials.json`);
  console.log(`Jurisdictions: ${new Set(classified.map((p) => p.sourceId)).size}`);
  console.log(`Jail sex bookings: ${classified.filter((p) => p.category === 'sex' && p.sourceType === 'county-jail').length}`);
  console.log(`Registry photos: ${classified.filter((p) => p.sourceType === 'sex-offender-registry').length}`);
  console.log(`Jail foils: ${classified.filter((p) => p.poolRole === 'foil').length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
