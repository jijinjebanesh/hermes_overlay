import React from 'react';
import { MessageSquarePlus, X, Settings, TerminalSquare } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import { getElectronAPI } from '../hooks/useElectronAPI';
import { ModelSelector } from './header/ModelSelector';
import { SessionHistory } from './header/SessionHistory';

const api = getElectronAPI();

export const Header: React.FC = () => {
  const { newSession, setSettingsOpen } = useOverlayStore();

  const handleClose = () => api?.closeOverlay();
  const handleNewChat = () => newSession();
  const handleSettings = () => setSettingsOpen(true);
  const handleTerminal = () => {
    if (api?.openTerminal) api.openTerminal();
  };

  return (
    <div className="header">
      {/* LEFT: Provider · Model pill */}
      <ModelSelector />

      {/* CENTER: Spacer */}
      <div className="header-spacer" />

      {/* RIGHT: History + Terminal + Settings + New Chat + Close */}
      <div className="header-actions">
        <SessionHistory />
        
        <button
          className="header-btn"
          onClick={handleTerminal}
          title="Open Terminal"
          aria-label="Open Terminal"
        >
          <TerminalSquare size={14} />
        </button>
        
        <button
          className="header-btn"
          onClick={handleSettings}
          title="Settings"
          aria-label="Open settings"
        >
          <Settings size={14} />
        </button>
        
        <button
          className="header-btn new-chat-btn"
          onClick={handleNewChat}
          title="New Chat"
          aria-label="Start new chat"
        >
          <MessageSquarePlus size={14} />
        </button>
        
        <button
          className="header-btn"
          onClick={handleClose}
          title="Close (Escape)"
          aria-label="Close overlay"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
