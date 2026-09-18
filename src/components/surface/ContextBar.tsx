import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  MoreHorizontal, Plus, X, Settings, TerminalSquare, Zap,
  Maximize2, Minimize2, History, ChevronDown, RefreshCw, Check
} from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';
import { getElectronAPI } from '../../hooks/useElectronAPI';
import type { InventoryProvider } from '../../store/overlayStore';

const api = getElectronAPI();

interface ContextBarProps {
  onMoreClick?: () => void;
  onNewSession?: () => void;
  onToggleHistory?: () => void;
  showNewButton?: boolean;
}

/**
 * ContextBar — Model pill with hover-expand actions.
 *
 * Default: compact pill with just the ⋮ button.
 * On hover: expands left to reveal model name + action buttons.
 * Clicking the model name shows a dropdown of models from current provider.
 */
export const ContextBar: React.FC<ContextBarProps> = ({
  onMoreClick,
  onNewSession,
  onToggleHistory,
  showNewButton = true,
}) => {
  const {
    activeModel, activeProvider,
    streamState, setSettingsOpen, backgroundTasks, smallWindow, setSmallWindow,
    inventory, setInventory, inventoryLoading, setInventoryLoading,
    setActiveModel, setActiveProvider,
  } = useOverlayStore();

  const isStreaming = streamState.isStreaming;

  const [isHovered, setIsHovered] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const runningTasks = backgroundTasks.filter((t: any) => t.status === 'running');
  const hasRunning = runningTasks.length > 0;

  // Get current provider data
  const currentProviderData = useMemo<InventoryProvider | undefined>(() =>
    inventory.find(p => p.slug === activeProvider),
    [inventory, activeProvider]
  );

  // All models from current provider
  const providerModels = useMemo(() => {
    if (!currentProviderData?.models) return [];
    return currentProviderData.models;
  }, [currentProviderData]);

  // Apply model change
  const handleApplyModel = useCallback(async (model: string) => {
    if (!activeProvider || !model || applying) return;
    if (model === activeModel) {
      setModelDropdownOpen(false);
      return;
    }
    setApplying(model);
    try {
      if (api?.applyProviderModel) {
        const res = await api.applyProviderModel(activeProvider, model);
        if (res?.success) {
          setActiveProvider(res.provider || activeProvider);
          setActiveModel(res.model || model);
        }
      } else if (api?.setProviderAndModel) {
        api.setProviderAndModel(activeProvider, model);
        setActiveModel(model);
      }
    } catch (e) {
      console.error('[ContextBar] apply model failed', e);
    } finally {
      setApplying(null);
      setModelDropdownOpen(false);
    }
  }, [activeProvider, activeModel, applying, api, setActiveModel, setActiveProvider]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelDropdownOpen]);

  const handleClose = () => api?.closeOverlay();
  const handleTerminal = () => api?.openTerminal?.();

  return (
    <div className="context-bar context-bar--compact">
      {/* Expandable model pill */}
      <div
        className={`model-pill ${isHovered ? 'expanded' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          if (!modelDropdownOpen) setIsHovered(false);
        }}
      >
        {/* Always-visible: ⋮ button */}
        <button
          className="model-pill-dot-btn"
          onClick={() => setIsHovered(!isHovered)}
          title="More actions"
        >
          <MoreHorizontal size={14} />
        </button>

        {/* Expanded content (visible on hover) */}
        <div className="model-pill-expanded">
          {/* Model selector */}
          <div className="model-pill-selector" ref={dropdownRef}>
            <button
              className="model-pill-name"
              onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
              title={`Change model (${activeProvider})`}
            >
              <span className={`model-dot-indicator ${isStreaming ? 'streaming' : ''}`} />
              <span className="model-pill-label">{activeModel || 'No model'}</span>
              <ChevronDown size={12} className={`model-pill-chevron ${modelDropdownOpen ? 'open' : ''}`} />
            </button>

            {/* Model dropdown */}
            {modelDropdownOpen && (
              <div className="model-dropdown">
                <div className="model-dropdown-header">
                  <span>{activeProvider || 'Select model'}</span>
                </div>
                <div className="model-dropdown-list">
                  {providerModels.length === 0 ? (
                    <div className="model-dropdown-empty">
                      <span>No models available</span>
                      <button
                        className="model-dropdown-refresh"
                        onClick={async () => {
                          if (api?.getInventory) {
                            const payload = await api.getInventory({ refresh: true });
                            if (payload?.providers) setInventory(payload.providers);
                          }
                        }}
                      >
                        <RefreshCw size={12} /> Refresh
                      </button>
                    </div>
                  ) : (
                    providerModels.map(model => (
                      <button
                        key={model}
                        className={`model-dropdown-item${model === activeModel ? ' active' : ''}${applying === model ? ' applying' : ''}`}
                        onClick={() => handleApplyModel(model)}
                        disabled={applying === model}
                      >
                        <span className="model-dropdown-item-name">{model}</span>
                        {model === activeModel && <Check size={12} className="model-dropdown-item-check" />}
                        {applying === model && <span className="model-dropdown-item-spinner" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons (visible on hover) */}
          <div className="model-pill-actions">
            {showNewButton && (
              <button className="context-bar-btn" onClick={onNewSession} title="New chat (Ctrl+N)">
                <Plus size={14} />
              </button>
            )}
            <button className="context-bar-btn" onClick={onToggleHistory} title="Chat history (Ctrl+H)">
              <History size={14} />
            </button>
            <button className="context-bar-btn" onClick={handleTerminal} title="Terminal">
              <TerminalSquare size={14} />
            </button>
            <button className="context-bar-btn" onClick={() => setSmallWindow(!smallWindow)} title={smallWindow ? 'Normal view' : 'Compact view'}>
              {smallWindow ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <button className="context-bar-btn" onClick={() => setSettingsOpen(true)} title="Settings">
              <Settings size={14} />
            </button>
            <button className="context-bar-btn" onClick={onMoreClick} title="Command palette">
              <Zap size={14} />
            </button>
            <button className="context-bar-btn context-bar-btn--danger" onClick={handleClose} title="Close">
              <X size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Background task indicator */}
      {hasRunning && (
        <span className="bg-task-indicator" title={`${runningTasks.length} task(s) running`}>
          <Zap size={10} />
          <span>{runningTasks.length}</span>
        </span>
      )}
    </div>
  );
};
