import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command, Monitor, Zap, Layout, Mic, Brain } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import { GeneralSettings } from './settings/GeneralSettings';
import { HotkeySettings } from './settings/HotkeySettings';
import { AISettings } from './settings/AISettings';
import { WindowSettings } from './settings/WindowSettings';
import { EchoSettings } from './settings/EchoSettings';
import { MemorySettings } from './settings/MemorySettings';

const SETTINGS_TABS = [
  { id: 'general', label: 'General', description: 'Appearance and startup', icon: Monitor },
  { id: 'hotkey', label: 'Hotkey', description: 'Global activation', icon: Command },
  { id: 'ai', label: 'AI Engine', description: 'Provider, model, tools', icon: Zap },
  { id: 'memory', label: 'Memory', description: 'Persistent memory & profile', icon: Brain },
  { id: 'window', label: 'Window', description: 'Overlay behavior', icon: Layout },
  { id: 'echo', label: 'Echo Mode', description: 'Voice interaction', icon: Mic },
] as const;

type SettingsTab = typeof SETTINGS_TABS[number]['id'];

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen } = useOverlayStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const activeMeta = SETTINGS_TABS.find((tab) => tab.id === activeTab) || SETTINGS_TABS[0];

  const handleClose = () => setSettingsOpen(false);

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
              <div className="settings-sidebar-header">
                <span>Hermes</span>
                <span className="settings-sidebar-sub">Preferences</span>
              </div>

              {SETTINGS_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className="settings-tab-icon"><Icon size={15} strokeWidth={1.5} /></span>
                    <span className="settings-tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="settings-content">
              <div className="settings-header">
                <div className="settings-heading-copy">
                  <span className="settings-kicker">Preferences</span>
                  <h3>{activeMeta.label}</h3>
                  <p>{activeMeta.description}</p>
                </div>
                <button className="settings-close-btn" onClick={handleClose} aria-label="Close settings"><X size={16} /></button>
              </div>

              <div className="settings-body">
                {activeTab === 'general' && <GeneralSettings />}
                {activeTab === 'hotkey' && <HotkeySettings />}
                {activeTab === 'ai' && <AISettings />}
                {activeTab === 'memory' && <MemorySettings />}
                {activeTab === 'window' && <WindowSettings />}
                {activeTab === 'echo' && <EchoSettings />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};