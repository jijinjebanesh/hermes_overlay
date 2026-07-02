import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { KeyboardEvent } from 'react';
import { Square, ArrowUp, AudioLines } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
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
    clearSession, newSession, undo, localMode,
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
  const [suggestions, setSuggestions] = useState<Array<{name: string, isDir: boolean, size: number}>>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [autocompletePrefix, setAutocompletePrefix] = useState('');
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [lastWord, setLastWord] = useState('');

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

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
        } else {
          api?.closeOverlay();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [input, isAutocompleteOpen]);

  const resetTextarea = useCallback(() => {
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, [inputRef]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        handleSelectSuggestion(selectedSuggestionIndex);
        return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (input.startsWith('/')) {
        const match = SLASH_COMMANDS.find((c) => c.startsWith(input.trim()));
        if (match) setInput(match + ' ');
      }
      return;
    }

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

    if (e.key === 'Enter') {
      if (e.shiftKey) return;
      e.preventDefault();
      handleSubmit();
    }
  };

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

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const sh = inputRef.current.scrollHeight;
      inputRef.current.style.height = Math.min(sh, 96) + 'px';
    }
  };

  const handleSelectSuggestion = (index: number) => {
    const selected = suggestions[index];
    if (selected) {
      const newPath = autocompletePrefix + selected.name + (selected.isDir ? '/' : '');
      const newInput = input.slice(0, -lastWord.length) + newPath;
      setInput(newInput);
      setIsAutocompleteOpen(false);
      if (selected.isDir) fetchSuggestions(newPath, '', newPath);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = () => {
    if (!input.trim() && !fileAttached) return;

    if (streamState.isStreaming) {
      const trimmed = input.trim();
      if (!trimmed) return;
      addToHistory(trimmed);
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

    const isExplicitOpen = trimmed.toLowerCase().startsWith('open ');
    const isRawAbsolutePath = /^(?:[a-zA-Z]:[/\\]|[/\\])/.test(trimmed);
    
    let targetPath = '';
    let shouldOpenLocally = false;

    if (isExplicitOpen) {
      const pathAfterOpen = trimmed.substring(5).trim();
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
      const currentMessages = [...useOverlayStore.getState().messages];
      newSession();
      currentMessages.forEach((m) => addMessage({ ...m, id: crypto.randomUUID?.() || Math.random().toString(36).substring(2) }));
      setInput('');
      resetTextarea();
      return;
    }

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

    let attachmentContext = '';
    let attachmentPayload: typeof pendingAttachments = [];
    let passthroughFilePath: string | undefined;

    const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'rtf'];

    if (pendingAttachments.length > 0) {
      // First image or document path for --image / file passthrough
      const firstPassthrough = pendingAttachments.find(
        f => f.isImage || docExts.includes(f.ext)
      );
      if (firstPassthrough) passthroughFilePath = firstPassthrough.path;

      // Build XML context for plain-text/code files only
      // Documents and images are binary — content must NOT go into CLI args
      const filesWithContent = pendingAttachments.filter(
        f => f.content !== null && !f.tooBig && !f.isImage && !docExts.includes(f.ext)
      );
      if (filesWithContent.length > 0) {
        attachmentContext = filesWithContent
          .map(f => `<file name="${f.name}" path="${f.path}">\n${f.content}\n</file>`)
          .join('\n\n') + '\n\n';
      }
      // Image + document reference tags (path only, no content)
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
      id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
      role: 'user',
      content: trimmed,
      attachments: attachmentPayload,
      timestamp: Date.now(),
    });

    addMessage({
      id: crypto.randomUUID?.() || Math.random().toString(36).substring(2),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    });

    setStreamState({
      isStreaming: true,
      tokens: 0,
      duration: 0,
      mode: toolMode,
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
            ext: fileResult.ext || '',
            isImage: fileResult.isImage || false,
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

  const hasContent = input.trim().length > 0 || pendingAttachments.length > 0;

  return (
    <div className="input-bar">
      {rejectTooltip && (
        <div className="drag-tooltip">{rejectTooltip}</div>
      )}

      <AttachMenu
        isOpen={showAttachMenu}
        onToggle={() => setShowAttachMenu(!showAttachMenu)}
        onClose={() => setShowAttachMenu(false)}
        onAttachFile={handleAttachFile}
        onScreenshot={handleScreenshot}
      />

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
            />
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
