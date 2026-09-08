import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Search, ChevronRight, Check, AlertTriangle, Loader2, KeyRound, Zap, ExternalLink, Info, HelpCircle } from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';
import type { InventoryProvider } from '../../store/overlayStore';
import { getElectronAPI } from '../../hooks/useElectronAPI';

const api = getElectronAPI();

/**
 * ProviderSettings — Professional provider/model configuration surface.
 * 
 * Key UX improvements:
 * - Clear three-state distinction: ACTIVE (applied) vs SELECTED (preview) vs AVAILABLE
 * - Prominent apply action with preview of what will change
 * - Keyboard shortcuts hint (Enter to apply, Escape to cancel)
 * - Auth status as visual badges with tooltips
 * - Better loading/empty/error states
 * - Inline help for OAuth/device-code flows
 */
export const ProviderSettings: React.FC = () => {
  const {
    activeProvider, setActiveProvider,
    activeModel, setActiveModel,
    inventory, setInventory,
    inventoryLoading, setInventoryLoading,
  } = useOverlayStore();

  const [selectedProvider, setSelectedProvider] = useState<string>(activeProvider || '');
  const [providerFilter, setProviderFilter] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showKeyboardHints, setShowKeyboardHints] = useState(false);
  
  const modelSearchRef = useRef<HTMLInputElement>(null);
  const providerFilterRef = useRef<HTMLInputElement>(null);

  // Auto-select active provider if none chosen yet
  useEffect(() => {
    if (!selectedProvider && activeProvider) setSelectedProvider(activeProvider);
    if (!selectedProvider && !activeProvider && inventory.length) {
      const cur = inventory.find(p => p.is_current);
      if (cur) setSelectedProvider(cur.slug);
    }
  }, [activeProvider, selectedProvider, inventory]);

  const selectedData = useMemo<InventoryProvider | undefined>(
    () => inventory.find(p => p.slug === selectedProvider),
    [inventory, selectedProvider]
  );

  // Filtered providers (group: configured first, then needs-config)
  const filtered = useMemo(() => {
    const q = providerFilter.trim().toLowerCase();
    const list = q
      ? inventory.filter(p =>
          p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
      : inventory;
    const configured = list.filter(p => p.authenticated && p.total_models > 0);
    const available = list.filter(p => !(p.authenticated && p.total_models > 0));
    return { configured, available };
  }, [inventory, providerFilter]);

  const models = selectedData?.models || [];
  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return models;
    return models.filter(m => m.toLowerCase().includes(q));
  }, [models, modelSearch]);
  const hasExactModel = filteredModels.some(m => m.toLowerCase() === modelSearch.trim().toLowerCase());

  // Auth-type → human label + icon
  const authInfo = (p: InventoryProvider): { label: string; icon: React.ReactNode; variant: 'configured' | 'needs-key' | 'oauth' | 'cli' | 'none' } => {
    if (p.authenticated && p.total_models > 0) return { label: 'Configured', icon: <Check size={10} />, variant: 'configured' };
    if (!p.auth_type) return { label: 'No auth needed', icon: <Check size={10} />, variant: 'none' };
    if (p.auth_type === 'api_key') return { label: p.key_env ? `Needs ${p.key_env}` : 'Needs API key', icon: <KeyRound size={10} />, variant: 'needs-key' };
    if (p.auth_type?.startsWith('oauth')) return { label: p.auth_type.replace('oauth_', 'OAuth ').replace('_', ' '), icon: <ExternalLink size={10} />, variant: 'oauth' };
    if (p.auth_type === 'external_process') return { label: 'External CLI', icon: <ExternalLink size={10} />, variant: 'cli' };
    if (p.auth_type === 'aws_sdk') return { label: 'AWS SDK creds', icon: <KeyRound size={10} />, variant: 'needs-key' };
    if (p.auth_type === 'virtual') return { label: 'Aggregator', icon: <Zap size={10} />, variant: 'none' };
    return { label: p.auth_type, icon: <HelpCircle size={10} />, variant: 'none' };
  };

  const canAuth = (p: InventoryProvider): boolean => {
    if (p.auth_type === 'virtual' || p.auth_type === 'none') return false;
    return !!p.auth_type || !!p.key_env || p.authenticated;
  };

  const handleRefresh = useCallback(async () => {
    if (!api?.getInventory) return;
    setRefreshing(true);
    setInventoryLoading(true);
    try {
      const payload = await api.getInventory({ refresh: true });
      if (payload?.providers) {
        setInventory(payload.providers);
        if (payload.provider) setActiveProvider(payload.provider);
        if (payload.model) setActiveModel(payload.model);
      }
    } catch (e) {
      console.error('inventory refresh failed', e);
    } finally {
      setRefreshing(false);
      setInventoryLoading(false);
    }
  }, [setInventory, setInventoryLoading, setActiveProvider, setActiveModel]);

  const handleSelectProvider = useCallback((slug: string) => {
    setSelectedProvider(slug);
    setModelSearch('');
    setApplyResult(null);
    setTimeout(() => modelSearchRef.current?.focus(), 50);
  }, []);

  const handleApply = useCallback(async (provider: string, model: string) => {
    if (!provider || !model) return;
    setApplying(true);
    setApplyResult(null);
    try {
      if (api?.applyProviderModel) {
        const res = await api.applyProviderModel(provider, model);
        if (res?.success) {
          setActiveProvider(res.provider || provider);
          setActiveModel(res.model || model);
          setApplyResult({ ok: true, msg: `Applied: ${res.provider || provider} / ${res.model || model}` });
        } else {
          setApplyResult({ ok: false, msg: res?.error || 'Unknown error' });
        }
      } else if (api?.setProviderAndModel) {
        api.setProviderAndModel(provider, model);
        setActiveProvider(provider);
        setActiveModel(model);
        setApplyResult({ ok: true, msg: `Applied: ${provider} / ${model}` });
      } else {
        setApplyResult({ ok: false, msg: 'No apply API available' });
      }
    } catch (e: any) {
      setApplyResult({ ok: false, msg: e?.message || String(e) });
    } finally {
      setApplying(false);
      setTimeout(() => setApplyResult(null), 5000);
    }
  }, [setActiveProvider, setActiveModel]);

  const handleLaunchAuth = useCallback(async (provider: string) => {
    if (!api?.launchHermesAuth) return;
    const res = await api.launchHermesAuth(provider);
    if (!res?.success) {
      setApplyResult({ ok: false, msg: res?.error || 'Failed to launch auth' });
    } else {
      setApplyResult({ ok: true, msg: `Opened terminal for ${provider} auth — complete the flow, then click Refresh.` });
    }
    setTimeout(() => setApplyResult(null), 7000);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setProviderFilter('');
      setModelSearch('');
      setApplyResult(null);
      providerFilterRef.current?.focus();
    }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setShowKeyboardHints(prev => !prev);
    }
  }, []);

  // Determine what will be applied
  const willApplyProvider = selectedData?.slug;
  const willApplyModel = modelSearch.trim() || activeModel;
  const isCurrentSelection = willApplyProvider === activeProvider && willApplyModel === activeModel;
  const hasChanges = Boolean(willApplyProvider && willApplyModel && !isCurrentSelection);

  if (inventory.length === 0 && !inventoryLoading) {
    return (
      <div className="provider-settings-empty" onKeyDown={handleKeyDown}>
        <div className="provider-settings-empty-icon">
          <Zap size={32} />
        </div>
        <h3 className="provider-settings-empty-title">No providers found</h3>
        <p className="provider-settings-empty-desc">
          Make sure Hermes CLI is installed and configured, then refresh.
        </p>
        <button className="btn btn-primary" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          Refresh inventory
        </button>
        <KeyboardHints />
      </div>
    );
  }

  return (
    <div className="provider-settings" onKeyDown={handleKeyDown}>
      {/* Toolbar */}
      <div className="provider-settings-toolbar">
        <div className="provider-settings-toolbar-left">
          <span className="provider-settings-toolbar-title">
            <Zap size={14} /> Provider & Model
          </span>
          <span className="provider-settings-toolbar-subtitle">
            Switch inference backend — same as <code>hermes model</code> in terminal
          </span>
        </div>
        <div className="provider-settings-toolbar-right">
          {showKeyboardHints && (
            <KeyboardHints />
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowKeyboardHints(!showKeyboardHints)}
            title="Keyboard shortcuts"
          >
            <HelpCircle size={14} />
            <span className="btn-text-hidden">Shortcuts</span>
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleRefresh}
            disabled={refreshing || inventoryLoading}
            title="Re-fetch live model lists from all providers (clears cache)"
          >
            {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            <span className="btn-text-hidden">Refresh</span>
          </button>
        </div>
      </div>

      {/* Search/Filter bar */}
      <div className="provider-settings-searchbar">
        <div className="provider-settings-search">
          <Search size={14} className="provider-settings-search-icon" />
          <input
            ref={providerFilterRef}
            type="text"
            placeholder="Filter providers…"
            value={providerFilter}
            onChange={e => setProviderFilter(e.target.value)}
            aria-label="Filter providers"
          />
        </div>
        {selectedData && (
          <div className="provider-settings-search">
            <Search size={14} className="provider-settings-search-icon" />
            <input
              ref={modelSearchRef}
              type="text"
              placeholder={`Search ${models.length} models… (Enter to apply)`}
              value={modelSearch}
              onChange={e => setModelSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && selectedData) {
                  const q = modelSearch.trim();
                  if (!q) return;
                  const exact = models.find(m => m.toLowerCase() === q.toLowerCase());
                  handleApply(selectedData.slug, exact || q);
                }
              }}
              disabled={models.length === 0}
              aria-label="Search models"
            />
          </div>
        )}
      </div>

      {/* Main content grid */}
      <div className="provider-settings-grid">
        {/* Provider column */}
        <div className="provider-settings-col provider-settings-col-providers">
          <div className="provider-settings-col-header">
            <span className="provider-settings-col-title">Providers</span>
            <span className="provider-settings-col-count">{inventory.length} total</span>
          </div>

          {inventoryLoading && inventory.length === 0 && (
            <div className="provider-settings-loading">
              <Loader2 size={16} className="spin" />
              <span>Loading providers…</span>
            </div>
          )}

          {filtered.configured.length > 0 && (
            <ProviderGroup
              title="Configured & Ready"
              subtitle={`${filtered.configured.length} provider${filtered.configured.length !== 1 ? 's' : ''} with models loaded`}
              items={filtered.configured}
              activeProvider={selectedProvider}
              currentProvider={activeProvider}
              onSelect={handleSelectProvider}
              showAuthBadge={true}
            />
          )}

          {filtered.available.length > 0 && (
            <ProviderGroup
              title="Available (Needs Setup)"
              subtitle={`${filtered.available.length} provider${filtered.available.length !== 1 ? 's' : ''} requiring authentication`}
              items={filtered.available}
              activeProvider={selectedProvider}
              currentProvider={activeProvider}
              onSelect={handleSelectProvider}
              showAuthBadge={true}
            />
          )}

          {(filtered.configured.length === 0 && filtered.available.length === 0) && (
            <div className="provider-settings-empty-state">
              <Search size={20} />
              <p>No providers match &ldquo;{providerFilter}&rdquo;</p>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="provider-settings-divider" />

        {/* Model column */}
        <div className="provider-settings-col provider-settings-col-models">
          {selectedData ? (
            <>
              <div className="provider-settings-col-header">
                <span className="provider-settings-col-title">
                  <ChevronRight size={12} /> {selectedData.name}
                </span>
                <AuthBadge provider={selectedData} />
              </div>

              {selectedData.warning && (
                <div className="provider-settings-warning" title={selectedData.warning}>
                  <AlertTriangle size={12} />
                  <span>{selectedData.warning}</span>
                </div>
              )}

              <div className="provider-settings-models">
                {models.length === 0 ? (
                  <div className="provider-settings-empty-state">
                    {canAuth(selectedData) && !selectedData.authenticated ? (
                      <>
                        <KeyRound size={24} />
                        <p>Requires authentication to load models</p>
                        <button className="btn btn-sm btn-primary" onClick={() => handleLaunchAuth(selectedData.slug)}>
                          <KeyRound size={12} /> Configure auth…
                        </button>
                      </>
                    ) : (
                      <>
                        <Info size={24} />
                        <p>{selectedData.warning || 'No models available for this provider'}</p>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    <ModelList
                      models={filteredModels}
                      activeModel={activeModel}
                      activeProvider={activeProvider}
                      selectedProvider={selectedData.slug}
                      applying={applying}
                      onApply={handleApply}
                      showCustomOption={!!(modelSearch.trim() && !hasExactModel)}
                      customModelName={modelSearch.trim()}
                    />
                    {modelSearch.trim() && !hasExactModel && (
                      <div className="provider-settings-custom-option">
                        <button
                          className="provider-settings-custom-btn"
                          onClick={() => selectedData && handleApply(selectedData.slug, modelSearch.trim())}
                          disabled={applying}
                        >
                          <Info size={12} />
                          <span>Use custom model: &ldquo;{modelSearch.trim()}&rdquo;</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Apply preview bar */}
              <ApplyPreviewBar
                provider={willApplyProvider}
                model={willApplyModel}
                activeProvider={activeProvider}
                activeModel={activeModel}
                hasChanges={hasChanges}
                applying={applying}
                onApply={() => willApplyProvider && willApplyModel && handleApply(willApplyProvider, willApplyModel)}
                onAuth={() => selectedData && canAuth(selectedData) && handleLaunchAuth(selectedData.slug)}
                canAuth={selectedData && canAuth(selectedData)}
              />
            </>
          ) : (
            <div className="provider-settings-placeholder">
              <ChevronRight size={48} className="provider-settings-placeholder-icon" />
              <h3 className="provider-settings-placeholder-title">Select a provider</h3>
              <p className="provider-settings-placeholder-desc">
                Choose a provider from the left to see available models
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Toast notification */}
      {applyResult && (
        <div className={`provider-settings-toast ${applyResult.ok ? 'ok' : 'err'}`} role="status" aria-live="polite">
          {applyResult.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
          <span>{applyResult.msg}</span>
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ───

interface ProviderGroupProps {
  title: string;
  subtitle: string;
  items: InventoryProvider[];
  activeProvider: string;
  currentProvider: string;
  onSelect: (slug: string) => void;
  showAuthBadge: boolean;
}

const ProviderGroup: React.FC<ProviderGroupProps> = ({ title, subtitle, items, activeProvider, currentProvider, onSelect, showAuthBadge }) => (
  <div className="provider-settings-group">
    <div className="provider-settings-group-header">
      <span className="provider-settings-group-title">{title}</span>
      <span className="provider-settings-group-subtitle">{subtitle}</span>
    </div>
    <div className="provider-settings-group-list">
      {items.map(p => {
        const info = authInfo(p);
        return (
          <button
            key={p.slug}
            className={`provider-settings-row${p.slug === activeProvider ? ' active' : ''}${!p.authenticated ? ' unconfigured' : ''}`}
            onClick={() => onSelect(p.slug)}
            title={`${p.name} — ${info.label}`}
          >
            <span className="provider-settings-row-name">{p.name}</span>
            <span className="provider-settings-row-meta">
              {p.total_models > 0 ? `${p.total_models} model${p.total_models !== 1 ? 's' : ''}` : '—'}
            </span>
            {showAuthBadge && (
              <span className={`provider-settings-auth-badge ${info.variant}`}>
                {info.icon}
              </span>
            )}
            {p.slug === currentProvider && (
              <span className="provider-settings-current-badge" title="Currently active">
                <span className="provider-settings-current-dot" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

interface AuthBadgeProps {
  provider: InventoryProvider;
}

const AuthBadge: React.FC<AuthBadgeProps> = ({ provider }) => {
  const info = authInfo(provider);
  return (
    <span className={`provider-settings-auth-badge-large ${info.variant}`} title={info.label}>
      {info.icon}
      <span className="provider-settings-auth-badge-text">{info.label}</span>
    </span>
  );
};

interface ModelListProps {
  models: string[];
  activeModel: string;
  activeProvider: string;
  selectedProvider: string;
  applying: boolean;
  onApply: (provider: string, model: string) => void;
  showCustomOption: boolean;
  customModelName: string;
}

const ModelList: React.FC<ModelListProps> = ({ models, activeModel, activeProvider, selectedProvider, applying, onApply, showCustomOption, customModelName }) => (
  <div className="provider-settings-model-list">
    {models.map(m => (
      <button
        key={m}
        className={`provider-settings-model-row${m === activeModel && selectedProvider === activeProvider ? ' active' : ''}`}
        onClick={() => onApply(selectedProvider, m)}
        disabled={applying}
      >
        <span className="provider-settings-model-name">{m}</span>
        {m === activeModel && selectedProvider === activeProvider && (
          <Check size={13} className="provider-settings-model-check" />
        )}
      </button>
    ))}
  </div>
);

interface ApplyPreviewBarProps {
  provider: string | undefined;
  model: string | undefined;
  activeProvider: string;
  activeModel: string;
  hasChanges: boolean;
  applying: boolean;
  onApply: () => void;
  onAuth: () => void;
  canAuth: boolean;
}

const ApplyPreviewBar: React.FC<ApplyPreviewBarProps> = ({ provider, model, activeProvider, activeModel, hasChanges, applying, onApply, onAuth, canAuth }) => {
  const isSame = provider === activeProvider && model === activeModel;
  
  return (
    <div className="provider-settings-apply-bar">
      <div className="provider-settings-apply-preview">
        <span className="provider-settings-apply-label">Will apply:</span>
        <span className="provider-settings-apply-provider">{provider || '—'}</span>
        <span className="provider-settings-apply-separator">/</span>
        <span className="provider-settings-apply-model">{model || '—'}</span>
        {isSame && <span className="provider-settings-apply-same">(no change)</span>}
      </div>
      <div className="provider-settings-apply-actions">
        {canAuth && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onAuth}
            disabled={applying}
          >
            <KeyRound size={12} /> Auth…
          </button>
        )}
        <button
          className={`btn btn-primary btn-sm ${!hasChanges && !isSame ? 'btn-disabled' : ''}`}
          onClick={onApply}
          disabled={applying || !provider || !model}
        >
          {applying ? (
            <>
              <Loader2 size={12} className="spin" />
              Applying…
            </>
          ) : hasChanges ? (
            <>
              <Check size={12} />
              Apply Changes
            </>
          ) : (
            <>
              <Check size={12} />
              Already Active
            </>
          )}
        </button>
      </div>
    </div>
  );
};

const KeyboardHints: React.FC = () => (
  <div className="provider-settings-keyboard-hints">
    <span className="hint"><kbd>Enter</kbd> Apply</span>
    <span className="hint"><kbd>Esc</kbd> Clear filters</span>
    <span className="hint"><kbd>?</kbd> Toggle hints</span>
  </div>
);

function authInfo(p: InventoryProvider): { label: string; icon: React.ReactNode; variant: 'configured' | 'needs-key' | 'oauth' | 'cli' | 'none' } {
  if (p.authenticated && p.total_models > 0) return { label: 'Configured', icon: <Check size={10} />, variant: 'configured' };
  if (!p.auth_type) return { label: 'No auth needed', icon: <Check size={10} />, variant: 'none' };
  if (p.auth_type === 'api_key') return { label: p.key_env ? `Needs ${p.key_env}` : 'Needs API key', icon: <KeyRound size={10} />, variant: 'needs-key' };
  if (p.auth_type?.startsWith('oauth')) return { label: p.auth_type.replace('oauth_', 'OAuth ').replace('_', ' '), icon: <ExternalLink size={10} />, variant: 'oauth' };
  if (p.auth_type === 'external_process') return { label: 'External CLI', icon: <ExternalLink size={10} />, variant: 'cli' };
  if (p.auth_type === 'aws_sdk') return { label: 'AWS SDK creds', icon: <KeyRound size={10} />, variant: 'needs-key' };
  if (p.auth_type === 'virtual') return { label: 'Aggregator', icon: <Zap size={10} />, variant: 'none' };
  return { label: p.auth_type, icon: <HelpCircle size={10} />, variant: 'none' };
}