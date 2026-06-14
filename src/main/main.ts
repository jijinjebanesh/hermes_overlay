import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
  desktopCapturer,
  dialog,
  shell,
} from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, execSync, ChildProcess } from 'child_process';
import http from 'http';

/* ═══════════════════════════════════════════════
   PATHS & DIRECTORIES
   ═══════════════════════════════════════════════ */

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isVisible = true;  // Starts visible (matches show: true in createWindow)
let isQuitting = false;
let activeChild: ChildProcess | null = null;
let hideTimeout: NodeJS.Timeout | null = null;

const hermesDir = path.join(os.homedir(), '.hermes');
const overlayConfigPath = path.join(hermesDir, 'overlay.json');
const sessionsDir = path.join(hermesDir, 'sessions');
const scriptsDir = path.join(__dirname, '..', 'scripts');

if (!fs.existsSync(hermesDir)) fs.mkdirSync(hermesDir, { recursive: true });
if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });


/* ═══════════════════════════════════════════════
   OVERLAY CONFIG PERSISTENCE
   ═══════════════════════════════════════════════ */

function loadOverlayConfig(): Record<string, any> {
  try {
    if (fs.existsSync(overlayConfigPath)) {
      return JSON.parse(fs.readFileSync(overlayConfigPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load overlay config', e);
  }
  return {};
}

function saveOverlayConfig(data: Record<string, any>) {
  try {
    const existing = loadOverlayConfig();
    fs.writeFileSync(
      overlayConfigPath,
      JSON.stringify({ ...existing, ...data }, null, 2)
    );
  } catch (e) {
    console.error('Failed to save overlay config', e);
  }
}

function updateAhkScript(electronHotkey: string) {
  let ahkModifier = '';
  const parts = electronHotkey.split('+');
  const key = parts.pop() || '';
  
  for (const mod of parts) {
    if (mod === 'CommandOrControl' || mod === 'Control' || mod === 'Ctrl') ahkModifier += '^';
    else if (mod === 'Alt') ahkModifier += '!';
    else if (mod === 'Shift') ahkModifier += '+';
    else if (mod === 'Meta' || mod === 'Command' || mod === 'Super') ahkModifier += '#';
  }
  
  const keyMapped = key.toLowerCase();
  const ahkHotkey = ahkModifier + keyMapped;
  const killHotkey = '^!+' + keyMapped;
  
  const ahkPaths = [
      path.join(__dirname, '..', '..', 'hotkey.ahk'),
      path.join(app.getAppPath(), '..', 'hotkey.ahk'),
      path.join(app.getAppPath(), '..', '..', 'hotkey.ahk'),
      'C:\\\\\\\\Users\\\\\\\\jijin\\\\\\\\hermes-overlay\\\\\\\\hotkey.ahk'
    ];
  
  let ahkPath = '';
  for (const p of ahkPaths) {
    if (fs.existsSync(p)) { ahkPath = p; break; }
  }
  
  if (!ahkPath) return;

  try {
      const friendlyName = electronHotkey.replace('CommandOrControl', 'Ctrl');
      const lines = fs.readFileSync(ahkPath, 'utf8').split('\n');
      let triggerReplaced = false;
      for (let i = 0; i < lines.length; i++) {
        // Replace first hotkey (main toggle)
        if (!triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
          lines[i] = `${ahkHotkey}:: {`;
          triggerReplaced = true;
        } 
        // Replace second hotkey (kill switch) - keep it as Ctrl+Alt+Shift+KEY
        else if (triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
          lines[i] = `${killHotkey}:: {`;
        } 
        // Update startup tooltip to show current hotkey
        else if (lines[i].includes('Hotkey Active')) {
          lines[i] = `ToolTip("${friendlyName} Daemon Active — Press ${friendlyName} to toggle Hermes", 10, 10)
`;
        }
        // Remove any hardcoded F2 references in comments
        else if (lines[i].includes('F2') && lines[i].trim().startsWith(';')) {
          lines[i] = lines[i].replace(/F2/g, friendlyName || 'hotkey');
        }
      }
      fs.writeFileSync(ahkPath, lines.join('\n'), 'utf8');
    
      // Reload AHK - this will restart the script with new hotkey
      spawn('cmd.exe', ['/c', 'start', '', ahkPath], { detached: true, stdio: 'ignore' });
    } catch (e) {
      console.error('Failed to update AHK script', e);
    }
  }


/* ═══════════════════════════════════════════════
   WINDOW CREATION
   ═══════════════════════════════════════════════ */

function createWindow() {
  const config = loadOverlayConfig();
  const savedBounds = config.bounds;
  const WIDTH = 420;
  const MAX_HEIGHT = 600;
  const MIN_HEIGHT = 56;

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
        hasShadow: false,  // Disable to prevent corner artifacts with rounded borders
        thickFrame: false,
    skipTaskbar: true,
        show: true,   // Start VISIBLE so Electron initializes the BrowserWindow properly
                        // AHK will hide it on first F9 press (since windowVisible starts false)
        resizable: false,
    title: 'Hermes',  // Explicit title so AHK WinExist finds it before HTML loads
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

  // Critical: Set window title immediately so AHK can find it
  mainWindow.setTitle('Hermes');
  
  // Prevent window from being destroyed on close — hide it instead
  // This is critical: without this, clicking X or OS-level close destroys the
  // BrowserWindow, and subsequent show() calls fail silently.
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

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


/* ═══════════════════════════════════════════════
   TRAY ICON
   ═══════════════════════════════════════════════ */

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('Hermes Overlay - Press F9 to toggle');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show/Hide (F9)', click: () => toggleVisibility() },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', () => {
    // Tray click should show/focus the window
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (isVisible) {
        // If already visible, just focus it
        mainWindow.focus();
      } else {
        // If hidden, show it
        toggleVisibility();
      }
    }
  });
}


/* ═══════════════════════════════════════════════
   VISIBILITY TOGGLE
   ═══════════════════════════════════════════════ */

function toggleVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    console.log('[toggleVisibility] Window destroyed, skipping');
    return;
  }

  // Cancel any pending hide timeout immediately for instant response
  if (hideTimeout) clearTimeout(hideTimeout);

  if (isVisible) {
    // Window is visible - hide it immediately
    console.log('[toggleVisibility] Hiding window');
    isVisible = false;
    mainWindow.webContents.send('visibility-change', false);
    
    // Hide the window after a very short delay to allow renderer to process visibility change
    hideTimeout = setTimeout(() => {
      if (!isVisible && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
        console.log('[toggleVisibility] Window hidden');
      }
    }, 10);  // Reduced from 50ms to 10ms for faster response
  } else {
    // Window is hidden - show it immediately
    console.log('[toggleVisibility] Showing window');
    mainWindow.show();
    isVisible = true;
    mainWindow.webContents.send('visibility-change', true);
    mainWindow.focus();
    mainWindow.webContents.send('focus-input');
    console.log('[toggleVisibility] Window shown and focused');
  }
}





