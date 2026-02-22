import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceWasmDir = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const targetWasmDir = path.join(root, 'public', 'mediapipe', 'wasm');

mkdirSync(targetWasmDir, { recursive: true });

if (!existsSync(sourceWasmDir)) {
  console.error('[sync-mediapipe-assets] source wasm directory not found:', sourceWasmDir);
  process.exit(1);
}

cpSync(sourceWasmDir, targetWasmDir, { recursive: true });

console.log('[sync-mediapipe-assets] copied wasm assets to public/mediapipe/wasm');
console.log('[sync-mediapipe-assets] place model files here if network is restricted:');
console.log('  public/mediapipe/models/hand_landmarker.task');
console.log('  public/mediapipe/models/face_landmarker.task');
