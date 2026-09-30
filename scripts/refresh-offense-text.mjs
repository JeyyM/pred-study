/**
 * Re-read full charge text from SOR detail pages (no image download).
 * Run: node scripts/refresh-offense-text.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyRecord } from './lib/offense.mjs';
import { fetchText } from './lib/mugshot-scrape.mjs';
import { parseBjmSorCharge } from './lib/profile.mjs';
import { sorScrapeSites } from './lib/sources.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const pool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
const sites = new Map(sorScrapeSites().map((site) => [site.id, site]));
const bySource = new Map();
for (const rec of pool.records) {
  if (!sites.has(rec.sourceId) || !rec.sourceOffenderId) continue;
  if (!bySource.has(rec.sourceId)) bySource.set(rec.sourceId, []);
  bySource.get(rec.sourceId).push(rec);
}

const stats = { updated: 0, failed: 0, movedToChild: 0 };

async function refreshSource(sourceId, records) {
  const site = sites.get(sourceId);
  for (const rec of records) {
    const beforeRole = rec.poolRole;
    try {
      const html = await fetchText(
        `${site.base}/sex_offender_view.php?id=${encodeURIComponent(rec.sourceOffenderId)}`,
      );
      const charge = parseBjmSorCharge(html);
      const next = classifyRecord({
        ...rec,
        offense: charge.offense,
        additionalInfo: charge.additionalInfo,
      });
      rec.offense = next.offense;
      rec.additionalInfo = next.additionalInfo;
      rec.category = next.category;
      rec.poolRole = next.poolRole;
      rec.minorTarget = next.minorTarget;
      rec.qualifyingMinor = next.qualifyingMinor;
      stats.updated += 1;
      if (beforeRole !== 'target' && next.poolRole === 'target') stats.movedToChild += 1;
    } catch {
      stats.failed += 1;
    }
    await sleep(80);
  }
  console.log(`  ${sourceId}: ${records.length} records`);
}

await Promise.all([...bySource.entries()].map(([id, rows]) => refreshSource(id, rows)));

pool.offenseRefreshedAt = new Date().toISOString();
fs.writeFileSync(POOL_PATH, `${JSON.stringify(pool, null, 2)}\n`, 'utf8');

console.log(
  `Updated ${stats.updated} charge texts, ${stats.failed} failed, ${stats.movedToChild} moved to child-victim`,
);
console.log(
  `Pool now: targets=${pool.records.filter((r) => r.poolRole === 'target').length} foils=${pool.records.filter((r) => r.poolRole !== 'target').length}`,
);
