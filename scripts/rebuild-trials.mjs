/**
 * Rebuild trials.json from mugshot-pool.json (no re-download).
 * Run: node scripts/rebuild-trials.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTrials, countByGender, assertUniqueTrialImages } from './lib/trial-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');

const pool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8')).records;
const tally = countByGender(pool);
const trials = buildTrials(pool);
const uniqueImages = assertUniqueTrialImages(trials);

fs.writeFileSync(
  TRIALS_PATH,
  JSON.stringify(
    {
      meta: {
        version: 6,
        description:
          'Forced-choice trials: exactly one qualifying minor-victim sex offense per round. Same-gender lineups; each photo used at most once across all 18 rounds.',
        sourceCount: new Set(pool.map((p) => p.sourceId)).size,
        genderBalance: tally,
        uniqueImages,
        fetchedAt: new Date().toISOString(),
      },
      trials,
    },
    null,
    2,
  ),
);

console.log(`Rebuilt ${trials.length} same-gender trials (${uniqueImages} unique photos) -> src/data/trials.json`);
console.log(`Pool gender: male sex=${tally.male.sex} foil=${tally.male.foil}, female sex=${tally.female.sex} foil=${tally.female.foil}, unknown=${tally.unknown}`);
