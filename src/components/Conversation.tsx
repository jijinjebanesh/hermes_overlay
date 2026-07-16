import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowDown } from 'lucide-react';
import { useOverlayStore, generateId } from '../store/overlayStore';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './ui/EmptyState';
import { IconButton } from './ui/IconButton';

export const Conversation: React.FC = () => {
  const { messages, streamState, editFromMessage, retryFromMessage } = useOverlayStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const prevMsgCount = useRef(messages.length);

  // Scroll detection — passive listener (lightweight, no blocking)
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

  // Auto-scroll + new message detection
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

  // Group messages by date for separators
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

      // Check if this is the active streaming message
      const isLastAssistantMessage = idx === messages.length - 1 && msg.role === 'assistant';
      const isStreaming = isLastAssistantMessage && streamState.isStreaming && !msg.cancelled;

      // Determine streaming status label
      const getStreamingLabel = () => {
        switch (streamState.mode) {
          case 'thinking': return 'Thinking';
          case 'tool': return 'Working';
          case 'terminal': return 'Running';
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
              onEdit={() => {
                const content = editFromMessage(msg.id);
                if (content) {
                  window.dispatchEvent(new CustomEvent('hermes-edit-message', { detail: content }));
                }
              }}
              onRetry={() => {
                const content = retryFromMessage(msg.id);
                if (content) {
                  const api = (window as any).electronAPI;
                  const state = useOverlayStore.getState();
                  if (api?.sendMessage) {
                    useOverlayStore.getState().addMessage({
                      id: generateId(),
                      role: 'user',
                      content,
                      timestamp: Date.now(),
                    });
                    useOverlayStore.getState().setStreamState({
                      isStreaming: true,
                      tokens: 0,
                      duration: 0,
                      mode: state.toolMode,
                    });
                    api.sendMessage({
                      text: content,
                      sessionId: state.sessionId,
                      toolMode: state.toolMode,
                      provider: state.activeProvider,
                      model: state.activeModel,
                    });
                  }
                }
              }}
            />

            {/* Streaming indicator */}
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

  // Empty state
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

      {/* Floating scroll to bottom pill */}
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
