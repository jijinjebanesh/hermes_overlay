import React, { useState } from 'react';
import { MoreHorizontal, Plus, X, Settings, TerminalSquare, Zap, Maximize2, Minimize2 } from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';
import { getElectronAPI } from '../../hooks/useElectronAPI';

const api = getElectronAPI();

interface ContextBarProps {
  onMoreClick?: () => void;
  onNewSession?: () => void;
  showNewButton?: boolean;
}

/**
 * ContextBar — 32px top bar. Replaces the old Header entirely.
 * 
 * Left: model indicator + tool mode + streaming status
 * Right: essential actions (new, settings, close)
 * Draggable region for window movement.
 */
export const ContextBar: React.FC<ContextBarProps> = ({
  onMoreClick,
  onNewSession,
  showNewButton = true,
}) => {
  const activeModel = useOverlayStore(s => s.activeModel);
  const activeProvider = useOverlayStore(s => s.activeProvider);
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

  const summary = activeProvider && activeModel ? `${activeProvider} · ${activeModel}` : activeModel || 'No model';

  return (
    <div className="context-bar context-bar--compact">
      <div className="context-bar-left">
        <button
          className="model-dot"
          onClick={() => setSettingsOpen(true)}
          title={summary}
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

      <div
        className="context-bar-overflow"
        onMouseEnter={() => setIsMenuOpen(true)}
        onMouseLeave={() => setIsMenuOpen(false)}
        onFocus={() => setIsMenuOpen(true)}
        onBlur={() => setIsMenuOpen(false)}
      >
        <button
          className="context-bar-more context-bar-more--overflow"
          onClick={() => setIsMenuOpen((open) => !open)}
          title="More actions"
          aria-label="More actions"
        >
          <MoreHorizontal />
        </button>

        <div className={`context-bar-menu ${isMenuOpen ? 'is-open' : ''}`}>
          {showNewButton && (
            <button onClick={onNewSession}>
              <Plus size={14} />
              <span>New chat</span>
            </button>
          )}

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
  );
};
