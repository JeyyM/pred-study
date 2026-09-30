/**
 * Download county sex-offender registry photos only.
 * Split: child-victim charges = targets; other registry charges = adult-sex foils.
 * Females are skipped and pre-rejected.
 *
 *   npm run fetch-sor
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './lib/age-matching.mjs';
import { buildTrials } from './lib/trial-builder.mjs';
import { classifyRecord } from './lib/offense.mjs';
import { scrapeSite } from './lib/mugshot-scrape.mjs';
import { sorScrapeSites } from './lib/sources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');
const DECISIONS_PATH = path.join(ROOT, 'src', 'data', 'validation-decisions.json');
const VALIDATED_PATH = path.join(ROOT, 'src', 'data', 'validated-pool.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function rejectFemales(records) {
  const decisions = {};
  const kept = [];
  const now = new Date().toISOString();
  for (const rec of records) {
    if (rec.gender === 'female') {
      decisions[rec.image] = {
        status: 'rejected',
        rotation: 0,
        note: 'Female — excluded (male-only pool).',
        reviewedAt: now,
      };
      continue;
    }
    kept.push(rec);
  }
  return { kept, decisions };
}

async function collectSorRecords() {
  const all = [];
  const seen = new Set();
  for (const site of sorScrapeSites()) {
    process.stdout.write(`• SOR ${site.id} ... `);
    try {
      const rows = await scrapeSite(site, { includeSor: true });
      const child = rows.filter((r) => r.poolRole === 'target').length;
      const adult = rows.length - child;
      console.log(`${rows.length} male (child ${child}, adult/other ${adult})`);
      for (const row of rows) {
        if (seen.has(row.imageUrl)) continue;
        seen.add(row.imageUrl);
        all.push(row);
      }
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(400);
  }
  return all;
}

async function main() {
  console.log('Fetching county sex-offender registries (child vs adult split, males only)...\n');
  const scraped = await collectSorRecords();
  console.log(`\nUnique registry records: ${scraped.length}`);

  if (fs.existsSync(IMAGE_DIR)) {
    for (const name of fs.readdirSync(IMAGE_DIR)) {
      if (/^(mug-|face-)/i.test(name)) fs.unlinkSync(path.join(IMAGE_DIR, name));
    }
  }
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const downloaded = [];
  for (let i = 0; i < scraped.length; i += 1) {
    const rec = scraped[i];
    const filename = `mug-${String(i + 1).padStart(4, '0')}.jpg`;
    process.stdout.write(`Downloading ${filename} [${rec.sourceId}] ${rec.poolRole} ... `);
    try {
      await downloadImage(rec.imageUrl, path.join(IMAGE_DIR, filename));
      downloaded.push(classifyRecord({ ...rec, image: filename }));
      console.log('ok');
    } catch (err) {
      console.log(`fail (${err.message})`);
    }
    await sleep(180);
  }

  const { kept, decisions } = rejectFemales(downloaded);
  const classified = applyAgeMatchingToPool(kept);

  fs.writeFileSync(
    POOL_PATH,
    `${JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        count: classified.length,
        sources: [...new Set(classified.map((p) => p.sourceId))],
        studyNote:
          'County sex-offender registries only. Targets = child-victim charges. Foils = other registered sex offenders (typically adult-victim). Females skipped/rejected. Same photo style within registry.',
        records: classified.map(({ imageUrl, ...rest }) => rest),
      },
      null,
      2,
    )}\n`,
  );

  fs.writeFileSync(DECISIONS_PATH, `${JSON.stringify({ updatedAt: new Date().toISOString(), decisions }, null, 2)}\n`);
  fs.writeFileSync(VALIDATED_PATH, `${JSON.stringify({ updatedAt: new Date().toISOString(), count: 0, records: [] }, null, 2)}\n`);

  let trials = [];
  try {
    trials = buildTrials(classified);
  } catch (err) {
    console.warn(`Trial build: ${err.message}`);
  }

  fs.writeFileSync(
    TRIALS_PATH,
    JSON.stringify(
      {
        meta: {
          version: 11,
          description:
            'Registry-only 3AFC. One child-victim sex offense vs two other registered sex offenders. Male only.',
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

  const childN = classified.filter((p) => p.category === 'sex').length;
  const adultN = classified.filter((p) => p.category === 'sex-adult').length;
  console.log(`\nSaved ${classified.length} male registry photos`);
  console.log(`Child-victim targets: ${childN}`);
  console.log(`Adult/other sex foils: ${adultN}`);
  console.log(`Pre-rejected females: ${Object.keys(decisions).length}`);
  console.log(`Trials: ${trials.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
