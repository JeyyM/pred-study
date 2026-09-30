/**
 * Reclassify mugshot-pool.json so only minor-victim sex offenses are trial targets.
 * Drops adult-only sex offenses from the pool entirely.
 * Run: node scripts/reclassify-offenses.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyRecord, isAdultSexOffense } from './lib/offense.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');

const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
const before = poolData.records.length;

const classified = poolData.records.map(classifyRecord);
const removed = classified.filter((rec) => isAdultSexOffense(rec.offense));
const records = classified.filter((rec) => !isAdultSexOffense(rec.offense));

poolData.records = records;
poolData.reclassifiedAt = new Date().toISOString();
poolData.count = records.length;

fs.writeFileSync(POOL_PATH, JSON.stringify(poolData, null, 2));

const targets = records.filter((r) => r.minorTarget).length;
console.log(`Reclassified pool: ${before} -> ${records.length} records`);
console.log(`Removed ${removed.length} adult-only sex offense record(s)`);
console.log(`Minor-victim targets available: ${targets}`);
if (removed.length) {
  console.log('Removed offenses:');
  for (const rec of removed) console.log(`  - ${rec.image}: ${rec.offense}`);
}
