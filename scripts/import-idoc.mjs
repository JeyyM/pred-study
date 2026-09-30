/**
 * Import a local unzip of Kaggle IDOC mugshots (elliotp/idoc-mugshots).
 * Does not download. Place files in data/idoc/ then:
 *
 *   npm run import-idoc
 *
 * Optional: --targets 80 --foils 160 --seed 1
 *
 * Sex targets: sex-offender registry flag OR charge text classified as sex.
 * Front mugshots only. Snapshot is ~2019 — valid for first-impressions, not current custody.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { applyAgeMatchingToPool } from './lib/age-matching.mjs';
import { categorizeCharge, classifyRecord, isMinorSexOffense } from './lib/offense.mjs';
import { buildTrials } from './lib/trial-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DEFAULT_DATA = path.join(ROOT, 'data', 'idoc');
const IMAGE_DIR = path.join(ROOT, 'public', 'images');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const TRIALS_PATH = path.join(ROOT, 'src', 'data', 'trials.json');
const DECISIONS_PATH = path.join(ROOT, 'src', 'data', 'validation-decisions.json');
const VALIDATED_PATH = path.join(ROOT, 'src', 'data', 'validated-pool.json');

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  if (i === -1 || !process.argv[i + 1]) return fallback;
  return process.argv[i + 1];
}

function parseCsvLine(line, delimiter) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const trimmed = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const first = trimmed.split('\n')[0] || '';
  const delimiter = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const lines = trimmed.split('\n').filter((row) => row.trim());
  const headers = parseCsvLine(lines[0], delimiter).map((h) => h.replace(/;+$/, '').trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line.replace(/;+$/, ''), delimiter);
    const rec = {};
    headers.forEach((h, i) => {
      rec[h] = (cols[i] || '').trim();
    });
    return rec;
  });
}

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function findLabelCsv(root) {
  const files = walkFiles(root).filter((f) => f.toLowerCase().endsWith('.csv'));
  const scored = files.map((file) => {
    const head = fs.readFileSync(file, 'utf8').slice(0, 4000).toLowerCase();
    let score = 0;
    if (head.includes('offense')) score += 3;
    if (head.includes('sex_offender')) score += 4;
    if (head.includes('date_of_birth') || head.includes('dob')) score += 1;
    return { file, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score ? scored[0].file : files[0] || null;
}

function field(row, ...names) {
  for (const name of names) {
    if (row[name] != null && row[name] !== '') return row[name];
  }
  return '';
}

function parseDobAge(dob, asOfYear = 2019) {
  const m = String(dob).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const year = Number(m[3]);
  if (year < 1900 || year > asOfYear) return null;
  const age = asOfYear - year;
  if (age < 16 || age > 100) return null;
  return age;
}

function mapGender(raw) {
  const s = String(raw).toLowerCase();
  if (s.startsWith('m')) return 'male';
  if (s.startsWith('f')) return 'female';
  return null;
}

function isRegistryFlag(value) {
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'y';
}

function isSexTarget(row, offense) {
  if (isRegistryFlag(field(row, 'sex_offender_registry_required', 'sex offender registry required', 'sex offender', 'sor'))) {
    return true;
  }
  return categorizeCharge(offense) === 'sex';
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, rand) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function findFrontImage(id, imageIndex) {
  const keys = [
    String(id),
    String(id).toLowerCase(),
    String(id).toUpperCase(),
    path.parse(String(id)).name,
  ];
  for (const key of keys) {
    if (imageIndex.has(key)) return imageIndex.get(key);
  }
  return null;
}

function buildImageIndex(root) {
  const map = new Map();
  for (const file of walkFiles(root)) {
    const ext = path.extname(file).toLowerCase();
    const base = path.basename(file, ext);
    if (ext && !['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) continue;
    const norm = file.replace(/\\/g, '/').toLowerCase();
    if (norm.includes('/side/')) continue;
    map.set(base, file);
    map.set(base.toLowerCase(), file);
  }
  return map;
}

function clearMugImages() {
  if (!fs.existsSync(IMAGE_DIR)) return;
  for (const name of fs.readdirSync(IMAGE_DIR)) {
    if (/^(mug-|face-)/i.test(name)) {
      fs.unlinkSync(path.join(IMAGE_DIR, name));
    }
  }
}

function main() {
  const dataRoot = path.resolve(argValue('--data', DEFAULT_DATA));
  const targetN = Number(argValue('--targets', '80'));
  const foilN = Number(argValue('--foils', '160'));
  const seed = Number(argValue('--seed', '1'));

  if (!fs.existsSync(dataRoot)) {
    console.error(`Unzip the Kaggle dataset into ${dataRoot}`);
    console.error('Download: https://www.kaggle.com/datasets/elliotp/idoc-mugshots');
    process.exit(1);
  }

  const csvPath = findLabelCsv(dataRoot);
  if (!csvPath) {
    console.error('No CSV labels found under', dataRoot);
    process.exit(1);
  }
  console.log('Labels:', csvPath);

  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const imageIndex = buildImageIndex(dataRoot);
  console.log(`CSV rows: ${rows.length}; image files indexed: ${imageIndex.size}`);

  const rand = mulberry32(seed);
  const targets = [];
  const foils = [];

  for (const row of rows) {
    const id = field(row, 'id', 'idoc', 'inmate_id', 'filename', 'file');
    if (!id) continue;
    const offense = field(row, 'offense', 'type of offense', 'charge', 'offense_type');
    const age = parseDobAge(field(row, 'date_of_birth', 'dob', 'birthdate', 'birthday'));
    const gender = mapGender(field(row, 'sex', 'gender'));
    const img = findFrontImage(id.replace(/\.(jpg|jpeg|png)$/i, ''), imageIndex);
    if (!img) continue;
    if (age != null && age < 18) continue;
    if (gender === 'female') continue;

    const sexTarget = isSexTarget(row, offense);
    const rec = {
      sourceId: 'il-idoc',
      sourceState: 'IL',
      sourceType: 'state-prison',
      sourceBookingId: String(id),
      sourcePath: img,
      offense: offense || (sexTarget ? 'Sex offense (IDOC registry flag)' : 'IDOC holding offense'),
      gender,
      race: field(row, 'race') || undefined,
      age,
      year: 2019,
      poolRole: sexTarget ? 'target' : 'foil',
    };
    if (sexTarget) targets.push(rec);
    else foils.push(rec);
  }

  console.log(`Usable with front photo: ${targets.length} sex-labeled, ${foils.length} foils`);

  const picked = [
    ...shuffle(targets, rand).slice(0, targetN),
    ...shuffle(foils, rand).slice(0, foilN),
  ];

  if (picked.filter((p) => p.poolRole === 'target').length < 18) {
    console.warn('Fewer than 18 sex targets with photos — trials may be short. Increase --targets or check CSV/image pairing.');
  }

  clearMugImages();
  fs.mkdirSync(IMAGE_DIR, { recursive: true });

  const downloaded = [];
  picked.forEach((rec, i) => {
    const filename = `mug-${String(i + 1).padStart(4, '0')}.jpg`;
    fs.copyFileSync(rec.sourcePath, path.join(IMAGE_DIR, filename));
    const { sourcePath, ...rest } = rec;
    downloaded.push(
      classifyRecord({
        ...rest,
        image: filename,
        minorTarget: isMinorSexOffense(rest.offense),
        qualifyingMinor: isMinorSexOffense(rest.offense),
        category: rec.poolRole === 'target' ? 'sex' : categorizeCharge(rest.offense),
      }),
    );
  });

  const pool = applyAgeMatchingToPool(downloaded);
  fs.writeFileSync(
    POOL_PATH,
    `${JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        count: pool.length,
        sources: ['il-idoc'],
        studyNote:
          'Illinois DOC Kaggle/Academic Torrents 2019 snapshot. Front mugshots. Sex = registry flag or charge text. Not current custody.',
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
          version: 9,
          description: 'IDOC 2019 prison mugshots. Sex vs non-sex from registry flag and charge text. Same-gender 3AFC.',
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

  console.log(`Copied ${pool.length} photos -> public/images/`);
  console.log(`Trials: ${trials.length}`);
  console.log(`Sex targets: ${pool.filter((p) => p.category === 'sex').length}`);
}

main();
