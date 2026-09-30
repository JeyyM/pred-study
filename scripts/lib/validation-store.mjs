import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyRecord } from './offense.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const POOL_PATH = path.join(ROOT, 'src', 'data', 'mugshot-pool.json');
const DECISIONS_PATH = path.join(ROOT, 'src', 'data', 'validation-decisions.json');
const VALIDATED_POOL_PATH = path.join(ROOT, 'src', 'data', 'validated-pool.json');
const SOURCE_IMAGE_DIR = path.join(ROOT, 'public', 'images');
const VALIDATED_IMAGE_DIR = path.join(ROOT, 'public', 'images', 'validated');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function loadPoolRecords() {
  const pool = readJson(POOL_PATH, { records: [] });
  return Array.isArray(pool.records) ? pool.records : [];
}

export function loadDecisions() {
  const data = readJson(DECISIONS_PATH, { decisions: {} });
  return data.decisions && typeof data.decisions === 'object' ? data.decisions : {};
}

export function loadValidatedPool() {
  return readJson(VALIDATED_POOL_PATH, {
    updatedAt: null,
    count: 0,
    records: [],
  });
}

export function getValidationSnapshot() {
  const records = loadPoolRecords();
  const decisions = loadDecisions();
  let pending = 0;
  let accepted = 0;
  let rejected = 0;
  for (const rec of records) {
    const status = decisions[rec.image]?.status;
    if (status === 'accepted') accepted += 1;
    else if (status === 'rejected') rejected += 1;
    else pending += 1;
  }
  return {
    records,
    decisions,
    stats: {
      total: records.length,
      pending,
      accepted,
      rejected,
    },
  };
}

function copyOrWriteImage(imageName, imageData) {
  fs.mkdirSync(VALIDATED_IMAGE_DIR, { recursive: true });
  const dest = path.join(VALIDATED_IMAGE_DIR, imageName);
  if (imageData) {
    const base64 = String(imageData).replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(dest, Buffer.from(base64, 'base64'));
    return `validated/${imageName}`;
  }
  const source = path.join(SOURCE_IMAGE_DIR, imageName);
  if (!fs.existsSync(source)) {
    throw new Error(`Source image missing: ${imageName}`);
  }
  fs.copyFileSync(source, dest);
  return `validated/${imageName}`;
}

function removeValidatedImage(imageName) {
  const dest = path.join(VALIDATED_IMAGE_DIR, imageName);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
}

export function applyDecision({ image, status, rotation = 0, imageData, note = '' }) {
  if (!image) throw new Error('Missing image id');
  if (status !== 'accepted' && status !== 'rejected') {
    throw new Error('Status must be accepted or rejected');
  }

  const records = loadPoolRecords();
  const record = records.find((row) => row.image === image);
  if (!record) throw new Error(`Unknown record: ${image}`);

  const decisions = loadDecisions();
  const reviewedAt = new Date().toISOString();
  decisions[image] = {
    status,
    rotation: Number(rotation) || 0,
    note: String(note || '').slice(0, 400),
    reviewedAt,
  };
  writeJson(DECISIONS_PATH, {
    updatedAt: reviewedAt,
    decisions,
  });

  const validated = loadValidatedPool();
  const without = validated.records.filter((row) => row.image !== image && row.sourceImage !== image);

  if (status === 'accepted') {
    const storedImage = copyOrWriteImage(image, imageData);
    without.push({
      ...record,
      sourceImage: image,
      image: storedImage,
      validation: {
        status: 'accepted',
        rotation: Number(rotation) || 0,
        note: String(note || '').slice(0, 400),
        reviewedAt,
      },
    });
  } else {
    removeValidatedImage(image);
  }

  writeJson(VALIDATED_POOL_PATH, {
    updatedAt: reviewedAt,
    count: without.length,
    records: without,
  });

  return getValidationSnapshot();
}

export function rewritePoolClassification() {
  const pool = readJson(POOL_PATH, { records: [] });
  pool.records = (pool.records || []).map(classifyRecord);
  pool.count = pool.records.length;
  pool.reclassifiedAt = new Date().toISOString();
  writeJson(POOL_PATH, pool);
  return pool.records;
}

export function reclassifyRecord(image, role) {
  if (role !== 'target' && role !== 'foil') {
    throw new Error('Role must be target or foil');
  }
  const pool = readJson(POOL_PATH, { records: [] });
  const records = Array.isArray(pool.records) ? pool.records : [];
  const index = records.findIndex((row) => row.image === image);
  if (index < 0) throw new Error(`Unknown record: ${image}`);
  records[index] = classifyRecord({
    ...records[index],
    classificationOverride: role,
  });
  pool.records = records;
  pool.reclassifiedAt = new Date().toISOString();
  writeJson(POOL_PATH, pool);
  return getValidationSnapshot();
}

export function resetAllDecisions() {
  const reviewedAt = new Date().toISOString();
  writeJson(DECISIONS_PATH, {
    updatedAt: reviewedAt,
    decisions: {},
  });
  writeJson(VALIDATED_POOL_PATH, {
    updatedAt: reviewedAt,
    count: 0,
    records: [],
  });
  if (fs.existsSync(VALIDATED_IMAGE_DIR)) {
    for (const name of fs.readdirSync(VALIDATED_IMAGE_DIR)) {
      if (name === '.gitkeep') continue;
      fs.unlinkSync(path.join(VALIDATED_IMAGE_DIR, name));
    }
  }
  return getValidationSnapshot();
}

export function undoDecision(image) {
  const decisions = loadDecisions();
  if (!decisions[image]) return getValidationSnapshot();
  delete decisions[image];
  const reviewedAt = new Date().toISOString();
  writeJson(DECISIONS_PATH, {
    updatedAt: reviewedAt,
    decisions,
  });

  const validated = loadValidatedPool();
  writeJson(VALIDATED_POOL_PATH, {
    updatedAt: reviewedAt,
    count: validated.records.filter((row) => row.sourceImage !== image && row.image !== image).length,
    records: validated.records.filter((row) => row.sourceImage !== image && row.image !== image),
  });
  removeValidatedImage(image);
  return getValidationSnapshot();
}
