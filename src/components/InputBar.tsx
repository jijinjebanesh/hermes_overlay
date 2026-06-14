import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Send, TerminalSquare, Slash, Wrench, File, X, Loader2, Plus, Image as ImageIcon, Camera, AudioLines, Square, ArrowUp } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import { AttachmentChip } from './AttachmentChip';

/**
 * INPUT BAR — 56px, 16px horizontal padding.
 *
 * [ADD] [TOOL STATUS] [INPUT ————————————————] [SEND]
 *
 * Features:
 * - Tab autocomplete for slash commands
 * - Ctrl+↑/↓ history recall
 * - Enter sends, Ctrl+Enter (Win) / Shift+Enter (Mac) for newline
 * - File attachment menu (+ button): Choose file or Screenshot
 * - Tool mode cycling (all → none → terminal)
 * - Send/stop button with streaming abort
 * - Escape: first press clears input, second press closes overlay
 */

const SLASH_COMMANDS = ['/new', '/clear', '/save', '/history', '/branch', '/undo'] as const;

const api = (window as any).electronAPI as any;

interface InputBarProps {
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export const InputBar: React.FC<InputBarProps> = ({ inputRef }) => {
  const {
    toolMode, cycleToolMode, streamState,
    addMessage, addToHistory, inputHistory,
    clearSession, newSession, undo, localMode,
    sessionId, setStreamState, updateLastMessage,
    pendingAttachments, addPendingAttachments, removePendingAttachment, clearPendingAttachments
  } = useOverlayStore();

  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [rejectTooltip, setRejectTooltip] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileAttached = pendingAttachments.length > 0;
  const [echoTooltip, setEchoTooltip] = useState<string | null>(null);

  // ── AUTOCOMPLETE STATE ──
  const [suggestions, setSuggestions] = useState<Array<{name: string, isDir: boolean, size: number}>>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [autocompletePrefix, setAutocompletePrefix] = useState('');
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [lastWord, setLastWord] = useState('');

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // ── ESCAPE key handler (global) ──
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAutocompleteOpen) {
          setIsAutocompleteOpen(false);
          return;
        }
        if (input.trim().length > 0) {
          // First press: clear input
          setInput('');
          setIsAutocompleteOpen(false);
          resetTextarea();
        } else {
          // Second press: close overlay
          api?.closeOverlay();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [input]);

