import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useOverlayStore } from '../store/overlayStore';
import { MessageBubble } from './MessageBubble';

/**
 * CONVERSATION — flex-grow, overflow-y: auto.
 *
 * Zero height when empty (no messages) — overlay becomes
 * just header + input bar (compact ~96px launcher).
 *
 * Auto-scrolls to bottom on new content. Pauses when user
 * scrolls up manually. Shows "↓ New message" pill when
 * paused and new content arrives.
 *
 * Streaming cursor (|) and status line shown on last
 * assistant message during active stream.
 */

export const Conversation: React.FC = () => {
  const { messages, streamState } = useOverlayStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const prevMsgCount = useRef(messages.length);

  // ── Scroll detection ──
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

  // ── Auto-scroll + new message detection ──
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

  // ── Empty state: zero height ──
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="conversation">
      <div ref={scrollRef} className="conversation-scroll">
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className="message-row">
            <MessageBubble message={msg} />

            {/* Streaming cursor on last assistant message */}
            {idx === messages.length - 1 &&
              msg.role === 'assistant' &&
              streamState.isStreaming &&
              !msg.cancelled && (
              <div style={{
                marginLeft: 12,
                marginTop: 8,
                marginBottom: 16,
                display: 'flex',
                flexDirection: 'column',
              }}>
                <span className="stream-cursor" />
                <span className="stream-status">
                  {streamState.tokens} tokens · {streamState.mode || 'thinking'} · {streamState.duration}s
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ↓ New message pill */}
      {showNewMsg && (
        <button className="new-msg-pill" onClick={scrollToBottom}>
          <span>↓</span> New message
        </button>
      )}
    </div>
  );
};
