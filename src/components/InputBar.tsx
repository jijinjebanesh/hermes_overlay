import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Square, ArrowUp, AudioLines, Zap, CornerDownLeft } from 'lucide-react';
import { useOverlayStore, generateId } from '../store/overlayStore';
import { getElectronAPI } from '../hooks/useElectronAPI';
import { AttachmentBar } from './input/AttachmentBar';
import { AutocompleteMenu } from './input/AutocompleteMenu';
import { AttachMenu } from './input/AttachMenu';

const api = getElectronAPI();
const SLASH_COMMANDS = ['/new', '/clear', '/save', '/history', '/branch', '/undo'] as const;

interface InputBarProps {
  inputRef: React.RefObject<HTMLTextAreaElement>;
}

export const InputBar: React.FC<InputBarProps> = ({ inputRef }) => {
  const {
    toolMode, streamState,
    addMessage, addToHistory, inputHistory,
    clearSession, newSession, localMode,
    sessionId, setStreamState, updateLastMessage,
    pendingAttachments, addPendingAttachments, removePendingAttachment, clearPendingAttachments
  } = useOverlayStore();

  const [input, setInput] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [rejectTooltip, setRejectTooltip] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const fileAttached = pendingAttachments.length > 0;
  const [echoTooltip, setEchoTooltip] = useState<string | null>(null);

  // ── AUTOCOMPLETE STATE ──
  const [suggestions, setSuggestions] = useState<Array<{name: string; isDir: boolean; size: number; isCommand?: boolean}>>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [autocompletePrefix, setAutocompletePrefix] = useState('');
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [lastWord, setLastWord] = useState('');
  const [autocompleteType, setAutocompleteType] = useState<'file' | 'command'>('file');

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // Listen for external "edit message" requests from Conversation
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      setInput(detail);
      setHistoryIndex(-1);
      setTimeout(() => {
        inputRef.current?.focus();
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
          const sh = inputRef.current.scrollHeight;
          inputRef.current.style.height = Math.min(sh, 200) + 'px';
        }
      }, 50);
    };
    window.addEventListener('hermes-edit-message', handler);
    return () => window.removeEventListener('hermes-edit-message', handler);
  }, [inputRef]);

  // Global Escape handler
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAutocompleteOpen) {
          setIsAutocompleteOpen(false);
          return;
        }
        if (input.trim().length > 0) {
          setInput('');
          setIsAutocompleteOpen(false);
          resetTextarea();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [input, isAutocompleteOpen]);

  const resetTextarea = useCallback(() => {
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [inputRef]);

  // ── AUTOCOMPLETE LOGIC ──
  const fetchFileSuggestions = async (dirPath: string, query: string, word: string) => {
    setAutocompletePrefix(dirPath);
    setAutocompleteQuery(query);
    setLastWord(word);
    setAutocompleteType('file');

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

  const fetchCommandSuggestions = useCallback((query: string) => {
    const prefix = query.startsWith('/') ? query : '/' + query;
    const filtered = SLASH_COMMANDS.filter(cmd => cmd.startsWith(prefix));
    if (filtered.length > 0) {
      setSuggestions(filtered.map(cmd => ({ name: cmd, isDir: false, size: 0, isCommand: true })));
      setAutocompleteType('command');
      setSelectedSuggestionIndex(0);
      setIsAutocompleteOpen(true);
      setAutocompletePrefix('');
      setAutocompleteQuery(query);
      setLastWord(query);
    } else {
      setIsAutocompleteOpen(false);
    }
  }, []);

  const handleSelectSuggestion = (index: number) => {
    const selected = suggestions[index];
    if (!selected) return;

    if (autocompleteType === 'command') {
      setInput(selected.name + ' ');
      setIsAutocompleteOpen(false);
    } else {
      const newPath = autocompletePrefix + selected.name + (selected.isDir ? '/' : '');
      const newInput = input.slice(0, -lastWord.length) + newPath;
      setInput(newInput);
      setIsAutocompleteOpen(false);
      if (selected.isDir) fetchFileSuggestions(newPath, '', newPath);
    }
    inputRef.current?.focus();
  };

  // ── INPUT HANDLER ──
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    setHistoryIndex(-1);

    // Check for slash command autocomplete
    if (val.startsWith('/')) {
      fetchCommandSuggestions(val);
      return;
    }

    // Check for path autocomplete
    const words = val.split(/\s+/);
    const word = words[words.length - 1];
    const isPath = /^(?:[a-zA-Z]:[/\\]|[/]|\.[/\\]|\.\.[/\\]|~[/\\])/.test(word);
    if (isPath) {
      const lastSlashIndex = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
      if (lastSlashIndex !== -1) {
        const dirPath = word.substring(0, lastSlashIndex + 1);
        const query = word.substring(lastSlashIndex + 1);
        fetchFileSuggestions(dirPath, query, word);
      } else {
        setIsAutocompleteOpen(false);
      }
    } else {
      setIsAutocompleteOpen(false);
    }

    // Auto-resize
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const sh = inputRef.current.scrollHeight;
      inputRef.current.style.height = Math.min(sh, 200) + 'px';
    }
  };

  // ── KEYBOARD HANDLER ──
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete navigation
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
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        handleSelectSuggestion(selectedSuggestionIndex);
        return;
      }
    }

    // Tab for slash command completion
    if (e.key === 'Tab') {
      e.preventDefault();
      if (input.startsWith('/')) {
        const match = SLASH_COMMANDS.find((c) => c.startsWith(input.trim()));
        if (match) setInput(match + ' ');
      }
      return;
    }

    // History navigation (only when not in autocomplete)
    if (e.key === 'ArrowUp' && !isAutocompleteOpen) {
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

    if (e.key === 'ArrowDown' && !isAutocompleteOpen) {
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

    // Enter key behavior:
    // - Enter alone: send
    // - Shift+Enter: newline (multiline)
    // - Ctrl+Enter: newline (multiline) - NOT background send
    // - Ctrl+Shift+Enter: background send
    if (e.key === 'Enter') {
      if (e.ctrlKey && e.shiftKey) {
        // Ctrl+Shift+Enter → background send
        e.preventDefault();
        handleBackgroundSend();
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter or Cmd+Enter → insert newline
        e.preventDefault();
        insertNewline();
        return;
      }
      if (e.shiftKey) {
        // Shift+Enter → insert newline (allow default behavior)
        return; // let the default newline insertion happen
      }
      // Enter alone → send
      e.preventDefault();
      handleSubmit();
    }
  };

  const insertNewline = () => {
    if (!inputRef.current) return;
    const el = inputRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const newValue = input.substring(0, start) + '\n' + input.substring(end);
    setInput(newValue);
    // Restore cursor position after newline
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + 1;
      // Trigger auto-resize
      el.style.height = 'auto';
      const sh = el.scrollHeight;
      el.style.height = Math.min(sh, 200) + 'px';
    }, 0);
  };

  // ── PASTE HANDLER ──
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData?.getData('text');
    if (pastedText && pastedText.length > 2000) {
      e.preventDefault();
      addPendingAttachments([{
        name: `paste_${Date.now()}.txt`,
        path: `clipboard://${generateId()}`,
        content: pastedText,
        tooBig: pastedText.length > 100_000,
        size: pastedText.length,
        ext: 'txt',
        isImage: false,
        id: generateId(),
      }]);
      return;
    }

    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            addPendingAttachments([{
              name: file.name || 'Pasted Image.png',
              path: `clipboard://${generateId()}`,
              content: base64,
              tooBig: false,
              size: file.size,
              ext: file.type.split('/')[1] || 'png',
              isImage: true,
              id: generateId(),
            }]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // ── SUBMIT HANDLER ──
  const handleSubmit = () => {
    if (!input.trim() && !fileAttached) return;

    if (streamState.isStreaming) {
      const trimmed = input.trim();
      if (!trimmed) return;
      addToHistory(trimmed);
      addMessage({
        id: generateId(),
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

    const isExplicitOpen = trimmed.toLowerCase().startsWith('open ');
    const isRawAbsolutePath = /^(?:[a-zA-Z]:[/\\]|[/])/.test(trimmed);

    let targetPath = '';
    let shouldOpenLocally = false;

    if (isExplicitOpen) {
      const pathAfterOpen = trimmed.substring(5).trim();
      const pathLooksLikeFile = /^(?:[a-zA-Z]:[/\\]|[/]|\.[/\\]|\.\.[/\\]|~[/\\])/.test(pathAfterOpen) || pathAfterOpen.includes('.mkv') || pathAfterOpen.includes('.mp4');
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
      if (targetPath.startsWith('"') && targetPath.endsWith('"')) targetPath = targetPath.slice(1, -1);
      if (targetPath.startsWith("'") && targetPath.endsWith("'")) targetPath = targetPath.slice(1, -1);

      addMessage({
        id: generateId(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      });
      addMessage({
        id: generateId(),
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
      const turnsToUndo = isNaN(turns) ? 1 : turns;
      addMessage({
        id: generateId(),
        role: 'assistant',
        content: `Undo requested (${turnsToUndo} turn${turnsToUndo > 1 ? 's' : ''}) — use the UI to undo messages.`,
        timestamp: Date.now(),
      });
      clearPendingAttachments();
      setInput('');
      resetTextarea();
      return;
    }

    if (trimmed === '/save') {
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
      clearPendingAttachments();
      setInput('');
      resetTextarea();
      return;
    }

    if (trimmed === '/history') {
      const history = useOverlayStore.getState().inputHistory;
      addMessage({
        id: generateId(),
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
      const currentMessages = [...useOverlayStore.getState().messages];
      newSession();
      currentMessages.forEach((m) => addMessage({ ...m, id: generateId() }));
      setInput('');
      resetTextarea();
      return;
    }

    if (localMode) {
      addMessage({
        id: generateId(),
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

    let attachmentContext = '';
    let attachmentPayload: typeof pendingAttachments = [];
    let passthroughFilePath: string | undefined;

    const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf'];

    if (pendingAttachments.length > 0) {
      const firstPassthrough = pendingAttachments.find(
        f => f.isImage || docExts.includes(f.ext)
      );
      if (firstPassthrough) passthroughFilePath = firstPassthrough.path;

      const filesWithContent = pendingAttachments.filter(
        f => f.content !== null && !f.tooBig && !f.isImage && !docExts.includes(f.ext)
      );
      if (filesWithContent.length > 0) {
        attachmentContext = filesWithContent
          .map(f => `<file name="${f.name}" path="${f.path}">\n${f.content}\n</file>`)
          .join('\n\n') + '\n\n';
      }
      const binaryFiles = pendingAttachments.filter(
        f => f.isImage || docExts.includes(f.ext)
      );
      if (binaryFiles.length > 0) {
        const tags = binaryFiles
          .map(f => `<file name="${f.name}" path="${f.path}" type="${f.isImage ? 'image' : 'document'}">[Attached — path: ${f.path}]\n</file>`)
          .join('\n\n') + '\n\n';
        attachmentContext += tags;
      }
      attachmentPayload = [...pendingAttachments];
    }

    const fullPayload = attachmentContext + trimmed;

    addMessage({
      id: generateId(),
      role: 'user',
      content: trimmed,
      attachments: attachmentPayload,
      timestamp: Date.now(),
    });

    addMessage({
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });

    setStreamState({
      isStreaming: true,
      tokens: 0,
      duration: 0,
      mode: 'thinking',
    });

    const state = useOverlayStore.getState();
    api?.sendMessage({
      text: fullPayload,
      file: passthroughFilePath,
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

  // ── STOP HANDLER ──
  const handleStop = () => {
    api?.abortStream();
    setStreamState({ isStreaming: false });
    updateLastMessage((msg) => ({
      ...msg,
      isStreaming: false,
      cancelled: true,
    }));
  };

  // ── BACKGROUND SEND HANDLER ──
  const handleBackgroundSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    addMessage({
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    });

    addMessage({
      id: generateId(),
      role: 'assistant',
      content: '⏳ Running in background... You\'ll get a notification when it\'s done.',
      timestamp: Date.now(),
    });

    const state = useOverlayStore.getState();
    api?.dispatchBackground?.({
      text: trimmed,
      sessionId: undefined,
      provider: state.activeProvider,
      model: state.activeModel,
    });

    setInput('');
    clearPendingAttachments();
    resetTextarea();
  };

  // ── TOOLTIP HANDLER ──
  const showReject = (msg: string) => {
    setRejectTooltip(msg);
    if (rejectTimer.current) clearTimeout(rejectTimer.current);
    rejectTimer.current = setTimeout(() => setRejectTooltip(null), 2000);
  };

  // ── ATTACH HANDLERS ──
  const handleAttachFile = async () => {
    setShowAttachMenu(false);
    try {
      const result = await api?.openFileDialog();
      if (result) {
        const fileResult = await api?.readDroppedFile(result.path);
        if (fileResult) {
          addPendingAttachments([{
            ...fileResult,
            ext: fileResult.ext || '',
            isImage: fileResult.isImage || false,
            id: generateId()
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
            ext: fileResult.ext || '',
            isImage: fileResult.isImage || false,
            id: generateId()
          }]);
        }
      } else {
        showReject('Failed to capture screen');
      }
    } catch (e) {
      showReject('Screenshot error');
    }
  };

  const handleClipboardPaste = async () => {
    setShowAttachMenu(false);
    try {
      const text = await api?.readClipboard?.();
      if (!text || !text.trim()) {
        showReject('Clipboard is empty');
        return;
      }
      const hash = text.substring(0, 40).replace(/[^a-zA-Z0-9]/g, '_') + '_clipboard';
      addPendingAttachments([{
        name: 'Clipboard.txt',
        path: `clipboard://${hash}`,
        content: text,
        tooBig: text.length > 100_000,
        size: text.length,
        ext: 'txt',
        isImage: false,
        id: generateId(),
      }]);
    } catch (e) {
      showReject('Failed to read clipboard');
    }
  };

  const handleEchoMode = () => {
    setEchoTooltip('Starting Echo Mode...');
    setTimeout(() => setEchoTooltip(null), 2000);
    try {
      api?.triggerEchoMode?.();
    } catch (e) {
      console.error('Failed to trigger Echo Mode:', e);
      setEchoTooltip('Echo Mode not available');
      setTimeout(() => setEchoTooltip(null), 2000);
    }
  };

  // ── CONTEXT CAPTURE HANDLER ──
  const handleCaptureContext = async () => {
    if (!api?.captureContext) return;
    try {
      const ctx = await api.captureContext();
      if (!ctx) return;

      if (ctx.clipboardText) {
        addPendingAttachments([{
          id: generateId(),
          name: 'Clipboard.txt',
          path: `clipboard://manual_${Date.now()}`,
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
          addPendingAttachments([{
            ...fileResult,
            ext: fileResult.ext || 'png',
            isImage: true,
            id: generateId(),
          }]);
        }
      }
    } catch (e) {
      console.error('[ManualContext] Capture failed:', e);
    }
  };

  const hasContent = input.trim().length > 0 || pendingAttachments.length > 0;
  const isStreaming = streamState.isStreaming;
  const sendBtnState = isStreaming ? 'streaming' : hasContent ? 'ready' : 'idle';

  // ── RENDER ──
  return (
    <div className="input-bar">
      {rejectTooltip && (
        <div className="drag-tooltip">{rejectTooltip}</div>
      )}

      {/* Left: Attach button */}
      <AttachMenu
        isOpen={showAttachMenu}
        onToggle={() => setShowAttachMenu(!showAttachMenu)}
        onClose={() => setShowAttachMenu(false)}
        onAttachFile={handleAttachFile}
        onScreenshot={handleScreenshot}
        onClipboardPaste={handleClipboardPaste}
      />

      {/* Center: Textarea + attachments */}
      <div className="input-content-col">
        <AttachmentBar
          attachments={pendingAttachments}
          onRemove={removePendingAttachment}
        />

        <div style={{ position: 'relative', width: '100%' }}>
          {isAutocompleteOpen && (
            <AutocompleteMenu
              suggestions={suggestions}
              selectedIndex={selectedSuggestionIndex}
              onSelect={handleSelectSuggestion}
              type={autocompleteType}
            />
          )}

          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Message Hermes... (Enter to send, Shift+Enter for newline, Ctrl+Shift+Enter for background)"
            className="input-textarea"
            rows={1}
            aria-label="Message input"
            spellCheck="false"
          />
        </div>
      </div>

      {/* Right: Action buttons */}
      <div className="input-actions-group">
        {/* Context capture button */}
        <button
          className="input-action-btn"
          onClick={handleCaptureContext}
          title="Capture context (screenshot + clipboard)"
          aria-label="Capture context"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 7V2h5" /><path d="M22 7V2h-5" /><path d="M2 17v5h5" /><path d="M22 17v5h-5" /><rect x="7" y="7" width="10" height="10" rx="1" />
          </svg>
        </button>

        {/* Echo/Voice mode button */}
        <button
          className="input-action-btn"
          onClick={handleEchoMode}
          title="Voice mode (Ctrl+Shift+E)"
          aria-label="Start voice mode"
        >
          <AudioLines size={16} strokeWidth={2} />
        </button>

        {/* Background send button */}
        <button
          className="input-action-btn"
          onClick={handleBackgroundSend}
          disabled={!hasContent}
          title="Send in background (Ctrl+Shift+Enter)"
          aria-label="Background send"
        >
          <Zap size={16} strokeWidth={2} />
        </button>

        {/* Stop streaming (conditional) */}
        {isStreaming && (
          <button
            className="input-action-btn stop"
            onClick={handleStop}
            aria-label="Stop streaming"
            title="Stop (Escape)"
          >
            <Square size={14} fill="currentColor" />
          </button>
        )}

        {/* Send button */}
        <button
          className={`send-btn ${sendBtnState}`}
          onClick={handleSubmit}
          disabled={!hasContent || isStreaming}
          title={isStreaming ? 'Streaming...' : 'Send (Enter)'}
          aria-label="Send message"
        >
          {isStreaming ? (
            <Square size={14} fill="currentColor" />
          ) : (
            <ArrowUp size={16} strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
};
