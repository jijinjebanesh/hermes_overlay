import React, { useState, useRef, useEffect } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';
import { Popover } from '../ui/Popover';
import { getElectronAPI } from '../../hooks/useElectronAPI';

const api = getElectronAPI();

export const SessionHistory: React.FC = () => {
  const { hydrateSession } = useOverlayStore();
  const [isOpen, setIsOpen] = useState(false);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSessionsLoading(true);
      if (api?.listSessions) {
        api.listSessions().then((data: any[]) => {
          setSessionsList(data);
          setSessionsLoading(false);
        }).catch(() => setSessionsLoading(false));
      } else {
        setSessionsLoading(false);
      }
    }
  }, [isOpen]);

  const handleSelectSession = async (sessionId: string) => {
    if (!api?.getSession) return;
    setSessionsLoading(true);
    try {
      const messages = await api.getSession(sessionId);
      hydrateSession(sessionId, messages);
      setIsOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSessionsLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        className={`header-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="History"
        aria-label="View past sessions"
      >
        <Clock size={14} />
      </button>

      <Popover 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
        triggerRef={triggerRef}
        className="model-popover history-popover"
        style={{ right: -128, left: 'auto', top: 32, width: 280 }}
      >
        <div className="popover-section-label">
          <Clock size={10} />
          <span>Recent Sessions</span>
        </div>
        
        <div className="model-list-scroll">
          {sessionsLoading && sessionsList.length === 0 ? (
            <div className="popover-empty">
              <Loader2 size={14} className="spin" style={{ display: 'inline-block', marginRight: 6 }} />
              Loading sessions...
            </div>
          ) : sessionsList.length === 0 ? (
            <div className="popover-empty">No recent sessions found.</div>
          ) : (
            sessionsList.map((s) => (
              <button
                key={s.id}
                className="model-popover-item model-item"
                onClick={() => handleSelectSession(s.id)}
                role="option"
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                  <span className="model-item-name" style={{ fontWeight: 500 }}>{s.title}</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                    {new Date(s.started_at).toLocaleString()} · {s.message_count} msg
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </Popover>
    </div>
  );
};
