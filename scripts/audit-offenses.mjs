/**
 * Re-tag mugshot pool offenses and scrape additional qualifying sex targets if needed.
 * Run: node scripts/audit-offenses.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decodeOffenseText, isQualifyingMinorSexOffense } from './lib/offense-qualify.mjs';
import { parseGenderFromBjmSorHtml } from './lib/gender.mjs';
import { buildTrials } from './lib/trial-builder.mjs';
import { applyFaceVisibility } from './lib/face-visible.mjs';
import { normalizeDownloadedImage } from './lib/normalize-image.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const BJM_SOR_SITES = [
  { id: 'al-chilton-sor', state: 'AL', base: 'https://www.chiltoncountyso.org' },
  { id: 'ar-logan-sor', state: 'AR', base: 'https://www.loganso.com' },
  { id: 'al-pickens-sor', state: 'AL', base: 'https://www.pcsoal.org' },
];

function cleanOffense(text) {
  return decodeOffenseText(text).replace(/Charge:\s*/gi, '').slice(0, 160);
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function downloadImage(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 900) throw new Error('Image too small');
  const normalized = await normalizeDownloadedImage(buf, path.basename(destPath));
  fs.writeFileSync(destPath, normalized);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

function extractYear(html) {
  const m = html.match(/\b(20\d{2})\b/);
  if (m) return Number(m[1]);
  return new Date().getFullYear() - 5;
}

async function fetchQualifyingOffender(site, id) {
  const html = await fetchText(`${site.base}/sex_offender_view.php?id=${id}`);
  const ogDesc = html.match(/property="og:description" content="([^"]+)"/i)?.[1];
  const levelBlock = html.match(/class="level_1"[^>]*>\s*<p>([\s\S]*?)<\/p>/i)?.[1];
  const offense = cleanOffense(levelBlock || ogDesc || '');
  if (!isQualifyingMinorSexOffense(offense)) return null;

  const rel =
    html.match(/src="(\/?plugins\/show_image\.php\?id=\d+&type=orig)"/i)?.[1] ||
    html.match(/content="(https:\/\/[^"]+\/plugins\/show_image\.php\?id=\d+&type=min200)"/i)?.[1];
  if (!rel) return null;

  const imageUrl = rel.startsWith('http') ? rel.replace('type=min200', 'type=orig') : new URL(rel, site.base).href;
  return {
    sourceId: site.id,
    sourceState: site.state,
    sourceType: 'sex-offender-registry',
    offense,
    category: 'sex',
    qualifyingMinor: true,
    year: extractYear(html),
    gender: parseGenderFromBjmSorHtml(html),
    registryId: id,
    imageUrl,
  };
}

function retagRecord(rec) {
  const offense = cleanOffense(rec.offense);
  const qualifying = isQualifyingMinorSexOffense(offense);
  const base = {
    ...rec,
    offense,
    qualifyingMinor: qualifying,
    category: rec.sourceType === 'sex-offender-registry' ? (qualifying ? 'sex' : 'violent') : rec.category,
  };
  return applyFaceVisibility(base);
}

function nextImageName(records) {
  let max = 0;
  for (const rec of records) {
    const n = parseInt(String(rec.image).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `mug-${String(max + 1).padStart(3, '0')}.jpg`;
}

async function addMissingQualifyingTargets(records, needed) {
  if (needed <= 0) return 0;

  const usedOffenses = new Set(records.map((r) => `${r.sourceId}:${decodeOffenseText(r.offense).toLowerCase()}`));
  let added = 0;

  for (const site of BJM_SOR_SITES) {
    if (added >= needed) break;
    const html = await fetchText(`${site.base}/sex_offenders.php`);
    const ids = parseSexOffenderIds(html);
    for (const id of ids) {
      if (added >= needed) break;
      try {
        const row = await fetchQualifyingOffender(site, id);
        if (!row) continue;
        const key = `${row.sourceId}:${decodeOffenseText(row.offense).toLowerCase()}`;
        if (usedOffenses.has(key)) continue;
        if (!row.gender) continue;
        if (row.faceVisible === false) continue;

        const filename = nextImageName(records);
        const dest = path.join(IMAGE_DIR, filename);
        await downloadImage(row.imageUrl, dest);
        const { imageUrl, registryId, ...rest } = row;
        records.push({ ...rest, image: filename });
        usedOffenses.add(key);
        added += 1;
        console.log(`  + ${filename} [${site.id}] ${row.offense.slice(0, 70)}`);
      } catch {
        /* skip */
      }
      await sleep(150);
    }
    await sleep(300);
  }

  return added;
}

async function main() {
  const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  let records = poolData.records.map(retagRecord);

  const qualifyingBefore = records.filter((r) => r.qualifyingMinor && r.faceVisible !== false).length;
  const disqualified = records.filter(
    (r) => r.sourceType === 'sex-offender-registry' && !r.qualifyingMinor,
  );
  console.log(`Qualifying minor sex targets: ${qualifyingBefore}`);
  if (disqualified.length) {
    console.log('Removed from target pool (adult/unspecified victim):');
    for (const rec of disqualified) {
      console.log(`  - ${rec.image}: ${decodeOffenseText(rec.offense)}`);
    }
  }

  const needed = Math.max(0, 18 - qualifyingBefore);
  if (needed > 0) {
    console.log(`\nScraping up to ${needed} additional qualifying targets...`);
    const added = await addMissingQualifyingTargets(records, needed);
    console.log(`Added ${added} new qualifying target(s).`);
  }

  records = records.map(retagRecord);
  const qualifyingAfter = records.filter((r) => r.qualifyingMinor && r.faceVisible !== false).length;
  console.log(`\nQualifying targets after audit: ${qualifyingAfter}`);

  poolData.records = records;
  poolData.count = records.length;
  poolData.offenseAuditAt = new Date().toISOString();
  fs.writeFileSync(POOL_PATH, JSON.stringify(poolData, null, 2));

  const trials = buildTrials(records);
  fs.writeFileSync(
    TRIALS_PATH,
    JSON.stringify(
      {
        meta: {
          version: 6,
          description:
            'Forced-choice trials with one qualifying minor-victim sex offense per round. Each round is same-gender only.',
          sourceCount: new Set(records.map((p) => p.sourceId)).size,
          qualifyingTargets: qualifyingAfter,
          fetchedAt: new Date().toISOString(),
        },
        trials,
      },
      null,
      2,
    ),
  );

  console.log(`Rebuilt ${trials.length} trials -> src/data/trials.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
