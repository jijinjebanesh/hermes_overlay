import React, { useEffect, useState, useRef, useCallback } from 'react';
import { EchoEngine, EchoState } from '../audio/EchoEngine';
import { EchoOrb } from './EchoOrb';
import { Mic, MicOff, Volume2, Square, ChevronUp, MessageSquareText, ArrowUp, X } from 'lucide-react';
import { useEchoSession } from '../hooks/useEchoSession';
import { useEchoKeyboard } from '../hooks/useEchoKeyboard';
import type { EchoSessionTurn } from '../hooks/useEchoSession';

interface EchoModeProps {
  onExit: (sessionTranscript?: EchoSessionTurn[]) => void;
}

/**
 * Apple-style live transcript display mode:
 * - "Apple Intelligence" style: agent words reveal in sync with TTS audio,
 *   using onTtsChunkStart to snap highlighting to the chunk being spoken.
 * - Bubble sits BELOW the orb, above controls — not floating way up top.
 * - Smooth vertical auto-scroll when text overflows — no horizontal jank.
 * - Listening: user transcript with dimmed interim text, single-line.
 * - Thinking/Processing: finalized transcript with soft animation.
 * - Responsive: max-height adapts to window/compact mode, font scales naturally.
 */
export const EchoMode: React.FC<EchoModeProps> = ({ onExit }) => {
  const [state, setState] = useState<EchoState>('initializing');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [agentText, setAgentText] = useState('');
  const [amplitude, setAmplitude] = useState(0);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [orbVisible, setOrbVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [ariaAnnouncement, setAriaAnnouncement] = useState('');
  const [showVolumePopover, setShowVolumePopover] = useState(false);
  const [volume, setVolume] = useState(80);
  const [latencyWarning, setLatencyWarning] = useState<string | null>(null);
  const [osMicMuted, setOsMicMuted] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');

  // Word reveal synced to TTS chunks — onTtsChunkStart snaps these forward
  const [revealedWords, setRevealedWords] = useState(0);
  const wordRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentTextRef = useRef(agentText);
  // When a TTS chunk starts, we fast-forward revealedWords to the end of that chunk
  const ttsChunkEndWordIdxRef = useRef(0);

  const engineRef = useRef<EchoEngine | null>(null);
  const prevStateRef = useRef<EchoState>('initializing');
  const muteBtnRef = useRef<HTMLButtonElement>(null);
  const volumePopoverRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const wasMutedBeforeTextRef = useRef(false);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const latencyTimerRef = useRef<{ t5: ReturnType<typeof setTimeout> | null; t15: ReturnType<typeof setTimeout> | null }>({ t5: null, t15: null });

  const { sessionDuration, getTranscript, addManualUserTurn } = useEchoSession(state, transcript, agentText);

  // ── Compact mode detection ──
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

  // ── Orb entrance animation ──
  useEffect(() => {
    const t = setTimeout(() => setOrbVisible(true), 100);
    return () => clearTimeout(t);
  }, []);

  // ── Auto-focus mute button after init ──
  useEffect(() => {
    if (state !== 'initializing' && muteBtnRef.current) {
      const t = setTimeout(() => muteBtnRef.current?.focus(), 600);
      return () => clearTimeout(t);
    }
  }, [state === 'initializing']);

  // ── ARIA announcements on state change ──
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

  // ── Latency warning timers ──
  useEffect(() => {
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

  // ── OS-level mic mute detection ──
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
  }, [state]);

  // ── Keep agentTextRef in sync ──
  useEffect(() => {
    agentTextRef.current = agentText;
  }, [agentText]);

  // ── Word reveal synced with TTS chunks ──
  // When a TTS chunk starts playing, jump revealedWords to include that entire chunk.
  // Then continue revealing remaining words at ~130ms/word for smooth trailing effect.
  useEffect(() => {
    if (state !== 'speaking') {
      if (wordRevealTimerRef.current) {
        clearTimeout(wordRevealTimerRef.current);
        wordRevealTimerRef.current = null;
      }
      setRevealedWords(0);
      ttsChunkEndWordIdxRef.current = 0;
      return;
    }

    const words = agentText.split(/\s+/).filter(w => w.length > 0);
    
    const advanceReveal = () => {
      setRevealedWords(prev => {
        // Don't exceed what's been revealed by TTS chunks plus trailing allowance
        const target = Math.min(
          words.length,
          ttsChunkEndWordIdxRef.current + 5  // allow 5-word trailing fade behind current audio
        );
        const next = prev + 1;
        if (next < target) {
          wordRevealTimerRef.current = setTimeout(advanceReveal, 130);
        } else {
          wordRevealTimerRef.current = null;
        }
        return next;
      });
    };

    // If a TTS chunk jumped ahead of us, fast-forward immediately then continue
    if (revealedWords < ttsChunkEndWordIdxRef.current && !wordRevealTimerRef.current) {
      // Jump to the chunk boundary minus 2 words (for smooth entry)
      const jumpTo = Math.max(revealedWords, ttsChunkEndWordIdxRef.current - 2);
      if (jumpTo > revealedWords) {
        setRevealedWords(jumpTo);
      }
      if (jumpTo < words.length) {
        wordRevealTimerRef.current = setTimeout(advanceReveal, 130);
      }
    } else if (revealedWords === 0 && words.length > 0 && !wordRevealTimerRef.current) {
      wordRevealTimerRef.current = setTimeout(advanceReveal, 130);
    }

    return () => {
      if (wordRevealTimerRef.current) {
        clearTimeout(wordRevealTimerRef.current);
        wordRevealTimerRef.current = null;
      }
    };
  }, [state, agentText]);

  // ── Auto-scroll transcript container when new text arrives ──
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcript, interimTranscript, agentText, revealedWords]);

  // ── Click-outside for volume popover ──
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

  // ── Helpers ──

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleExit = useCallback(() => {
    if (wordRevealTimerRef.current) {
      clearTimeout(wordRevealTimerRef.current);
      wordRevealTimerRef.current = null;
    }
    engineRef.current?.destroy();
    const transcriptTurns = getTranscript();
    onExit(transcriptTurns.length > 0 ? transcriptTurns : undefined);
  }, [onExit, getTranscript]);

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

  const openTextInput = useCallback(() => {
    wasMutedBeforeTextRef.current = isMuted;
    if (!isMuted && engineRef.current?.micStream) {
      engineRef.current.micStream.getAudioTracks().forEach(t => { t.enabled = false; });
      setIsMuted(true);
    }
    setShowTextInput(true);
    setTextInputValue('');
    setShowVolumePopover(false);
    setTimeout(() => textInputRef.current?.focus(), 80);
  }, [isMuted]);

  const closeTextInput = useCallback(() => {
    setShowTextInput(false);
    setTextInputValue('');
    if (!wasMutedBeforeTextRef.current && engineRef.current?.micStream) {
      engineRef.current?.micStream.getAudioTracks().forEach(t => { t.enabled = true; });
      setIsMuted(false);
    }
  }, []);

  const submitTextInput = useCallback(() => {
    const text = textInputValue.trim();
    if (!text || !engineRef.current) return;

    addManualUserTurn(text);

    setShowTextInput(false);
    setTextInputValue('');

    if (!wasMutedBeforeTextRef.current && engineRef.current?.micStream) {
      engineRef.current?.micStream.getAudioTracks().forEach(t => { t.enabled = true; });
      setIsMuted(false);
    }

    engineRef.current.sendTextMessage(text);
  }, [textInputValue, addManualUserTurn]);

  // ── onTtsChunkStart: TTS just started speaking this text — sync word reveal ──
  const handleTtsChunkStart = useCallback((chunkText: string) => {
    // Count how many words in agentText precede this chunk
    const words = agentTextRef.current.split(/\s+/).filter(w => w.length > 0);
    // Find where in the full agent text this chunk appears
    const cleanChunk = chunkText.trim();
    const chunkWords = cleanChunk.split(/\s+/).filter(w => w.length > 0);
    if (chunkWords.length === 0) return;

    // Accumulate all words up to and including this chunk
    let cumulativeWords = 0;
    let searchText = '';
    for (const word of words) {
      searchText += (searchText ? ' ' : '') + word;
      cumulativeWords++;
      if (searchText.includes(cleanChunk) && cleanChunk.includes(word)) {
        // We've found the approximate end of this chunk
        break;
      }
    }
    ttsChunkEndWordIdxRef.current = cumulativeWords;

    // Fast-forward revealedWords to match
    const jumpTo = Math.max(0, cumulativeWords - 2);
    setRevealedWords(prev => Math.max(prev, jumpTo));
  }, []);

  // ── Initialize engine ──
  useEffect(() => {
    const engine = new EchoEngine({
      onStateChange: setState,
      onTranscriptUpdate: (text) => {
        setTranscript(text);
        setInterimTranscript('');
      },
      onInterimTranscriptUpdate: setInterimTranscript,
      onAgentTextUpdate: setAgentText,
      onAmplitudeUpdate: setAmplitude,
      onTtsChunkStart: handleTtsChunkStart,
      onExit: handleExit,
    });

    engineRef.current = engine;
    engine.start();

    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, [handleExit, handleTtsChunkStart]);

  // ── Keyboard bindings ──
  useEchoKeyboard({
    onEscape: () => showTextInput ? closeTextInput() : handleExit(),
    onToggleMute: toggleMute,
    onToggleTextInput: () => showTextInput ? closeTextInput() : openTextInput(),
    showTextInput,
  });

  // ── Push-to-Talk (Ctrl+Space walkie-talkie) ──
  const pushToTalkActiveRef = useRef(false);

  useEffect(() => {
    const handler = () => {
      if (!engineRef.current) return;
      if (pushToTalkActiveRef.current) {
        // Second press = release → stop recording and send
        pushToTalkActiveRef.current = false;
        engineRef.current.stopPushToTalkAndSend();
      } else {
        // First press = start recording
        pushToTalkActiveRef.current = true;
        engineRef.current.startPushToTalk();
      }
    };
    window.addEventListener('push-to-talk-toggle', handler);
    return () => window.removeEventListener('push-to-talk-toggle', handler);
  }, []);

  // ── Display logic ──

  const showAgentCaption = state === 'speaking' && agentText;
  const showUserTranscript = !showAgentCaption && (
    state === 'listening' || state === 'processing' || state === 'thinking'
  ) && (transcript || interimTranscript);

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
  const agentWords = agentText ? agentText.split(/\s+/) : [];

  // ── Render ──

  return (
    <div className="echo-mode-container" data-state={state} data-compact={isCompactMode}>
      {/* Screen-reader announcements */}
      <div
        role="status"
        aria-live="polite"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}
      >
        {ariaAnnouncement}
      </div>

      {/* Exit button */}
      <button
        className="echo-exit-btn"
        style={{ opacity: isInitializing ? 0 : 1, transition: 'opacity 0.4s ease' }}
        onClick={handleExit}
        aria-label="End Echo Mode"
      >
        <span className="echo-exit-icon">✕</span>
        {!isCompactMode && <span className="echo-exit-text">End</span>}
      </button>

      {/* Session timer */}
      {!isInitializing && (
        <div className="echo-timer" style={{ opacity: isInitializing ? 0 : 1 }}>
          {formatDuration(sessionDuration)}
        </div>
      )}

      {/* ── Orb stage — always dead center ── */}
      <div className="echo-orb-stage" data-compact={isCompactMode}>
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

        <div className="echo-state-wrapper" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center',
          opacity: hasTranscriptContent ? 0 : 1,
          transition: 'opacity 0.4s ease',
          pointerEvents: hasTranscriptContent ? 'none' : 'auto'
        }}>
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

      {/* ── TTS Flow — materializing words below the orb ── */}
      {showAgentCaption && (
        <div className="echo-tts-flow">
          <div className="echo-tts-scroll" ref={transcriptScrollRef}>
            <div className="echo-tts-flow-inner">
              {agentWords.map((word, i) => {
                const isRevealed = i < revealedWords;
                const distanceFromFront = revealedWords - i;
                const isActive = isRevealed && distanceFromFront <= 2;
                const opacity = !isRevealed ? 0
                  : distanceFromFront <= 2 ? 0.95
                  : distanceFromFront <= 6 ? 0.55
                  : 0.2;
                return (
                  <span
                    key={i}
                    className={`echo-tts-word${isRevealed ? ' revealed' : ''}${isActive ? ' active' : ''}`}
                    style={{ opacity }}
                  >
                    {word}{i < agentWords.length - 1 ? ' ' : ''}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── STT Subtitle — cinematic floating text above controls ── */}
      {showUserTranscript && (
        <div
          className="echo-stt-subtitle"
          data-input-open={showTextInput}
          role="log"
          aria-live="polite"
        >
          <div className="echo-stt-subtitle-inner">
            {state === 'listening' && !isMuted && (
              <span className="stt-listening-dot" />
            )}
            {state === 'listening' ? (
              <>
                {transcript && <span>{transcript} </span>}
                {interimTranscript && <span className="stt-interim">{interimTranscript}</span>}
                {!transcript && !interimTranscript && (
                  <span className="stt-interim" style={{ opacity: 0.35 }}>Listening…</span>
                )}
              </>
            ) : (
              <span>{transcript}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Controls ── */}
      {!isInitializing && (
        <div className="echo-controls">
          {/* Mute */}
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

          {/* Type to Echo */}
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

          {/* End */}
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

      {/* ── Type-to-Echo text input ── */}
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

      {/* ── OS mic mute warning ── */}
      {osMicMuted && !isMuted && (
        <div className="echo-latency-warning">
          Microphone is muted at system level. Unmute in menu bar or System Preferences.
        </div>
      )}

      {/* ── Error state ── */}
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
                try {
                  (window.electronAPI as any)?.openExternal?.('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
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