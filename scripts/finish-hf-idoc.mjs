/**
 * Build the study pool from Hugging Face IDOC photos staged by import-hf-idoc.py.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './lib/age-matching.mjs';
import { categorizeCharge, classifyRecord, isMinorSexOffense } from './lib/offense.mjs';
import { buildTrials } from './lib/trial-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PICKED_PATH = path.join(ROOT, 'data', 'hf-idoc', 'picked.json');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');
const DECISIONS_PATH = path.join(ROOT, 'src', 'data', 'validation-decisions.json');
const VALIDATED_PATH = path.join(ROOT, 'src', 'data', 'validated-pool.json');

if (!fs.existsSync(PICKED_PATH)) {
  console.error('Run: python scripts/import-hf-idoc.py');
  process.exit(1);
}

const staged = JSON.parse(fs.readFileSync(PICKED_PATH, 'utf8'));
const downloaded = (staged.records || []).map((rec) => {
  const childTarget = rec.poolRole === 'target' || isMinorSexOffense(rec.offense);
  return classifyRecord({
    ...rec,
    minorTarget: childTarget,
    qualifyingMinor: childTarget,
    category: childTarget ? 'sex' : categorizeCharge(rec.offense),
    poolRole: childTarget ? 'target' : 'foil',
    studyEligible: true,
  });
});

const pool = applyAgeMatchingToPool(downloaded);
fs.writeFileSync(
  POOL_PATH,
  `${JSON.stringify(
    {
      fetchedAt: new Date().toISOString(),
      count: pool.length,
      sources: ['il-idoc-hf'],
      studyNote:
        'Illinois DOC via Hugging Face ljnlonoljpiljm/idoc-mugshots. Front mugshots. Targets = child-predation charges only (predatory CSA, child porn, indecent solicitation of a child, grooming, victim 13-17, etc.). Adult sex offenses are foils. 2019 snapshot.',
      records: pool,
    },
    null,
    2,
  )}\n`,
);

fs.writeFileSync(DECISIONS_PATH, `${JSON.stringify({ updatedAt: new Date().toISOString(), decisions: {} }, null, 2)}\n`);
fs.writeFileSync(
  VALIDATED_PATH,
  `${JSON.stringify({ updatedAt: new Date().toISOString(), count: 0, records: [] }, null, 2)}\n`,
);

const trials = buildTrials(pool);
fs.writeFileSync(
  TRIALS_PATH,
  JSON.stringify(
    {
      meta: {
        version: 10,
        description:
          'IDOC 2019 front mugshots. Target = child-predation charge. Foils include non-sex and adult-victim sex offenses. Same-gender 3AFC.',
        sourceCount: 1,
        trialCount: trials.length,
        fetchedAt: new Date().toISOString(),
      },
      trials,
    },
    null,
    2,
  ),
);

const nTarget = pool.filter((p) => p.category === 'sex').length;
console.log(`Pool ${pool.length}; child-predation targets ${nTarget}; trials ${trials.length}`);
