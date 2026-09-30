/**
 * Estimate age for pool rows missing booking age (local @vladmandic/human).
 * Run: node scripts/estimate-face-age.mjs
 * Options: --force re-estimate even if estimatedAge exists
 *          --accepted only process validated-pool.json (official age still wins)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingFields, applyAgeMatchingToPool } from './lib/age-matching.mjs';
import { estimateAgeFromImageFile, faceAgeModelMeta } from './lib/face-age.mjs';
import { AGE_MODEL_ID } from './lib/age-matching.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const VALIDATED_POOL_PATH = path.join(ROOT, 'src', 'data', 'validated-pool.json');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');

const force = process.argv.includes('--force');
const acceptedOnly = process.argv.includes('--accepted');

function resolveImagePath(record) {
  const name = String(record.image || '').replace(/^validated\//, '');
  const validated = path.join(IMAGE_DIR, 'validated', name);
  if (fs.existsSync(validated)) return validated;
  return path.join(IMAGE_DIR, name);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function syncValidatedFromPool(withMatching, updatedAt) {
  if (!fs.existsSync(VALIDATED_POOL_PATH)) return;
  const validated = JSON.parse(fs.readFileSync(VALIDATED_POOL_PATH, 'utf8'));
  const byImage = new Map(withMatching.map((r) => [r.image, r]));
  validated.records = validated.records.map((row) => {
    const src = byImage.get(row.sourceImage || String(row.image || '').replace(/^validated\//, ''));
    if (!src) return applyAgeMatchingFields(row);
    return {
      ...row,
      age: src.age,
      estimatedAge: src.estimatedAge,
      ageModel: src.ageModel,
      ageModelVersion: src.ageModelVersion,
      estimatedAt: src.estimatedAt,
      ageForMatching: src.ageForMatching,
      ageBand: src.ageBand,
      ageSource: src.ageSource,
      studyEligible: src.studyEligible,
    };
  });
  validated.updatedAt = updatedAt;
  fs.writeFileSync(VALIDATED_POOL_PATH, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
}

async function estimateRecord(record, meta, counters) {
  const hasBooking = record.age != null && record.age !== '';
  if (hasBooking) {
    counters.skippedBooking += 1;
    return record;
  }

  if (!force && record.estimatedAge != null && record.ageModel === AGE_MODEL_ID) {
    counters.skippedExisting += 1;
    return record;
  }

  const imagePath = resolveImagePath(record);
  process.stdout.write(`• ${record.image} ... `);
  try {
    const { estimatedAge, faceCount } = await estimateAgeFromImageFile(imagePath);
    if (estimatedAge == null) {
      counters.noFace += 1;
      console.log(faceCount ? 'no age' : 'no face');
      return {
        ...record,
        estimatedAge: null,
        ...meta,
        estimatedAt: new Date().toISOString(),
      };
    }
    counters.estimated += 1;
    console.log(`~${estimatedAge}`);
    return {
      ...record,
      estimatedAge,
      ...meta,
      estimatedAt: new Date().toISOString(),
    };
  } catch (err) {
    counters.failed += 1;
    console.log(`fail (${err.message})`);
    return record;
  }
}

async function main() {
  const meta = faceAgeModelMeta();
  const counters = {
    estimated: 0,
    skippedBooking: 0,
    skippedExisting: 0,
    noFace: 0,
    failed: 0,
  };

  if (acceptedOnly) {
    if (!fs.existsSync(VALIDATED_POOL_PATH)) {
      throw new Error('validated-pool.json is missing');
    }
    const validated = JSON.parse(fs.readFileSync(VALIDATED_POOL_PATH, 'utf8'));
    const records = [];
    for (const record of validated.records || []) {
      records.push(await estimateRecord(record, meta, counters));
      await sleep(50);
    }
    const withMatching = applyAgeMatchingToPool(records);
    const updatedAt = new Date().toISOString();
    validated.records = withMatching;
    validated.updatedAt = updatedAt;
    validated.ageMatching = {
      model: meta.ageModel,
      modelVersion: meta.ageModelVersion,
      updatedAt,
      rule: 'ageForMatching prefers official/booking age; else estimatedAge',
    };
    fs.writeFileSync(VALIDATED_POOL_PATH, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');

    if (fs.existsSync(POOL_PATH)) {
      const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
      const bySource = new Map(
        withMatching.map((row) => [row.sourceImage || String(row.image || '').replace(/^validated\//, ''), row]),
      );
      poolData.records = applyAgeMatchingToPool(
        (poolData.records || []).map((row) => {
          const src = bySource.get(row.image);
          if (!src) return row;
          return {
            ...row,
            estimatedAge: src.estimatedAge,
            ageModel: src.ageModel,
            ageModelVersion: src.ageModelVersion,
            estimatedAt: src.estimatedAt,
          };
        }),
      );
      poolData.ageMatching = validated.ageMatching;
      fs.writeFileSync(POOL_PATH, `${JSON.stringify(poolData, null, 2)}\n`, 'utf8');
    }

    const booking = withMatching.filter((r) => r.ageSource === 'booking').length;
    const est = withMatching.filter((r) => r.ageSource === 'estimated').length;
    const missing = withMatching.filter((r) => r.ageSource === 'missing').length;
    console.log('\nDone (accepted photos).');
    console.log(
      `Estimated this run: ${counters.estimated} (skipped official=${counters.skippedBooking}, cached=${counters.skippedExisting}, no face/age=${counters.noFace}, failed=${counters.failed})`,
    );
    console.log(`ageForMatching: official=${booking}, estimated=${est}, missing=${missing}`);
    return;
  }

  const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  const records = [];
  for (const record of poolData.records) {
    records.push(await estimateRecord(record, meta, counters));
    await sleep(50);
  }

  const withMatching = applyAgeMatchingToPool(records);
  const updatedAt = new Date().toISOString();
  const payload = {
    ...poolData,
    records: withMatching,
    ageMatching: {
      model: meta.ageModel,
      modelVersion: meta.ageModelVersion,
      updatedAt,
      rule: 'ageForMatching prefers official/booking age; else estimatedAge; ageBand is coarse lineup bin',
    },
  };
  fs.writeFileSync(POOL_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  syncValidatedFromPool(withMatching, updatedAt);

  const booking = withMatching.filter((r) => r.ageSource === 'booking').length;
  const est = withMatching.filter((r) => r.ageSource === 'estimated').length;
  const missing = withMatching.filter((r) => r.ageSource === 'missing').length;
  const ineligible = withMatching.filter((r) => r.studyEligible === false).length;

  console.log('\nDone.');
  console.log(
    `Estimated this run: ${counters.estimated} (skipped official=${counters.skippedBooking}, cached=${counters.skippedExisting}, no face/age=${counters.noFace}, failed=${counters.failed})`,
  );
  console.log(`ageForMatching: official=${booking}, estimated=${est}, missing=${missing}, under-18 excluded=${ineligible}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
