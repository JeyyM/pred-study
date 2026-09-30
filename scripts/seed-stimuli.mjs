import pool from '../src/data/validated-pool.json' with { type: 'json' };
import { supabaseRest } from './lib/supabase-rest.mjs';

const rows = (pool.records || []).map((rec) => ({
  image: rec.image,
  source_id: rec.sourceId || null,
  pool_role: rec.poolRole === 'target' || rec.category === 'sex' ? 'target' : 'foil',
  category: rec.category || null,
  age_band: rec.ageBand || null,
  accepted_at: rec.validation?.reviewedAt || pool.updatedAt || null,
}));

const chunkSize = 200;
let upserted = 0;
for (let i = 0; i < rows.length; i += chunkSize) {
  const chunk = rows.slice(i, i + chunkSize);
  await supabaseRest('stimuli?on_conflict=image', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: chunk,
  });
  upserted += chunk.length;
}

console.log(`Seeded ${upserted} accepted stimulus IDs (no images).`);
