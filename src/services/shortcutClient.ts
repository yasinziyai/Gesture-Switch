import type { TabDirection } from '../types/gesture';

export async function triggerTabShortcut(direction: TabDirection): Promise<void> {
  if (!window.electronAPI) {
    throw new Error('Electron bridge is not available. Run the app with Electron.');
  }

  await window.electronAPI.triggerTabShortcut(direction);
}

export async function movePointer(normalizedX: number, normalizedY: number): Promise<void> {
  if (!window.electronAPI) {
    throw new Error('Electron bridge is not available. Run the app with Electron.');
  }

  await window.electronAPI.movePointer(normalizedX, normalizedY);
}

export async function leftClick(): Promise<void> {
  if (!window.electronAPI) {
    throw new Error('Electron bridge is not available. Run the app with Electron.');
  }

  await window.electronAPI.leftClick();
}
