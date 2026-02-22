import { contextBridge, ipcRenderer } from 'electron';

type TabDirection = 'next' | 'prev';

const api = {
  triggerTabShortcut(direction: TabDirection): Promise<void> {
    return ipcRenderer.invoke('shortcut:tab', direction);
  },
  movePointer(normalizedX: number, normalizedY: number): Promise<void> {
    return ipcRenderer.invoke('pointer:move', normalizedX, normalizedY);
  },
  leftClick(): Promise<void> {
    return ipcRenderer.invoke('pointer:click');
  }
};

contextBridge.exposeInMainWorld('electronAPI', api);
