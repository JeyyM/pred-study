/**
 * Fix upside-down / known sideways mugshots (in place).
 * Run: node scripts/fix-orientation.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { needsFlip180, normalizeMugshotFile } from './lib/normalize-image.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_DIR = path.join(__dirname, '..', 'public', 'images');
const POOL_PATH = path.join(__dirname, '..', 'src', 'data', 'mugshot-pool.json');

async function main() {
  const files = fs.readdirSync(IMAGE_DIR).filter((f) => f.endsWith('.jpg')).sort();
  let flipped = 0;
  let dimensionChanges = 0;

  for (const file of files) {
    const filePath = path.join(IMAGE_DIR, file);
    const beforeBuf = await fs.promises.readFile(filePath);
    const shouldFlipBefore = await needsFlip180(await sharp(beforeBuf).rotate().toBuffer());
    const { before, after } = await normalizeMugshotFile(filePath);

    if (shouldFlipBefore) {
      flipped += 1;
      console.log(`${file}: flipped 180°`);
    }
    if (before.width !== after.width || before.height !== after.height) {
      dimensionChanges += 1;
      console.log(`${file}: ${before.width}x${before.height} -> ${after.width}x${after.height}`);
    }
  }

  const poolData = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
  poolData.orientationFixedAt = new Date().toISOString();
  fs.writeFileSync(POOL_PATH, JSON.stringify(poolData, null, 2));

  console.log(`\nChecked ${files.length} images (${flipped} flipped 180°, ${dimensionChanges} dimension changes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
