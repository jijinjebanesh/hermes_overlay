import React, { useState, useEffect, useRef } from 'react';
import { MessageSquarePlus, X, ChevronDown, Check, Zap, Search, Loader2, Settings, TerminalSquare, Clock } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import type { InventoryProvider } from '../store/overlayStore';

/**
 * HEADER — 40px height, 24px horizontal padding.
 *
 * LEFT:   Provider·Model pill → cascading popover
 *         (uses live inventory from hermes_cli.inventory)
 * CENTER: Spacer
 * RIGHT:  New Chat + Close
 *
 * Entire header is drag handle (-webkit-app-region: drag).
 * Interactive elements opt out with no-drag.
 */

const api = (window as any).electronAPI as any;

export const Header: React.FC = () => {
  const {
    activeModel, setActiveModel,
    activeProvider, setActiveProvider,
    inventory, inventoryLoading,
    newSession,
    setInventory, setInventoryLoading,
    setSettingsOpen, hydrateSession,
  } = useOverlayStore();

  const [showPopover, setShowPopover] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [popoverView, setPopoverView] = useState<'providers' | 'models'>('providers');
  const [selectedProvider, setSelectedProvider] = useState<string>(activeProvider);
  const [searchQuery, setSearchQuery] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowPopover(false);
        setPopoverView('providers');
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  // Close history on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHistory]);

  const handleClose = () => api?.closeOverlay();

  const handleNewChat = () => newSession();
  
  const handleSettings = () => setSettingsOpen(true);
  
  const handleTerminal = () => {
    if (api?.openTerminal) api.openTerminal();
  };

  const handleToggleHistory = () => {
    if (showHistory) {
      setShowHistory(false);
    } else {
      setShowHistory(true);
      setShowPopover(false);
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
  };

  const handleSelectSession = async (sessionId: string) => {
    if (!api?.getSession) return;
    setSessionsLoading(true);
    try {
      const messages = await api.getSession(sessionId);
      hydrateSession(sessionId, messages);
      setShowHistory(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleRefreshInventory = () => {
    if (!api?.getInventory) return;
    setInventoryLoading(true);
    api.getInventory()
      .then((payload: any) => {
        if (payload?.providers) setInventory(payload.providers);
      })
      .catch(() => {})
      .finally(() => setInventoryLoading(false));
  };

  const handleTogglePopover = () => {
    if (showPopover) {
      setShowPopover(false);
      setPopoverView('providers');
      setSearchQuery('');
    } else {
      setShowPopover(true);
      setShowHistory(false);
      setPopoverView('providers');
      setSelectedProvider(activeProvider);
      setSearchQuery('');
    }
  };

  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setPopoverView('models');
    setSearchQuery('');
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleSelectModel = (model: string) => {
    setActiveModel(model);
    setActiveProvider(selectedProvider);
    setShowPopover(false);
    setPopoverView('providers');
    setSearchQuery('');
    api?.setProviderAndModel(selectedProvider, model);
  };

  const handleBackToProviders = () => {
    setPopoverView('providers');
    setSearchQuery('');
  };

  // Split inventory into authenticated vs unconfigured
  const authenticated = inventory.filter(p => p.authenticated && p.models.length > 0);
  const unconfigured = inventory.filter(p => !p.authenticated || p.models.length === 0);

  // Get selected provider's data
  const selectedProviderData = inventory.find(p => p.slug === selectedProvider);
  const allModels = selectedProviderData?.models || [];
  const filteredModels = searchQuery.trim()
    ? allModels.filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()))
    : allModels;
  const hasExactMatch = filteredModels.some(m => m.toLowerCase() === searchQuery.toLowerCase());

  // Display text for pill
  const providerData = inventory.find(p => p.slug === activeProvider);
  const providerLabel = providerData?.name || activeProvider || 'Select';
  const modelShort = activeModel
    ? (activeModel.includes('/') ? activeModel.split('/').pop()! : activeModel)
    : 'No model';
  const displayModel = modelShort.length > 18 ? modelShort.substring(0, 18) + '…' : modelShort;

  return (
    <div className="header">
      {/* LEFT: Provider · Model pill */}
      <div ref={popoverRef} className="header-no-drag" style={{ position: 'relative' }}>
        <button
          className="model-pill"
          onClick={handleTogglePopover}
          aria-haspopup="listbox"
          aria-expanded={showPopover}
        >
          <span className="model-pill-provider">{providerLabel}</span>
          <span className="model-pill-separator">·</span>
          <span className="model-pill-model">{displayModel}</span>
          {inventoryLoading ? (
            <Loader2 size={10} className="model-pill-chevron spin" />
          ) : (
            <ChevronDown size={10} className={`model-pill-chevron ${showPopover ? 'open' : ''}`} />
          )}
        </button>

        {showPopover && (
          <div className="model-popover" role="listbox">
            {/* ── PROVIDER VIEW ── */}
            {popoverView === 'providers' && (
              <>
                <div className="popover-section-label">
                  <Zap size={10} />
                  <span>Select Provider</span>
                  <button
                    className="popover-refresh-btn"
                    onClick={handleRefreshInventory}
                    title="Refresh model list"
                  >
                    ↻
                  </button>
                </div>

                <div className="model-list-scroll">
                  {authenticated.length > 0 && (
                    <>
                      <div className="popover-group-label">
                        Configured ({authenticated.length})
                      </div>
                      {authenticated.map((p) => (
                        <button
                          key={p.slug}
                          className={`model-popover-item provider-item${p.slug === activeProvider ? ' active' : ''}`}
                          onClick={() => handleSelectProvider(p.slug)}
                          role="option"
                          aria-selected={p.slug === activeProvider}
                        >
                          <span className="provider-item-label">{p.name}</span>
                          <span className="provider-item-models">
                            {p.models.length} model{p.models.length !== 1 ? 's' : ''}
                          </span>
                          {p.slug === activeProvider && (
                            <Check size={12} className="provider-check" />
                          )}
                        </button>
                      ))}
                    </>
                  )}

                  {unconfigured.length > 0 && (
                    <>
                      <div className="popover-group-label">
                        Available ({unconfigured.length})
                      </div>
                      {unconfigured.map((p) => (
                        <button
                          key={p.slug}
                          className="model-popover-item provider-item unconfigured"
                          onClick={() => handleSelectProvider(p.slug)}
                          role="option"
                        >
                          <span className="provider-item-label">{p.name}</span>
                          <span className="provider-item-hint">
                            {p.warning ? p.warning.replace('paste ', '').replace(' to activate', '') : 'no key'}
                          </span>
                        </button>
                      ))}
                    </>
                  )}

                  {inventory.length === 0 && !inventoryLoading && (
                    <div className="popover-empty">
                      No providers found. Run<br /><code>hermes model</code> to configure.
                    </div>
                  )}

                  {inventoryLoading && (
                    <div className="popover-empty">
                      <Loader2 size={14} className="spin" style={{ display: 'inline-block', marginRight: 6 }} />
                      Loading providers…
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── MODEL VIEW ── */}
            {popoverView === 'models' && (
              <>
                <button className="popover-back-btn" onClick={handleBackToProviders}>
                  ← {selectedProviderData?.name || selectedProvider}
                </button>

                <div className="popover-search-container">
                  <Search size={12} className="popover-search-icon" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="popover-search-input"
                    placeholder={`Search ${allModels.length} model${allModels.length !== 1 ? 's' : ''}…`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchQuery.trim() && !hasExactMatch) {
                        handleSelectModel(searchQuery.trim());
                      }
                    }}
                  />
                </div>

                <div className="model-list-scroll">
                  {filteredModels.map((m) => (
                    <button
                      key={m}
                      className={`model-popover-item model-item${m === activeModel && selectedProvider === activeProvider ? ' active' : ''}`}
                      onClick={() => handleSelectModel(m)}
                      role="option"
                      aria-selected={m === activeModel}
                    >
                      <span className="model-item-name">{m}</span>
                      {m === activeModel && selectedProvider === activeProvider && (
                        <Check size={12} className="provider-check" />
                      )}
                    </button>
                  ))}

                  {searchQuery.trim() && !hasExactMatch && (
                    <button
                      className="model-popover-item model-item custom-model"
                      onClick={() => handleSelectModel(searchQuery.trim())}
                      role="option"
                    >
                      <span className="model-item-name">Use "{searchQuery.trim()}"</span>
                    </button>
                  )}

                  {allModels.length === 0 && (
                    <div className="popover-empty">
                      {selectedProviderData?.warning || 'No models available. Configure the provider first.'}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* CENTER: Spacer */}
      <div className="header-spacer" />

      {/* RIGHT: History + Terminal + Settings + New Chat + Close */}
      <div className="header-actions">
        <div ref={historyRef} style={{ position: 'relative' }}>
          <button
            className={`header-btn ${showHistory ? 'active' : ''}`}
            onClick={handleToggleHistory}
            title="History"
            aria-label="View past sessions"
          >
            <Clock size={14} />
          </button>
          
          {showHistory && (
            <div className="model-popover" style={{ right: -128, left: 'auto', top: 32, width: 280 }} role="listbox">
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
            </div>
          )}
        </div>
        
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
