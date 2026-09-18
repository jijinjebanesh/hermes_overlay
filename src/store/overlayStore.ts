import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SemanticBlock } from '../semantic/types';

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

// ── New TUI-style segment types (replacing old flat tool_activity) ──

import type { DiffLine } from '../tool-parser';

export interface ToolStartSegment {
  type: 'tool_start';
  toolId: string;
  name: string;
  args: Record<string, any>;
  display: string;
}

export interface ToolCompleteSegment {
  type: 'tool_complete';
  toolId: string;
  name: string;
  args: Record<string, any>;
  result: any;
  durationS?: number;
  duration_s?: number;
  inlineDiff?: string;
  inline_diff?: string;
  diffLines?: DiffLine[];
  error?: string;
  display: string;
}

export interface ClarifySegment {
  type: 'clarify';
  question: string;
  choices?: string[];
  multiSelect?: boolean;
  answer?: string;
}

export interface FileNoticeSegment {
  type: 'file_notice';
  filename: string;
}

export interface ThinkingSegment {
  type: 'thinking';
  content: string;
}

export interface ReasoningSegment {
  type: 'reasoning';
  content: string;
}

export interface DiffSegment {
  type: 'diff';
  content: string;
  diffLines?: DiffLine[];
}

export interface TextSegment {
  type: 'text';
  content: string;
}

export type StreamSegment =
  | ToolStartSegment
  | ToolCompleteSegment
  | ClarifySegment
  | FileNoticeSegment
  | ThinkingSegment
  | ReasoningSegment
  | DiffSegment
  | TextSegment;

export interface AttachedFile {
  id: string;
  name: string;
  path: string;
  content: string | null;
  tooBig: boolean;
  size: number;
  ext: string;
  isImage: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  cancelled?: boolean;
  toolCalls?: ToolCall[];
  /** Structured segments from hermes output (TUI-style tool lifecycle, diffs, thinking, text) */
  segments?: StreamSegment[];
  attachments?: AttachedFile[];
  blocks?: SemanticBlock[];
}

export interface StreamState {
  isStreaming: boolean;
  tokens: number;
  duration: number;
  mode: string;
  sessionTokens?: number;
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
  uiState: Record<string, any>;

  // Input & Tools
  toolMode: ToolMode;
  inputHistory: string[];
  historyIndex: number;
  pendingAttachments: AttachedFile[];

  // Config
  localMode: boolean;
  activeModel: string;
  activeProvider: string;

  // Live inventory from hermes
  inventory: InventoryProvider[];
  inventoryLoading: boolean;

  // Settings State
  isSettingsOpen: boolean;
  settingsSidebarCollapsed: boolean;
  isGuideOpen: boolean;
  launchAtStartup: boolean;
  globalHotkey: string;
  alwaysOnTop: boolean;
  smallWindow: boolean;
  theme: 'system' | 'light' | 'dark';
  accentColor: string;
  fontFamily: string;

  // Echo Settings
  echoClapWakeEnabled: boolean;
  echoVoiceModeEnabled: boolean;
  echoInterruptWords: string[];
  echoExitWords: string[];
  echoClapSensitivity: number;
  echoTtsProvider: 'elevenlabs' | 'edge-tts' | 'openai' | 'qwen3';
  echoTtsVoice: string;
  echoWakeWordEnabled: boolean;
  echoWakeWord: string;
  echoDoubleClapMinimize: boolean;

  // Screen awareness
  autoCaptureContext: boolean;
  autoCaptureScreenshot: boolean;

  // Background tasks
  backgroundTasks: any[];

  // Actions
  setSettingsOpen: (open: boolean) => void;
  setSettingsSidebarCollapsed: (collapsed: boolean) => void;
  setGuideOpen: (open: boolean) => void;
  setLaunchAtStartup: (enable: boolean) => void;
  setGlobalHotkey: (key: string) => void;
  setAlwaysOnTop: (always: boolean) => void;

