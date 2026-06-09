import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  const [isVisible, setIsVisible] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      const matchMedia = window.matchMedia('(prefers-color-scheme: dark)');
      applyTheme(matchMedia.matches);
      
      const listener = (e: MediaQueryListEvent) => applyTheme(e.matches);
      matchMedia.addEventListener('change', listener);
      return () => matchMedia.removeEventListener('change', listener);
    } else {
      applyTheme(safeTheme === 'dark');
    }
  }, [theme, fontFamily]);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // ── Load inventory on mount ──
  useEffect(() => {
    if (!api?.getInventory) return;

    setInventoryLoading(true);
    api.getInventory()
      .then((payload: any) => {
        if (payload && payload.providers) {
          setInventory(payload.providers);

          // If no model/provider set yet, use the current from hermes config
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

    // Visibility changes
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
  });

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{
              type: 'spring',
              mass: 0.6,
              stiffness: 280,
              opacity: { duration: 0.2, ease: 'easeOut' },
            }}
            className="overlay-shell"
          >
            <Header />
            <Conversation />
            <InputBar inputRef={inputRef} />
          </motion.div>
        )}
      </AnimatePresence>
      <SettingsModal />
    </>
  );
};

export default App;
