import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, session } from 'electron';
import type { Event as ElectronEvent, IpcMainInvokeEvent } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

if (!app.isPackaged) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}

function appleScriptForDesktop(direction: 'next' | 'prev'): string {
  const keyCode = direction === 'next' ? 124 : 123;
  return `tell application "System Events"\nkey code ${keyCode} using {control down}\nend tell`;
}

async function triggerMacDesktopShortcut(direction: 'next' | 'prev'): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('macOS is required for desktop space shortcuts');
  }

  await execFileAsync('osascript', ['-e', appleScriptForDesktop(direction)]);
}

async function runJxa(script: string): Promise<void> {
  await execFileAsync('osascript', ['-l', 'JavaScript', '-e', script]);
}

async function moveMousePointer(normalizedX: number, normalizedY: number): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('macOS is required for pointer control');
  }

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  const clampedX = Math.max(0, Math.min(1, normalizedX));
  const clampedY = Math.max(0, Math.min(1, normalizedY));
  const targetX = Math.round(x + clampedX * width);
  const targetY = Math.round(y + clampedY * height);

  const script = [
    'ObjC.import("ApplicationServices");',
    `const point = $.CGPointMake(${targetX}, ${targetY});`,
    '$.CGWarpMouseCursorPosition(point);'
  ].join('\n');

  await runJxa(script);
}

async function leftMouseClick(): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('macOS is required for pointer control');
  }

  const script = [
    'ObjC.import("ApplicationServices");',
    'const eventSource = $.CGEventSourceCreate($.kCGEventSourceStateCombinedSessionState);',
    'const current = $.CGEventGetLocation($.CGEventCreate(null));',
    'const down = $.CGEventCreateMouseEvent(eventSource, $.kCGEventLeftMouseDown, current, $.kCGMouseButtonLeft);',
    'const up = $.CGEventCreateMouseEvent(eventSource, $.kCGEventLeftMouseUp, current, $.kCGMouseButtonLeft);',
    '$.CGEventPost($.kCGHIDEventTap, down);',
    '$.CGEventPost($.kCGHIDEventTap, up);'
  ].join('\n');

  await runJxa(script);
}

function positionWindowUnderTray(window: BrowserWindow): void {
  const trayBounds = tray?.getBounds();
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const windowBounds = window.getBounds();

  if (!trayBounds) {
    const x = Math.round(display.workArea.x + display.workArea.width - windowBounds.width - 12);
    const y = Math.round(display.workArea.y + 10);
    window.setPosition(x, y, false);
    return;
  }

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = Math.round(trayBounds.y + trayBounds.height + 8);
  window.setPosition(x, y, false);
}

function showWindow(): void {
  if (!mainWindow) {
    return;
  }

  positionWindowUnderTray(mainWindow);
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide();
    return;
  }

  showWindow();
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 560,
    minWidth: 420,
    minHeight: 520,
    maxWidth: 520,
    maxHeight: 680,
    title: 'Gesture Switch',
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0b1530',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('blur', () => {
    if (!app.isPackaged && mainWindow?.webContents.isDevToolsOpened()) {
      return;
    }

    mainWindow?.hide();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (!app.isPackaged && devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function createTray(): void {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setTitle('GS');
  tray.setToolTip('Gesture Switch');
  tray.on('click', () => {
    toggleWindow();
  });

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Gesture Switch',
      click: () => showWindow()
    },
    {
      type: 'separator'
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  ipcMain.handle('shortcut:tab', async (_event: IpcMainInvokeEvent, direction: 'next' | 'prev') => {
    await triggerMacDesktopShortcut(direction);
  });

  ipcMain.handle(
    'pointer:move',
    async (_event: IpcMainInvokeEvent, normalizedX: number, normalizedY: number) => {
      await moveMousePointer(normalizedX, normalizedY);
    }
  );

  ipcMain.handle('pointer:click', async () => {
    await leftMouseClick();
  });

  await createWindow();
  createTray();
  showWindow();

  app.on('activate', () => {
    showWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (event: ElectronEvent) => {
  event.preventDefault();
});
