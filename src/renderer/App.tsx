import React, { useEffect, useCallback, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Conversation } from '../components/Conversation';
import { InputBar } from '../components/InputBar';
import { ContextBar } from '../components/surface/ContextBar';
import { StatusBar } from '../components/surface/StatusBar';
import { CommandPalette } from '../components/command/CommandPalette';
import { SettingsPanel } from '../components/settings/SettingsPanel';
import { GuideModal } from '../components/GuideModal';
import { useOverlayStore, generateId } from '../store/overlayStore';
import type { StreamSegment } from '../store/overlayStore';
import { EchoMode } from '../components/EchoMode';
import type { EchoSessionTurn } from '../hooks/useEchoSession';
import { WakeWordListener } from '../components/WakeWordListener';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastContainer } from '../components/ui/Toast';
import { getElectronAPI } from '../hooks/useElectronAPI';

/**
 * App — Root component and surface state machine.
 *
 * Surface states:
 *   - query:        Minimal mode, no chrome above input
 *   - conversation: Context bar + messages + input
 *   - workspace:    Full chrome with tabs and tool panels
 *
 * Preserves all IPC listeners, drag/drop, echo mode, and
 * keyboard shortcuts from the original architecture.
 */

const api = getElectronAPI();

export const App: React.FC = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const {
    addMessage,
    appendSegmentToLast,
    setStreamState,
    updateLastMessage,
    setActiveModel,
    setActiveProvider,
    setInventory,
    setInventoryLoading,
    theme,
    accentColor,
    fontFamily,
    smallWindow,
    cycleToolMode,
    messages,
    newSession,
    hydrateSession,
    isSettingsOpen,
    setSettingsOpen,
  } = useOverlayStore();

  const [isVisible, setIsVisible] = useState(true);
  const [isEchoMode, setIsEchoMode] = useState(false);
  const [echoTransitioning, setEchoTransitioning] = useState(false);
  const echoStartTimeRef = useRef<number>(0);

  // ── Command Palette state ──
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  // ── Surface state derivation ──
  // Surface morphs based on content, not explicit mode switching
  const surfaceState = React.useMemo(() => {
    if (messages.length === 0) return 'query';
    if (messages.length > 6) return 'workspace';
    return 'conversation';
  }, [messages.length]);

  // ── Theme & Font Engine ──
  useEffect(() => {
    // Font Family
    if (fontFamily) {
      document.documentElement.style.setProperty('--font-sans', fontFamily);
    }

    // Accent Color — set data attribute for CSS-driven theming
    if (accentColor) {
      document.documentElement.setAttribute('data-accent', accentColor);
    }

    // Theme logic
    const safeTheme = theme || 'system';
    
    const applyTheme = (isDark: boolean) => {
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    };

    if (safeTheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(mq.matches);
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      applyTheme(safeTheme === 'dark');
    }
  }, [theme, accentColor, fontFamily]);

  // ── Focus helper ──
  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [inputRef]);

  // ── Inventory fetch ──
  useEffect(() => {
    if (!api?.getInventory) return;
    setInventoryLoading(true);
    api.getInventory()
      .then((payload) => {
        if (payload?.providers) {
          setInventory(payload.providers);
          const state = useOverlayStore.getState();
          if (!state.activeProvider && payload.provider) {
            setActiveProvider(payload.provider);
          }
          if (!state.activeModel && payload.model) {
            setActiveModel(payload.model);
          }
        }
      })
      .catch(() => {})
      .finally(() => setInventoryLoading(false));
  }, [setInventory, setInventoryLoading, setActiveModel, setActiveProvider]);

  // ── IPC Listeners ──
  useEffect(() => {
    if (!api) return;

    const cleanups: (() => void)[] = [];

    // Visibility changes — sync state and focus
    if (api.onVisibilityChange) {
      cleanups.push(api.onVisibilityChange((visible: boolean) => {
        setIsVisible(visible);
        if (visible) {
          focusInput();

          // ── Auto-Context Capture ──
          const state = useOverlayStore.getState();
          if (state.autoCaptureContext && api.captureContext) {
            setTimeout(async () => {
              try {
                const ctx = await api.captureContext!();
                if (!ctx) return;

                if (ctx.clipboardText) {
                  useOverlayStore.getState().addPendingAttachments([{
                    id: generateId(),
                    name: 'Clipboard.txt',
                    path: `clipboard://auto_${Date.now()}`,
                    content: ctx.clipboardText,
                    tooBig: ctx.clipboardText.length > 100_000,
                    size: ctx.clipboardText.length,
                    ext: 'txt',
                    isImage: false,
                  }]);
                }

                if (ctx.screenshot) {
                  const fileResult = await api.readDroppedFile(ctx.screenshot.path);
                  if (fileResult) {
                    useOverlayStore.getState().addPendingAttachments([{
                      ...fileResult,
                      ext: fileResult.ext || 'png',
                      isImage: true,
                      id: generateId(),
                    }]);
                  }
                }
              } catch (e) {
                console.error('[AutoContext] Capture failed:', e);
              }
            }, 50);
          }
        } else {
          setIsEchoMode(false);
        }
      }));
    }

    // Focus input
    if (api.onFocusInput) {
      cleanups.push(api.onFocusInput(() => focusInput()));
    }

    // Structured stream segments
    if (api.onStreamSegment) {
      cleanups.push(api.onStreamSegment((segment: StreamSegment) => {
        appendSegmentToLast(segment);
        setStreamState({
          isStreaming: true,
          tokens: useOverlayStore.getState().streamState.tokens + 1,
        });
      }));
    }

    // Stream end
    if (api.onStreamEnd) {
      cleanups.push(api.onStreamEnd(() => {
        setStreamState({ isStreaming: false, tokens: 0, duration: 0 });
        updateLastMessage((msg) => ({ ...msg, isStreaming: false }));
      }));
    }

    // Stream error
    if (api.onStreamError) {
      cleanups.push(api.onStreamError((error: string) => {
        setStreamState({ isStreaming: false });
        const isENOENT = error.includes('ENOENT') || error.includes('spawn hermes');
        const friendly = isENOENT
          ? 'Hermes CLI not found. Install it with `npm install -g @anthropic/hermes` or add it to your PATH.'
          : `Error: ${error}`;
        addMessage({
          id: generateId(),
          role: 'assistant',
          content: friendly,
          timestamp: Date.now(),
        });
      }));
    }

    // Echo mode handler
    if (api.onEnterEchoMode) {
      cleanups.push(api.onEnterEchoMode(() => {
        setIsEchoMode(true);
      }));
    }

    // Push-to-Talk
    if (api.onPushToTalkStart) {
      cleanups.push(api.onPushToTalkStart(() => {
        window.dispatchEvent(new CustomEvent('push-to-talk-toggle'));
      }));
    }

    // Background task updates
    if (api.onBackgroundTaskUpdate) {
      cleanups.push(api.onBackgroundTaskUpdate((task: any) => {
        const state = useOverlayStore.getState();
        const existing = state.backgroundTasks.find((t: any) => t.id === task.id);
        if (existing) {
          state.updateBackgroundTask(task);
        } else {
          state.addBackgroundTask(task);
        }
      }));
    }

    // Background task clicked
    if (api.onBackgroundTaskClicked) {
      cleanups.push(api.onBackgroundTaskClicked((taskId: string) => {
        const state = useOverlayStore.getState();
        const task = state.backgroundTasks.find((t: any) => t.id === taskId);
        if (task && task.status === 'completed') {
          state.addMessage({
            id: generateId(),
            role: 'assistant',
            content: `**Background Task Complete**\n\n${task.output || '(no output)'}`,
            timestamp: Date.now(),
          });
        }
      }));
    }

    return () => cleanups.forEach(fn => fn());
  }, [addMessage, appendSegmentToLast, focusInput, setStreamState, updateLastMessage]);

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+K — Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !e.shiftKey) {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
      }

      // Ctrl+, — Settings
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(!isSettingsOpen);
      }

      // Ctrl+N — New Session
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault();
        newSession();
        focusInput();
      }

      // Ctrl+Shift+E — Echo Mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (isEchoMode) {
          setIsEchoMode(false);
          setEchoTransitioning(false);
        } else {
          enterEchoMode();
        }
      }
      
      // Ctrl+T — Cycle Tool Mode
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        cycleToolMode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEchoMode, cycleToolMode, isSettingsOpen, newSession, focusInput, setSettingsOpen]);

  // Stream duration timer
  useEffect(() => {
    const state = useOverlayStore.getState();
    if (!state.streamState.isStreaming) return;

    const interval = setInterval(() => {
      const s = useOverlayStore.getState().streamState;
      if (s.isStreaming) {
        setStreamState({ duration: s.duration + 1 });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // ── Prevent Electron from navigating on file drop ──
  useEffect(() => {
    const preventNav = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener('dragover', preventNav);
    document.addEventListener('drop', preventNav);
    return () => {
      document.removeEventListener('dragover', preventNav);
      document.removeEventListener('drop', preventNav);
    };
  }, []);

  // ── Drag & Drop Handlers ──
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0 && e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const supportedExts = [
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf',
      'txt', 'md', 'csv', 'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'log',
      'js', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
      'cs', 'swift', 'kt', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd',
      'html', 'css', 'scss', 'less', 'sql', 'graphql',
    ];

    const readPromises = files.map(async (file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isSupported = supportedExts.includes(ext) || file.type !== '';
      if (!isSupported) return null;

      const filePath = (file as any).path || '';
      if (!filePath || !api) return null;

      try {
        const result = await api.readDroppedFile(filePath);
        return { ...result, id: generateId() };
      } catch (e) {
        console.error('Failed to read dropped file:', e);
        return null;
      }
    });

    const results = await Promise.all(readPromises);
    const validFiles = results.filter((f): f is any => f !== null && !f.error);
    
    if (validFiles.length > 0) {
      useOverlayStore.getState().addPendingAttachments(validFiles);
    }
  };

  // ── Echo Mode Helpers ──
  const enterEchoMode = useCallback(() => {
    echoStartTimeRef.current = Date.now();
    setEchoTransitioning(true);
    setTimeout(() => {
      setIsEchoMode(true);
    }, 250);
  }, []);

  const handleEchoExit = useCallback((sessionTranscript?: EchoSessionTurn[]) => {
    setIsEchoMode(false);
    setTimeout(() => {
      setEchoTransitioning(false);
      focusInput();
    }, 300);

    if (sessionTranscript && sessionTranscript.length > 0) {
      const durationSec = Math.floor((Date.now() - echoStartTimeRef.current) / 1000);
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const exchanges = Math.floor(sessionTranscript.length / 2);

      const transcriptLines = sessionTranscript.map(t =>
        `**${t.role === 'user' ? 'You' : 'Hermes'}:** ${t.text}`
      ).join('\n\n');

      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `🎙 **Echo Session** · ${durationStr} · ${exchanges} exchange${exchanges !== 1 ? 's' : ''}\n\n${transcriptLines}`,
        timestamp: Date.now(),
      });
    }
  }, [addMessage, focusInput]);

  // ── Session switching (for Command Palette) ──
  const handleSwitchSession = useCallback(async (sessionId: string) => {
    if (!api?.getSession) return;
    try {
      const messages: any = await api.getSession(sessionId);
      if (Array.isArray(messages)) {
        hydrateSession(sessionId, messages);
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  }, [hydrateSession]);

  // Show ContextBar in conversation and workspace states
  const showContextBar = surfaceState !== 'query';
  const showDragOverlay = isDragging;

  const shellClasses = [
    'overlay-shell',
    smallWindow ? 'small-mode' : '',
    !isVisible ? 'hidden' : '',
    echoTransitioning ? 'echo-dissolve' : '',
  ].filter(Boolean).join(' ');

  return (
    <ErrorBoundary>
      <ToastContainer>
        <div 
          className={shellClasses}
          data-surface={surfaceState}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            ...(echoTransitioning ? { pointerEvents: 'none' as const } : {}),
          }}
        >
          {/* Drag overlay */}
          {showDragOverlay && (
            <div className="drag-overlay">
              <div className="drag-overlay-content">
                <FolderOpen size={32} strokeWidth={1.5} />
                <span>Drop file to attach</span>
              </div>
            </div>
          )}

          {/* Context Bar — always present, replaces old Header */}
          <ContextBar
            onMoreClick={() => setIsPaletteOpen(true)}
            onNewSession={() => { newSession(); focusInput(); }}
            showNewButton={true}
          />

          {/* Conversation */}
          <Conversation />

          {/* Input */}
          <InputBar inputRef={inputRef} />

          {/* Status Bar — conditional */}
          <StatusBar />

          {/* Command Palette (Ctrl+K) — inside shell for containment */}
          <CommandPalette
            isOpen={isPaletteOpen}
            onClose={() => setIsPaletteOpen(false)}
            onNewSession={() => { newSession(); focusInput(); }}
            onOpenSettings={() => setSettingsOpen(true)}
            onSwitchSession={handleSwitchSession}
            onEnterEchoMode={enterEchoMode}
          />

          {/* Settings Panel (Ctrl+,) — inside shell for containment */}
          <SettingsPanel
            isOpen={isSettingsOpen}
            onClose={() => setSettingsOpen(false)}
          />

          {/* Guide Modal — inside shell for containment */}
          <GuideModal />
        </div>

        {/* Echo Mode Layer — fixed fullscreen, outside shell */}
        {isEchoMode && (
          <EchoMode onExit={handleEchoExit} />
        )}

        {/* Global Wake Word Listener */}
        <WakeWordListener />
      </ToastContainer>
    </ErrorBoundary>
  );
};

export default App;
