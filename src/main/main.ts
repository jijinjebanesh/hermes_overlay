/**
 * Main Process Orchestrator — Hermes Overlay
 *
 * This is the slim entry point that composes all modules:
 * - config:        Overlay config persistence
 * - window:        BrowserWindow lifecycle & visibility
 * - tray:          System tray icon
 * - hotkey-server: HTTP toggle server for AHK
 * - ipc-handlers:  All IPC handler registrations
 * - clap-detector: Python clap detection subprocess
 * - hermes-cli:    Hermes CLI spawning & streaming
 *
 * Previously 1305 lines — now a clean composition.
 */

import { app, BrowserWindow, globalShortcut, net, protocol } from 'electron';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import { loadOverlayConfig } from './config';
import { createWindow, toggleVisibility, setIsQuitting, getMainWindow } from './window';
import { createTray } from './tray';
import { startHotkeyServer } from './hotkey-server';
import { registerIpcHandlers } from './ipc-handlers';
import { startClapDetector, stopClapDetector } from './clap-detector';
import { stopWhisperDaemon } from './whisper-daemon';
import { killActiveChild } from './hermes-cli';
import { registerQuickActionsHotkey, unregisterQuickActionsHotkey } from './quick-actions';

function registerLocalFileProtocol() {
  try {
    protocol.handle('local-file', async (request) => {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('path');

      if (!filePath) {
        return new Response('Missing file path', { status: 400 });
      }

      if (!path.isAbsolute(filePath)) {
        return new Response('Path must be absolute', { status: 400 });
      }

      try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
          return new Response('Not a file', { status: 400 });
        }
      } catch (e) {
        return new Response('File not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(filePath).toString());
    });
  } catch (error) {
    console.error('Failed to register local-file protocol:', error);
  }
}

/* ═══════════════════════════════════════════════
   SINGLE INSTANCE LOCK
   ═══════════════════════════════════════════════ */

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    registerLocalFileProtocol();
    createWindow();
    createTray(() => { setIsQuitting(true); app.quit(); });
    startClapDetector();

    startHotkeyServer();
    registerIpcHandlers();

    // Register global hotkey for overlay toggle
    const config = loadOverlayConfig();
    const triggerHotkey = config.triggerHotkey || 'F9';
    try {
      globalShortcut.register(triggerHotkey, toggleVisibility);
      console.log('✓ Registered hotkey:', triggerHotkey);
    } catch (e) {
      console.error('Failed to register hotkey:', e);
      try {
        globalShortcut.register('F9', toggleVisibility);
        console.log('✓ Registered fallback hotkey: F9');
      } catch (e2) {
        console.error('Failed to register fallback F9:', e2);
      }
    }

    // Register Push-to-Talk hotkey (Ctrl+Space) for Echo Mode walkie-talkie
    try {
      globalShortcut.register('Control+Space', () => {
        const win = getMainWindow();
        if (!win) return;
        // Send key-down to renderer — EchoEngine starts recording
        win.webContents.send('push-to-talk-start');
      });
      console.log('✓ Registered Push-to-Talk hotkey: Ctrl+Space');
    } catch (e) {
      console.error('Failed to register Push-to-Talk:', e);
    }

    // Register Quick Actions hotkey (Ctrl+Shift+A) for floating toolbar
    registerQuickActionsHotkey();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

/* ═══════════════════════════════════════════════
   APP LIFECYCLE
   ═══════════════════════════════════════════════ */

app.on('before-quit', () => {
  setIsQuitting(true);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  unregisterQuickActionsHotkey();
  stopClapDetector();
  stopWhisperDaemon();
  killActiveChild();
});