/* ═══════════════════════════════════════════════
   ECHO MODE & CLAP DETECTOR
   ═══════════════════════════════════════════════ */

let clapDetector: ChildProcess | null = null;

function startClapDetector() {
  if (clapDetector) return;
  const config = loadOverlayConfig();
  // Default to OFF - must be explicitly enabled
  if (config.echoClapWakeEnabled !== true) {
    console.log('[ClapDetector] Not starting - echoClapWakeEnabled is false');
    return;
  }
  
  const hermesAgentVenvPython = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe');
  // Robust script path resolution
  const scriptPaths = [
    path.join(__dirname, '..', 'src', 'audio', 'clap_detector.py'),
    path.join(app.getAppPath(), 'src', 'audio', 'clap_detector.py'),
    path.join(app.getAppPath(), '..', 'src', 'audio', 'clap_detector.py')
  ];
  let clapScriptPath = '';
  for (const p of scriptPaths) {
    if (fs.existsSync(p)) {
      clapScriptPath = p;
      break;
    }
  }

  if (!clapScriptPath) {
    console.error('[ClapDetector] Could not find clap_detector.py');
    return;
  }
  
  console.log('[ClapDetector] Starting...', { 
    python: hermesAgentVenvPython, 
    script: clapScriptPath,
    appPath: app.getAppPath(),
    dirname: __dirname
  });
  
  clapDetector = spawn(hermesAgentVenvPython, [clapScriptPath]);

  clapDetector.stdout?.on('data', (data: Buffer) => {
      try {
        const msgs = data.toString().trim().split('\n');
        for (const msgStr of msgs) {
          if (!msgStr) continue;
          const msg = JSON.parse(msgStr);
        
          // Check for double_clap event (Python outputs "type" field)
          if (msg.type === 'double_clap') {
            console.log('[ClapDetector] DOUBLE CLAP DETECTED!', msg);
            if (!mainWindow) return;
            
            const currentConfig = loadOverlayConfig();
            
            if (!isVisible) {
              toggleVisibility(); // Show the overlay
              mainWindow.webContents.send('enter-echo-mode');
            } else if (currentConfig.echoDoubleClapMinimize) {
              toggleVisibility(); // Minimize the overlay
            }
          }
        }
      } catch (e) {
        console.error('[ClapDetector] Error parsing output:', e);
      }
    });

  clapDetector.stderr?.on('data', (data: Buffer) => {
    console.error('[ClapDetector] Log:', data.toString());
  });

  clapDetector.on('error', (err) => {
    console.error('[ClapDetector] Failed to start:', err);
  });

  clapDetector.on('close', (code) => {
    console.log('[ClapDetector] Exited with code:', code);
    clapDetector = null;
  });
}

