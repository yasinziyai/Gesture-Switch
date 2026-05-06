import { cpSync, createWriteStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { get as httpsGet } from 'node:https';
import path from 'node:path';

const root = process.cwd();
const sourceWasmDir = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const targetWasmDir = path.join(root, 'public', 'mediapipe', 'wasm');
const modelsDir = path.join(root, 'public', 'mediapipe', 'models');

const MODELS = [
  {
    name: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    sha256: 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1',
    minBytes: 7_000_000
  },
  {
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
    minBytes: 3_000_000
  }
];

mkdirSync(targetWasmDir, { recursive: true });
mkdirSync(modelsDir, { recursive: true });

if (!existsSync(sourceWasmDir)) {
  console.error('[sync-mediapipe-assets] source wasm directory not found:', sourceWasmDir);
  process.exit(1);
}

cpSync(sourceWasmDir, targetWasmDir, { recursive: true });

console.log('[sync-mediapipe-assets] copied wasm assets to public/mediapipe/wasm');

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode ?? 'unknown'}`));
        return;
      }

      pipeline(response, createWriteStream(outputPath)).then(resolve).catch(reject);
    });

    request.on('error', reject);
  });
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const file = await fs.readFile(filePath);
  hash.update(file);
  return hash.digest('hex');
}

async function isValidModel(modelPath, expectedSha256, minBytes) {
  if (!existsSync(modelPath)) {
    return false;
  }

  const stat = await fs.stat(modelPath);
  if (stat.size < minBytes) {
    return false;
  }

  const signature = await fs.readFile(modelPath, { encoding: null });
  if (signature.length < 2 || signature[0] !== 0x50 || signature[1] !== 0x4b) {
    return false;
  }

  const hash = await sha256File(modelPath);
  return hash === expectedSha256;
}

async function ensureModel(model) {
  const modelPath = path.join(modelsDir, model.name);
  const tmpPath = `${modelPath}.tmp`;
  const valid = await isValidModel(modelPath, model.sha256, model.minBytes);

  if (valid) {
    console.log(`[sync-mediapipe-assets] model ready: public/mediapipe/models/${model.name}`);
    return true;
  }

  console.warn(`[sync-mediapipe-assets] missing or invalid model: public/mediapipe/models/${model.name}`);
  console.warn(`[sync-mediapipe-assets] downloading ${model.name} ...`);

  try {
    await fs.rm(tmpPath, { force: true });
    await downloadFile(model.url, tmpPath);

    const downloadedValid = await isValidModel(tmpPath, model.sha256, model.minBytes);
    if (!downloadedValid) {
      throw new Error('downloaded file failed validation');
    }

    await fs.rename(tmpPath, modelPath);
    console.log(`[sync-mediapipe-assets] downloaded model: public/mediapipe/models/${model.name}`);
    return true;
  } catch (error) {
    await fs.rm(tmpPath, { force: true });
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[sync-mediapipe-assets] failed to download ${model.name}: ${message}`);
    return false;
  }
}

const results = await Promise.all(MODELS.map((model) => ensureModel(model)));

if (results.some((ok) => !ok)) {
  console.warn('[sync-mediapipe-assets] offline mode requires valid local model files:');
  for (const model of MODELS) {
    console.warn(`  ${model.url}`);
    console.warn(`  -> public/mediapipe/models/${model.name}`);
  }
  console.warn('[sync-mediapipe-assets] app does not use remote model fallback at runtime.');
}
