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
} from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, execSync, ChildProcess } from 'child_process';

/* ═══════════════════════════════════════════════
   PATHS & DIRECTORIES
   ═══════════════════════════════════════════════ */

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isVisible = false;
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
    path.join(__dirname, '..', '..', 'f2-hotkey.ahk'),
    path.join(app.getAppPath(), '..', 'f2-hotkey.ahk'),
    path.join(app.getAppPath(), '..', '..', 'f2-hotkey.ahk'),
    'C:\\Users\\jijin\\hermes-overlay\\f2-hotkey.ahk'
  ];
  
  let ahkPath = '';
  for (const p of ahkPaths) {
    if (fs.existsSync(p)) { ahkPath = p; break; }
  }
  
  if (!ahkPath) return;

  try {
    const lines = fs.readFileSync(ahkPath, 'utf8').split('\n');
    let triggerReplaced = false;
    for (let i = 0; i < lines.length; i++) {
      if (!triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
        lines[i] = `${ahkHotkey}:: {`;
        triggerReplaced = true;
      } else if (triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
        lines[i] = `${killHotkey}:: {`;
      } else if (lines[i].includes('Daemon Active')) {
        const friendlyName = electronHotkey.replace('CommandOrControl', 'Ctrl');
        lines[i] = `ToolTip("${friendlyName} Daemon Active — Press ${friendlyName} to toggle Hermes", 10, 10)\r`;
      }
    }
    fs.writeFileSync(ahkPath, lines.join('\n'), 'utf8');
    
    // Reload AHK
    spawn('cmd.exe', ['/c', 'start', '""', ahkPath], { detached: true, stdio: 'ignore' });
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
    backgroundColor: '#00000000',
    opacity: savedBounds?.opacity ?? 0.96,
    hasShadow: true,
    thickFrame: false,
    skipTaskbar: true,
    show: false,   // Start hidden; AHK script shows it on first F2 press
    resizable: false,
    title: 'Hermes',  // Explicit title so AHK WinExist finds it before HTML loads
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!savedBounds) {
    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + workArea.width - WIDTH - 24;
    const y = workArea.y + workArea.height - MAX_HEIGHT - 24;
    mainWindow.setBounds({ x, y, width: WIDTH, height: MAX_HEIGHT });
  }

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
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip('Hermes Overlay');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show/Hide', click: () => toggleVisibility() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', () => toggleVisibility());
}


/* ═══════════════════════════════════════════════
   VISIBILITY TOGGLE
   ═══════════════════════════════════════════════ */

function toggleVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (isVisible) {
    if (!mainWindow.isFocused()) {
      mainWindow.focus();
      return;
    }
    mainWindow.webContents.send('visibility-change', false);
    isVisible = false;
    
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (!isVisible && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
    }, 200);
  } else {
    if (hideTimeout) clearTimeout(hideTimeout);
    mainWindow.show();
    mainWindow.webContents.send('visibility-change', true);
    isVisible = true;
    mainWindow.focus();
    mainWindow.webContents.send('focus-input');
  }
}





/* ═══════════════════════════════════════════════
   APP READY — Register hotkeys & IPC handlers
   ═══════════════════════════════════════════════ */

app.whenReady().then(() => {
  createWindow();
  createTray();

  const config = loadOverlayConfig();
  const triggerHotkey = config.triggerHotkey || 'CommandOrControl+Alt+H';
  
  try {
    globalShortcut.register(triggerHotkey, toggleVisibility);
  } catch (e) {
    console.error('Failed to register custom hotkey', e);
  }
  
  // Let Electron handle F2 directly so internal state stays synced
  globalShortcut.register('F2', toggleVisibility);


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

  ipcMain.on('set-opacity', (_e, opacity: number) => {
    if (mainWindow) {
      mainWindow.setOpacity(opacity);
    }
    saveOverlayConfig({ bounds: { ...loadOverlayConfig().bounds, opacity } });
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
                mainWindow?.webContents.send('stream-segment', {
                  type: 'tool_activity',
                  content: trimmed.replace(/^[│┊]\s*/, ''),
                  toolName: toolMatch[1].trim().replace(/…$/, ''),
                });
              } else if (trimmed.includes('review diff')) {
                inDiff = true;
                diffBuffer = '';
              } else {
                mainWindow?.webContents.send('stream-segment', {
                  type: 'tool_activity',
                  content: trimmed.replace(/^[│┊]\s*/, ''),
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
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (activeChild && !activeChild.killed) activeChild.kill();
});