function stopClapDetector() {
  if (clapDetector && !clapDetector.killed) {
    clapDetector.kill();
    clapDetector = null;
  }
}

/* ═══════════════════════════════════════════════
   APP READY — Register hotkeys & IPC handlers
   ═══════════════════════════════════════════════ */

// Request single instance lock - ensures only one instance of the app runs
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // This is a second instance - quit immediately
  console.log('Another instance is already running. Quitting.');
  app.quit();
} else {
  // This is the first instance - handle second-instance events
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // If someone tries to launch a second instance, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
      isVisible = true;
    }
  });

  app.whenReady().then(() => {
      createWindow();
      createTray();
      startClapDetector();

      // Start local HTTP server for AHK communication
      const toggleServer = http.createServer((req, res) => {
        if (req.url === '/toggle' && req.method === 'POST') {
          toggleVisibility();
          res.writeHead(200);
          res.end('OK');
        } else if (req.url === '/show' && req.method === 'POST') {
          if (!isVisible && mainWindow && !mainWindow.isDestroyed()) {
            toggleVisibility();
          }
          res.writeHead(200);
          res.end('OK');
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      toggleServer.listen(34567, 'localhost', () => {
        console.log('✓ Toggle server listening on port 34567');
      });

    const config = loadOverlayConfig();
    // Default to F9 if no hotkey is configured
    const triggerHotkey = config.triggerHotkey || 'F9';
  
    // Register the configured hotkey
        try {
          globalShortcut.register(triggerHotkey, toggleVisibility);
          console.log('✓ Registered Electron hotkey:', triggerHotkey);
        } catch (e) {
          console.error('Failed to register hotkey:', e);
          // Fallback to F9 if custom hotkey fails
          try {
            globalShortcut.register('F9', toggleVisibility);
            console.log('✓ Registered fallback hotkey: F9');
          } catch (e2) {
            console.error('Failed to register fallback F9:', e2);
          }
        }
    
        console.log('Electron hotkey registered:', triggerHotkey);

      /* ── IPC HANDLERS ── */

  // Get persisted config
  ipcMain.handle('get-config', async () => loadOverlayConfig());

  // Fetch live provider/model inventory via Python bridge
  ipcMain.handle('get-inventory', async () => {
    return new Promise((resolve) => {
      try {
        // Find the inventory script
        const scriptPaths = [
          path.join(scriptsDir, 'model_inventory.py'),
          path.join(app.getAppPath(), 'scripts', 'model_inventory.py'),
          path.join(__dirname, '..', '..', 'scripts', 'model_inventory.py'),
        ];
        
        let scriptPath = '';
        for (const p of scriptPaths) {
          if (fs.existsSync(p)) { scriptPath = p; break; }
        }
        
        if (!scriptPath) {
          resolve({ error: 'model_inventory.py not found', providers: [], model: '', provider: '' });
          return;
        }

        const child = spawn('python', [scriptPath], {
          shell: true,
          timeout: 30000,
          env: { ...process.env },
        });

        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        child.on('close', () => {
          try {
            // Extract just the JSON from stdout (ignore any stderr/warnings)
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              resolve(JSON.parse(jsonMatch[0]));
            } else {
              resolve({ error: 'No JSON output', providers: [], model: '', provider: '' });
            }
          } catch (e: any) {
            resolve({ error: e.message, providers: [], model: '', provider: '' });
          }
        });

        child.on('error', (err: any) => {
          resolve({ error: err.message, providers: [], model: '', provider: '' });
        });
      } catch (e: any) {
        resolve({ error: e.message, providers: [], model: '', provider: '' });
      }
    });
  });

  // Set active model globally in hermes
  ipcMain.on('set-provider-model', (_e, provider: string, model: string) => {
    saveOverlayConfig({ activeProvider: provider, activeModel: model });
    try {
      const scriptPaths = [
        path.join(scriptsDir, 'set_model.py'),
        path.join(app.getAppPath(), 'scripts', 'set_model.py'),
        path.join(__dirname, '..', '..', 'scripts', 'set_model.py'),
      ];
      let scriptPath = '';
      for (const p of scriptPaths) {
        if (fs.existsSync(p)) { scriptPath = p; break; }
      }
      if (scriptPath) {
        // Run python to update global config
        execSync(`python "${scriptPath}" "${provider}" "${model}"`, { timeout: 5000 });
      }
    } catch (e) {
      console.error('Failed to update hermes config', e);
    }
  });

  // Save session
  ipcMain.on('save-session', (_e, data: { sessionId: string; markdown: string }) => {
    const savePath = path.join(sessionsDir, `${data.sessionId}.md`);
    fs.writeFileSync(savePath, data.markdown);
  });

  // Abort stream
  ipcMain.on('abort-stream', () => {
    if (activeChild && !activeChild.killed) {
      activeChild.kill('SIGTERM');
      activeChild = null;
    }
  });

  // Close overlay
  ipcMain.on('close-overlay', () => {
    toggleVisibility();
  });

  // Send input to active stream (for interactive prompts)
  ipcMain.on('send-input', (_e, input: string) => {
    if (activeChild && !activeChild.killed && activeChild.stdin) {
      activeChild.stdin.write(input);
    }
  });

  // Screenshot capture
  ipcMain.handle('capture-screenshot', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      });
      if (sources.length === 0) return null;
      const primarySource = sources[0];
      const thumbnail = primarySource.thumbnail;
      const tmpDir = path.join(os.tmpdir(), 'hermes-screenshots');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const filename = `screenshot_${Date.now()}.png`;
      const filepath = path.join(tmpDir, filename);
      fs.writeFileSync(filepath, thumbnail.toPNG());
      return { path: filepath, name: filename };
    } catch (e) {
      console.error('Screenshot capture failed:', e);
      return null;
    }
  });

  // File picker dialog
  ipcMain.handle('open-file-dialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'All Supported', extensions: [
          'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
          'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf',
          'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'log',
          'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h',
          'cs', 'swift', 'kt', 'sh', 'ps1', 'bat', 'html', 'css', 'sql',
        ] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filepath = result.filePaths[0];
    return { path: filepath, name: path.basename(filepath) };
  });

  /* ── ECHO MODE IPC HANDLERS ── */

      // Find the hermes-agent venv Python and CLI path
      const hermesAgentVenvPython = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe');
      const cliPath = path.join(os.homedir(), 'hermes-overlay', 'hermes-agent', 'cli.py');

      ipcMain.handle('transcribe-audio', async (_event, buffer: Uint8Array) => {
        const tmpPath = path.join(os.tmpdir(), `hermes_echo_${Date.now()}.webm`);
        fs.writeFileSync(tmpPath, Buffer.from(buffer));

        return new Promise((resolve, reject) => {
          const proc = spawn(hermesAgentVenvPython, [cliPath, '--transcribe', tmpPath]);
          let out = '';
          proc.stdout?.on('data', d => out += d);
          proc.on('close', () => {
            try { fs.unlinkSync(tmpPath); } catch (e) {}
            resolve(out.trim());
          });
          proc.on('error', (err) => {
            console.error('Transcribe spawn error:', err);
            resolve('');
          });
          // Timeout after 30s
          setTimeout(() => {
            proc.kill();
            resolve('');
          }, 30000);
        });
      });

      ipcMain.handle('synthesize-speech', async (_event, { text, voice }) => {
        return new Promise((resolve, reject) => {
          const args = [cliPath, '--tts', text];
          if (voice) {
            args.push('--voice', voice);
          }
          const proc = spawn(hermesAgentVenvPython, args);
          const chunks: Buffer[] = [];
          let errOutput = '';
        
          proc.stdout?.on('data', (d: Buffer) => chunks.push(d));
          proc.stderr?.on('data', (d) => errOutput += d.toString());
        
          proc.on('close', (code) => {
            if (code !== 0 || chunks.length === 0) {
              console.error('TTS failed:', errOutput);
              resolve([]); // Return empty array on failure
            } else {
              const audioBuffer = Buffer.concat(chunks);
              // Convert to array for IPC transfer
              resolve(Array.from(audioBuffer));
            }
          });
          proc.on('error', (err) => {
            console.error('TTS spawn error:', err);
            resolve([]);
          });
          // Timeout after 15s
          setTimeout(() => {
            proc.kill();
            resolve([]);
          }, 15000);
        });
      });

  ipcMain.handle('echo-send-message', async (_event, { text }) => {
        console.log('[Echo IPC] Received message:', text);
        return new Promise((resolve) => {
          const config = loadOverlayConfig();
          const args = ['-z', text];
          if (config.activeProvider) args.push('--provider', config.activeProvider);
          if (config.activeModel) args.push('--model', config.activeModel);

          console.log('[Echo IPC] Spawning hermes.exe with args:', args.join(' '));
          const proc = spawn('hermes.exe', args);
          let out = '';
          let err = '';
        
          proc.stdout?.on('data', d => {
            const chunk = d.toString();
            out += chunk;
            console.log('[Echo IPC] stdout:', chunk.substring(0, 100));
          });
          proc.stderr?.on('data', d => {
            err += d.toString();
            console.error('[Echo IPC] stderr:', d.toString().substring(0, 200));
          });
          proc.on('close', (code) => {
            console.log('[Echo IPC] Process closed, code:', code, 'output:', out.trim().substring(0, 200));
            resolve(out.trim());
          });
          proc.on('error', (err) => {
            console.error('[Echo IPC] Spawn error:', err);
            resolve('');
          });
          // Timeout after 65s
          setTimeout(() => {
            console.log('[Echo IPC] Timeout, killing process');
            proc.kill();
            resolve('');
          }, 65000);
        });
      });

  ipcMain.on('update-echo-settings', () => {
        stopClapDetector();
        startClapDetector();
      });

    // Trigger Echo Mode manually (from UI button)
    ipcMain.on('trigger-echo-mode', () => {
      if (!mainWindow) return;
      console.log('[Echo IPC] Manual trigger from UI button');
      mainWindow.webContents.send('enter-echo-mode');
    });

    ipcMain.on('trigger-wake-word', () => {
      console.log('[Echo IPC] Wake word detected');
      if (!mainWindow) return;
      if (!isVisible) {
        toggleVisibility();
      }
      mainWindow.webContents.send('enter-echo-mode');
    });

    /* ── FILE ATTACHMENT IPC HANDLER ── */
    ipcMain.handle('read-dropped-file', async (_event, filePath: string) => {
      try {
        const stats = fs.statSync(filePath);
        const size = stats.size;
        const MAX_SIZE = 500 * 1024; // 500KB cap

        if (size > MAX_SIZE) {
          return {
            name: path.basename(filePath),
            path: filePath,
            content: null,
            tooBig: true,
            size: size
          };
        }

        const ext = path.extname(filePath).slice(1).toLowerCase();
        const textExtensions = [
          'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log',
          'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
          'cs', 'swift', 'kt', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
          'html', 'css', 'scss', 'less', 'sql', 'graphql'
        ];

        const isText = textExtensions.includes(ext);
        const content = isText ? fs.readFileSync(filePath, 'utf-8') : null;

        return {
          name: path.basename(filePath),
          path: filePath,
          content: content,
          tooBig: false,
          size: size,
          ext: ext,
          isImage: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)
        };
      } catch (e: any) {
        console.error('Failed to read dropped file:', e);
        return {
          name: path.basename(filePath),
          path: filePath,
          content: null,
          tooBig: false,
          size: 0,
          error: e.message
        };
      }
    });

    /* ── DIRECTORY AUTOCOMPLETE IPC HANDLER ── */
    ipcMain.handle('read-dir', async (_event, dirPath: string) => {
      try {
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        const results = await Promise.all(items.map(async (item) => {
          const itemPath = path.join(dirPath, item.name);
          let size = 0;
          try {
            if (!item.isDirectory()) {
              const stats = await fs.promises.stat(itemPath);
              size = stats.size;
            }
          } catch (e) {
            // Ignore stat errors for unreadable files
          }
          return {
            name: item.name,
            isDir: item.isDirectory(),
            size
          };
        }));

        // Sort directories first, then files
        return results.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name);
        });
      } catch (e: any) {
        // If directory doesn't exist or isn't readable, just return empty
        return [];
      }
    });

  /* ── FILE/PATH IPC HANDLERS ── */
  ipcMain.on('open-path', (_e, targetPath: string) => {
    shell.openPath(targetPath);
  });

  /* ── SETTINGS IPC HANDLERS ── */
  ipcMain.on('open-terminal', () => {
    // Open a detached powershell instance
    spawn('cmd.exe', ['/c', 'start powershell'], { detached: true, stdio: 'ignore' });
  });

  ipcMain.on('reset-bounds', () => {
    if (!mainWindow) return;
    const WIDTH = 420;
    const MAX_HEIGHT = 600;
    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + workArea.width - WIDTH - 24;
    const y = workArea.y + workArea.height - MAX_HEIGHT - 24;
    mainWindow.setBounds({ x, y, width: WIDTH, height: MAX_HEIGHT });
    saveOverlayConfig({ bounds: mainWindow.getBounds() });
  });

  ipcMain.on('set-launch-at-startup', (_e, enable: boolean) => {
    app.setLoginItemSettings({
      openAtLogin: enable,
      openAsHidden: true,
    });
    saveOverlayConfig({ launchAtStartup: enable });
  });

  ipcMain.handle('clear-all-sessions', async () => {
      try {
        const files = fs.readdirSync(sessionsDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            fs.unlinkSync(path.join(sessionsDir, file));
          }
        }
        return true;
      } catch (e) {
        console.error('Failed to clear sessions', e);
        return false;
      }
    });

    /* ── SESSION HISTORY IPC HANDLERS ── */
  
    // List all sessions from hermes state.db
        ipcMain.handle('list-sessions', async () => {
          return new Promise((resolve) => {
            try {
              const scriptPaths = [
                path.join(scriptsDir, 'list_sessions.py'),
                path.join(app.getAppPath(), 'scripts', 'list_sessions.py'),
                path.join(__dirname, '..', '..', 'scripts', 'list_sessions.py'),
              ];
        
              let scriptPath = '';
              for (const p of scriptPaths) {
                if (fs.existsSync(p)) { 
                  scriptPath = p;
                  console.log('[list-sessions] Found script at:', scriptPath);
                  break; 
                }
              }
        
              if (!scriptPath) {
                console.error('[list-sessions] Script not found');
                resolve([]);
                return;
              }

              const child = spawn('python', [scriptPath], {
                shell: true,
                timeout: 10000,
                env: { ...process.env },
              });

              let stdout = '';
              let stderr = '';
              child.stdout?.on('data', (chunk: Buffer) => { 
                stdout += chunk.toString(); 
              });
              child.stderr?.on('data', (chunk: Buffer) => { 
                stderr += chunk.toString();
                console.error('[list-sessions] stderr:', chunk.toString());
              });

              child.on('close', (code) => {
                console.log('[list-sessions] Process closed with code:', code);
                console.log('[list-sessions] stdout length:', stdout.length);
                try {
                  const jsonMatch = stdout.match(/\[[\s\S]*\]/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    console.log('[list-sessions] Parsed', parsed.length, 'sessions');
                    resolve(parsed);
                  } else {
                    console.error('[list-sessions] No JSON array found in output');
                    resolve([]);
                  }
                } catch (e: any) {
                  console.error('[list-sessions] Failed to parse output:', e);
                  console.error('[list-sessions] Raw stdout:', stdout);
                  resolve([]);
                }
              });

              child.on('error', (err: any) => {
                console.error('[list-sessions] Spawn error:', err);
                resolve([]);
              });
            } catch (e: any) {
              console.error('[list-sessions] Error:', e);
              resolve([]);
            }
          });
        });

    // Get messages for a specific session from hermes state.db
        ipcMain.handle('get-session', async (_event, sessionId: string) => {
          return new Promise((resolve) => {
            try {
              const scriptPaths = [
                path.join(scriptsDir, 'get_session.py'),
                path.join(app.getAppPath(), 'scripts', 'get_session.py'),
                path.join(__dirname, '..', '..', 'scripts', 'get_session.py'),
              ];
        
              let scriptPath = '';
              for (const p of scriptPaths) {
                if (fs.existsSync(p)) { 
                  scriptPath = p; 
                  console.log('[get-session] Found script at:', scriptPath);
                  break; 
                }
              }
        
              if (!scriptPath) {
                console.error('[get-session] Script not found');
                resolve([]);
                return;
              }

              const pythonPath = 'python';
              const child = spawn(pythonPath, [scriptPath, sessionId], {
                shell: true,
                timeout: 10000,
                env: { ...process.env },
              });

              let stdout = '';
              let stderr = '';
              child.stdout?.on('data', (chunk: Buffer) => { 
                stdout += chunk.toString(); 
              });
              child.stderr?.on('data', (chunk: Buffer) => { 
                stderr += chunk.toString();
                console.error('[get-session] stderr:', chunk.toString());
              });

              child.on('close', (code) => {
                console.log('[get-session] Process closed with code:', code);
                console.log('[get-session] stdout length:', stdout.length);
                try {
                  const jsonMatch = stdout.match(/\[[\s\S]*\]/);
                  if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    console.log('[get-session] Parsed', parsed.length, 'messages');
                    resolve(parsed);
                  } else {
                    console.error('[get-session] No JSON array found in output');
                    resolve([]);
                  }
                } catch (e: any) {
                  console.error('[get-session] Failed to parse output:', e);
                  console.error('[get-session] Raw stdout:', stdout);
                  resolve([]);
                }
              });

              child.on('error', (err: any) => {
                console.error('[get-session] Spawn error:', err);
                resolve([]);
              });
            } catch (e: any) {
              console.error('[get-session] Error:', e);
              resolve([]);
            }
          });
        });

    ipcMain.on('set-global-hotkey', (_e, hotkey: string) => {
    const currentConfig = loadOverlayConfig();
    const oldHotkey = currentConfig.triggerHotkey || 'CommandOrControl+Alt+H';
    
    // Unregister old
    try {
      if (oldHotkey !== 'F2') {
        globalShortcut.unregister(oldHotkey);
      }
    } catch (e) {}

    // Register new
    try {
      globalShortcut.register(hotkey, toggleVisibility);
      saveOverlayConfig({ triggerHotkey: hotkey });
      updateAhkScript(hotkey);
    } catch (e) {
      console.error('Failed to register new hotkey', e);
      // Fallback
      globalShortcut.register('CommandOrControl+Alt+H', toggleVisibility);
      saveOverlayConfig({ triggerHotkey: 'CommandOrControl+Alt+H' });
      updateAhkScript('CommandOrControl+Alt+H');
    }
  });

  ipcMain.on('set-always-on-top', (_e, enable: boolean) => {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(enable);
    }
    saveOverlayConfig({ bounds: { ...loadOverlayConfig().bounds, alwaysOnTop: enable } });
  });



  ipcMain.on('set-small-window', (_e, enable: boolean) => {
    if (!mainWindow) return;
    const { workArea } = screen.getPrimaryDisplay();
    const WIDTH = 420;
    const MAX_HEIGHT = 600;
    
    const newWidth = enable ? 380 : WIDTH;
    const newHeight = enable ? 300 : MAX_HEIGHT;
    
    const x = workArea.x + workArea.width - newWidth - 24;
    const y = workArea.y + workArea.height - newHeight - 24;
    
    mainWindow.setBounds({ x, y, width: newWidth, height: newHeight });
    saveOverlayConfig({ bounds: mainWindow.getBounds(), smallWindow: enable });
  });

  // Session ID mapping (overlay UUID → hermes session ID)
  const sessionMap = new Map<string, string>();

  /* ═══════════════════════════════════════════════
     SEND MESSAGE — spawn hermes CLI with non-quiet mode
     
     Uses standard mode (not -Q) to get rich tool-call
     output. Parses the streaming output into structured
     segments and sends them to the renderer in real time.
     ═══════════════════════════════════════════════ */

  ipcMain.on('send-message', (_e, data: {
    text: string;
    file?: string;
    sessionId: string;
    toolMode: string;
    provider?: string;
    model?: string;
  }) => {
    if (!mainWindow) return;

    const args: string[] = [];
    const hermesSessionId = sessionMap.get(data.sessionId);

    if (hermesSessionId) {
      args.push('--resume', hermesSessionId);
    }

    args.push('chat');

    // Get model/provider from saved config or from data
    const config = loadOverlayConfig();
    const provider = data.provider || config.activeProvider;
    const model = data.model || config.activeModel;
    if (provider) args.push('--provider', provider);
    if (model) args.push('--model', model);

    // Tool mode: use -t to specify toolsets
    if (data.toolMode === 'none') args.push('-t', '');
    else if (data.toolMode === 'terminal') args.push('-t', 'terminal');

    let queryText = data.text;
    if (data.file) {
      const ext = data.file.split('.').pop()?.toLowerCase() || '';
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
      
      if (imageExts.includes(ext)) {
        args.push('--image', data.file);
      } else {
        queryText = `[User attached a file at: ${data.file}]\n\n` + queryText;
      }
    }

    // The query
    args.push('-q', queryText);

    // Auto-approve hooks for non-interactive use
    args.push('--accept-hooks');

    let fullOutput = '';
    let parsedIndex = 0;
    let inBox = false;
    let inDiff = false;
    let diffBuffer = '';
    let isThinkingBox = false;

    try {
      const isWindows = process.platform === 'win32';
      activeChild = spawn(isWindows ? 'hermes.exe' : 'hermes', args, {
        shell: false,
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NO_COLOR: '1',
          TERM: 'dumb',
        },
      });

      const handleChunk = (chunk: Buffer) => {
        const text = chunk.toString();
        // Remove ANSI escape sequences
        const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        fullOutput += cleanText;

        // Capture session ID if not yet captured
        if (!sessionMap.has(data.sessionId)) {
          const match = fullOutput.match(/Session:\s+([a-zA-Z0-9_]+)/);
          if (match) {
            sessionMap.set(data.sessionId, match[1]);
          }
        }

        let unparsed = fullOutput.substring(parsedIndex);
        let lineEnd = unparsed.indexOf('\n');

        while (lineEnd !== -1 || inBox) {
          if (inBox) {
            const endBoxIndex = unparsed.indexOf('╰─');
            if (endBoxIndex !== -1) {
              // Found end of box, send remainder and close box
              const content = unparsed.substring(0, endBoxIndex);
              if (content) {
                mainWindow?.webContents.send('stream-segment', {
                  type: isThinkingBox ? 'thinking' : 'text',
                  content: content.replace(/^    /gm, ''),
                });
              }
              inBox = false;
              // Advance parsedIndex to after the newline of the ╰─ line
              const lineEndAfterBox = unparsed.indexOf('\n', endBoxIndex);
              parsedIndex += (lineEndAfterBox !== -1 ? lineEndAfterBox + 1 : unparsed.length);
              unparsed = fullOutput.substring(parsedIndex);
              lineEnd = unparsed.indexOf('\n');
            } else {
              // Send all currently unparsed text and consume it
              if (unparsed) {
                mainWindow?.webContents.send('stream-segment', {
                  type: isThinkingBox ? 'thinking' : 'text',
                  content: unparsed.replace(/^    /gm, ''),
                });
                parsedIndex += unparsed.length;
                unparsed = '';
              }
              break;
            }
          } else {
            if (lineEnd === -1) break;
            const line = unparsed.substring(0, lineEnd);
            const trimmed = line.trim();
            parsedIndex += lineEnd + 1;

            if (
              trimmed.startsWith('Query:') ||
              trimmed.startsWith('Initializing agent') ||
              trimmed.match(/^─+$/) ||
              trimmed.startsWith('Resume this session with:') ||
              trimmed.startsWith('hermes --resume') ||
              trimmed.startsWith('Session:') ||
              trimmed.startsWith('Duration:') ||
              trimmed.startsWith('Messages:') ||
              trimmed.startsWith('Exit code:') ||
              trimmed.startsWith('↻') ||
              trimmed.match(/Resumed session/)
            ) {
              unparsed = fullOutput.substring(parsedIndex);
              lineEnd = unparsed.indexOf('\n');
              continue;
            }

            if (inDiff) {
              if (trimmed.startsWith('╭─') || (trimmed === '' && diffBuffer.length > 0)) {
                mainWindow?.webContents.send('stream-segment', { type: 'diff', content: diffBuffer.trim() });
                inDiff = false;
                diffBuffer = '';
                // Fall through to process the current line (e.g. ╭─)
              } else {
                diffBuffer += line + '\n';
                unparsed = fullOutput.substring(parsedIndex);
                lineEnd = unparsed.indexOf('\n');
                continue;
              }
            }

            if (trimmed.startsWith('╭─')) {
              inBox = true;
              const title = trimmed.toLowerCase();
              isThinkingBox = title.includes('thinking') || title.includes('reasoning');
            } else if (trimmed.match(/^─+\s+⚕ Hermes/)) {
              inBox = true;
              isThinkingBox = false;
            } else if (trimmed.startsWith('┊') || trimmed.match(/^[│┊]\s/)) {
                          const toolMatch = trimmed.match(/[│┊]\s*(?:💻|✍️|🔍|📁|🌐|⚡|🔧|📝|🛠️|⚙️|🔒)\s*(?:preparing\s+)?(.+?)…?$/);
                          if (toolMatch) {
                            // Strip any trailing JSON blob that might be incorrectly included
                            let contentText = trimmed.replace(/^[│┊]\s*/, '');
                            // Remove tool-call JSON patterns like: toolname · {"arg": "value"}
                            contentText = contentText.replace(/\s+·\s+\{[\s\S]*$/, '').trim();
                            mainWindow?.webContents.send('stream-segment', {
                              type: 'tool_activity',
                              content: contentText,
                              toolName: toolMatch[1].trim().replace(/…$/, ''),
                            });
                          } else if (trimmed.includes('review diff')) {
                            inDiff = true;
                            diffBuffer = '';
                          } else {
                            // Strip tool-call JSON from regular tool activity lines too
                            let contentText = trimmed.replace(/^[│┊]\s*/, '');
                            contentText = contentText.replace(/\s+·\s+\{[\s\S]*$/, '').trim();
                            mainWindow?.webContents.send('stream-segment', {
                              type: 'tool_activity',
                              content: contentText,
                            });
                          }
            } else if (trimmed) {
              // Any other text (like Query: or API error details)
              mainWindow?.webContents.send('stream-segment', {
                type: 'text',
                content: line.replace(/^    /gm, ''),
              });
            }
            
            unparsed = fullOutput.substring(parsedIndex);
            lineEnd = unparsed.indexOf('\n');
          }
        }
      };

      activeChild.stdout?.on('data', handleChunk);
      activeChild.stderr?.on('data', handleChunk);

      activeChild.on('close', (code) => {
        if (inDiff && diffBuffer.trim()) {
           mainWindow?.webContents.send('stream-segment', { type: 'diff', content: diffBuffer.trim() });
        }
        mainWindow?.webContents.send('stream-end', { code });
        activeChild = null;
      });

      activeChild.on('error', (err) => {
        mainWindow?.webContents.send('stream-error', err.message);
        activeChild = null;
      });
    } catch (err: any) {
      mainWindow?.webContents.send('stream-error', err.message || 'Failed to spawn hermes');
    }
  });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }); // End of app.whenReady().then()

  } // End of else block (first instance)

  app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (activeChild && !activeChild.killed) activeChild.kill();
  stopClapDetector();
});