  // Close attach menu on outside click
  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAttachMenu]);

  const resetTextarea = useCallback(() => {
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [inputRef]);


  /* ── KEYBOARD HANDLING ── */

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // ── Autocomplete Navigation ──
    if (isAutocompleteOpen && suggestions.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev > 0 ? prev - 1 : suggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const selected = suggestions[selectedSuggestionIndex];
        if (selected) {
          const newPath = autocompletePrefix + selected.name + (selected.isDir ? '/' : '');
          const newInput = input.slice(0, -lastWord.length) + newPath;
          setInput(newInput);
          setIsAutocompleteOpen(false);
          
          if (selected.isDir) {
            // Trigger fetch for the new directory automatically
            fetchSuggestions(newPath, '', newPath);
          }
        }
        return;
      }
    }

    // ── Tab completion for slash commands ──
    if (e.key === 'Tab') {
      e.preventDefault();
      if (input.startsWith('/')) {
        const match = SLASH_COMMANDS.find((c) => c.startsWith(input.trim()));
        if (match) setInput(match + ' ');
      }
      return;
    }

    // ── History recall: ↑ / ↓ ──
    if (e.key === 'ArrowUp') {
      if (input === '' || historyIndex !== -1) {
        e.preventDefault();
        if (inputHistory.length > 0) {
          const nextIdx = Math.min(historyIndex + 1, inputHistory.length - 1);
          setHistoryIndex(nextIdx);
          setInput(inputHistory[nextIdx]);
        }
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      if (historyIndex !== -1) {
        e.preventDefault();
        if (historyIndex > 0) {
          const nextIdx = historyIndex - 1;
          setHistoryIndex(nextIdx);
          setInput(inputHistory[nextIdx]);
        } else if (historyIndex === 0) {
          setHistoryIndex(-1);
          setInput('');
        }
        return;
      }
    }

    // ── Submit / Newline ──
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter = newline (let it happen naturally)
        return;
      }

      e.preventDefault();
      handleSubmit();
    }
  };


  /* ── INPUT CHANGE ── */

  const fetchSuggestions = async (dirPath: string, query: string, word: string) => {
    setAutocompletePrefix(dirPath);
    setAutocompleteQuery(query);
    setLastWord(word);
    
    try {
      if (api?.readDir) {
        const results = await api.readDir(dirPath);
        const filtered = results.filter((r: any) => r.name.toLowerCase().startsWith(query.toLowerCase()));
        setSuggestions(filtered);
        setSelectedSuggestionIndex(filtered.length > 0 ? 0 : -1);
        setIsAutocompleteOpen(filtered.length > 0);
      }
    } catch (e) {
      setIsAutocompleteOpen(false);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    setHistoryIndex(-1);

    // Path autocomplete detection
    const words = val.split(/\s+/);
    const word = words[words.length - 1];
    
    const isPath = /^(?:[a-zA-Z]:[/\\]|[/\\]|\.[/\\]|\.\.[/\\]|~[/\\])/.test(word);
    if (isPath) {
      const lastSlashIndex = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
      if (lastSlashIndex !== -1) {
        const dirPath = word.substring(0, lastSlashIndex + 1);
        const query = word.substring(lastSlashIndex + 1);
        fetchSuggestions(dirPath, query, word);
      } else {
        setIsAutocompleteOpen(false);
      }
    } else {
      setIsAutocompleteOpen(false);
    }

    // Auto-resize (up to 4 lines ≈ 96px)
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const sh = inputRef.current.scrollHeight;
      inputRef.current.style.height = Math.min(sh, 96) + 'px';
    }
  };


  /* ── SUBMIT ── */

  const handleSubmit = () => {
    if (!input.trim() && !fileAttached) return;

    if (streamState.isStreaming) {
      // Send input to the ongoing stream!
      const trimmed = input.trim();
      if (!trimmed) return;
      addToHistory(trimmed);
      
      // Add user message to UI so they see what they sent
      addMessage({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      });
      
      api?.sendInput(trimmed + '\n');
      setInput('');
      setHistoryIndex(-1);
      resetTextarea();
      return;
    }

    const trimmed = input.trim();
    addToHistory(trimmed);

    // ── Local File Opening ──
    const isExplicitOpen = trimmed.toLowerCase().startsWith('open ');
    const isRawAbsolutePath = /^(?:[a-zA-Z]:[/\\]|[/\\])/.test(trimmed);
    
    let targetPath = '';
    let shouldOpenLocally = false;

    if (isExplicitOpen) {
      const pathAfterOpen = trimmed.substring(5).trim();
      // Only intercept 'open ' if what follows actually looks like a file path
      const pathLooksLikeFile = /^(?:[a-zA-Z]:[/\\]|[/\\]|\.[/\\]|\.\.[/\\]|~[/\\])/.test(pathAfterOpen) || pathAfterOpen.includes('.mkv') || pathAfterOpen.includes('.mp4');
      if (pathLooksLikeFile) {
        targetPath = pathAfterOpen;
        shouldOpenLocally = true;
      }
    } else if (isRawAbsolutePath) {
      if (!trimmed.toLowerCase().includes('what') && !trimmed.toLowerCase().includes('why') && !trimmed.toLowerCase().includes('how') && !trimmed.endsWith('?')) {
        targetPath = trimmed;
        shouldOpenLocally = true;
      }
    }

    if (shouldOpenLocally) {
      // Remove any surrounding quotes
      if (targetPath.startsWith('"') && targetPath.endsWith('"')) targetPath = targetPath.slice(1, -1);
      if (targetPath.startsWith("'") && targetPath.endsWith("'")) targetPath = targetPath.slice(1, -1);
      
      addMessage({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      });
      addMessage({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'assistant',
        content: `Opening ${targetPath}...`,
        timestamp: Date.now(),
      });
      
      api?.openPath?.(targetPath);
      
      setInput('');
      clearPendingAttachments();
      resetTextarea();
      return;
    }

    // ── Slash commands ──
        if (trimmed === '/clear') {
          clearSession();
          clearPendingAttachments();
          setInput('');
          resetTextarea();
          return;
        }

        if (trimmed === '/new') {
          newSession();
          clearPendingAttachments();
          setInput('');
          resetTextarea();
          return;
        }

        if (trimmed.startsWith('/undo')) {
          const parts = trimmed.split(' ');
          const turns = parts.length > 1 ? parseInt(parts[1], 10) : 1;
          if (!isNaN(turns)) undo(turns);
          clearPendingAttachments();
          setInput('');
          resetTextarea();
          return;
        }

        if (trimmed === '/save') {
          // Build markdown from messages
          const messages = useOverlayStore.getState().messages;
          const markdown = [
            `# Session ${sessionId}`,
            `Saved at ${new Date().toISOString()}`,
            '',
            ...messages.map((m) =>
              `**${m.role === 'user' ? 'You' : 'Hermes'}:** ${m.content}`
            ),
          ].join('\\n\\n');
          api?.saveSession({ sessionId, markdown });
          clearPendingAttachments();
          setInput('');
          resetTextarea();
          return;
        }

    if (trimmed === '/history') {
      // Show input history inline
      const history = useOverlayStore.getState().inputHistory;
      addMessage({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'assistant',
        content: history.length > 0
          ? 'Recent commands:\n' + history.slice(0, 10).map((h, i) => `${i + 1}. ${h}`).join('\n')
          : 'No command history yet.',
        timestamp: Date.now(),
      });
      setInput('');
      resetTextarea();
      return;
    }

    if (trimmed === '/branch') {
      // Branch = new session but keep messages
      const currentMessages = [...useOverlayStore.getState().messages];
      newSession();
      currentMessages.forEach((m) => addMessage({ ...m, id: crypto.randomUUID?.() || Math.random().toString(36).substring(2) }));
      setInput('');
      resetTextarea();
      return;
    }

    // ── Local mode block ──
    if (localMode) {
      addMessage({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'user',
        content: trimmed,
                attachments: pendingAttachments.length > 0 ? [...pendingAttachments] : undefined,
                timestamp: Date.now(),
              });
              setInput('');
              clearPendingAttachments();
              resetTextarea();
              return;
            }

            // ── Build attachment context XML ──
            let attachmentContext = '';
            let attachmentPayload: typeof pendingAttachments = [];
    
            if (pendingAttachments.length > 0) {
              const filesWithContent = pendingAttachments.filter(f => f.content !== null && !f.tooBig);
              if (filesWithContent.length > 0) {
                attachmentContext = filesWithContent
                  .map(f => `<file name="${f.name}" path="${f.path}">\n${f.content}\n</file>`)
                  .join('\n\n') + '\n\n';
              }
              attachmentPayload = [...pendingAttachments];
            }

            const fullPayload = attachmentContext + trimmed;

            // ── Add user message to store ──
            addMessage({
              id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
              role: 'user',
              content: trimmed,
              attachments: attachmentPayload,
              timestamp: Date.now(),
            });

            // ── Create empty assistant message for streaming ──
            addMessage({
              id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
            });

            // ── Start stream state ──
            setStreamState({
              isStreaming: true,
              tokens: 0,
              duration: 0,
              mode: toolMode,
            });

            // ── Send via IPC ──
            const state = useOverlayStore.getState();
            api?.sendMessage({
              text: fullPayload,
              sessionId,
              toolMode,
              provider: state.activeProvider,
              model: state.activeModel,
    });

    setInput('');
        clearPendingAttachments();
        setHistoryIndex(-1);
        resetTextarea();
      };


      /* ── STREAM CANCEL ── */

      const handleStop = () => {
        api?.abortStream();
        setStreamState({ isStreaming: false });
        updateLastMessage((msg) => ({
          ...msg,
          isStreaming: false,
          cancelled: true,
        }));
      };


      const showReject = (msg: string) => {
        setRejectTooltip(msg);
        if (rejectTimer.current) clearTimeout(rejectTimer.current);
        rejectTimer.current = setTimeout(() => setRejectTooltip(null), 2000);
      };

      /* ── ATTACHMENTS ── */

            const handleAttachFile = async () => {
              setShowAttachMenu(false);
              try {
                const result = await api?.openFileDialog();
                if (result) {
                  const fileResult = await api?.readDroppedFile(result.path);
                  if (fileResult) {
                    addPendingAttachments([{
                      ...fileResult,
                      id: crypto.randomUUID?.() || Math.random().toString(36).substring(2)
                    }]);
                  }
                }
              } catch (e) {
                showReject('Failed to open file picker');
              }
            };

            const handleScreenshot = async () => {
              setShowAttachMenu(false);
              try {
                const result = await api?.captureScreenshot();
                if (result) {
                  const fileResult = await api?.readDroppedFile(result.path);
                  if (fileResult) {
                    addPendingAttachments([{
                      ...fileResult,
                      id: crypto.randomUUID?.() || Math.random().toString(36).substring(2)
                    }]);
                  }
                } else {
                  showReject('Failed to capture screen');
                }
              } catch (e) {
                showReject('Screenshot error');
              }
            };

            /* ── ECHO MODE ── */

            const handleEchoMode = () => {
              // Show tooltip
              setEchoTooltip('Starting Echo Mode...');
              setTimeout(() => setEchoTooltip(null), 2000);
        
              // Trigger Echo Mode via IPC
              try {
                api?.triggerEchoMode?.();
              } catch (e) {
                console.error('Failed to trigger Echo Mode:', e);
                setEchoTooltip('Echo Mode not available');
                setTimeout(() => setEchoTooltip(null), 2000);
              }
            };


  /* ── TOOL ICON ── */

  const renderToolIcon = () => {
    switch (toolMode) {
      case 'all': return <Wrench size={16} />;
      case 'terminal': return <TerminalSquare size={16} />;
      case 'none': return <Slash size={16} />;
    }
  };

  const toolTitle = toolMode === 'all'
    ? 'Tool Mode: All Tools'
    : toolMode === 'terminal'
      ? 'Tool Mode: Terminal Only'
      : 'Tool Mode: No Tools';

  const hasContent = input.trim().length > 0 || pendingAttachments.length > 0;

    return (
      <div className="input-bar">
        {/* Rejection tooltip */}
        {rejectTooltip && (
          <div className="drag-tooltip">{rejectTooltip}</div>
        )}

        {/* Attach Menu toggle */}
        <div className="attach-container" ref={attachMenuRef}>
        <button
          className={`attach-toggle-btn${showAttachMenu ? ' active' : ''}`}
          onClick={() => setShowAttachMenu(!showAttachMenu)}
          title="Attach file or screenshot"
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
        
        {showAttachMenu && (
          <div className="attach-menu">
            <button className="attach-menu-item" onClick={handleAttachFile}>
              <ImageIcon size={14} className="attach-menu-icon" />
              <span>Choose File</span>
            </button>
            <button className="attach-menu-item" onClick={handleScreenshot}>
              <Camera size={14} className="attach-menu-icon" />
              <span>Screenshot</span>
            </button>
          </div>
        )}
      </div>

      {/* Tool toggle */}
      <button
        className="tool-toggle-btn"
        onClick={cycleToolMode}
        title={toolTitle}
        aria-label={toolTitle}
      >
        {renderToolIcon()}
      </button>

      {/* Input Column (Attachments + Textarea) */}
      <div className="input-content-col">
        {/* Attachment Tray (Inline) */}
        {pendingAttachments.length > 0 && (
          <div className="attachment-tray">
            {pendingAttachments.map((file) => (
              <AttachmentChip
                key={file.id}
                file={file}
                variant="pending"
                onRemove={() => removePendingAttachment(file.id)}
              />
            ))}
          </div>
        )}

        <div style={{ position: 'relative', width: '100%' }}>
          {isAutocompleteOpen && suggestions.length > 0 && (
            <div className="autocomplete-menu">
              {suggestions.map((sug, idx) => (
                <div
                  key={sug.name}
                  className={`autocomplete-item ${idx === selectedSuggestionIndex ? 'selected' : ''}`}
                  onClick={() => {
                    const newPath = autocompletePrefix + sug.name + (sug.isDir ? '/' : '');
                    const newInput = input.slice(0, -lastWord.length) + newPath;
                    setInput(newInput);
                    setIsAutocompleteOpen(false);
                    if (sug.isDir) fetchSuggestions(newPath, '', newPath);
                    inputRef.current?.focus();
                  }}
                >
                  <span className="autocomplete-name">{sug.name}{sug.isDir ? '/' : ''}</span>
                  <span className="autocomplete-meta">
                    {sug.isDir ? 'dir' : (sug.size > 1024 * 1024 ? (sug.size / (1024 * 1024)).toFixed(1) + 'M' : (sug.size > 1024 ? Math.round(sug.size / 1024) + 'K' : sug.size + 'B'))}
                  </span>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask Hermes"
            className="input-textarea"
            rows={1}
          />
        </div>
      </div>

      {/* Send / Stop button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Echo Mode Button */}
              <button
                className="echo-mode-btn"
                onClick={handleEchoMode}
                title="Start Echo Mode (Voice Interaction)"
                aria-label="Start Echo Mode"
                onMouseEnter={() => setEchoTooltip('Start Echo Mode')}
                onMouseLeave={() => setEchoTooltip(null)}
              >
                <AudioLines size={16} strokeWidth={2} />
              </button>
        
              {streamState.isStreaming && (
                <button
                  className="send-btn streaming"
                  onClick={handleStop}
                  aria-label="Stop streaming"
                  style={{ marginRight: 0 }}
                >
                  <Square size={14} fill="var(--text-secondary)" color="var(--text-secondary)" />
                </button>
              )}
              <button
                className={`send-btn ${hasContent ? 'ready' : 'idle'}`}
                onClick={handleSubmit}
                disabled={!hasContent}
                aria-label="Send message"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* Echo Mode tooltip */}
            {echoTooltip && (
              <div className="echo-tooltip" style={{
                position: 'absolute',
                bottom: '70px',
                right: '60px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                pointerEvents: 'none',
                zIndex: 1000
              }}>
                {echoTooltip}
              </div>
            )}
          </div>
        );
      };
