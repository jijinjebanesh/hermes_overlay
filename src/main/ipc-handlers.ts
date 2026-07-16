/**
 * IPC Handlers — All ipcMain handler registrations.
 * Organized by domain: config, inventory, files, sessions, settings, echo.
 */

import { ipcMain, dialog, desktopCapturer, screen, shell, app, globalShortcut, clipboard, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { loadOverlayConfig, saveOverlayConfig, sessionsDir } from './config';
import { getMainWindow, toggleVisibility, getIsVisible } from './window';
import { sendMessage, killActiveChild, sendInputToChild } from './hermes-cli';
import { transcribeViaDaemon, isWhisperDaemonReady } from './whisper-daemon';

// ── Background Task Tracker ──
interface BackgroundTask {
  id: string;
  prompt: string;
  status: 'running' | 'completed' | 'failed';
  output: string;
  startTime: number;
  endTime?: number;
  hermesSessionId?: string;
}

const backgroundTasks = new Map<string, BackgroundTask>();

const scriptsDir = path.join(__dirname, '..', 'scripts');
const hermesAgentVenvPython = path.join(os.homedir(), 'AppData', 'Local', 'hermes', 'hermes-agent', 'venv', 'Scripts', 'python.exe');
const cliPath = path.join(os.homedir(), 'hermes-overlay', 'hermes-agent', 'cli.py');

function findScript(name: string): string {
  const paths = [
    path.join(scriptsDir, name),
    path.join(app.getAppPath(), 'scripts', name),
    path.join(__dirname, '..', '..', 'scripts', name),
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return '';
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
      if (!triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
        lines[i] = `${ahkHotkey}:: {`;
        triggerReplaced = true;
      } else if (triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
        lines[i] = `${killHotkey}:: {`;
      } else if (lines[i].includes('Hotkey Active')) {
        lines[i] = `ToolTip("${friendlyName} Daemon Active — Press ${friendlyName} to toggle Hermes", 10, 10)\n`;
      } else if (lines[i].includes('F2') && lines[i].trim().startsWith(';')) {
        lines[i] = lines[i].replace(/F2/g, friendlyName || 'hotkey');
      }
    }
    fs.writeFileSync(ahkPath, lines.join('\n'), 'utf8');
    spawn('cmd.exe', ['/c', 'start', '', ahkPath], { detached: true, stdio: 'ignore' });
  } catch (e) {
    console.error('Failed to update AHK script', e);
  }
}

