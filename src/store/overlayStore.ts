import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

export type ToolMode = 'all' | 'terminal' | 'none';

export interface ToolCall {
  id: string;
  name: string;
  command: string;
  output?: string;
  status: 'pending' | 'success' | 'error';
}

/** Structured segment from hermes CLI output */
export interface StreamSegment {
  type: 'tool_activity' | 'diff' | 'thinking' | 'text' | 'session_info';
  content: string;
  toolName?: string;
  status?: string;
}

export interface AttachedFile {
  name: string;
  path: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  cancelled?: boolean;
  toolCalls?: ToolCall[];
  /** Structured segments from hermes output (tool activity, diffs, thinking, text) */
  segments?: StreamSegment[];
  attachedFile?: AttachedFile;
}

export interface StreamState {
  isStreaming: boolean;
  tokens: number;
  duration: number;
  mode: string;
}

/** Live provider from hermes inventory */
export interface InventoryProvider {
  slug: string;
  name: string;
  models: string[];
  total_models: number;
  is_current: boolean;
  authenticated: boolean;
  auth_type: string;
  key_env: string;
  warning: string;
}


/* ═══════════════════════════════════════════════
   STORE INTERFACE
   ═══════════════════════════════════════════════ */

interface OverlayState {
  // Session
  sessionId: string;
  messages: Message[];

  // Stream state
  streamState: StreamState;

  // Input & Tools
  toolMode: ToolMode;
  inputHistory: string[];
  historyIndex: number;
  fileAttached: AttachedFile | null;

  // Config
  localMode: boolean;
  activeModel: string;
  activeProvider: string;

  // Live inventory from hermes
  inventory: InventoryProvider[];
  inventoryLoading: boolean;

  // Settings State
  isSettingsOpen: boolean;
  launchAtStartup: boolean;
  globalHotkey: string;
  alwaysOnTop: boolean;
  opacity: number;
  smallWindow: boolean;
  theme: 'system' | 'light' | 'dark';
  fontFamily: string;

  // Actions
  setSettingsOpen: (isOpen: boolean) => void;
  setLaunchAtStartup: (enable: boolean) => void;
  setGlobalHotkey: (hotkey: string) => void;
  setAlwaysOnTop: (enable: boolean) => void;
  setOpacity: (opacity: number) => void;
  setSmallWindow: (enable: boolean) => void;
  setTheme: (theme: 'system' | 'light' | 'dark') => void;
  setFontFamily: (fontFamily: string) => void;
  setToolMode: (mode: ToolMode) => void;
  
  addMessage: (msg: Message) => void;
  updateLastMessage: (updater: (msg: Message) => Message) => void;
  appendSegmentToLast: (segment: StreamSegment) => void;
  clearSession: () => void;
  newSession: () => void;
  hydrateSession: (sessionId: string, messages: Message[]) => void;
  setStreamState: (state: Partial<StreamState>) => void;
  cycleToolMode: () => void;
  setLocalMode: (enabled: boolean) => void;
  setActiveModel: (model: string) => void;
  setActiveProvider: (provider: string) => void;
  setInventory: (providers: InventoryProvider[]) => void;
  setInventoryLoading: (loading: boolean) => void;
  addToHistory: (input: string) => void;
  undo: (turns: number) => void;
  setFileAttached: (file: AttachedFile | null) => void;
}


/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

const generateId = () =>
  crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15);


/* ═══════════════════════════════════════════════
   STORE
   ═══════════════════════════════════════════════ */

