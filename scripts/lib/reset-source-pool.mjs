import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './age-matching.mjs';
import { classifyRecord } from './offense.mjs';
import { scrapeSite } from './mugshot-scrape.mjs';
import { parseValidationGroupKey } from './pool-role.mjs';
import { allScrapeSites } from './sources.mjs';
import { buildTrials, countByGender } from './trial-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const DECISIONS_PATH = path.join(ROOT, 'src', 'data', 'validation-decisions.json');
const VALIDATED_POOL_PATH = path.join(ROOT, 'src', 'data', 'validated-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const VALIDATED_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'validated');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clearValidationForImages(images) {
  const decisionsData = readJson(DECISIONS_PATH, { decisions: {} });
  const decisions = decisionsData.decisions || {};
  for (const image of images) {
    delete decisions[image];
    const validatedPath = path.join(VALIDATED_IMAGE_DIR, image);
    if (fs.existsSync(validatedPath)) fs.unlinkSync(validatedPath);
  }
  writeJson(DECISIONS_PATH, {
    updatedAt: new Date().toISOString(),
    decisions,
  });

  const validated = readJson(VALIDATED_POOL_PATH, { records: [] });
  validated.records = (validated.records || []).filter(
    (row) => !images.includes(row.sourceImage) && !images.includes(String(row.image).replace(/^validated\//, '')),
  );
  validated.count = validated.records.length;
  validated.updatedAt = new Date().toISOString();
  writeJson(VALIDATED_POOL_PATH, validated);
}

function rebuildTrialsFile(records) {
  const tally = countByGender(records);
  const trials = buildTrials(records);
  writeJson(TRIALS_PATH, {
    meta: {
      version: 5,
      description:
        'Forced-choice trials with one sex-charge jail booking target per round and two non-sex jail foils. Same-gender only.',
      sourceCount: new Set(records.map((p) => p.sourceId)).size,
      genderBalance: tally,
      fetchedAt: new Date().toISOString(),
    },
    trials,
  });
  return trials.length;
}

/**
 * Clear validation for one source, re-scrape from the sheriff site, and replace pool rows.
 */
export async function resetSourceFromScrape(sourceRef) {
  const { jailSourceId, poolRole } = parseValidationGroupKey(sourceRef);
  const site = allScrapeSites().find((s) => s.id === jailSourceId);
  if (!site) {
    throw new Error(`This source cannot be re-downloaded (${sourceRef}). Use the CLI for manual pool edits.`);
  }

  const matchesSource = (r) =>
    r.sourceId === jailSourceId && (poolRole == null || r.poolRole === poolRole || (poolRole && !r.poolRole && (poolRole === 'target' ? r.category === 'sex' : r.category !== 'sex')));

  const poolData = readJson(POOL_PATH, { records: [] });
  const removed = poolData.records.filter(matchesSource);
  const removedImages = removed.map((r) => r.image);

  clearValidationForImages(removedImages);

  let nextRecords = poolData.records.filter((r) => !matchesSource(r));

  for (const image of removedImages) {
    const stillUsed = nextRecords.some((r) => r.image === image);
    if (!stillUsed) {
      const file = path.join(IMAGE_DIR, image);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  const isJail = site.cms === 'bjm-roster' || site.cms === 'green-roster' || site.cms === 'iowa-roster';
  let scraped = [];
  if (isJail) {
    if (poolRole === 'target' || poolRole === 'foil') {
      scraped = await scrapeSite(site, { rosterRole: poolRole });
    } else {
      scraped = await scrapeSite(site, { rosterRole: 'all' });
    }
  } else {
    scraped = await scrapeSite(site, { includeSor: site.cms === 'bjm-sor' });
  }
  let index = maxMugIndex(nextRecords);
  const added = [];
  const downloadErrors = [];

  for (const rec of scraped) {
    index += 1;
    const filename = `mug-${String(index).padStart(4, '0')}.jpg`;
    const dest = path.join(IMAGE_DIR, filename);
    try {
      await downloadImage(rec.imageUrl, dest);
      const { imageUrl, ...rest } = rec;
      added.push(classifyRecord({ ...rest, image: filename }));
    } catch (err) {
      downloadErrors.push({ filename, message: err.message });
    }
    await sleep(150);
  }

  if (!added.length) {
    throw new Error(
      downloadErrors[0]?.message || 'Re-download failed (site blocked or no images). Previous rows were removed.',
    );
  }

  nextRecords = [...nextRecords, ...added];
  poolData.records = applyAgeMatchingToPool(nextRecords);
  poolData.count = poolData.records.length;
  poolData.sources = [...new Set(poolData.records.map((r) => r.sourceId))];
  poolData.updatedAt = new Date().toISOString();
  writeJson(POOL_PATH, poolData);

  const trialCount = rebuildTrialsFile(poolData.records);

  return {
    sourceId: sourceRef,
    jailSourceId,
    poolRole,
    removed: removed.length,
    added: added.length,
    downloadErrors: downloadErrors.length,
    trialCount,
  };
}
