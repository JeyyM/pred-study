/**
 * Rebuild trials.json from mugshot-pool.json (no re-download).
 * Run: node scripts/rebuild-trials.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTrials, countByGender } from './lib/trial-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');

const pool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8')).records;
const tally = countByGender(pool);
const trials = buildTrials(pool);

fs.writeFileSync(
  TRIALS_PATH,
  JSON.stringify(
    {
      meta: {
        version: 5,
        description:
          'Forced-choice trials with one qualifying minor-victim sex offense per round. Adult-victim sex crimes are excluded. Each round is same-gender only.',
        sourceCount: new Set(pool.map((p) => p.sourceId)).size,
        genderBalance: tally,
        fetchedAt: new Date().toISOString(),
      },
      trials,
    },
    null,
    2,
  ),
);

console.log(`Rebuilt ${trials.length} same-gender trials -> src/data/trials.json`);
console.log(`Pool gender: male sex=${tally.male.sex} foil=${tally.male.foil}, female sex=${tally.female.sex} foil=${tally.female.foil}, unknown=${tally.unknown}`);