export function registerIpcHandlers() {
  const mainWindow = getMainWindow;

  // ── Config ──
  ipcMain.handle('get-config', async () => loadOverlayConfig());

  // ── Inventory ──
  ipcMain.handle('get-inventory', async () => {
    return new Promise((resolve) => {
      try {
        const scriptPath = findScript('model_inventory.py');
        if (!scriptPath) {
          resolve({ error: 'model_inventory.py not found', providers: [], model: '', provider: '' });
          return;
        }
        const child = spawn('python', [scriptPath], {
          shell: true, timeout: 30000, env: { ...process.env },
        });
        let stdout = '', stderr = '';
        child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.on('close', () => {
          try {
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (jsonMatch) resolve(JSON.parse(jsonMatch[0]));
            else resolve({ error: 'No JSON output', providers: [], model: '', provider: '' });
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

  // ── Model/Provider ──
  ipcMain.on('set-provider-model', (_e, provider: string, model: string) => {
    saveOverlayConfig({ activeProvider: provider, activeModel: model });
    try {
      const scriptPath = findScript('set_model.py');
      if (scriptPath) {
        execSync(`python "${scriptPath}" "${provider}" "${model}"`, { timeout: 5000 });
      }
    } catch (e) {
      console.error('Failed to update hermes config', e);
    }
  });

  // ── Session management ──
  ipcMain.on('save-session', (_e, data: { sessionId: string; markdown: string }) => {
    const savePath = path.join(sessionsDir, `${data.sessionId}.md`);
    fs.writeFileSync(savePath, data.markdown);
  });

  ipcMain.handle('clear-all-sessions', async () => {
    try {
      const files = fs.readdirSync(sessionsDir);
      for (const file of files) {
        if (file.endsWith('.md')) fs.unlinkSync(path.join(sessionsDir, file));
      }
      return true;
    } catch (e) {
      console.error('Failed to clear sessions', e);
      return false;
    }
  });

  ipcMain.handle('list-sessions', async () => {
    return new Promise((resolve) => {
      try {
        const scriptPath = findScript('list_sessions.py');
        if (!scriptPath) { resolve([]); return; }
        const child = spawn('python', [scriptPath], {
          shell: true, timeout: 10000, env: { ...process.env },
        });
        let stdout = '';
        child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on('data', () => {});
        child.on('close', () => {
          try {
            const jsonMatch = stdout.match(/\[[\s\S]*\]/);
            if (jsonMatch) resolve(JSON.parse(jsonMatch[0]));
            else resolve([]);
          } catch (e) { resolve([]); }
        });
        child.on('error', () => resolve([]));
      } catch (e) { resolve([]); }
    });
  });

  ipcMain.handle('get-session', async (_event, sessionId: string) => {
    return new Promise((resolve) => {
      try {
        const scriptPath = findScript('get_session.py');
        if (!scriptPath) { resolve([]); return; }
        const child = spawn('python', [scriptPath, sessionId], {
          shell: true, timeout: 10000, env: { ...process.env },
        });
        let stdout = '';
        child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on('data', () => {});
        child.on('close', () => {
          try {
            const jsonMatch = stdout.match(/\[[\s\S]*\]/);
            if (jsonMatch) resolve(JSON.parse(jsonMatch[0]));
            else resolve([]);
          } catch (e) { resolve([]); }
        });
        child.on('error', () => resolve([]));
      } catch (e) { resolve([]); }
    });
  });

  // ── Stream control ──
  ipcMain.on('abort-stream', () => killActiveChild());
  ipcMain.on('send-input', (_e, input: string) => sendInputToChild(input));

  ipcMain.on('send-message', (_e, data) => {
    const win = getMainWindow();
    if (win) sendMessage(win, data);
  });

  // ── Window controls ──
  ipcMain.on('close-overlay', () => toggleVisibility());
  ipcMain.on('open-terminal', () => {
    spawn('cmd.exe', ['/c', 'start powershell'], { detached: true, stdio: 'ignore' });
  });
  ipcMain.on('open-path', (_e, targetPath: string) => shell.openPath(targetPath));

  ipcMain.on('reset-bounds', () => {
    const win = getMainWindow();
    if (!win) return;
    const WIDTH = 420, MAX_HEIGHT = 600;
    const { workArea } = screen.getPrimaryDisplay();
    const x = workArea.x + workArea.width - WIDTH - 24;
    const y = workArea.y + workArea.height - MAX_HEIGHT - 24;
    win.setBounds({ x, y, width: WIDTH, height: MAX_HEIGHT });
    saveOverlayConfig({ bounds: win.getBounds() });
  });

  ipcMain.on('set-small-window', (_e, enable: boolean) => {
    const win = getMainWindow();
    if (!win) return;
    
    const currentBounds = win.getBounds();
    const WIDTH = 420, MAX_HEIGHT = 1200;
    const newWidth = enable ? 380 : WIDTH;
    const newHeight = enable ? 300 : MAX_HEIGHT;
    
    // Anchor to the bottom-right of the CURRENT window position, rather than jumping to screen corner
    const dx = currentBounds.width - newWidth;
    const dy = currentBounds.height - newHeight;
    const x = currentBounds.x + dx;
    const y = currentBounds.y + dy;
    
    // On Windows, setting bounds on a non-resizable window can sometimes fail or act weirdly
    win.setResizable(true);
    win.setBounds({ x, y, width: newWidth, height: newHeight });
    win.setResizable(false);
    
    saveOverlayConfig({ bounds: win.getBounds(), smallWindow: enable });
  });

  // ── Settings ──
  ipcMain.on('set-launch-at-startup', (_e, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable, openAsHidden: true });
    saveOverlayConfig({ launchAtStartup: enable });
  });

  ipcMain.on('set-always-on-top', (_e, enable: boolean) => {
    const win = getMainWindow();
    if (win) win.setAlwaysOnTop(enable);
    saveOverlayConfig({ bounds: { ...loadOverlayConfig().bounds, alwaysOnTop: enable } });
  });

  ipcMain.on('set-global-hotkey', (_e, hotkey: string) => {
    const config = loadOverlayConfig();
    const oldHotkey = config.triggerHotkey || 'CommandOrControl+Alt+H';
    try { globalShortcut.unregister(oldHotkey); } catch (e) {}
    try {
      globalShortcut.register(hotkey, toggleVisibility);
      saveOverlayConfig({ triggerHotkey: hotkey });
      updateAhkScript(hotkey);
    } catch (e) {
      console.error('Failed to register new hotkey', e);
      globalShortcut.register('CommandOrControl+Alt+H', toggleVisibility);
      saveOverlayConfig({ triggerHotkey: 'CommandOrControl+Alt+H' });
      updateAhkScript('CommandOrControl+Alt+H');
    }
  });

  // ── Context Capture (Screen & App Awareness) ──
  // Grabs screenshot + clipboard text in one shot — used for auto-context on summon.
  // Returns { screenshot?: {path, name}, clipboardText?: string }
  ipcMain.handle('capture-context', async () => {
    const win = getMainWindow();
    const wasVisible = Boolean(win && !win.isDestroyed() && win.isVisible());

    const result: { screenshot?: { path: string; name: string }; clipboardText?: string } = {};

    try {
      // Read clipboard text (instant, no UI disruption)
      try {
        const clipText = clipboard.readText();
        if (clipText && clipText.trim().length > 0) {
          result.clipboardText = clipText.trim();
        }
      } catch (e) {
        // Clipboard read can fail in rare cases — not fatal
      }

      // Capture screenshot — hide overlay first if visible to avoid capturing ourselves
      if (wasVisible && win) {
        win.hide();
        await new Promise<void>((resolve) => setTimeout(resolve, 180));
      }

      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'], thumbnailSize: { width: 1920, height: 1080 },
        });
        if (sources.length > 0) {
          const tmpDir = path.join(os.tmpdir(), 'hermes-screenshots');
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
          const filename = `screenshot_${Date.now()}.png`;
          const filepath = path.join(tmpDir, filename);
          fs.writeFileSync(filepath, sources[0].thumbnail.toPNG());
          result.screenshot = { path: filepath, name: filename };
        }
      } catch (e) {
        console.error('[ContextCapture] Screenshot failed:', e);
      }
    } finally {
      if (wasVisible && win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
    }

    return result;
  });

  // ── Files ──
  ipcMain.handle('capture-screenshot', async () => {
    const win = getMainWindow();
    const wasVisible = Boolean(win && !win.isDestroyed() && win.isVisible());

    try {
      if (wasVisible && win) {
        win.hide();
        await new Promise<void>((resolve) => setTimeout(resolve, 180));
      }

      const sources = await desktopCapturer.getSources({
        types: ['screen'], thumbnailSize: { width: 1920, height: 1080 },
      });
      if (sources.length === 0) return null;
      const tmpDir = path.join(os.tmpdir(), 'hermes-screenshots');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const filename = `screenshot_${Date.now()}.png`;
      const filepath = path.join(tmpDir, filename);
      fs.writeFileSync(filepath, sources[0].thumbnail.toPNG());
      return { path: filepath, name: filename };
    } catch (e) {
      console.error('Screenshot capture failed:', e);
      return null;
    } finally {
      if (wasVisible && win && !win.isDestroyed()) {
        win.show();
        win.focus();
      }
    }
  });

  ipcMain.handle('open-file-dialog', async () => {
    const win = getMainWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
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

  ipcMain.handle('read-dropped-file', async (_event, filePath: string) => {
    try {
      const stats = fs.statSync(filePath);
      const size = stats.size;
      const MAX_SIZE = 500 * 1024;
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'];
      const isImage = imageExts.includes(ext);

      if (size > MAX_SIZE) {
        return {
          name: path.basename(filePath), path: filePath, content: null, tooBig: true,
          size, ext, isImage,
        };
      }
      const textExts = [
        'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log',
        'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
        'cs', 'swift', 'kt', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
        'html', 'css', 'scss', 'less', 'sql', 'graphql',
      ];
      const content = textExts.includes(ext) ? fs.readFileSync(filePath, 'utf-8') : null;
      return {
        name: path.basename(filePath), path: filePath, content, tooBig: false,
        size, ext, isImage,
      };
    } catch (e: any) {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      return {
        name: path.basename(filePath), path: filePath, content: null, tooBig: false,
        size: 0, ext, isImage: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext),
        error: e.message,
      };
    }
  });

  ipcMain.handle('read-dir', async (_event, dirPath: string) => {
    try {
      const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const results = await Promise.all(items.map(async (item) => {
        let size = 0;
        try {
          if (!item.isDirectory()) {
            const stats = await fs.promises.stat(path.join(dirPath, item.name));
            size = stats.size;
          }
        } catch (e) {}
        return { name: item.name, isDir: item.isDirectory(), size };
      }));
      return results.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (e) { return []; }
  });

  // ── Echo Mode ──
  ipcMain.handle('transcribe-audio', async (_event, buffer: Uint8Array) => {
    const tmpPath = path.join(os.tmpdir(), `hermes_echo_${Date.now()}.webm`);
    fs.writeFileSync(tmpPath, Buffer.from(buffer));

    // Try the preloaded Whisper daemon first (instant — no model-load latency)
    if (isWhisperDaemonReady()) {
      try {
        const transcript = await transcribeViaDaemon(tmpPath);
        try { fs.unlinkSync(tmpPath); } catch (_) {}
        return transcript;
      } catch (e) {
        console.warn('[Transcribe] Daemon failed, falling back to spawn:', e);
      }
    }

    // Fallback: spawn one-shot whisper process (1-2s model load penalty)
    return new Promise((resolve) => {
      const proc = spawn(hermesAgentVenvPython, [cliPath, '--transcribe', tmpPath]);
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => out += d);
      proc.on('close', () => { try { fs.unlinkSync(tmpPath); } catch (_) {} resolve(out.trim()); });
      proc.on('error', () => resolve(''));
      setTimeout(() => { proc.kill(); resolve(''); }, 30000);
    });
  });

  ipcMain.handle('synthesize-speech', async (_event, { text, voice, provider }) => {
    return new Promise((resolve) => {
      const args = [cliPath, '--tts', text];
      if (voice) args.push('--voice', voice);
      if (provider) args.push('--provider', provider);
      const proc = spawn(hermesAgentVenvPython, args);
      const chunks: Buffer[] = [];
      proc.stdout?.on('data', (d: Buffer) => chunks.push(d));
      proc.stderr?.on('data', () => {});
      proc.on('close', (code) => {
        if (code !== 0 || chunks.length === 0) resolve([]);
        else resolve(Array.from(Buffer.concat(chunks)));
      });
      proc.on('error', () => resolve([]));
      setTimeout(() => { proc.kill(); resolve([]); }, 15000);
    });
  });

  ipcMain.handle('echo-send-message', async (event, { text, imagePath }) => {
    return new Promise((resolve) => {
      const config = loadOverlayConfig();
      const args = ['-z', text];
      if (config.activeProvider) args.push('--provider', config.activeProvider);
      if (config.activeModel) args.push('--model', config.activeModel);
      if (imagePath) args.push('--image', imagePath);
      const proc = spawn('hermes.exe', args);
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => {
        const chunk = d.toString();
        out += chunk;
        event.sender.send('echo-stream-chunk', chunk);
      });
      proc.stderr?.on('data', () => {});
      proc.on('close', () => resolve(out.trim()));
      proc.on('error', () => resolve(''));
      setTimeout(() => { proc.kill(); resolve(''); }, 65000);
    });
  });

  ipcMain.on('trigger-echo-mode', () => {
    const win = getMainWindow();
    if (win) win.webContents.send('enter-echo-mode');
  });

  ipcMain.on('trigger-wake-word', () => {
    const win = getMainWindow();
    if (!win) return;
    if (!getIsVisible()) toggleVisibility();
    win.webContents.send('enter-echo-mode');
  });

  // ── Echo settings sync ──
  // Renderer calls these when echo settings change so the main process
  // can persist to overlay.json and restart services (clap detector, etc.)
  ipcMain.on('echo-settings-changed', (_e, settings: Record<string, any>) => {
    saveOverlayConfig(settings);
    // Restart clap detector if relevant settings changed
    if ('echoClapWakeEnabled' in settings || 'echoClapSensitivity' in settings) {
      const { restartClapDetector } = require('./clap-detector');
      restartClapDetector();
    }
  });

  // ── Clipboard ──
  ipcMain.handle('read-clipboard', () => {
    return clipboard.readText();
  });

  // ── Memory (MEMORY.md / USER.md) ──
  ipcMain.handle('read-memory', async () => {
    try {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const hermesMemDir = path.join(localAppData, 'hermes', 'memories');
      const result: Record<string, string> = {};

      // Read MEMORY.md
      const memoryPath = path.join(hermesMemDir, 'MEMORY.md');
      if (fs.existsSync(memoryPath)) {
        result.memory = fs.readFileSync(memoryPath, 'utf-8');
      }

      // Read USER.md
      const userPath = path.join(hermesMemDir, 'USER.md');
      if (fs.existsSync(userPath)) {
        result.user = fs.readFileSync(userPath, 'utf-8');
      }

      return result;
    } catch (e: any) {
      console.error('Failed to read memory files:', e);
      return { error: e.message };
    }
  });

  ipcMain.handle('save-memory', async (_event, data: { memory?: string; user?: string }) => {
    try {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const hermesMemDir = path.join(localAppData, 'hermes', 'memories');
      if (!fs.existsSync(hermesMemDir)) fs.mkdirSync(hermesMemDir, { recursive: true });

      if (data.memory !== undefined) {
        fs.writeFileSync(path.join(hermesMemDir, 'MEMORY.md'), data.memory, 'utf-8');
      }
      if (data.user !== undefined) {
        fs.writeFileSync(path.join(hermesMemDir, 'USER.md'), data.user, 'utf-8');
      }
      return { success: true };
    } catch (e: any) {
      console.error('Failed to save memory files:', e);
      return { error: e.message };
    }
  });

  // ── Session Search ──
  ipcMain.handle('search-sessions', async (_event, query: string) => {
    return new Promise((resolve) => {
      try {
        const scriptPath = findScript('search_sessions.py');
        if (!scriptPath) { resolve([]); return; }
        const child = spawn('python', [scriptPath, query], {
          shell: true, timeout: 10000, env: { ...process.env },
        });
        let stdout = '';
        child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on('data', () => {});
        child.on('close', () => {
          try {
            const jsonMatch = stdout.match(/\[[\s\S]*\]/);
            if (jsonMatch) resolve(JSON.parse(jsonMatch[0]));
            else resolve([]);
          } catch (e) { resolve([]); }
        });
        child.on('error', () => resolve([]));
      } catch (e) { resolve([]); }
    });
  });

  // ── Background Tasks (Fire-and-Forget Agents) ──
  ipcMain.handle('dispatch-background', async (_event, data: {
    text: string;
    sessionId?: string;
    provider?: string;
    model?: string;
  }) => {
    const taskId = `bg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const config = loadOverlayConfig();

    const args: string[] = [];
    if (data.sessionId) args.push('--resume', data.sessionId);
    args.push('chat', '-q', data.text, '--accept-hooks');
    const provider = data.provider || config.activeProvider;
    const model = data.model || config.activeModel;
    if (provider) args.push('--provider', provider);
    if (model) args.push('--model', model);

    const task: BackgroundTask = {
      id: taskId,
      prompt: data.text.substring(0, 100),
      status: 'running',
      output: '',
      startTime: Date.now(),
    };
    backgroundTasks.set(taskId, task);

    // Notify renderer that a task started
    const win = getMainWindow();
    win?.webContents.send('background-task-update', { ...task });

    try {
      const isWindows = process.platform === 'win32';
      const child = spawn(isWindows ? 'hermes.exe' : 'hermes', args, {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          NO_COLOR: '1',
          TERM: 'dumb',
        },
      });

      let output = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString().replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
        output += text;

        // Capture session ID
        if (!task.hermesSessionId) {
          const match = output.match(/Session:\s+([a-zA-Z0-9_]+)/);
          if (match) task.hermesSessionId = match[1];
        }
      });
      child.stderr?.on('data', () => {});

      child.on('close', (code) => {
        task.status = code === 0 ? 'completed' : 'failed';
        task.endTime = Date.now();
        task.output = output.substring(0, 50000); // Cap output

        // Send Windows native notification
        try {
          if (Notification.isSupported()) {
            const notif = new Notification({
              title: 'Hermes Background Task',
              body: task.status === 'completed'
                ? `Task complete: "${task.prompt}..."`
                : `Task failed: "${task.prompt}..."`,
              silent: false,
            });
            notif.on('click', () => {
              // Show the overlay when notification is clicked
              const w = getMainWindow();
              if (w && !getIsVisible()) {
                toggleVisibility();
              }
              w?.webContents.send('background-task-clicked', taskId);
            });
            notif.show();
          }
        } catch (e) {
          console.error('[BackgroundTask] Notification failed:', e);
        }

        // Notify renderer
        const w = getMainWindow();
        w?.webContents.send('background-task-update', { ...task });
      });

      child.on('error', (err) => {
        task.status = 'failed';
        task.endTime = Date.now();
        task.output = `Error: ${err.message}`;
        backgroundTasks.set(taskId, { ...task });
        const w = getMainWindow();
        w?.webContents.send('background-task-update', { ...task });
      });
    } catch (err: any) {
      task.status = 'failed';
      task.output = `Error: ${err.message}`;
      backgroundTasks.set(taskId, { ...task });
      const w = getMainWindow();
      w?.webContents.send('background-task-update', { ...task });
    }

    return taskId;
  });

  ipcMain.handle('list-background-tasks', async () => {
    return Array.from(backgroundTasks.values()).sort((a, b) => b.startTime - a.startTime);
  });

  ipcMain.handle('get-background-task', async (_event, taskId: string) => {
    return backgroundTasks.get(taskId) || null;
  });

  ipcMain.handle('clear-background-task', async (_event, taskId: string) => {
    backgroundTasks.delete(taskId);
    return true;
  });

  // ── Quick Actions (Floating Toolbar) ──
  const { processQuickAction, hideQuickActions } = require('./quick-actions');

  ipcMain.handle('quick-action-execute', async (_event, data: { action: string; text: string }) => {
    return processQuickAction(data.action, data.text);
  });

  ipcMain.on('quick-action-close', () => {
    hideQuickActions();
  });
}
