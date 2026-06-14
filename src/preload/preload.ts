import { contextBridge, ipcRenderer } from 'electron';

/**
 * Typed IPC bridge — exposes only what the renderer needs.
 * No nodeIntegration. Context isolation enforced.
 */

export interface ParsedSegment {
  type: 'tool_activity' | 'diff' | 'thinking' | 'text' | 'session_info';
  content: string;
  toolName?: string;
  status?: string;
}

export interface InventoryPayload {
  providers: Array<{
    slug: string;
    name: string;
    models: string[];
    total_models: number;
    is_current: boolean;
    authenticated: boolean;
    auth_type: string;
    key_env: string;
    warning: string;
  }>;
  model: string;
  provider: string;
  error?: string;
}

export interface ElectronAPI {
  // Invoke (returns Promise)
  getConfig: () => Promise<Record<string, any>>;
  getInventory: () => Promise<InventoryPayload>;
  captureScreenshot: () => Promise<{ path: string; name: string } | null>;
  openFileDialog: () => Promise<{ path: string; name: string } | null>;
  listSessions: () => Promise<any[]>;
  getSession: (sessionId: string) => Promise<any[]>;
  readDroppedFile: (filePath: string) => Promise<{
    name: string;
    path: string;
    content: string | null;
    tooBig: boolean;
    size: number;
    ext?: string;
    isImage?: boolean;
    error?: string;
  }>;
  readDir: (dirPath: string) => Promise<Array<{name: string, isDir: boolean, size: number}>>;

  // One-way sends
  setProviderAndModel: (provider: string, model: string) => void;
  saveSession: (data: { sessionId: string; markdown: string }) => void;
  abortStream: () => void;
  closeOverlay: () => void;
  openTerminal: () => void;
  openPath: (path: string) => void;
  resetBounds: () => void;
  setLaunchAtStartup: (enable: boolean) => void;
  setGlobalHotkey: (hotkey: string) => void;
  setAlwaysOnTop: (enable: boolean) => void;

  setSmallWindow: (enable: boolean) => void;
  clearAllSessions: () => Promise<boolean>;
  sendMessage: (data: {
    text: string;
    file?: string;
    sessionId: string;
    toolMode: string;
    provider?: string;
    model?: string;
  }) => void;
  sendInput: (input: string) => void;

  // Echo Mode
  transcribeAudio: (buffer: Uint8Array) => Promise<string>;
  synthesizeSpeech: (payload: { text: string, voice?: string }) => Promise<number[]>;
  echoSendMessage: (payload: { text: string }) => Promise<string>;
  triggerEchoMode: () => void;
  triggerWakeWord: () => void;

  // Listeners (returns cleanup function)
  onVisibilityChange: (cb: (visible: boolean) => void) => () => void;
  onFocusInput: (cb: () => void) => () => void;
  onStreamSegment: (cb: (segment: ParsedSegment) => void) => () => void;
  onStreamEnd: (cb: (result: { code: number | null }) => void) => () => void;
  onStreamError: (cb: (error: string) => void) => () => void;
  onEnterEchoMode: (cb: () => void) => () => void;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Invoke ──
  getConfig: () => ipcRenderer.invoke('get-config'),
  getInventory: () => ipcRenderer.invoke('get-inventory'),
  captureScreenshot: () => ipcRenderer.invoke('capture-screenshot'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  listSessions: () => ipcRenderer.invoke('list-sessions'),
  getSession: (sessionId: string) => ipcRenderer.invoke('get-session', sessionId),
  readDroppedFile: (filePath: string) => ipcRenderer.invoke('read-dropped-file', filePath),
  readDir: (dirPath: string) => ipcRenderer.invoke('read-dir', dirPath),

  // ── One-way sends ──
  setProviderAndModel: (provider: string, model: string) => ipcRenderer.send('set-provider-model', provider, model),
  saveSession: (data: { sessionId: string; markdown: string }) =>
    ipcRenderer.send('save-session', data),
  abortStream: () => ipcRenderer.send('abort-stream'),
  closeOverlay: () => ipcRenderer.send('close-overlay'),
  openTerminal: () => ipcRenderer.send('open-terminal'),
  openPath: (path: string) => ipcRenderer.send('open-path', path),
  resetBounds: () => ipcRenderer.send('reset-bounds'),
  setLaunchAtStartup: (enable: boolean) => ipcRenderer.send('set-launch-at-startup', enable),
  setGlobalHotkey: (hotkey: string) => ipcRenderer.send('set-global-hotkey', hotkey),
  setAlwaysOnTop: (enable: boolean) => ipcRenderer.send('set-always-on-top', enable),

  setSmallWindow: (enable: boolean) => ipcRenderer.send('set-small-window', enable),
  clearAllSessions: () => ipcRenderer.invoke('clear-all-sessions'),
  sendMessage: (data: {
    text: string;
    file?: string;
    sessionId: string;
    toolMode: string;
    provider?: string;
    model?: string;
  }) => ipcRenderer.send('send-message', data),
  sendInput: (input: string) => ipcRenderer.send('send-input', input),

  // Echo Mode
  transcribeAudio: (buffer: Uint8Array) => ipcRenderer.invoke('transcribe-audio', buffer),
  synthesizeSpeech: (payload: { text: string, voice?: string }) => ipcRenderer.invoke('synthesize-speech', payload),
  echoSendMessage: (payload: { text: string }) => ipcRenderer.invoke('echo-send-message', payload),
  triggerEchoMode: () => ipcRenderer.send('trigger-echo-mode'),
  triggerWakeWord: () => ipcRenderer.send('trigger-wake-word'),

  // ── Listeners ──
  onVisibilityChange: (cb: (visible: boolean) => void) => {
    const handler = (_e: any, v: boolean) => cb(v);
    ipcRenderer.on('visibility-change', handler);
    return () => ipcRenderer.removeListener('visibility-change', handler);
  },
  onFocusInput: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('focus-input', handler);
    return () => ipcRenderer.removeListener('focus-input', handler);
  },
  onStreamSegment: (cb: (segment: ParsedSegment) => void) => {
    const handler = (_e: any, seg: ParsedSegment) => cb(seg);
    ipcRenderer.on('stream-segment', handler);
    return () => ipcRenderer.removeListener('stream-segment', handler);
  },
  onStreamEnd: (cb: (result: { code: number | null }) => void) => {
    const handler = (_e: any, result: { code: number | null }) => cb(result);
    ipcRenderer.on('stream-end', handler);
    return () => ipcRenderer.removeListener('stream-end', handler);
  },
  onStreamError: (cb: (error: string) => void) => {
    const handler = (_e: any, error: string) => cb(error);
    ipcRenderer.on('stream-error', handler);
    return () => ipcRenderer.removeListener('stream-error', handler);
  },
  onEnterEchoMode: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('enter-echo-mode', handler);
    return () => ipcRenderer.removeListener('enter-echo-mode', handler);
  },
} satisfies ElectronAPI);