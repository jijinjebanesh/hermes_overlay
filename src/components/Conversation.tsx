import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowDown } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import { MessageBubble } from './MessageBubble';
import { EmptyState } from './ui/EmptyState';
import { IconButton } from './ui/IconButton';

export const Conversation: React.FC = () => {
  const { messages, streamState } = useOverlayStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const prevMsgCount = useRef(messages.length);

  // Scroll detection
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
    el.addEventListener('scroll', handleScroll);
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

      return (
        <React.Fragment key={msg.id || idx}>
          {showDateSeparator && (
            <div className="date-separator">
              <span className="date-separator-pill">{dateStr}</span>
            </div>
          )}
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, type: 'spring', bounce: 0 }}
            className="message-row"
          >
            <MessageBubble message={msg} />

            {/* Streaming cursor and typing indicator */}
            {isStreaming && (
              <div style={{
                marginLeft: 12,
                marginTop: 8,
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
              }}>
                <div className="typing-indicator">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
                <span className="stream-status">
                  {streamState.tokens} tokens · {streamState.mode || 'thinking'} · {streamState.duration}s
                </span>
              </div>
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
          icon={<Sparkles size={32} style={{ color: 'var(--color-accent)' }} />}
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
