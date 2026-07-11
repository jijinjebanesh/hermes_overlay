import React, { useEffect, useCallback, useRef, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Header } from '../components/Header';
import { Conversation } from '../components/Conversation';
import { InputBar } from '../components/InputBar';
import { SettingsModal } from '../components/SettingsModal';
import { useOverlayStore, generateId } from '../store/overlayStore';
import type { StreamSegment } from '../store/overlayStore';
import { EchoMode } from '../components/EchoMode';
import type { EchoSessionTurn } from '../hooks/useEchoSession';
import { WakeWordListener } from '../components/WakeWordListener';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ToastContainer } from '../components/ui/Toast';
import { getElectronAPI } from '../hooks/useElectronAPI';

/**
 * Root component. Renders the three-section layout:
 * Header → Conversation → InputBar.
 *
 * Wires up IPC listeners for visibility, structured
 * segment streaming, and focus events from main process.
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
  } = useOverlayStore();

  const [isVisible, setIsVisible] = useState(true);
  const [isEchoMode, setIsEchoMode] = useState(false);
  const [echoTransitioning, setEchoTransitioning] = useState(false);
  const echoStartTimeRef = useRef<number>(0);

  // ── Theme & Font Engine ──
  useEffect(() => {
    // Font Family
    if (fontFamily) {
      document.documentElement.style.setProperty('--font-sans', fontFamily);
    }

    // Accent Color — map named color to hex and set CSS custom property
    if (accentColor) {
      document.documentElement.setAttribute('data-accent', accentColor);
      const ACCENT_HEX: Record<string, string> = {
        blue:   '#0A84FF',
        purple: '#BF5AF2',
        pink:   '#FF375F',
        red:    '#FF453A',
        orange: '#FF9F0A',
        green:  '#30D158',
      };
      const hex = ACCENT_HEX[accentColor] || ACCENT_HEX.blue;
      document.documentElement.style.setProperty('--accent-primary', hex);
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

          // ── Auto-Context Capture (Screen & App Awareness) ──
          // When overlay is summoned, silently grab screenshot + clipboard
          // so they're available as context without manual copy-paste.
          const state = useOverlayStore.getState();
          if (state.autoCaptureContext && api.captureContext) {
            // Small delay so the overlay is fully rendered before hiding for screenshot
            setTimeout(async () => {
              try {
                const ctx = await api.captureContext!();
                if (!ctx) return;

                // Auto-attach clipboard text if present
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

                // Auto-attach screenshot if present
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
          setIsEchoMode(false); // Close Echo mode when hidden
        }
      }));
    }

    // Focus input
    if (api.onFocusInput) {
      cleanups.push(api.onFocusInput(() => focusInput()));
    }

    // Structured stream segments from hermes parser
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

    // Push-to-Talk handler — toggles recording on Ctrl+Space
    if (api.onPushToTalkStart) {
      cleanups.push(api.onPushToTalkStart(() => {
        // Dispatch custom event so EchoMode picks it up
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

    // Background task clicked in notification — show the result
    if (api.onBackgroundTaskClicked) {
      cleanups.push(api.onBackgroundTaskClicked((taskId: string) => {
        const state = useOverlayStore.getState();
        const task = state.backgroundTasks.find((t: any) => t.id === taskId);
        if (task && task.status === 'completed') {
          // Display the task result as an assistant message
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

  // ── Keyboard Shortcuts (Echo Mode & Tool Mode) ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘⇧E / Ctrl+Shift+E for Echo mode
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (isEchoMode) {
          setIsEchoMode(false);
          setEchoTransitioning(false);
        } else {
          enterEchoMode();
        }
      }
      
      // Ctrl+T to cycle Tool Mode
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        cycleToolMode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isEchoMode, cycleToolMode]);

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

  // ── Prevent Electron from navigating on file drop (document-level) ──
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

  // ── Drag & Drop Handlers (Global) ──
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
      // Images
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico',
      // Documents
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf',
      // Text / Code
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
        return {
          ...result,
          id: generateId()
        };
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
    // Phase 1: chat fades up & blurs out (250ms)
    // EchoMode container fades in concurrently with orb rising from bottom
    setTimeout(() => {
      setIsEchoMode(true);
    }, 250);
  }, []);

  const handleEchoExit = useCallback((sessionTranscript?: EchoSessionTurn[]) => {
    setIsEchoMode(false);
    // Phase 2: Echo fades out, chat restores (300ms blur dissolve)
    setTimeout(() => {
      setEchoTransitioning(false);
      focusInput();
    }, 300);
    // ...merge transcript (unchanged)...

    // Merge transcript into conversation if there were exchanges
    if (sessionTranscript && sessionTranscript.length > 0) {
      const durationSec = Math.floor((Date.now() - echoStartTimeRef.current) / 1000);
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      const exchanges = Math.floor(sessionTranscript.length / 2);

      // Build a readable transcript
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
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
                      ...(echoTransitioning ? { pointerEvents: 'none' as const } : {})
                    }}
        >
          {showDragOverlay && (
            <div className="global-drag-overlay">
              <div className="global-drag-content">
                <div className="global-drag-icon"><FolderOpen size={32} strokeWidth={1.5} /></div>
                <h2>Drop file to attach</h2>
                <p>Images, documents, code, and more</p>
              </div>
            </div>
          )}
          <Header />
          <Conversation />
          <InputBar inputRef={inputRef} />
        </div>
        
        {/* Settings Modal Layer */}
        <SettingsModal />

        {/* Echo Mode Layer */}
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
