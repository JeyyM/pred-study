/**
 * Recompute ageForMatching / ageBand on mugshot-pool.json (no face model).
 * Run: node scripts/apply-age-matching.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './lib/age-matching.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');

const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
poolData.records = applyAgeMatchingToPool(poolData.records);
poolData.ageMatching = {
  ...(poolData.ageMatching || {}),
  updatedAt: new Date().toISOString(),
};
fs.writeFileSync(POOL_PATH, `${JSON.stringify(poolData, null, 2)}\n`, 'utf8');
console.log(`Updated age matching fields on ${poolData.records.length} records.`);
