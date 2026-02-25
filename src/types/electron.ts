import type { TabDirection } from './gesture';

export interface ElectronAPI {
  triggerTabShortcut(direction: TabDirection): Promise<void>;
  movePointer(normalizedX: number, normalizedY: number): Promise<void>;
  leftClick(): Promise<void>;
  openWhiteboard(): Promise<void>;
  closeWhiteboard(): Promise<void>;
}