  setSmallWindow: (s: boolean) => void;
  setTheme: (t: 'system' | 'light' | 'dark') => void;
  setAccentColor: (color: string) => void;
  setFontFamily: (f: string) => void;
  setEchoClapWakeEnabled: (enabled: boolean) => void;
  setEchoInterruptWords: (words: string[]) => void;
  setEchoExitWords: (words: string[]) => void;
  setEchoVoiceModeEnabled: (enabled: boolean) => void;
  setEchoClapSensitivity: (sensitivity: number) => void;
  setEchoTtsProvider: (provider: 'elevenlabs' | 'edge-tts' | 'openai' | 'qwen3') => void;
  setEchoTtsVoice: (voice: string) => void;
  setEchoWakeWordEnabled: (enabled: boolean) => void;
  setEchoWakeWord: (word: string) => void;
  setEchoDoubleClapMinimize: (enabled: boolean) => void;
  setAutoCaptureContext: (enabled: boolean) => void;
  setAutoCaptureScreenshot: (enabled: boolean) => void;
  setBackgroundTasks: (tasks: any[]) => void;
  addBackgroundTask: (task: any) => void;
  updateBackgroundTask: (task: any) => void;
  clearBackgroundTask: (taskId: string) => void;
  setToolMode: (mode: ToolMode) => void;

  addMessage: (msg: Message) => void;
  updateLastMessage: (updater: (msg: Message) => Message) => void;
  appendSegmentToLast: (segment: StreamSegment) => void;
  hydrateBlocks: (messageId: string, blocks: SemanticBlock[]) => void;
  updateBlockUIState: (blockId: string, patch: Record<string, any>) => void;
  editFromMessage: (messageId: string) => string | null;
  retryFromMessage: (messageId: string) => string | null;
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
  addPendingAttachments: (files: AttachedFile[]) => void;
  removePendingAttachment: (fileId: string) => void;
  clearPendingAttachments: () => void;
}


/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

export const generateId = () =>
  crypto.randomUUID?.() || Math.random().toString(36).substring(2, 15);


/* ═══════════════════════════════════════════════
   STORE
   ═══════════════════════════════════════════════ */

