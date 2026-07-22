/**
 * Normalize mugshot JPEG orientation (EXIF + upside-down + sideways registry photos).
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

/** Clockwise correction for registry photos stored sideways (verified manually). */
export const MANUAL_ROTATION_DEGREES = {
  'mug-086.jpg': 90,
  'mug-090.jpg': 90,
};

function horizontalEdgeEnergy(data, width, yStart, yEnd, channels = 3) {
  let sum = 0;
  let n = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * channels;
      const iL = (y * width + (x - 1)) * channels;
      const iR = (y * width + (x + 1)) * channels;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const lumL = 0.299 * data[iL] + 0.587 * data[iL + 1] + 0.114 * data[iL + 2];
      const lumR = 0.299 * data[iR] + 0.587 * data[iR + 1] + 0.114 * data[iR + 2];
      sum += Math.abs(lumL - lumR);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

async function topBottomEdgeRatio(input, rotation) {
  let pipeline = sharp(input);
  if (rotation) {
    pipeline = pipeline.rotate(rotation);
  }
  const { data, info } = await pipeline
    .resize(200, 260, { fit: 'cover', position: 'centre' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const top = horizontalEdgeEnergy(data, width, 0, Math.floor(height * 0.22), channels ?? 3);
  const bottom = horizontalEdgeEnergy(
    data,
    width,
    Math.floor(height * 0.78),
    height,
    channels ?? 3,
  );
  return top / Math.max(bottom, 0.01);
}

/**
 * Upside-down jail photos: height chart / header band produces strong top-edge energy
 * when upright. Pick whichever of 0° vs 180° puts that structure at the top.
 */
export async function needsFlip180(input) {
  const r0 = await topBottomEdgeRatio(input, 0);
  const r180 = await topBottomEdgeRatio(input, 180);

  if (r180 > 2.5 && r0 < 0.55) return true;
  if (r0 > 2.5 && r180 < 0.55) return false;

  return r180 > r0 * 1.8 && r180 > 2.0;
}

export async function normalizeMugshotBuffer(input, { filename } = {}) {
  const exifCorrected = await sharp(input).rotate().toBuffer();
  let pipeline = sharp(exifCorrected);

  if (await needsFlip180(exifCorrected)) {
    pipeline = pipeline.rotate(180);
  }

  const manual = filename ? MANUAL_ROTATION_DEGREES[filename] : 0;
  if (manual) {
    const meta = await pipeline.metadata();
    if (meta.width && meta.height && meta.width > meta.height) {
      pipeline = sharp(await pipeline.toBuffer()).rotate(manual);
    }
  }

  return pipeline.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

export async function normalizeDownloadedImage(buf, filename) {
  return normalizeMugshotBuffer(buf, { filename });
}

export async function normalizeMugshotFile(filePath) {
  const filename = path.basename(filePath);
  const input = await fs.promises.readFile(filePath);
  const before = await sharp(input).metadata();
  const output = await normalizeMugshotBuffer(input, { filename });
  const tempPath = path.join(
    path.dirname(filePath),
    `.tmp-${path.basename(filePath)}-${process.pid}.jpg`,
  );
  await fs.promises.writeFile(tempPath, output);
  await fs.promises.rename(tempPath, filePath);
  const after = await sharp(output).metadata();
  return { before, after, filename, flipped: before.width === after.width && before.height === after.height };
}
