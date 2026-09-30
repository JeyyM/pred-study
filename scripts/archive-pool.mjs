/**
 * Snapshot current pool, trials, validation, and mug images before a full reset.
 * Run: node scripts/archive-pool.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const STAMP = new Date().toISOString().slice(0, 10);
const ARCHIVE = path.join(ROOT, 'archive', `pre-overhaul-${STAMP}`);

const FILES = [
  ['src/data/mugshot-pool.json', 'mugshot-pool.json'],
  ['src/data/trials.json', 'trials.json'],
  ['src/data/validation-decisions.json', 'validation-decisions.json'],
  ['src/data/validated-pool.json', 'validated-pool.json'],
];

function copyFile(rel, destName) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return false;
  fs.copyFileSync(src, path.join(ARCHIVE, destName));
  return true;
}

function moveImages(fromDir, toDir, pattern) {
  if (!fs.existsSync(fromDir)) return 0;
  fs.mkdirSync(toDir, { recursive: true });
  let n = 0;
  for (const name of fs.readdirSync(fromDir)) {
    if (!pattern.test(name)) continue;
    fs.renameSync(path.join(fromDir, name), path.join(toDir, name));
    n += 1;
  }
  return n;
}

function summarizePool(poolPath) {
  if (!fs.existsSync(poolPath)) return null;
  const data = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
  const records = data.records || [];
  const bySource = {};
  for (const r of records) {
    bySource[r.sourceId] = (bySource[r.sourceId] || 0) + 1;
  }
  return {
    count: records.length,
    sources: data.sources || [...new Set(records.map((r) => r.sourceId))],
    bySource,
    fetchedAt: data.fetchedAt,
  };
}

fs.mkdirSync(ARCHIVE, { recursive: true });

for (const [rel, dest] of FILES) copyFile(rel, dest);

const imageDir = path.join(ROOT, 'public', 'images');
const archiveImages = path.join(ARCHIVE, 'images');
const archiveValidated = path.join(ARCHIVE, 'images-validated');
const mugCount = moveImages(imageDir, archiveImages, /^mug-\d+\.jpg$/i);
const validatedDir = path.join(imageDir, 'validated');
const valCount = moveImages(validatedDir, archiveValidated, /\.jpg$/i);

const summary = summarizePool(path.join(ARCHIVE, 'mugshot-pool.json'));
const note = `# Pre-overhaul snapshot (${STAMP})

Archived before a full pool reset. Targets = jail booking sex charges; foils = non-sex bookings (same counties, \`poolRole\` target vs foil).

## Pool summary

- **Records:** ${summary?.count ?? 0}
- **Mug images moved here:** ${mugCount} (\`images/\`)
- **Validated images moved here:** ${valCount} (\`images-validated/\`)
- **Previous fetch time:** ${summary?.fetchedAt ?? 'unknown'}

## Records per sourceId

\`\`\`json
${JSON.stringify(summary?.bySource ?? {}, null, 2)}
\`\`\`

## Source IDs in old pool

${(summary?.sources ?? []).map((s) => `- \`${s}\``).join('\n') || '(none)'}

## Files in this folder

- \`mugshot-pool.json\` — full record list and metadata
- \`trials.json\` — trial lineups built from that pool
- \`validation-decisions.json\` — researcher keep/reject
- \`validated-pool.json\` — accepted subset

Restore manually by copying JSON/images back if needed; do not run \`fetch-mugshots\` on top of a restore without reading paths.
`;

fs.writeFileSync(path.join(ARCHIVE, 'README.md'), note, 'utf8');
console.log(`Archived to ${ARCHIVE}`);
console.log(`  pool records: ${summary?.count ?? 0}, mugs: ${mugCount}, validated imgs: ${valCount}`);
