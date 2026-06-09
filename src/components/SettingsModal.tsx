import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command, Monitor, Zap, Layout } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import type { ToolMode } from '../store/overlayStore';

const api = (window as any).electronAPI as any;

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen, setSettingsOpen,
    launchAtStartup, setLaunchAtStartup,
    globalHotkey, setGlobalHotkey,
    alwaysOnTop, setAlwaysOnTop,
    opacity, setOpacity,
    toolMode, setToolMode,
    activeProvider, setActiveProvider,
    activeModel, setActiveModel,
    inventory = [],
    localMode, setLocalMode,
    clearSession,
    theme, setTheme,
    fontFamily, setFontFamily,
    smallWindow, setSmallWindow
  } = useOverlayStore();

  const safeGlobalHotkey = globalHotkey || 'CommandOrControl+Alt+H';
  const safeOpacity = opacity ?? 0.96;
  const safeAlwaysOnTop = alwaysOnTop ?? true;
  const safeLaunchAtStartup = launchAtStartup ?? false;
  const safeSmallWindow = smallWindow ?? false;

  const [activeTab, setActiveTab] = useState<'general' | 'hotkey' | 'ai' | 'window'>('general');
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [tempKeys, setTempKeys] = useState<string[]>([]);

  const handleClose = () => setSettingsOpen(false);

  // --- Hotkey Recorder Logic ---
  useEffect(() => {
    if (!recordingHotkey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      const key = e.key;
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        if (!tempKeys.includes(key)) setTempKeys([...tempKeys, key]);
        return;
      }
      
      // Finalize hotkey
      const modifiers = [];
      if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      
      const keyName = key.length === 1 ? key.toUpperCase() : key;
      const finalHotkey = [...modifiers, keyName].join('+');
      
      setGlobalHotkey(finalHotkey);
      setRecordingHotkey(false);
      setTempKeys([]);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [recordingHotkey, tempKeys, setGlobalHotkey]);

  // --- Handlers ---
  const handleClearSessions = async () => {
    if (api?.clearAllSessions) {
      if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
        await api.clearAllSessions();
        clearSession();
        alert('All sessions cleared.');
      }
    }
  };

  const handleResetBounds = () => {
    if (api?.resetBounds) api.resetBounds();
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const prov = e.target.value;
    setActiveProvider(prov);
    const provData = inventory.find(p => p.slug === prov);
    if (provData && provData.models.length > 0) {
      setActiveModel(provData.models[0]);
      if (api?.setProviderAndModel) api.setProviderAndModel(prov, provData.models[0]);
    }
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mod = e.target.value;
    setActiveModel(mod);
    if (api?.setProviderAndModel) api.setProviderAndModel(activeProvider, mod);
  };

  const selectedProviderData = inventory.find(p => p.slug === activeProvider);

  return (
    <AnimatePresence>
      {isSettingsOpen && (
        <motion.div 
          className="settings-overlay" 
          onClick={handleClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', mass: 0.6, stiffness: 280 }}
          >
        <div className="settings-sidebar">
          <div className="settings-sidebar-header">Settings</div>
          <button className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>
            <Monitor size={14} /> General
          </button>
          <button className={`settings-tab ${activeTab === 'hotkey' ? 'active' : ''}`} onClick={() => setActiveTab('hotkey')}>
            <Command size={14} /> Hotkey
          </button>
          <button className={`settings-tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
            <Zap size={14} /> AI Engine
          </button>
          <button className={`settings-tab ${activeTab === 'window' ? 'active' : ''}`} onClick={() => setActiveTab('window')}>
            <Layout size={14} /> Window
          </button>
        </div>

        <div className="settings-content">
          <div className="settings-header">
            <h3>
              {activeTab === 'general' && 'General'}
              {activeTab === 'hotkey' && 'Global Hotkey'}
              {activeTab === 'ai' && 'AI Settings'}
              {activeTab === 'window' && 'Window Preferences'}
            </h3>
            <button className="settings-close-btn" onClick={handleClose}><X size={16} /></button>
          </div>

          <div className="settings-body">
            {activeTab === 'general' && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Launch at Startup</span>
                    <span className="settings-desc">Start Hermes in the background when you log in.</span>
                  </div>
                  <label className="mac-toggle">
                    <input type="checkbox" checked={safeLaunchAtStartup} onChange={(e) => setLaunchAtStartup(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Theme</span>
                    <span className="settings-desc">Match system or force light/dark mode.</span>
                  </div>
                  <select className="mac-select" value={theme || 'system'} onChange={(e) => setTheme(e.target.value as any)}>
                    <option value="system">System</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Font Family</span>
                    <span className="settings-desc">Choose your preferred application font.</span>
                  </div>
                  <select className="mac-select" value={fontFamily || 'system-ui'} onChange={(e) => setFontFamily(e.target.value)}>
                    <option value="system-ui">System Default</option>
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Roboto, sans-serif">Roboto</option>
                    <option value="'JetBrains Mono', monospace">JetBrains Mono</option>
                  </select>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Clear All Sessions</span>
                    <span className="settings-desc">Permanently delete all chat history.</span>
                  </div>
                  <button className="mac-button destructive" onClick={handleClearSessions}>Clear Data</button>
                </div>
              </div>
            )}

            {activeTab === 'hotkey' && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Trigger Hotkey</span>
                    <span className="settings-desc">Show/Hide the overlay instantly from anywhere.</span>
                  </div>
                  <button 
                    className={`mac-button hotkey-btn ${recordingHotkey ? 'recording' : ''}`}
                    onClick={() => setRecordingHotkey(true)}
                  >
                    {recordingHotkey ? (tempKeys.length > 0 ? tempKeys.join('+') + '...' : 'Press keys...') : safeGlobalHotkey.replace('CommandOrControl', 'Ctrl/Cmd')}
                  </button>
                </div>
                {recordingHotkey && <div className="settings-hint">Press your desired key combination (e.g., Ctrl+Shift+A). Escape to cancel.</div>}
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Provider</span>
                    <span className="settings-desc">Select the default AI provider.</span>
                  </div>
                  <select className="mac-select" value={activeProvider} onChange={handleProviderChange}>
                    <option value="">Select Provider...</option>
                    {inventory.map(p => (
                      <option key={p.slug} value={p.slug}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Model</span>
                    <span className="settings-desc">Select the default AI model.</span>
                  </div>
                  <select className="mac-select" value={activeModel} onChange={handleModelChange} disabled={!selectedProviderData || selectedProviderData.models.length === 0}>
                    {selectedProviderData?.models.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    {!selectedProviderData && <option value="">No models</option>}
                  </select>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Default Tool Mode</span>
                    <span className="settings-desc">Which tools the AI can use by default.</span>
                  </div>
                  <div className="mac-segmented-control">
                    <button className={toolMode === 'all' ? 'active' : ''} onClick={() => setToolMode('all')}>All Tools</button>
                    <button className={toolMode === 'terminal' ? 'active' : ''} onClick={() => setToolMode('terminal')}>Terminal Only</button>
                    <button className={toolMode === 'none' ? 'active' : ''} onClick={() => setToolMode('none')}>None</button>
                  </div>
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Local Mode</span>
                    <span className="settings-desc">Prefer local models if available.</span>
                  </div>
                  <label className="mac-toggle">
                    <input type="checkbox" checked={localMode} onChange={(e) => setLocalMode(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === 'window' && (
              <div className="settings-section">
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Compact Mode</span>
                    <span className="settings-desc">Shrink the overlay footprint.</span>
                  </div>
                  <label className="mac-toggle">
                    <input type="checkbox" checked={safeSmallWindow} onChange={(e) => setSmallWindow(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Always on Top</span>
                    <span className="settings-desc">Keep the overlay above other windows.</span>
                  </div>
                  <label className="mac-toggle">
                    <input type="checkbox" checked={safeAlwaysOnTop} onChange={(e) => setAlwaysOnTop(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Opacity: {Math.round(safeOpacity * 100)}%</span>
                    <span className="settings-desc">Adjust the window transparency.</span>
                  </div>
                  <input 
                    type="range" 
                    className="mac-slider" 
                    min="0.6" max="1.0" step="0.01" 
                    value={safeOpacity} 
                    onChange={(e) => setOpacity(parseFloat(e.target.value))} 
                  />
                </div>
                <div className="settings-divider" />
                <div className="settings-row">
                  <div className="settings-label">
                    <span>Reset Window Position</span>
                    <span className="settings-desc">Restore to bottom-right corner.</span>
                  </div>
                  <button className="mac-button" onClick={handleResetBounds}>Reset Position</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
