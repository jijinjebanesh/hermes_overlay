/**
 * Window — BrowserWindow creation, positioning, and visibility management.
 */

import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { loadOverlayConfig, saveOverlayConfig } from './config';

let mainWindow: BrowserWindow | null = null;
let isVisible = false;
let hideTimeout: NodeJS.Timeout | null = null;
let isQuitting = false;

const WIDTH = 420;
const MAX_HEIGHT = 600;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getIsVisible(): boolean {
  return isVisible;
}

export function setIsQuitting(value: boolean) {
  isQuitting = value;
}

export function createWindow() {
  const config = loadOverlayConfig();
  const savedBounds = config.bounds;

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || WIDTH,
    height: savedBounds?.height || MAX_HEIGHT,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 380,
    maxWidth: WIDTH,
    minHeight: 300,
    maxHeight: MAX_HEIGHT,
    frame: false,
    alwaysOnTop: savedBounds?.alwaysOnTop ?? true,
    transparent: true,
    hasShadow: false,
    thickFrame: false,
    skipTaskbar: true,
    show: false,
    resizable: false,
    title: 'Hermes',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (!savedBounds) {
    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + workArea.width - WIDTH - 24;
    const y = workArea.y + workArea.height - MAX_HEIGHT - 24;
    mainWindow.setBounds({ x, y, width: WIDTH, height: MAX_HEIGHT });
  }

  mainWindow.setTitle('Hermes');

  // Prevent destroy on close — hide instead
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.webContents.send('visibility-change', false);
      isVisible = false;

      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (!isVisible && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.hide();
        }
      }, 200);
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.on('moved', () => {
    if (mainWindow) saveOverlayConfig({ bounds: mainWindow.getBounds() });
  });
  mainWindow.on('resized', () => {
    if (mainWindow) saveOverlayConfig({ bounds: mainWindow.getBounds() });
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

export function toggleVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (hideTimeout) clearTimeout(hideTimeout);

  if (isVisible) {
    isVisible = false;
    mainWindow.webContents.send('visibility-change', false);
    hideTimeout = setTimeout(() => {
      if (!isVisible && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
    }, 10);
  } else {
    mainWindow.show();
    isVisible = true;
    mainWindow.webContents.send('visibility-change', true);
    mainWindow.focus();
    mainWindow.webContents.send('focus-input');
  }
}
