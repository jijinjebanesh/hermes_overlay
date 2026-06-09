import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Wrench, TerminalSquare, Slash, ArrowUp, Square, X, Plus, Image as ImageIcon, Camera } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';

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
  } = useOverlayStore();

  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileAttached, setFileAttached] = useState<{path: string; name: string} | null>(null);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [rejectTooltip, setRejectTooltip] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // ── ESCAPE key handler (global) ──
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (input.trim().length > 0) {
          // First press: clear input
          setInput('');
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
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isNewline = isMac ? e.shiftKey : e.ctrlKey;

      if (!isNewline) {
        e.preventDefault();
        handleSubmit();
      }
    }
  };


  /* ── INPUT CHANGE ── */

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    setHistoryIndex(-1);

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

    // ── Slash commands ──
    if (trimmed === '/clear') {
      clearSession();
      setInput('');
      setFileAttached(null);
      resetTextarea();
      return;
    }

    if (trimmed === '/new') {
      newSession();
      setInput('');
      setFileAttached(null);
      resetTextarea();
      return;
    }

    if (trimmed.startsWith('/undo')) {
      const parts = trimmed.split(' ');
      const turns = parts.length > 1 ? parseInt(parts[1], 10) : 1;
      if (!isNaN(turns)) undo(turns);
      setInput('');
      setFileAttached(null);
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
      ].join('\n\n');
      api?.saveSession({ sessionId, markdown });
      setInput('');
      setFileAttached(null);
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
        timestamp: Date.now(),
      });
      addMessage({
        id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
        role: 'assistant',
        content: 'Local mode — remote calls blocked.',
        timestamp: Date.now(),
      });
      setInput('');
      setFileAttached(null);
      resetTextarea();
      return;
    }

    // ── Add user message to store ──
    addMessage({
      id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
      role: 'user',
      content: trimmed + (fileAttached ? `\n[Attached: ${fileAttached.name}]` : ''),
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
      text: trimmed,
      file: fileAttached?.path,
      sessionId,
      toolMode,
      provider: state.activeProvider,
      model: state.activeModel,
    });

    setInput('');
    setFileAttached(null);
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


  /* ── DRAG & DROP ── */

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const isPdfOrImage = file.type === 'application/pdf' || file.type.startsWith('image/');
    if (isPdfOrImage) {
      setFileAttached({ path: (file as any).path, name: file.name });
    } else {
      showReject(`Unsupported: ${file.name.split('.').pop() || 'file'}`);
    }
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
      if (result) setFileAttached(result);
    } catch (e) {
      showReject('Failed to open file picker');
    }
  };

  const handleScreenshot = async () => {
    setShowAttachMenu(false);
    try {
      const result = await api?.captureScreenshot();
      if (result) {
        setFileAttached(result);
      } else {
        showReject('Failed to capture screen');
      }
    } catch (e) {
      showReject('Screenshot error');
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

  const hasContent = input.trim().length > 0 || fileAttached !== null;

  return (
    <div
      className={`input-bar${isDragging ? ' dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* File chip */}
      {fileAttached && (
        <div className="file-chip">
          <span className="file-chip-name">{fileAttached.name}</span>
          <button className="file-chip-close" onClick={() => setFileAttached(null)}>
            <X size={12} />
          </button>
        </div>
      )}

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

      {/* Input */}
      <textarea
        ref={inputRef}
        value={input}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Ask Hermes"
        className="input-textarea"
        rows={1}
      />

      {/* Send / Stop button */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
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
    </div>
  );
};
