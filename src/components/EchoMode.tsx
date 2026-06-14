import React, { useEffect, useState, useRef, useCallback } from 'react';
import { EchoEngine, EchoState } from '../audio/EchoEngine';
import { EchoOrb } from './EchoOrb';
import { Mic, MicOff, Volume2, Square, ChevronUp, MessageSquareText, ArrowUp, X } from 'lucide-react';

interface EchoModeProps {
  onExit: (sessionTranscript?: EchoSessionTurn[]) => void;
}

export interface EchoSessionTurn {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}

/**
 * Echo Mode — Full-screen voice conversation surface.
 *
 * Features:
 * - Audio-reactive orb visualization
 * - Live STT transcript with interim/final distinction
 * - Agent caption with word-by-word reveal during TTS
 * - Control cluster (mute, volume/voice popover, end)
 * - Session transcript accumulation for merge on exit
 * - Accessibility: aria-live state announcements, keyboard controls
 * - Focus management: auto-focus mute on enter, return to input on exit
 * - Reduced-motion support
 * - Edge case handling: OS-level mic mute, STT latency timeouts
 */
export const EchoMode: React.FC<EchoModeProps> = ({ onExit }) => {
  const [state, setState] = useState<EchoState>('initializing');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [agentText, setAgentText] = useState('');
  const [amplitude, setAmplitude] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [orbVisible, setOrbVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');
  const [showVolumePopover, setShowVolumePopover] = useState(false);
  const [volume, setVolume] = useState(80);
  const [latencyWarning, setLatencyWarning] = useState<string | null>(null);
  const [osMicMuted, setOsMicMuted] = useState(false);
  const [revealedWords, setRevealedWords] = useState(0);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const engineRef = useRef<EchoEngine | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const sessionTranscriptRef = useRef<EchoSessionTurn[]>([]);
  const prevStateRef = useRef<EchoState>('initializing');
  const muteBtnRef = useRef<HTMLButtonElement>(null);
  const volumePopoverRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const wasMutedBeforeTextRef = useRef(false);
  const wordRevealTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentTextRef = useRef(agentText);
  const latencyTimerRef = useRef<{ t5: ReturnType<typeof setTimeout> | null; t15: ReturnType<typeof setTimeout> | null }>({ t5: null, t15: null });

  // Detect compact mode
  useEffect(() => {
    const checkCompactMode = () => {
      const shell = document.querySelector('.overlay-shell');
      const isSmallMode = shell?.classList.contains('small-mode') ?? false;
      const isNarrowWindow = window.innerWidth < 600 || window.innerHeight < 400;
      setIsCompactMode(isSmallMode || isNarrowWindow);
    };
    checkCompactMode();
    window.addEventListener('resize', checkCompactMode);
    const interval = setInterval(checkCompactMode, 1000);
    return () => {
      window.removeEventListener('resize', checkCompactMode);
      clearInterval(interval);
    };
  }, []);

  // Orb entrance
  useEffect(() => {
    const t = setTimeout(() => setOrbVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Focus management: auto-focus mute button on enter
  useEffect(() => {
    if (state !== 'initializing' && muteBtnRef.current) {
      // Delay to allow animation to settle
      const t = setTimeout(() => muteBtnRef.current?.focus(), 600);
      return () => clearTimeout(t);
    }
  }, [state === 'initializing']);

  // Session timer
  useEffect(() => {
    if (state === 'initializing' || state === 'error') return;
    sessionStartRef.current = Date.now();
    const timer = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [state === 'initializing']);

  // Aria announcements on state change
  useEffect(() => {
    if (state === prevStateRef.current) return;
    prevStateRef.current = state;

    const announcements: Record<EchoState, string> = {
      initializing: 'Echo mode starting up',
      listening: isMuted ? 'Microphone muted' : 'Hermes is listening',
      processing: 'Processing your speech',
      thinking: 'Hermes is thinking',
      speaking: `Hermes is speaking${agentText ? ': ' + agentText.substring(0, 50) : ''}`,
      interrupted: 'Interrupted. Hermes is listening.',
      error: 'Error: Cannot access microphone',
    };
    setAriaAnnouncement(announcements[state] || '');
  }, [state, isMuted, agentText]);

  // §8.4 STT/LLM latency timeouts
  useEffect(() => {
    // Clear previous timers
    if (latencyTimerRef.current.t5) clearTimeout(latencyTimerRef.current.t5);
    if (latencyTimerRef.current.t15) clearTimeout(latencyTimerRef.current.t15);
    setLatencyWarning(null);

    if (state === 'processing' || state === 'thinking') {
      latencyTimerRef.current.t5 = setTimeout(() => {
        setLatencyWarning('Still processing…');
      }, 5000);
      latencyTimerRef.current.t15 = setTimeout(() => {
        setLatencyWarning('Transcription taking longer than expected.');
      }, 15000);
    }

    return () => {
      if (latencyTimerRef.current.t5) clearTimeout(latencyTimerRef.current.t5);
      if (latencyTimerRef.current.t15) clearTimeout(latencyTimerRef.current.t15);
    };
  }, [state]);

  // §8.2 OS-level mic mute detection
  useEffect(() => {
    if (!engineRef.current?.micStream) return;
    const tracks = engineRef.current.micStream.getAudioTracks();
    const handler = () => {
      const anyMuted = tracks.some(t => t.muted);
      setOsMicMuted(anyMuted);
    };
    tracks.forEach(t => {
      t.addEventListener('mute', handler);
      t.addEventListener('unmute', handler);
    });
    return () => {
      tracks.forEach(t => {
        t.removeEventListener('mute', handler);
        t.removeEventListener('unmute', handler);
      });
    };
  }, [state]); // re-bind when state changes (mic may not exist during init)

  // Keep a ref of agentText so the interval can read the latest without re-running
  useEffect(() => {
    agentTextRef.current = agentText;
  }, [agentText]);

  // §5.3 Agent caption word-by-word reveal
  useEffect(() => {
    if (wordRevealTimerRef.current) {
      clearInterval(wordRevealTimerRef.current);
      wordRevealTimerRef.current = null;
    }

    if (state === 'speaking') {
      setRevealedWords(0);
      // Reveal one word every ~140ms to sync with natural speech pace
      wordRevealTimerRef.current = setInterval(() => {
        setRevealedWords(prev => {
          const words = agentTextRef.current.split(/\s+/).filter(Boolean);
          if (prev >= words.length) {
            return prev;
          }
          return prev + 1;
        });
      }, 140);
    } else {
      setRevealedWords(0);
    }

    return () => {
      if (wordRevealTimerRef.current) clearInterval(wordRevealTimerRef.current);
    };
  }, [state]);

  // Accumulate session transcript
  useEffect(() => {
    if (state === 'thinking' && transcript.trim()) {
      sessionTranscriptRef.current.push({
        role: 'user',
        text: transcript.trim(),
        timestamp: Date.now(),
      });
    }
  }, [state, transcript]);

  useEffect(() => {
    if ((state === 'listening' || state === 'interrupted') && agentText.trim()) {
      sessionTranscriptRef.current.push({
        role: 'agent',
        text: agentText.trim(),
        timestamp: Date.now(),
      });
    }
  }, [state, agentText]);

  // Close volume popover on outside click
  useEffect(() => {
    if (!showVolumePopover) return;
    const handler = (e: MouseEvent) => {
      if (volumePopoverRef.current && !volumePopoverRef.current.contains(e.target as Node)) {
        setShowVolumePopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showVolumePopover]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExit = useCallback(() => {
    engineRef.current?.destroy();
    onExit(sessionTranscriptRef.current.length > 0 ? sessionTranscriptRef.current : undefined);
  }, [onExit]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      if (engineRef.current) {
        const stream = engineRef.current.micStream;
        if (stream) {
          stream.getAudioTracks().forEach(t => { t.enabled = !next; });
        }
      }
      return next;
    });
  }, []);

  // ── Type-to-Echo handlers ──

  const openTextInput = useCallback(() => {
    // Remember current mute state, then auto-mute while typing
    wasMutedBeforeTextRef.current = isMuted;
    if (!isMuted && engineRef.current?.micStream) {
      engineRef.current.micStream.getAudioTracks().forEach(t => { t.enabled = false; });
      setIsMuted(true);
    }
    setShowTextInput(true);
    setTextInputValue('');
    setShowVolumePopover(false);
    // Focus the input after the slide-up animation starts
    setTimeout(() => textInputRef.current?.focus(), 80);
  }, [isMuted]);

  const closeTextInput = useCallback(() => {
    setShowTextInput(false);
    setTextInputValue('');
    // Restore mute state to what it was before opening text input
    if (!wasMutedBeforeTextRef.current && engineRef.current?.micStream) {
      engineRef.current.micStream.getAudioTracks().forEach(t => { t.enabled = true; });
      setIsMuted(false);
    }
  }, []);

  const submitTextInput = useCallback(() => {
    const text = textInputValue.trim();
    if (!text || !engineRef.current) return;

    // Record in session transcript
    sessionTranscriptRef.current.push({
      role: 'user',
      text,
      timestamp: Date.now(),
    });

    setShowTextInput(false);
    setTextInputValue('');

    // Restore mic to pre-text state (will be paused anyway during thinking/speaking)
    if (!wasMutedBeforeTextRef.current && engineRef.current.micStream) {
      engineRef.current.micStream.getAudioTracks().forEach(t => { t.enabled = true; });
      setIsMuted(false);
    }

    // Feed text into the engine pipeline
    engineRef.current.sendTextMessage(text);
  }, [textInputValue]);

  // Handle transcript updates — split interim vs final
  const handleTranscriptUpdate = useCallback((text: string, isInterim?: boolean) => {
    setTranscript(text);
    if (isInterim) {
      setInterimTranscript(text);
      setFinalTranscript('');
    } else {
      setFinalTranscript(text);
      setInterimTranscript('');
    }
  }, []);

  useEffect(() => {
    const engine = new EchoEngine({
      onStateChange: setState,
      onTranscriptUpdate: (text: string) => {
        // The live recognition provides mixed interim/final.
        // We'll treat it as interim if state is listening, final once state changes to processing/thinking
        setTranscript(text);
      },
      onAgentTextUpdate: setAgentText,
      onAmplitudeUpdate: setAmplitude,
      onExit: handleExit,
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [handleExit]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: close text input first, then exit Echo
      if (e.key === 'Escape') {
        if (showTextInput) {
          closeTextInput();
        } else {
          handleExit();
        }
        return;
      }
      // Space to toggle mute — only when not typing in an input
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        toggleMute();
      }
      // T key to open text input (when not already in an input)
      if (e.key === 't' && !showTextInput && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        openTextInput();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleExit, toggleMute, showTextInput, closeTextInput, openTextInput]);

  // Determine what text to show in the transcript pill
  const showAgentCaption = state === 'speaking' && agentText;
  const showUserTranscript = !showAgentCaption && (
    state === 'listening' || state === 'processing' || state === 'thinking'
  ) && transcript;

  // Human-readable state label
  const stateLabel: Record<EchoState, string> = {
    initializing: 'Starting up',
    listening: isMuted ? 'Muted' : 'Listening',
    processing: 'Processing',
    thinking: 'Thinking',
    speaking: 'Speaking',
    interrupted: 'Interrupted',
    error: 'Error',
  };

  const displayState = isMuted && state === 'listening' ? 'muted' : state;
  const isInitializing = state === 'initializing';
  const hasTranscriptContent = !!(showUserTranscript || showAgentCaption);

  // Build agent caption words
  const agentWords = agentText ? agentText.split(/\s+/) : [];

  return (
    <div className="echo-mode-container" data-state={state} data-compact={isCompactMode}>

      {/* Aria live region for screen readers */}
      <div
        role="status"
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      >
        {ariaAnnouncement}
      </div>

      {/* Exit button — top right */}
      <button
        className="echo-exit-btn"
        style={{ opacity: isInitializing ? 0 : 1, transition: 'opacity 0.4s ease' }}
        onClick={handleExit}
        aria-label="End Echo Mode"
      >
        <span className="echo-exit-icon">✕</span>
        {!isCompactMode && <span className="echo-exit-text">End</span>}
      </button>

      {/* Timer pill — top left */}
      {!isInitializing && (
        <div className="echo-timer" style={{ opacity: isInitializing ? 0 : 1 }}>
          {formatDuration(sessionDuration)}
        </div>
      )}

      {/* Transcript pill — above orb */}
      <div className="echo-transcript-wrapper" data-visible={hasTranscriptContent && !isInitializing}>

        {/* User transcript with interim/final distinction */}
        {showUserTranscript && (
          <div className={`echo-transcript${isCompactMode ? ' compact' : ''}`} role="log" aria-live="polite">
            <div 
              className="echo-transcript-inner" 
              style={{ transform: `translateX(calc(-1 * max(0, ${transcript.split(/\s+/).length} - 6) * 8ch))` }}
            >
              {state === 'listening' && !isMuted && (
                <span className="echo-transcript-listening-dot" style={{ flexShrink: 0 }} />
              )}
              {state === 'listening' ? (
                // During listening: show text with interim styling (faded for unconfirmed)
                <span className="interim">{transcript}</span>
              ) : (
                // During processing/thinking: text is finalized
                <span>{transcript}</span>
              )}
            </div>
          </div>
        )}

        {/* Agent caption: word-by-word reveal during speaking */}
        {showAgentCaption && (
          <div className={`echo-transcript${isCompactMode ? ' compact' : ''}`} style={{ fontSize: '17px', fontWeight: 500, letterSpacing: '-0.01em' }}>
            <div 
              className="echo-transcript-inner" 
              style={{ transform: `translateX(calc(-1 * max(0, ${revealedWords} - 6) * 8ch))` }}
            >
              {agentWords.map((word, i) => {
                const isRevealed = i < revealedWords;
                // Fade out older words
                const opacity = i < revealedWords - 8 ? 0 : i < revealedWords - 5 ? 0.4 : 1;
                return (
                  <span 
                    key={i} 
                    className={`agent-word${isRevealed ? ' revealed' : ''}`}
                    style={{ opacity: isRevealed ? opacity : 0 }}
                  >
                    {word}{i < agentWords.length - 1 ? ' ' : ''}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Orb + state label */}
      <div className="echo-center" data-compact={isCompactMode}>
        <div
          className="echo-orb-wrapper"
          style={{
            opacity: orbVisible ? 1 : 0,
            transform: orbVisible ? 'scale(1)' : 'scale(0.6)',
            transition: 'opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1)',
          }}
        >
          <EchoOrb state={state} amplitude={amplitude} compact={isCompactMode} muted={isMuted} />
        </div>

        {/* State label */}
        <div className="echo-state-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            className="echo-state-label"
            data-compact={isCompactMode}
            data-state={displayState}
            key={displayState}
          >
            {stateLabel[state]}
          </div>
          {latencyWarning && (
            <div className="echo-state-sublabel" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', animation: 'echoFadeInUp 0.3s cubic-bezier(0.16,1,0.3,1) both' }}>
              {latencyWarning}
            </div>
          )}
        </div>
      </div>

      {/* Control cluster — bottom anchored */}
      {!isInitializing && (
        <div className="echo-controls">
          {/* Mute/unmute */}
          <button
            ref={muteBtnRef}
            className={`echo-ctrl-btn${isMuted ? ' muted' : ''}`}
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={isMuted ? 'Unmute (Space)' : 'Mute (Space)'}
          >
            {isMuted
              ? <MicOff size={20} strokeWidth={1.8} />
              : <Mic size={20} strokeWidth={1.8} />
            }
          </button>

          <div className="echo-ctrl-divider" />

          {/* Type-to-Echo */}
          <button
            className={`echo-ctrl-btn${showTextInput ? ' active' : ''}`}
            onClick={() => showTextInput ? closeTextInput() : openTextInput()}
            aria-label="Type a message"
            title="Type a message (T)"
            disabled={state === 'thinking' || state === 'speaking'}
          >
            <MessageSquareText size={19} strokeWidth={1.8} />
          </button>

          <div className="echo-ctrl-divider" />

          {/* Volume / Voice */}
          <div style={{ position: 'relative' }} ref={volumePopoverRef}>
            <button
              className="echo-ctrl-btn"
              onClick={() => setShowVolumePopover(prev => !prev)}
              aria-label="Volume and voice settings"
              aria-expanded={showVolumePopover}
              title="Volume / Voice"
            >
              <Volume2 size={20} strokeWidth={1.8} />
            </button>

            {/* Volume / Voice popover */}
            {showVolumePopover && (
              <div className="echo-volume-popover">
                <div className="echo-volume-popover-arrow">
                  <ChevronUp size={14} />
                </div>
                <div className="echo-volume-row">
                  <span className="echo-volume-label">Volume</span>
                  <input
                    type="range"
                    className="mac-slider"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolume(v);
                      // Apply volume to TTS audio if playing
                      if (engineRef.current) {
                        const audio = (engineRef.current as any).ttsAudio as HTMLAudioElement | null;
                        if (audio) audio.volume = v / 100;
                      }
                    }}
                    aria-label="Volume level"
                  />
                  <span className="echo-volume-value">{volume}%</span>
                </div>
              </div>
            )}
          </div>

          <div className="echo-ctrl-divider" />

          {/* End session */}
          <button
            className="echo-ctrl-btn end-btn"
            onClick={handleExit}
            aria-label="End Echo session"
            title="End Echo"
          >
            <Square size={14} strokeWidth={1.8} />
            <span>End</span>
          </button>
        </div>
      )}

      {/* Type-to-Echo input bar — slides up from control cluster */}
      {showTextInput && (
        <div className="echo-text-input-bar">
          <input
            ref={textInputRef}
            className="echo-text-input"
            type="text"
            value={textInputValue}
            onChange={(e) => setTextInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitTextInput();
              }
              // Escape handled by global handler
            }}
            placeholder="Type a message…"
            aria-label="Type a message to Hermes"
            autoComplete="off"
            spellCheck={false}
          />
          {textInputValue.trim() ? (
            <button
              className="echo-text-send-btn"
              onClick={submitTextInput}
              aria-label="Send message"
            >
              <ArrowUp size={16} strokeWidth={2.2} />
            </button>
          ) : (
            <button
              className="echo-text-dismiss-btn"
              onClick={closeTextInput}
              aria-label="Dismiss text input"
            >
              <X size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {/* Latency warning (§8.4) */}
      {/* OS-level mic muted warning (§8.2) */}
      {osMicMuted && !isMuted && (
        <div className="echo-latency-warning">
          Microphone is muted at system level. Unmute in menu bar or System Preferences.
        </div>
      )}

      {/* Error banner (§8.1) */}
      {state === 'error' && (
        <div className="echo-error-banner" data-compact={isCompactMode}>
          <div style={{ fontWeight: 600, marginBottom: isCompactMode ? 0 : 4 }}>
            Microphone access required
          </div>
          {!isCompactMode && (
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
              Open System Preferences → Privacy & Security → Microphone
            </div>
          )}
          {!isCompactMode && (
            <button
              className="echo-error-action"
              onClick={() => {
                // On macOS, open system preferences. On Windows, open settings.
                try {
                  (window as any).electronAPI?.openExternal?.('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
                } catch (_) {}
              }}
            >
              Open Settings
            </button>
          )}
        </div>
      )}
    </div>
  );
};
