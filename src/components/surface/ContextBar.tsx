import React, { useState } from 'react';
import { MoreHorizontal, Plus, X, Settings, TerminalSquare, Zap, Maximize2, Minimize2, History } from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';
import { getElectronAPI } from '../../hooks/useElectronAPI';

const api = getElectronAPI();

interface ContextBarProps {
  onMoreClick?: () => void;
  onNewSession?: () => void;
  onToggleHistory?: () => void;
  showNewButton?: boolean;
}

export const ContextBar: React.FC<ContextBarProps> = ({
  onMoreClick,
  onNewSession,
  onToggleHistory,
  showNewButton = true,
}) => {
  const activeModel = useOverlayStore(s => s.activeModel);
  const isStreaming = useOverlayStore(s => s.streamState.isStreaming);
  const setSettingsOpen = useOverlayStore(s => s.setSettingsOpen);
  const backgroundTasks = useOverlayStore(s => s.backgroundTasks);
  const smallWindow = useOverlayStore(s => s.smallWindow);
  const setSmallWindow = useOverlayStore(s => s.setSmallWindow);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const runningTasks = backgroundTasks.filter((t: any) => t.status === 'running');
  const hasRunning = runningTasks.length > 0;

  const handleClose = () => api?.closeOverlay();
  const handleTerminal = () => api?.openTerminal?.();

  return (
    <div className="context-bar context-bar--compact">
      <div className="context-bar-left">
        <button
          className="model-dot"
          onClick={() => setSettingsOpen(true)}
          title={activeModel || 'No model'}
        >
          <span className={`model-dot-indicator ${isStreaming ? 'streaming' : ''}`} />
          <span>{activeModel || 'No model'}</span>
          {hasRunning && (
            <span className="bg-task-indicator" title={`${runningTasks.length} task(s) running`}>
              <Zap size={10} />
              <span>{runningTasks.length}</span>
            </span>
          )}
        </button>
      </div>

      <div className="context-bar-right">
        {showNewButton && (
          <button className="context-bar-btn" onClick={onNewSession} title="New chat (Ctrl+N)">
            <Plus size={14} />
          </button>
        )}
        <button className="context-bar-btn" onClick={onToggleHistory} title="Chat history (Ctrl+H)">
          <History size={14} />
        </button>

        <div
          className="context-bar-overflow"
          onMouseEnter={() => setIsMenuOpen(true)}
          onMouseLeave={() => setIsMenuOpen(false)}
        >
          <button
            className="context-bar-btn"
            onClick={() => setIsMenuOpen((open) => !open)}
            title="More actions"
          >
            <MoreHorizontal size={14} />
          </button>

          <div className={`context-bar-menu ${isMenuOpen ? 'is-open' : ''}`}>
            <button onClick={handleTerminal}>
              <TerminalSquare size={14} />
              <span>Terminal</span>
            </button>
            <button onClick={() => setSmallWindow(!smallWindow)}>
              {smallWindow ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
              <span>{smallWindow ? 'Normal view' : 'Compact view'}</span>
            </button>
            <button onClick={() => setSettingsOpen(true)}>
              <Settings size={14} />
              <span>Settings</span>
            </button>
            <button onClick={onMoreClick}>
              <Zap size={14} />
              <span>Command palette</span>
            </button>
            <button onClick={handleClose} className="context-bar-menu-item--danger">
              <X size={14} />
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