export const useOverlayStore = create<OverlayState>()(
  persist(
    (set) => ({
      sessionId: generateId(),
      messages: [],

      streamState: {
        isStreaming: false,
        tokens: 0,
        duration: 0,
        mode: 'none',
      },

      toolMode: 'all' as ToolMode,
      inputHistory: [],
      historyIndex: -1,
      fileAttached: null,

      localMode: false,
      activeModel: '',
      activeProvider: '',

      inventory: [],
      inventoryLoading: false,

      // Settings
      isSettingsOpen: false,
      launchAtStartup: false,
      globalHotkey: 'CommandOrControl+Alt+H',
      alwaysOnTop: true,
      opacity: 0.96,
      smallWindow: false,
      theme: 'system',
      fontFamily: 'system-ui',

      /* ── Actions ── */

      setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
      setLaunchAtStartup: (enable) => {
        set({ launchAtStartup: enable });
        (window as any).electronAPI?.setLaunchAtStartup(enable);
      },
      setGlobalHotkey: (hotkey) => {
        set({ globalHotkey: hotkey });
        (window as any).electronAPI?.setGlobalHotkey(hotkey);
      },
      setAlwaysOnTop: (enable) => {
        set({ alwaysOnTop: enable });
        (window as any).electronAPI?.setAlwaysOnTop(enable);
      },
      setOpacity: (opacity) => {
        set({ opacity });
        (window as any).electronAPI?.setOpacity(opacity);
      },
      setSmallWindow: (enable) => {
        set({ smallWindow: enable });
        (window as any).electronAPI?.setSmallWindow(enable);
      },
      setTheme: (theme) => set({ theme }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setToolMode: (mode) => set({ toolMode: mode }),

      addMessage: (msg) =>
        set((state) => ({ messages: [...state.messages, msg] })),

      updateLastMessage: (updater) =>
        set((state) => {
          const msgs = [...state.messages];
          if (msgs.length > 0) {
            msgs[msgs.length - 1] = updater(msgs[msgs.length - 1]);
          }
          return { messages: msgs };
        }),

      appendSegmentToLast: (segment) =>
        set((state) => {
          const msgs = [...state.messages];
          if (msgs.length === 0) return state;
          const last = { ...msgs[msgs.length - 1] };
          if (last.role !== 'assistant') return state;

          const segments = [...(last.segments || []), segment];

          // Also update the text content for text segments
          if (segment.type === 'text') {
            last.content = (last.content || '') + (last.content ? '\n' : '') + segment.content;
          }

          last.segments = segments;
          msgs[msgs.length - 1] = last;
          return { messages: msgs };
        }),

      clearSession: () =>
        set({ messages: [], sessionId: generateId() }),

      newSession: () =>
        set({ messages: [], sessionId: generateId() }),

      hydrateSession: (sessionId, messages) =>
        set({ sessionId, messages }),

      setStreamState: (newState) =>
        set((state) => ({
          streamState: { ...state.streamState, ...newState },
        })),

      cycleToolMode: () =>
        set((state) => {
          const modes: ToolMode[] = ['all', 'none', 'terminal'];
          const nextIndex = (modes.indexOf(state.toolMode) + 1) % modes.length;
          return { toolMode: modes[nextIndex] };
        }),

      setLocalMode: (enabled) => set({ localMode: enabled }),
      setActiveModel: (model) => set({ activeModel: model }),
      setActiveProvider: (provider) => set({ activeProvider: provider }),
      setInventory: (providers) => set({ inventory: providers }),
      setInventoryLoading: (loading) => set({ inventoryLoading: loading }),

      addToHistory: (input) =>
        set((state) => {
          if (!input.trim() || state.inputHistory[0] === input) return state;
          return {
            inputHistory: [input, ...state.inputHistory].slice(0, 50),
          };
        }),

      undo: (turns) =>
        set((state) => {
          const toRemove = turns * 2;
          return {
            messages: state.messages.slice(
              0,
              Math.max(0, state.messages.length - toRemove)
            ),
          };
        }),

      setFileAttached: (file) => set({ fileAttached: file }),
    }),
    {
      name: 'hermes-overlay-storage',
      partialize: (state) => ({
        localMode: state.localMode,
        activeModel: state.activeModel,
        activeProvider: state.activeProvider,
        sessionId: state.sessionId,
        inputHistory: state.inputHistory,
        launchAtStartup: state.launchAtStartup,
        globalHotkey: state.globalHotkey,
        alwaysOnTop: state.alwaysOnTop,
        opacity: state.opacity,
        smallWindow: state.smallWindow,
        toolMode: state.toolMode,
        theme: state.theme,
        fontFamily: state.fontFamily,
      }),
    }
  )
);
