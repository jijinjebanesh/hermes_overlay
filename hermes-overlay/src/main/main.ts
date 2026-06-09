const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { join } = require('path');
const { existsSync, mkdirSync } = require('fs');
const Store = require('electron-store');

// Initialize store
const store = new Store();

// Create the app data directory if it doesn't exist
const appDataPath = app.getPath('userData');
if (!existsSync(appDataPath)) {
  mkdirSync(appDataPath, { recursive: true });
}

// Keep a global reference of the window object to prevent garbage collection
let mainWindow = null;
let tray = null;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    hasShadow: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../../preload/dist/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the React app
  mainWindow.loadFile(join(__dirname, '../../renderer/dist/index.html'));

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Set window position to bottom-right of screen
  const updatePosition = () => {
    if (!mainWindow) return;
    const { width, height } = mainWindow.getBounds();
    const { width: screenWidth, height: screenHeight } = require('electron').screen.getPrimaryDisplay().workAreaSize;
    mainWindow.setPosition(screenWidth - width - 20, screenHeight - height - 20);
  };

  // Update position on ready and resize
  mainWindow.once('ready-to-show', updatePosition);
  mainWindow.on('resize', updatePosition);
  require('electron').screen.getPrimaryDisplay().on('workarea-changed', updatePosition);
}

app.on('ready', () => {
  createWindow();
  registerGlobalShortcuts();
  createTray();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Global shortcuts
function registerGlobalShortcuts() {
  // Toggle overlay with Ctrl+Space
  globalShortcut.register('Ctrl+Space', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // Zen mode: Ctrl+Shift+Z
  globalShortcut.register('Ctrl+Shift+Z', () => {
    mainWindow.webContents.send('toggle-zen-mode');
  });

  // Micro mode: Ctrl+Shift+M
  globalShortcut.register('Ctrl+Shift+M', () => {
    mainWindow.webContents.send('toggle-micro-mode');
  });
}

// Tray icon
function createTray() {
  const icon = nativeImage.createFromPath(join(__dirname, '../../assets/icon.png'));
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Hermes',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setToolTip('Hermes Overlay');
  tray.setContextMenu(contextMenu);
}

// IPC handlers
ipcMain.handle('get-store-value', (event, key) => {
  return store.get(key);
});

ipcMain.handle('set-store-value', (event, key, value) => {
  store.set(key, value);
  return true;
});

// Handle permissions
ipcMain.on('permission-request', (event, request) => {
  // In a real implementation, this would show a permission ticker in the overlay
  // For now, we just log it
  console.log('Permission request:', request);
  // Auto-allow for demo purposes
  mainWindow.webContents.send('permission-response', { requestId: request.id, allowed: true });
});