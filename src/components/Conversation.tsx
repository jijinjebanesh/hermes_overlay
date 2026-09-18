import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowDown } from 'lucide-react';
import { useOverlayStore, generateId } from '../store/overlayStore';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './ui/EmptyState';

export const Conversation: React.FC = () => {
  const { messages, streamState, setStreamState, addMessage, sessionId, activeProvider, activeModel, toolMode } = useOverlayStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const prevMsgCount = useRef(messages.length);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10;
    setAutoScroll(isAtBottom);
    if (isAtBottom) setShowNewMsg(false);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    } else if (!autoScroll && messages.length > prevMsgCount.current) {
      setShowNewMsg(true);
    }
    prevMsgCount.current = messages.length;
  }, [messages, streamState, autoScroll]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    setAutoScroll(true);
    setShowNewMsg(false);
  };

  // Edit message: find the user message and everything after it, remove them, put text in input
  const handleEdit = useCallback((messageId: string) => {
    const state = useOverlayStore.getState();
    const idx = state.messages.findIndex(m => m.id === messageId);
    if (idx === -1 || state.messages[idx].role !== 'user') return;

    const content = state.messages[idx].content;
    // Truncate messages to before this user message
    const newMessages = state.messages.slice(0, idx);
    useOverlayStore.setState({ messages: newMessages });

    // Dispatch event to set input text
    window.dispatchEvent(new CustomEvent('hermes-edit-message', { detail: content }));
  }, []);

  // Retry: remove messages after the one we're retrying, resubmit
  const handleRetry = useCallback((messageId: string) => {
    const state = useOverlayStore.getState();
    const idx = state.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;

    // Find preceding user message
    let userContent: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (state.messages[i].role === 'user') {
        userContent = state.messages[i].content;
        // Remove everything from the user message onwards
        useOverlayStore.setState({ messages: state.messages.slice(0, i) });
        break;
      }
    }

    if (!userContent) return;

    // Add user message
    addMessage({
      id: generateId(),
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
    });

    // Add streaming placeholder
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

    const api = (window as any).electronAPI;
    api?.sendMessage({
      text: userContent,
      sessionId,
      toolMode,
      provider: activeProvider,
      model: activeModel,
    });
  }, [addMessage, setStreamState, sessionId, toolMode, activeProvider, activeModel]);

  const renderMessages = () => {
    let lastDateStr = '';

    return messages.map((msg, idx) => {
      const msgDate = new Date(msg.timestamp);
      const dateStr = msgDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric'
      });

      const showDateSeparator = dateStr !== lastDateStr;
      if (showDateSeparator) {
        lastDateStr = dateStr;
      }

      const isLastAssistantMessage = idx === messages.length - 1 && msg.role === 'assistant';
      const isStreaming = isLastAssistantMessage && streamState.isStreaming && !msg.cancelled;

      const getStreamingLabel = () => {
        switch (streamState.mode) {
          case 'thinking': return 'Thinking';
          case 'working': return 'Working';
          case 'running': return 'Running';
          case 'searching': return 'Searching';
          default: return 'Thinking';
        }
      };

      return (
        <React.Fragment key={msg.id || idx}>
          {showDateSeparator && (
            <motion.div
              className="date-separator"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              <span className="date-separator-pill">{dateStr}</span>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.35,
              type: 'spring',
              bounce: 0.15,
              delay: 0.02
            }}
            className="message-row"
          >
            <MessageBubble
              message={msg}
              onEdit={msg.role === 'user' ? () => handleEdit(msg.id) : undefined}
              onRetry={msg.role === 'assistant' ? () => handleRetry(msg.id) : undefined}
            />

            {isStreaming && (
              <motion.div
                className="stream-indicator"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="stream-indicator-content">
                  <div className="stream-dots">
                    <span className="stream-dot"></span>
                    <span className="stream-dot"></span>
                    <span className="stream-dot"></span>
                  </div>
                  <span className="stream-status">
                    {getStreamingLabel()}
                    <span className="stream-divider">·</span>
                    <span className="stream-time">{streamState.duration}s</span>
                  </span>
                </div>
                {streamState.tokens > 0 && (
                  <span className="stream-tokens">{streamState.tokens} tokens</span>
                )}
              </motion.div>
            )}
          </motion.div>
        </React.Fragment>
      );
    });
  };

  if (messages.length === 0) {
    return (
      <div className="conversation conversation--empty">
        <EmptyState
          icon={<Sparkles size={32} style={{ color: 'var(--accent-primary)' }} />}
          title="How can I help you today?"
          description="Ask me anything, or try using voice mode for a hands-free experience."
          className="welcome-empty-state"
        />
      </div>
    );
  }

  return (
    <div className="conversation">
      <div ref={scrollRef} className="conversation-scroll">
        {renderMessages()}
      </div>

      {(!autoScroll || showNewMsg) && (
        <div className="scroll-to-bottom-wrapper">
          <button
            className={`scroll-to-bottom-btn ${showNewMsg ? 'has-new' : ''}`}
            onClick={scrollToBottom}
          >
            <ArrowDown size={14} />
            {showNewMsg && <span className="scroll-new-badge" />}
          </button>
        </div>
      )}
    </div>
  );
};
