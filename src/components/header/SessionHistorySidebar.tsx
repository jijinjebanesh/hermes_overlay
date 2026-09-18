import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
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

const getSessionTitle = (session: SessionRecord) => {
  const title = session.title?.trim();
  return title || 'New session';
};

export const SessionHistorySidebar: React.FC = () => {
  const { hydrateSession, newSession, sessionId } = useOverlayStore();
  const [isOpen, setIsOpen] = useState(true);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
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
    const timer = window.setTimeout(() => {
      void loadSessions(searchQuery);
    }, searchQuery ? 240 : 0);
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

  const handleNewSession = () => {
    newSession();
    setIsOpen(false);
  };

  const handleClearHistory = async () => {
    if (!api?.clearAllSessions || isClearing) return;
    const confirmed = window.confirm('Clear all saved chat sessions? This cannot be undone.');
    if (!confirmed) return;

    setIsClearing(true);
    try {
      const cleared = await api.clearAllSessions();
      if (cleared) setSessions([]);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <>
      <button
        className={`history-launcher${isOpen ? ' is-active' : ''}`}
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? 'Close session history' : 'Open session history'}
        aria-expanded={isOpen}
        title="Session history"
      >
        <span className="history-launcher-glyph" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <div className={`session-history-layer${isOpen ? ' is-open' : ''}`} aria-hidden={!isOpen}>
        <button
          className="session-history-backdrop"
          onClick={() => setIsOpen(false)}
          tabIndex={isOpen ? 0 : -1}
          aria-label="Close session history"
        />

        <aside className="session-history-sidebar" aria-label="Chat history">
          <div className="session-history-header">
            <div className="session-history-heading">
              <span className="session-history-kicker">Workspace</span>
              <h2>Chat history</h2>
              <span className="session-history-count">
                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
              </span>
            </div>
            <button
              className="session-history-icon-button"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat history"
            >
              <X size={16} />
            </button>
          </div>

          <div className="session-history-actions">
            <button className="session-history-new" onClick={handleNewSession}>
              <Plus size={15} />
              <span>New chat</span>
              <kbd>Ctrl N</kbd>
            </button>
            <button
              className="session-history-icon-button"
              onClick={() => void loadSessions(searchQuery)}
              disabled={isLoading || isClearing}
              aria-label="Refresh chat history"
              title="Refresh"
            >
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            </button>
          </div>

          <div className="session-history-search">
            <Search size={14} aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
            {searchQuery && (
              <button
                className="session-history-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="session-history-list" role="list">
            {isLoading && sessions.length === 0 ? (
              <div className="session-history-state">
                <Loader2 size={16} className="spin" />
                <span>{searchQuery ? 'Searching history' : 'Loading history'}</span>
              </div>
            ) : error ? (
              <div className="session-history-state session-history-state-error">
                <span>{error}</span>
                <button onClick={() => void loadSessions(searchQuery)}>Try again</button>
              </div>
            ) : groups.length === 0 ? (
              <div className="session-history-state">
                <MessageSquare size={18} />
                <strong>{searchQuery ? 'No matches' : 'No saved chats yet'}</strong>
                <span>{searchQuery ? 'Try a different search term.' : 'Your conversations will appear here.'}</span>
              </div>
            ) : (
              groups.map((group) => (
                <section className="session-history-group" key={group.label}>
                  <div className="session-history-group-label">{group.label}</div>
                  {group.sessions.map((session) => {
                    const isActive = session.id === sessionId;
                    const snippet = session.snippet ? stripMarkup(session.snippet) : '';
                    return (
                      <button
                        className={`session-history-item${isActive ? ' is-active' : ''}`}
                        key={session.id}
                        onClick={() => void handleSelectSession(session)}
                        role="listitem"
                        disabled={isLoading}
                      >
                        <span className="session-history-item-icon"><MessageSquare size={13} /></span>
                        <span className="session-history-item-copy">
                          <strong>{getSessionTitle(session)}</strong>
                          <span>
                            {formatSessionTime(session)} · {session.message_count || 0} {session.message_count === 1 ? 'message' : 'messages'}
                          </span>
                          {snippet && <em>{snippet}</em>}
                        </span>
                        {isActive && <span className="session-history-active-mark">●</span>}
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>

          <div className="session-history-footer">
            <span>Showing all saved sessions</span>
            <button
              className="session-history-clear"
              onClick={() => void handleClearHistory()}
              disabled={isClearing || sessions.length === 0}
            >
              <Trash2 size={12} />
              {isClearing ? 'Clearing...' : 'Clear history'}
            </button>
          </div>
        </aside>
      </div>
    </>
  );
};
