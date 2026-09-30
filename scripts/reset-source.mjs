/**
 * Clear validation for a source and optionally replace its pool rows with a fresh scrape.
 *
 *   node scripts/reset-source.mjs ar-logan-jail
 *   node scripts/reset-source.mjs ar-logan-jail --refresh-pool
 */

import { resetSourceFromScrape } from './lib/reset-source-pool.mjs';
import { loadPoolRecords } from './lib/validation-store.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DECISIONS_PATH = path.join(__dirname, '..', 'src', 'data', 'validation-decisions.json');
const VALIDATED_POOL_PATH = path.join(__dirname, '..', 'src', 'data', 'validated-pool.json');
const VALIDATED_IMAGE_DIR = path.join(__dirname, '..', 'public', 'images', 'validated');

const sourceId = process.argv[2];
const refreshPool = process.argv.includes('--refresh-pool');

if (!sourceId) {
  console.error('Usage: node scripts/reset-source.mjs <sourceId> [--refresh-pool]');
  process.exit(1);
}

function clearValidationOnly(images) {
  const decisionsData = JSON.parse(fs.readFileSync(DECISIONS_PATH, 'utf8'));
  for (const image of images) delete decisionsData.decisions[image];
  decisionsData.updatedAt = new Date().toISOString();
  fs.writeFileSync(DECISIONS_PATH, `${JSON.stringify(decisionsData, null, 2)}\n`);
  const validated = JSON.parse(fs.readFileSync(VALIDATED_POOL_PATH, 'utf8'));
  validated.records = validated.records.filter(
    (row) => !images.includes(row.sourceImage) && !images.includes(String(row.image).replace(/^validated\//, '')),
  );
  validated.count = validated.records.length;
  fs.writeFileSync(VALIDATED_POOL_PATH, `${JSON.stringify(validated, null, 2)}\n`);
  for (const image of images) {
    const p = path.join(VALIDATED_IMAGE_DIR, image);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

async function main() {
  if (refreshPool) {
    const result = await resetSourceFromScrape(sourceId);
    console.log(`Reset ${sourceId}: removed ${result.removed}, added ${result.added}, trials=${result.trialCount}`);
    return;
  }
  const images = loadPoolRecords().filter((r) => r.sourceId === sourceId).map((r) => r.image);
  clearValidationOnly(images);
  console.log(`Validation cleared for ${images.length} photo(s). Pool unchanged.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
