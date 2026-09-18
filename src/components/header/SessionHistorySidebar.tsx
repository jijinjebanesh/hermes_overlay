import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOverlayStore } from '../../store/overlayStore';
import { getElectronAPI } from '../../hooks/useElectronAPI';

const api = getElectronAPI();

interface SessionRecord {
  id: string;
  title?: string;
  started_at?: number;
  message_count?: number;
  snippet?: string;
}

interface SessionGroup {
  label: string;
  sessions: SessionRecord[];
}

const stripMarkup = (value: string) => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const sessionDate = (session: SessionRecord) => {
  const date = Number(session.started_at || 0);
  return date > 0 ? new Date(date) : null;
};

const dayStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const groupLabelFor = (session: SessionRecord) => {
  const date = sessionDate(session);
  if (!date) return 'Older';
  const today = dayStart(new Date());
  const sessionDay = dayStart(date);
  const dayDelta = Math.round((today - sessionDay) / 86_400_000);
  if (dayDelta <= 0) return 'Today';
  if (dayDelta === 1) return 'Yesterday';
  if (dayDelta < 7) return 'Previous 7 days';
  return 'Older';
};

const formatSessionTime = (session: SessionRecord) => {
  const date = sessionDate(session);
  if (!date) return 'No timestamp';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const getSessionTitle = (session: SessionRecord) => session.title?.trim() || 'New session';

export const SessionHistorySidebar: React.FC = () => {
  const { hydrateSession, newSession, sessionId } = useOverlayStore();
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const loadSessions = useCallback(async (query: string) => {
    if (!api) return;
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setError('');
    try {
      const result = query.trim() && api.searchSessions
        ? await api.searchSessions(query.trim())
        : await api.listSessions();
      if (currentRequest !== requestId.current) return;
      setSessions(Array.isArray(result) ? result : []);
    } catch {
      if (currentRequest !== requestId.current) return;
      setSessions([]);
      setError('Session history is unavailable right now.');
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => void loadSessions(searchQuery), searchQuery ? 240 : 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, loadSessions, searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) window.setTimeout(() => searchInputRef.current?.focus(), 120);
  }, [isOpen]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolled(e.currentTarget.scrollTop > 10);
  }, []);

  const groups = useMemo<SessionGroup[]>(() => {
    if (searchQuery.trim()) return [{ label: 'Search results', sessions }];
    const order = ['Today', 'Yesterday', 'Previous 7 days', 'Older'];
    return order
      .map((label) => ({ label, sessions: sessions.filter((session) => groupLabelFor(session) === label) }))
      .filter((group) => group.sessions.length > 0);
  }, [searchQuery, sessions]);

  const handleSelectSession = async (session: SessionRecord) => {
    if (!api?.getSession) return;
    setIsLoading(true);
    try {
      const messages = await api.getSession(session.id);
      if (Array.isArray(messages)) {
        hydrateSession(session.id, messages);
        setIsOpen(false);
      }
    } catch {
      setError('Could not open that session.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewSession = () => { newSession(); setIsOpen(false); };

  const handleClearHistory = async () => {
    if (!api?.clearAllSessions || isClearing) return;
    const confirmed = window.confirm('Clear all saved chat sessions? This cannot be undone.');
    if (!confirmed) return;
    setIsClearing(true);
    try { if (await api.clearAllSessions()) setSessions([]); }
    finally { setIsClearing(false); }
  };

  return (
    <>
      <button
        className={`history-launcher${isOpen ? ' is-active' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? 'Close session history' : 'Open session history'}
        title="Session history"
      >
        <span className="history-launcher-glyph">
          <span /><span /><span />
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="session-history-layer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="session-history-backdrop" onClick={() => setIsOpen(false)} />

            <motion.aside
              className="session-history-sidebar"
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              {/* Collapsible Header */}
              <div className={`session-history-header ${isScrolled ? 'scrolled' : ''}`}>
                <div className="session-history-header-top">
                  <div className="session-history-title-row">
                    <Clock size={16} className="session-history-title-icon" />
                    <h2>History</h2>
                  </div>
                  <div className="session-history-header-actions">
                    <button className="session-history-icon-btn" onClick={handleNewSession} title="New chat">
                      <Plus size={15} />
                    </button>
                    <button
                      className="session-history-icon-btn"
                      onClick={() => void loadSessions(searchQuery)}
                      disabled={isLoading}
                      title="Refresh"
                    >
                      <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
                    </button>
                    <button className="session-history-icon-btn close" onClick={() => setIsOpen(false)} title="Close">
                      <X size={15} />
                    </button>
                  </div>
                </div>

                <div className="session-history-search-wrapper">
                  <Search size={14} className="session-history-search-icon" />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search chats..."
                    className="session-history-search-input"
                  />
                  {searchQuery && (
                    <button className="session-history-search-clear" onClick={() => setSearchQuery('')}>
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable List */}
              <div className="session-history-scroll" ref={scrollRef} onScroll={handleScroll}>
                <AnimatePresence mode="wait">
                  {isLoading && sessions.length === 0 ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="session-history-state"
                    >
                      <Loader2 size={18} className="spin" />
                      <span>Loading history...</span>
                    </motion.div>
                  ) : error ? (
                    <motion.div
                      key="error"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="session-history-state error"
                    >
                      <span>{error}</span>
                      <button onClick={() => void loadSessions(searchQuery)}>Try again</button>
                    </motion.div>
                  ) : groups.length === 0 ? (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="session-history-state"
                    >
                      <MessageSquare size={20} />
                      <strong>{searchQuery ? 'No matches' : 'No saved chats yet'}</strong>
                      <span>{searchQuery ? 'Try different keywords' : 'Your conversations appear here'}</span>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="list"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      {groups.map((group) => (
                        <section className="session-history-group" key={group.label}>
                          <div className="session-history-group-label">{group.label}</div>
                          <div className="session-history-group-list">
                            {group.sessions.map((session, idx) => {
                              const isActive = session.id === sessionId;
                              const snippet = session.snippet ? stripMarkup(session.snippet) : '';
                              return (
                                <motion.button
                                  key={session.id}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.03 }}
                                  className={`session-history-item${isActive ? ' is-active' : ''}`}
                                  onClick={() => void handleSelectSession(session)}
                                  disabled={isLoading}
                                >
                                  <span className="session-history-item-icon">
                                    <MessageSquare size={13} />
                                  </span>
                                  <span className="session-history-item-content">
                                    <strong>{getSessionTitle(session)}</strong>
                                    <span className="session-history-item-meta">
                                      {formatSessionTime(session)} · {session.message_count || 0} msgs
                                    </span>
                                    {snippet && <em>{snippet}</em>}
                                  </span>
                                  {isActive && <span className="session-history-active-dot" />}
                                </motion.button>
                              );
                            })}
                          </div>
                        </section>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              {sessions.length > 0 && (
                <div className="session-history-footer">
                  <span>{sessions.length} sessions</span>
                  <button
                    className="session-history-clear-btn"
                    onClick={() => void handleClearHistory()}
                    disabled={isClearing}
                  >
                    <Trash2 size={12} />
                    {isClearing ? 'Clearing...' : 'Clear all'}
                  </button>
                </div>
              )}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
