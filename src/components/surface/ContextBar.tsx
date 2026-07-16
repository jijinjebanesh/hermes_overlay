import React from 'react';
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
  const toolMode = useOverlayStore(s => s.toolMode);
  const setSettingsOpen = useOverlayStore(s => s.setSettingsOpen);
  const backgroundTasks = useOverlayStore(s => s.backgroundTasks);
  const smallWindow = useOverlayStore(s => s.smallWindow);
  const setSmallWindow = useOverlayStore(s => s.setSmallWindow);

  const runningTasks = backgroundTasks.filter((t: any) => t.status === 'running');
  const hasRunning = runningTasks.length > 0;

  // Format display model — shorten long names
  const displayModel = React.useMemo(() => {
    if (!activeModel) return 'No model';
    const name = activeModel;
    return name.length > 20 ? name.slice(0, 18) + '…' : name;
  }, [activeModel]);

  // Tool mode info
  const toolModeInfo = React.useMemo(() => {
    switch (toolMode) {
      case 'all': return { label: 'Full tools', cls: 'all' };
      case 'terminal': return { label: 'Terminal', cls: 'terminal' };
      case 'none': return { label: 'Chat only', cls: 'none' };
      default: return { label: 'Full tools', cls: 'all' };
    }
  }, [toolMode]);

  const handleClose = () => api?.closeOverlay();
  const handleTerminal = () => api?.openTerminal?.();

  return (
    <div className="context-bar">
      <div className="context-bar-left">
        {/* Model dot — clickable, opens command palette */}
        <button
          className="model-dot"
          onClick={onMoreClick}
          title={`${activeProvider} · ${activeModel}`}
        >
          <span className={`model-dot-indicator ${isStreaming ? 'streaming' : ''}`} />
          <span>{displayModel}</span>
          {isStreaming && (
            <span className="streaming-dots">
              <span />
              <span />
              <span />
            </span>
          )}
        </button>

        {/* Background tasks indicator */}
        {hasRunning && (
          <div className="bg-task-indicator" title={`${runningTasks.length} task(s) running`}>
            <Zap size={11} />
            <span>{runningTasks.length}</span>
          </div>
        )}
      </div>

      <div className="context-bar-right">
        {showNewButton && (
          <button
            className="context-bar-more"
            onClick={onNewSession}
            title="New session (Ctrl+N)"
          >
            <Plus />
          </button>
        )}

        <button
          className="context-bar-more"
          onClick={handleTerminal}
          title="Open Terminal"
        >
          <TerminalSquare />
        </button>

        <button
          className="context-bar-more"
          onClick={() => setSmallWindow(!smallWindow)}
          title={smallWindow ? "Normal View" : "Compact View"}
        >
          {smallWindow ? <Maximize2 /> : <Minimize2 />}
        </button>

        <button
          className="context-bar-more"
          onClick={() => setSettingsOpen(true)}
          title="Settings (Ctrl+,)"
        >
          <Settings />
        </button>

        <button
          className="context-bar-more"
          onClick={onMoreClick}
          title="Command Palette (Ctrl+K)"
        >
          <MoreHorizontal />
        </button>

        <button
          className="context-bar-more"
          onClick={handleClose}
          title="Close (Esc)"
        >
          <X />
        </button>
      </div>
    </div>
  );
};
