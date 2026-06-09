import React, { useEffect, useCallback, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { Conversation } from '../components/Conversation';
import { InputBar } from '../components/InputBar';
import { SettingsModal } from '../components/SettingsModal';
import { useOverlayStore } from '../store/overlayStore';
import type { StreamSegment } from '../store/overlayStore';

/**
 * Root component. Renders the three-section layout:
 * Header → Conversation → InputBar.
 *
 * Wires up IPC listeners for visibility, structured
 * segment streaming, and focus events from main process.
 */

const api = (window as any).electronAPI as any;

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
    fontFamily
  } = useOverlayStore();

  const [isVisible, setIsVisible] = useState(true);

  // ── Theme & Font Engine ──
  useEffect(() => {
    // Font Family
    if (fontFamily) {
      document.documentElement.style.setProperty('--font-sans', fontFamily);
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
  }, [theme, fontFamily]);

  // ── Focus helper ──
  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [inputRef]);

  // ── Inventory fetch ──
  useEffect(() => {
    if (!api?.getInventory) return;
    setInventoryLoading(true);
    api.getInventory()
      .then((payload: any) => {
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
        if (visible) focusInput();
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
        addMessage({
          id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
          role: 'assistant',
          content: `Error: ${error}`,
          timestamp: Date.now(),
        });
      }));
    }

    return () => cleanups.forEach(fn => fn());
  }, [addMessage, appendSegmentToLast, focusInput, setStreamState, updateLastMessage]);

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
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Windows drag-and-drop often has empty file.type — fall back to extension
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
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
    const isSupported = supportedExts.includes(ext) || file.type !== '';

    if (isSupported) {
      const filePath = (file as any).path || '';
      useOverlayStore.getState().setFileAttached({ path: filePath, name: file.name });
    }
  };

  const showDragOverlay = isDragging;

  return (
    <>
      <div 
        className={`overlay-shell ${useOverlayStore().smallWindow ? 'small-mode' : ''} ${!isVisible ? 'hidden' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {showDragOverlay && (
          <div className="global-drag-overlay">
            <div className="global-drag-content">
              <div className="global-drag-icon">📁</div>
              <h2>Drop file to attach</h2>
              <p>Images, documents, code, and more</p>
            </div>
          </div>
        )}
        <Header />
        <Conversation />
        <InputBar inputRef={inputRef} />
      </div>
      <SettingsModal />
    </>
  );
};

export default App;