export const useOverlayStore = create<OverlayState>()(
  persist(
    (set, get) => ({
      sessionId: generateId(),
      messages: [],

      streamState: {
        isStreaming: false,
        tokens: 0,
        duration: 0,
        mode: 'none',
        sessionTokens: 0,
      },
      uiState: {},

      toolMode: 'all' as ToolMode,
      inputHistory: [],
      historyIndex: -1,
      pendingAttachments: [],

      localMode: false,
      activeModel: '',
      activeProvider: '',

      inventory: [],
      inventoryLoading: false,

      // Settings
      isSettingsOpen: false,
      settingsSidebarCollapsed: true,
      isGuideOpen: false,
      launchAtStartup: false,
      globalHotkey: 'CommandOrControl+Alt+H',
      alwaysOnTop: true,

      smallWindow: false,
      theme: 'system',
      accentColor: 'blue',
      fontFamily: 'system-ui',

      echoClapWakeEnabled: true,
      echoVoiceModeEnabled: false,
      echoInterruptWords: ['stop', 'wait', 'shut up', 'hey hermes'],
      echoExitWords: ['goodbye', 'close', 'exit', 'stop reading'],
      echoClapSensitivity: 0.5,
      echoTtsProvider: 'edge-tts',
      echoTtsVoice: 'en-US-AriaNeural',
      echoWakeWordEnabled: false,
      echoWakeWord: 'hey hermes',
      echoDoubleClapMinimize: false,
      autoCaptureContext: true as boolean,
      autoCaptureScreenshot: false as boolean,
      backgroundTasks: [] as any[],

      /* ── Actions ── */

      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      setSettingsSidebarCollapsed: (collapsed) => set({ settingsSidebarCollapsed: collapsed }),
      setGuideOpen: (open) => set({ isGuideOpen: open }),
      setLaunchAtStartup: (enable) => {
        set({ launchAtStartup: enable });
        window.electronAPI?.setLaunchAtStartup(enable);
      },
      setGlobalHotkey: (hotkey) => {
        set({ globalHotkey: hotkey });
        window.electronAPI?.setGlobalHotkey(hotkey);
      },
      setAlwaysOnTop: (enable) => {
        set({ alwaysOnTop: enable });
        window.electronAPI?.setAlwaysOnTop(enable);
      },

      setSmallWindow: (enable) => {
        set({ smallWindow: enable });
        window.electronAPI?.setSmallWindow(enable);
      },
      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
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

          let segments = [...(last.segments || [])];

          // When a clarify segment arrives, remove any pending tool_start for clarify
          // so the clarify card cleanly replaces the tool pill
          if (segment.type === 'clarify') {
            const toolIdx = segments.findIndex(
              (s) => (s.type === 'tool_start' || s.type === 'tool_complete') && (s as any).name === 'clarify'
            );
            if (toolIdx !== -1) {
              segments.splice(toolIdx, 1);
            }

            const existingIdx = segments.findIndex(
              (s) => s.type === 'clarify' && (s as ClarifySegment).question === segment.question
            );
            if (existingIdx !== -1) {
              segments[existingIdx] = {
                ...(segments[existingIdx] as ClarifySegment),
                ...segment,
                choices: segment.choices && segment.choices.length > 0 ? segment.choices : (segments[existingIdx] as ClarifySegment).choices,
              };
            } else {
              segments.push(segment);
            }
          } else if (segment.type === 'tool_complete') {
            // Drop tool_complete for clarify if a clarify segment already exists
            if (segment.name === 'clarify' && segments.some((s) => s.type === 'clarify')) {
              return state;
            }
            let startIdx = -1;
            if (segment.toolId) {
              startIdx = segments.findIndex(
                (s) => s.type === 'tool_start' && (s as ToolStartSegment).toolId === segment.toolId
              );
            }
            if (startIdx === -1 && segment.name) {
              startIdx = segments.findIndex(
                (s) => s.type === 'tool_start' && (s as ToolStartSegment).name === segment.name
              );
            }
            if (startIdx !== -1) {
              segments[startIdx] = segment;
            } else {
              segments.push(segment);
            }
          } else {
            segments.push(segment);
          }

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

      editFromMessage: (messageId) => {
        const state = get();
        const idx = state.messages.findIndex((m) => m.id === messageId);
        if (idx === -1) return null;
        const msg = state.messages[idx];
        if (msg.role !== 'user') return null;
        set({ messages: state.messages.slice(0, idx) });
        return msg.content;
      },

      retryFromMessage: (messageId) => {
        const state = get();
        const idx = state.messages.findIndex((m) => m.id === messageId);
        if (idx === -1) return null;
        const msg = state.messages[idx];
        if (msg.role !== 'assistant') return null;
        let userContent: string | null = null;
        for (let i = idx - 1; i >= 0; i--) {
          if (state.messages[i].role === 'user') {
            userContent = state.messages[i].content;
            set({ messages: state.messages.slice(0, i) });
            break;
          }
        }
        return userContent;
      },

      newSession: () =>
        set({ messages: [], sessionId: generateId() }),

      hydrateSession: (sessionId, messages) =>
        set({ sessionId, messages }),

      hydrateBlocks: (messageId, blocks) =>
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId ? { ...message, blocks } : message
          ),
        })),

      updateBlockUIState: (blockId, patch) =>
        set((state) => ({
          uiState: {
            ...state.uiState,
            [blockId]: { ...(state.uiState[blockId] || {}), ...patch },
          },
        })),

      setStreamState: (newState) =>
        set((state) => ({
          streamState: { ...state.streamState, ...newState },
        })),

      cycleToolMode: () =>
        set((state) => {
          const modes: ToolMode[] = ['all', 'terminal', 'none'];
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

      setEchoClapWakeEnabled: (enabled) => {
        set({ echoClapWakeEnabled: enabled });
        window.electronAPI?.echoSettingsChanged?.({ echoClapWakeEnabled: enabled });
      },
      setEchoInterruptWords: (words) => set({ echoInterruptWords: words }),
      setEchoExitWords: (words) => set({ echoExitWords: words }),

      addPendingAttachments: (files) =>
        set((state) => ({
          pendingAttachments: [...state.pendingAttachments, ...files]
        })),

      removePendingAttachment: (fileId) =>
        set((state) => ({
          pendingAttachments: state.pendingAttachments.filter(f => f.id !== fileId)
        })),

      clearPendingAttachments: () => set({ pendingAttachments: [] }),

      setEchoVoiceModeEnabled: (enabled) => {
        set({ echoVoiceModeEnabled: enabled });
        window.electronAPI?.echoSettingsChanged?.({ echoVoiceModeEnabled: enabled });
      },
      setEchoClapSensitivity: (sensitivity) => {
        set({ echoClapSensitivity: sensitivity });
        window.electronAPI?.echoSettingsChanged?.({ echoClapSensitivity: sensitivity });
      },
      setEchoTtsProvider: (provider) => set({ echoTtsProvider: provider }),
      setEchoTtsVoice: (voice) => set({ echoTtsVoice: voice }),
      setEchoWakeWordEnabled: (enabled) => {
        set({ echoWakeWordEnabled: enabled });
        window.electronAPI?.echoSettingsChanged?.({ echoWakeWordEnabled: enabled });
      },
      setEchoWakeWord: (word) => {
        set({ echoWakeWord: word });
        window.electronAPI?.echoSettingsChanged?.({ echoWakeWord: word });
      },
      setEchoDoubleClapMinimize: (enabled) => {
        set({ echoDoubleClapMinimize: enabled });
        window.electronAPI?.echoSettingsChanged?.({ echoDoubleClapMinimize: enabled });
      },
      setAutoCaptureContext: (enabled) => set({ autoCaptureContext: enabled }),
      setAutoCaptureScreenshot: (enabled) => set({ autoCaptureScreenshot: enabled }),
      setBackgroundTasks: (tasks) => set({ backgroundTasks: tasks }),
      addBackgroundTask: (task) => set((state) => ({
        backgroundTasks: [task, ...state.backgroundTasks].slice(0, 50),
      })),
      updateBackgroundTask: (task) => set((state) => ({
        backgroundTasks: state.backgroundTasks.map((t) =>
          t.id === task.id ? task : t
        ),
      })),
      clearBackgroundTask: (taskId) => set((state) => ({
        backgroundTasks: state.backgroundTasks.filter((t) => t.id !== taskId),
      })),
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

        smallWindow: state.smallWindow,
        toolMode: state.toolMode,
        theme: state.theme,
        accentColor: state.accentColor,
        fontFamily: state.fontFamily,
        echoClapWakeEnabled: state.echoClapWakeEnabled,
        echoWakeWordEnabled: state.echoWakeWordEnabled,
        echoWakeWord: state.echoWakeWord,
        echoClapSensitivity: state.echoClapSensitivity,
        echoVoiceModeEnabled: state.echoVoiceModeEnabled,
        echoInterruptWords: state.echoInterruptWords,
        echoExitWords: state.echoExitWords,
        echoTtsProvider: state.echoTtsProvider,
        echoTtsVoice: state.echoTtsVoice,
        echoDoubleClapMinimize: state.echoDoubleClapMinimize,
        autoCaptureContext: state.autoCaptureContext,
        autoCaptureScreenshot: state.autoCaptureScreenshot,
      }),
    }
  )
);
