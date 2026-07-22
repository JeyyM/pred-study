/**
 * Undo mistaken rotation on standard landscape jail mugshots.
 * Keeps fixes for truly sideways registry photos (mug-086, mug-090).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_DIR = path.join(__dirname, '..', 'public', 'images');

const KEEP_PORTRAIT = new Set(['mug-086.jpg', 'mug-090.jpg']);

const RESTORE = [
  'mug-001.jpg',
  'mug-005.jpg',
  'mug-009.jpg',
  'mug-010.jpg',
  'mug-011.jpg',
  'mug-013.jpg',
  'mug-014.jpg',
  'mug-021.jpg',
  'mug-030.jpg',
  'mug-032.jpg',
  'mug-034.jpg',
  'mug-035.jpg',
  'mug-036.jpg',
  'mug-037.jpg',
  'mug-038.jpg',
  'mug-040.jpg',
  'mug-042.jpg',
  'mug-050.jpg',
  'mug-059.jpg',
  'mug-065.jpg',
  'mug-071.jpg',
  'mug-073.jpg',
  'mug-082.jpg',
];

async function rotateFile(file, angle) {
  const filePath = path.join(IMAGE_DIR, file);
  const tempPath = path.join(IMAGE_DIR, `.restore-${file}`);
  const buf = await fs.promises.readFile(filePath);
  const out = await sharp(buf).rotate(angle).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  await fs.promises.writeFile(tempPath, out);
  await fs.promises.rename(tempPath, filePath);
  const meta = await sharp(out).metadata();
  console.log(`${file}: restored to ${meta.width}x${meta.height}`);
}

async function main() {
  for (const file of RESTORE) {
    if (KEEP_PORTRAIT.has(file)) continue;
    await rotateFile(file, 270);
  }
  for (const file of KEEP_PORTRAIT) {
    const meta = await sharp(path.join(IMAGE_DIR, file)).metadata();
    console.log(`${file}: kept at ${meta.width}x${meta.height}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
