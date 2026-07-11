import React from 'react';
import { MessageSquarePlus, X, Settings, TerminalSquare, Zap } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import { getElectronAPI } from '../hooks/useElectronAPI';
import { ModelSelector } from './header/ModelSelector';
import { SessionHistory } from './header/SessionHistory';

const api = getElectronAPI();

export const Header: React.FC = () => {
  const { newSession, setSettingsOpen, backgroundTasks, toolMode } = useOverlayStore();

  const handleClose = () => api?.closeOverlay();
  const handleNewChat = () => newSession();
  const handleSettings = () => setSettingsOpen(true);
  const handleTerminal = () => {
    if (api?.openTerminal) api.openTerminal();
  };

  const runningTasks = backgroundTasks.filter((t: any) => t.status === 'running');
  const hasRunning = runningTasks.length > 0;

  return (
    <div className="header">
      {/* LEFT: Status cluster */}
      <div className="header-left">
        <ModelSelector />

        <div className="header-status-cluster">
          <div className="tool-mode-pill" title={`Tool mode: ${toolMode === 'all' ? 'Full tools' : toolMode === 'terminal' ? 'Terminal only' : 'Chat only'}`}>
            {toolMode === 'all' ? 'Full tools' : toolMode === 'terminal' ? 'Terminal' : 'Chat'}
          </div>

          <div className="connection-dot" title="Hermes backend connected" role="status" aria-label="Backend connected" />
        </div>
      </div>

      {/* CENTER: Product identity */}
      <div className="header-center">
        <span className="header-title">Hermes</span>
      </div>

      {/* RIGHT: Action buttons */}
      <div className="header-actions">
        <SessionHistory />

        {hasRunning && (
          <div
            className="header-btn header-bg-task"
            title={`${runningTasks.length} background task${runningTasks.length > 1 ? 's' : ''} running`}
          >
            <Zap size={13} className="spin-slow" />
            <span className="bg-task-badge">{runningTasks.length}</span>
          </div>
        )}

        <div className="header-divider" />

        <button
          className="header-btn"
          onClick={handleTerminal}
          title="Open Terminal"
          aria-label="Open Terminal"
        >
          <TerminalSquare size={13} />
        </button>

        <button
          className="header-btn"
          onClick={handleSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={13} />
        </button>

        <button
          className="header-btn new-chat-btn"
          onClick={handleNewChat}
          title="New Chat"
          aria-label="Start new chat"
        >
          <MessageSquarePlus size={13} />
        </button>

        <button
          className="header-btn header-close-btn"
          onClick={handleClose}
          title="Close (Escape)"
          aria-label="Close overlay"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
};
