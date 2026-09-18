import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Check, Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';
import type { InventoryProvider } from '../../store/overlayStore';
import { getElectronAPI } from '../../hooks/useElectronAPI';

const api = getElectronAPI();

/**
 * ProviderSettings — Professional two-panel provider/model picker.
 *
 * Left:  Filterable provider list grouped by status (Configured / Needs Setup)
 * Right: Searchable model list for the selected provider
 *
 * Clicking a model applies it immediately. No separate 'Apply' button.
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
  const [applying, setApplying] = useState<string | null>(null); // model being applied
  const [refreshing, setRefreshing] = useState(false);

  // Auto-select active provider on mount / when inventory arrives
  useEffect(() => {
    if (!selectedProvider && activeProvider) {
      setSelectedProvider(activeProvider);
    } else if (!selectedProvider && !activeProvider && inventory.length) {
      const cur = inventory.find(p => p.is_current);
      if (cur) setSelectedProvider(cur.slug);
    }
  }, [activeProvider, selectedProvider, inventory]);

  const selectedData = useMemo<InventoryProvider | undefined>(
    () => inventory.find(p => p.slug === selectedProvider),
    [inventory, selectedProvider]
  );

  // ── Filtered / grouped providers ──
  const { configured, needsSetup } = useMemo(() => {
    const q = providerFilter.trim().toLowerCase();
    const list = q
      ? inventory.filter(p =>
          p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
      : inventory;
    return {
      configured: list.filter(p => p.authenticated && p.total_models > 0),
      needsSetup: list.filter(p => !(p.authenticated && p.total_models > 0)),
    };
  }, [inventory, providerFilter]);

  // ── Filtered models for selected provider ──
  const filteredModels = useMemo(() => {
    const models = selectedData?.models || [];
    const q = modelSearch.trim().toLowerCase();
    if (!q) return models;
    return models.filter(m => m.toLowerCase().includes(q));
  }, [selectedData, modelSearch]);

  // ── Handlers ──
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
      console.error('[ProviderSettings] refresh failed', e);
    } finally {
      setRefreshing(false);
      setInventoryLoading(false);
    }
  }, [api, setInventory, setInventoryLoading, setActiveProvider, setActiveModel]);

  const handleSelectProvider = useCallback((slug: string)  => {
    setSelectedProvider(slug);
    setModelSearch('');
  }, []);

  const handleApplyModel = useCallback(async (provider: string, model: string) => {
    if (!provider || !model || applying) return;
    setApplying(model);
    try {
      if (api?.applyProviderModel) {
        const res = await api.applyProviderModel(provider, model);
        if (res?.success) {
          setActiveProvider(res.provider || provider);
          setActiveModel(res.model || model);
        }
      } else if (api?.setProviderAndModel) {
        api.setProviderAndModel(provider, model);
        setActiveProvider(provider);
        setActiveModel(model);
      }
    } catch (e) {
      console.error('[ProviderSettings] apply failed', e);
    } finally {
      setApplying(null);
    }
  }, [api, applying, setActiveProvider, setActiveModel]);

  const handleLaunchAuth = useCallback(async (provider: string) => {
    if (!api?.launchHermesAuth) return;
    await api.launchHermesAuth(provider);
  }, [api]);

  // ── Helpers ──
  const isActiveProvider = (p: InventoryProvider) =>
    p.slug === activeProvider;

  const isActiveModel = (model: string) =>
    model === activeModel && selectedProvider === activeProvider;

  // ── Empty state ──
  if (inventory.length === 0 && !inventoryLoading) {
    return (
      <div className="ps-empty">
        <KeyRound size={28} />
        <p>No providers found</p>
        <span>Ensure Hermes CLI is installed, then refresh.</span>
        <button className="ps-btn ps-btn-primary" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
          Refresh inventory
        </button>
      </div>
    );
  }

  return (
    <div className="ps">
      {/* ── Header ── */}
      <div className="ps-header">
        <div className="ps-header-left">
          <span className="ps-title">Provider & Model</span>
          <span className="ps-subtitle">Switch inference backend</span>
        </div>
        <button
          className="ps-btn ps-btn-ghost ps-btn-icon"
          onClick={handleRefresh}
          disabled={refreshing || inventoryLoading}
          title="Refresh inventory"
        >
          {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      {/* ── Provider filter ── */}
      <div className="ps-filter">
        <Search size={13} className="ps-filter-icon" />
        <input
          type="text"
          placeholder="Filter providers…"
          value={providerFilter}
          onChange={e => setProviderFilter(e.target.value)}
          className="ps-filter-input"
          aria-label="Filter providers"
        />
      </div>

      {/* ── Two-panel grid ── */}
      <div className="ps-grid">

        {/* ── Left: Provider list ── */}
        <div className="ps-panel ps-providers">
          {inventoryLoading && inventory.length === 0 && (
            <div className="ps-loading">
              <Loader2 size={14} className="spin" />
              <span>Loading providers…</span>
            </div>
          )}

          {configured.length > 0 && (
            <ProviderGroup
              heading="Configured"
              providers={configured}
              selectedProvider={selectedProvider}
              activeProvider={activeProvider}
              onSelect={handleSelectProvider}
            />
          )}

          {needsSetup.length > 0 && (
            <ProviderGroup
              heading="Needs Setup"
              providers={needsSetup}
              selectedProvider={selectedProvider}
              activeProvider={activeProvider}
              onSelect={handleSelectProvider}
            />
          )}

          {configured.length === 0 && needsSetup.length === 0 && (
            <div className="ps-no-results">
              <Search size={16} />
              <span>No providers match "{providerFilter}"</span>
            </div>
          )}
        </div>

        {/* ── Right: Model list ── */}
        <div className="ps-panel ps-models">
          {selectedData ? (
            <>
              <div className="ps-models-header">
                <span className="ps-models-title">{selectedData.name}</span>
                <span className="ps-models-count">
                  {selectedData.total_models} model{selectedData.total_models !== 1 ? 's' : ''}
                </span>
              </div>

              {selectedData.warning && (
                <div className="ps-warning">
                  <AlertTriangle size={12} />
                  <span>{selectedData.warning}</span>
                </div>
              )}

              <div className="ps-filter ps-filter-model">
                <Search size={13} className="ps-filter-icon" />
                <input
                  type="text"
                  placeholder={`Search models…`}
                  value={modelSearch}
                  onChange={e => setModelSearch(e.target.value)}
                  className="ps-filter-input"
                  disabled={selectedData.total_models === 0}
                  aria-label="Search models"
                />
              </div>

              {selectedData.total_models === 0 ? (
                <div className="ps-no-models">
                  {selectedData.authenticated ? (
                    <span>No models available</span>
                  ) : (
                    <>
                      <KeyRound size={20} />
                      <span>Requires authentication to list models</span>
                      <button
                        className="ps-btn ps-btn-primary ps-btn-sm"
                        onClick={() => handleLaunchAuth(selectedData.slug)}
                      >
                        <KeyRound size={12} />
                        Configure auth
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="ps-model-list">
                  {filteredModels.length === 0 ? (
                    <div className="ps-no-results ps-no-results-inner">
                      <Search size={14} />
                      <span>No models match "{modelSearch}"</span>
                    </div>
                  ) : (
                    filteredModels.map(model => {
                      const active = isActiveModel(model);
                      const isApplying = applying === model;
                      return (
                        <button
                          key={model}
                          className={`ps-model-row${active ? ' is-active' : ''}`}
                          onClick={() => handleApplyModel(selectedData.slug, model)}
                          disabled={isApplying}
                        >
                          <span className="ps-model-name">{model}</span>
                          {isApplying ? (
                            <Loader2 size={12} className="spin" />
                          ) : active ? (
                            <span className="ps-active-badge">
                              <Check size={11} />
                              Active
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="ps-placeholder">
              <Search size={28} />
              <span>Select a provider to view models</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

interface ProviderGroupProps {
  heading: string;
  providers: InventoryProvider[];
  selectedProvider: string;
  activeProvider: string;
  onSelect: (slug: string) => void;
}

const ProviderGroup: React.FC<ProviderGroupProps> = ({
  heading, providers, selectedProvider, activeProvider, onSelect,
}) => (
  <div className="ps-group">
    <div className="ps-group-header">
      <span className="ps-group-title">{heading}</span>
      <span className="ps-group-count">{providers.length}</span>
    </div>
    <div className="ps-group-list">
      {providers.map(p => {
        const active = p.slug === activeProvider;
        const selected = p.slug === selectedProvider;
        const needsAuth = !p.authenticated && p.auth_type && p.auth_type !== 'none' && p.auth_type !== 'virtual';

        return (
          <button
            key={p.slug}
            className={`ps-provider-row${selected ? ' is-selected' : ''}${active ? ' is-active-provider' : ''}`}
            onClick={() => onSelect(p.slug)}
          >
            <span className="ps-provider-name">{p.name}</span>

            <span className="ps-provider-meta">
              {p.total_models > 0 && (
                <span className="ps-model-count">{p.total_models}</span>
              )}

              {active && (
                <span className="ps-active-dot" title="Currently active" />
              )}

              {needsAuth ? (
                <span className="ps-auth-badge ps-auth-needs" title="Needs authentication">
                  <KeyRound size={10} />
                </span>
              ) : p.authenticated ? (
                <span className="ps-auth-badge ps-auth-ok" title="Configured">
                  <Check size={10} />
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  </div>
);
