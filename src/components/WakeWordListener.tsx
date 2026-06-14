import React, { useEffect, useRef, useCallback } from 'react';
import { useOverlayStore } from '../store/overlayStore';

/**
 * Headless component that listens continuously for the wake word
 * using the Web Speech API (webkitSpeechRecognition).
 *
 * Uses short non-continuous sessions that restart themselves to work
 * reliably inside Electron's Chromium, which sometimes kills continuous sessions.
 */
export const WakeWordListener: React.FC = () => {
  const { echoWakeWordEnabled, echoWakeWord } = useOverlayStore();
  const recognitionRef = useRef<any>(null);
  const stoppedIntentionallyRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSession = useCallback(() => {
    const { echoWakeWordEnabled: enabled, echoWakeWord: phrase } = useOverlayStore.getState();
    if (!enabled || !phrase) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('[WakeWordListener] SpeechRecognition not available');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      // Use short non-continuous mode — more reliable in Electron
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 3;

      recognition.onresult = (event: any) => {
        for (let i = 0; i < event.results.length; i++) {
          const result = event.results[i];
          for (let j = 0; j < result.length; j++) {
            const transcript = result[j].transcript.trim().toLowerCase().replace(/[.,!?]/g, '');
            const target = phrase.trim().toLowerCase().replace(/[.,!?]/g, '');
            if (transcript.includes(target)) {
              console.log('[WakeWordListener] Wake phrase detected! Triggering echo mode.');
              (window as any).electronAPI?.triggerWakeWord?.();
              return;
            }
          }
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          console.error('[WakeWordListener] Mic permission denied');
          return; // don't retry
        }
        // All other errors (no-speech, network, aborted) — just let onend restart
      };

      recognition.onend = () => {
        if (stoppedIntentionallyRef.current) return;
        // Restart after a short gap to avoid rapid-fire restarts
        restartTimerRef.current = setTimeout(startSession, 300);
      };

      recognitionRef.current = recognition;
      stoppedIntentionallyRef.current = false;
      recognition.start();
      console.log('[WakeWordListener] Session started, listening for:', phrase);
    } catch (err) {
      console.error('[WakeWordListener] Failed to start:', err);
      restartTimerRef.current = setTimeout(startSession, 1000);
    }
  }, []); // stable ref — reads state directly inside

  const stopSession = useCallback(() => {
    stoppedIntentionallyRef.current = true;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (echoWakeWordEnabled && echoWakeWord) {
      startSession();
    } else {
      stopSession();
    }
    return stopSession;
  }, [echoWakeWordEnabled, echoWakeWord, startSession, stopSession]);

  return null;
};
