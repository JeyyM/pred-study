import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath, pathToFileURL } from 'url';
import { AGE_MODEL_ID, AGE_MODEL_VERSION } from './age-matching.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const MODEL_BASE = path.join(ROOT, 'node_modules', '@vladmandic', 'human', 'models');

let humanInstance = null;

/** Node fetch does not support file://; Human loads models via fetch. */
function installFileFetchPolyfill() {
  if (globalThis.__humanFileFetchInstalled) return;
  const orig = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const href = typeof input === 'string' ? input : input?.url ?? String(input);
    if (href.startsWith('file:')) {
      const filePath = fileURLToPath(href);
      const buf = fs.readFileSync(filePath);
      return new Response(buf, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
    }
    return orig(input, init);
  };
  globalThis.__humanFileFetchInstalled = true;
}

export function faceAgeModelMeta() {
  return {
    ageModel: AGE_MODEL_ID,
    ageModelVersion: AGE_MODEL_VERSION,
  };
}

async function loadImageTensor(human, imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const { data, info } = await sharp(buffer).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const tensor = human.tf.tensor3d(new Uint8Array(data), [info.height, info.width, info.channels]);
  return human.tf.expandDims(tensor, 0);
}

export async function getFaceAgeEstimator() {
  if (humanInstance) return humanInstance;

  installFileFetchPolyfill();

  const tf = await import('@tensorflow/tfjs');
  await import('@tensorflow/tfjs-backend-wasm');
  await tf.setBackend('wasm');
  await tf.ready();

  const humanEntry = path.join(ROOT, 'node_modules', '@vladmandic', 'human', 'dist', 'human.node-wasm.js');
  const humanModule = await import(pathToFileURL(humanEntry).href);
  const Human = humanModule.Human || humanModule.default;

  const modelBasePath = `${pathToFileURL(MODEL_BASE).href}/`;
  const human = new Human({
    backend: 'wasm',
    modelBasePath,
    cacheSensitivity: 0,
    face: {
      enabled: true,
      detector: { rotation: true, minConfidence: 0.15, maxDetected: 3 },
      iris: { enabled: false },
      emotion: { enabled: false },
      /** Age/gender run with the description model stack */
      description: { enabled: true },
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: false },
  });

  await human.load();
  humanInstance = human;
  return humanInstance;
}

export async function estimateAgeFromImageFile(imagePath) {
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found: ${imagePath}`);
  }
  const human = await getFaceAgeEstimator();
  const tensor = await loadImageTensor(human, imagePath);
  try {
    const result = await human.detect(tensor);
    const faces = result?.face || [];
    if (!faces.length) {
      return { estimatedAge: null, faceCount: 0 };
    }
    faces.sort((a, b) => (b.box?.[2] || 0) * (b.box?.[3] || 0) - (a.box?.[2] || 0) * (a.box?.[3] || 0));
    const age = faces[0].age;
    if (age == null || !Number.isFinite(age)) {
      return { estimatedAge: null, faceCount: faces.length };
    }
    return {
      estimatedAge: Math.round(Number(age)),
      faceCount: faces.length,
    };
  } finally {
    tensor.dispose();
  }
}
