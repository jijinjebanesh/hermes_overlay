import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command, Monitor, Zap, Layout, Mic, Brain, ChevronLeft, ChevronRight } from 'lucide-react';
import { useOverlayStore } from '../store/overlayStore';
import { GeneralSettings } from './settings/GeneralSettings';
import { HotkeySettings } from './settings/HotkeySettings';
import { AISettings } from './settings/AISettings';
import { WindowSettings } from './settings/WindowSettings';
import { EchoSettings } from './settings/EchoSettings';
import { MemorySettings } from './settings/MemorySettings';
import { GuideSettings } from './settings/GuideSettings';
import { HelpCircle } from 'lucide-react';

const SETTINGS_TABS = [
  { id: 'general', label: 'General', description: 'Appearance and startup', icon: Monitor },
  { id: 'hotkey', label: 'Hotkey', description: 'Global activation', icon: Command },
  { id: 'ai', label: 'AI Engine', description: 'Provider, model, tools', icon: Zap },
  { id: 'memory', label: 'Memory', description: 'Persistent memory & profile', icon: Brain },
  { id: 'window', label: 'Window', description: 'Overlay behavior', icon: Layout },
  { id: 'echo', label: 'Echo Mode', description: 'Voice interaction', icon: Mic },
  { id: 'guide', label: 'Guide', description: 'Tips & Shortcuts', icon: HelpCircle },
] as const;

type SettingsTab = typeof SETTINGS_TABS[number]['id'];

// Collapsed sidebar width
const SIDEBAR_COLLAPSED = 64;
// Expanded sidebar width  
const SIDEBAR_EXPANDED = 192;

export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setSettingsOpen, settingsSidebarCollapsed, setSettingsSidebarCollapsed } = useOverlayStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [isHoveringSidebar, setIsHoveringSidebar] = useState(false);
  const activeMeta = SETTINGS_TABS.find((tab) => tab.id === activeTab) || SETTINGS_TABS[0];

  // Sidebar collapsed by default (user preference), expands on hover
  const isCollapsed = settingsSidebarCollapsed && !isHoveringSidebar;
  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  const handleClose = () => setSettingsOpen(false);

  const handleToggleCollapse = () => {
    setSettingsSidebarCollapsed(!settingsSidebarCollapsed);
  };

  return (
    <AnimatePresence>
      {isSettingsOpen && (
        <motion.div
          className="settings-overlay"
          onClick={handleClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', mass: 0.7, stiffness: 300, damping: 30 }}
          >
            {/* Collapsible Sidebar */}
            <motion.div
              className="settings-sidebar"
              animate={{ width: sidebarWidth }}
              transition={{ type: 'spring', mass: 0.6, stiffness: 280, damping: 28 }}
              onMouseEnter={() => setIsHoveringSidebar(true)}
              onMouseLeave={() => setIsHoveringSidebar(false)}
              style={{ overflow: 'hidden' }}
            >
              <div className="settings-sidebar-header">
                {/* Show full text when expanded, icon-only when collapsed */}
                <AnimatePresence mode="wait">
                  {!isCollapsed ? (
                    <motion.span
                      key="full"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.15 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span className="settings-logo-mark">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      <span>Hermes</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent-primary)' }}>
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </motion.span>
                  )}
                </AnimatePresence>
                
                {!isCollapsed && (
                  <span className="settings-sidebar-sub">Preferences</span>
                )}
              </div>

              <nav className="settings-nav" role="navigation" aria-label="Settings navigation">
                {SETTINGS_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  
                  return (
                    <button
                      key={tab.id}
                      className={`settings-tab ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveTab(tab.id)}
                      title={isCollapsed ? tab.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="settings-tab-icon">
                        <Icon size={16} strokeWidth={1.5} />
                      </span>
                      
                      <AnimatePresence mode="wait">
                        {!isCollapsed && (
                          <motion.span
                            key="label"
                            className="settings-tab-label"
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.12 }}
                          >
                            {tab.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      
                      {isActive && !isCollapsed && (
                        <motion.div
                          className="settings-tab-indicator"
                          layoutId="settings-tab-indicator"
                          transition={{ type: 'spring', mass: 0.5, stiffness: 350, damping: 30 }}
                        />
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Collapse toggle button */}
              <button
                className="settings-collapse-btn"
                onClick={handleToggleCollapse}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
              </button>
            </motion.div>

            {/* Content area */}
            <div className="settings-content">
              <div className="settings-header">
                <div className="settings-heading-copy">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={activeTab}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.18 }}
                      className="settings-kicker"
                    >
                      {activeMeta.description}
                    </motion.span>
                  </AnimatePresence>
                  <AnimatePresence mode="wait">
                    <motion.h3
                      key={activeTab + '-title'}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.18, delay: 0.04 }}
                    >
                      {activeMeta.label}
                    </motion.h3>
                  </AnimatePresence>
                </div>
                <button className="settings-close-btn" onClick={handleClose} aria-label="Close settings">
                  <X size={16} />
                </button>
              </div>

              <div className="settings-body">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    {activeTab === 'general' && <GeneralSettings />}
                    {activeTab === 'hotkey' && <HotkeySettings />}
                    {activeTab === 'ai' && <AISettings />}
                    {activeTab === 'memory' && <MemorySettings />}
                    {activeTab === 'window' && <WindowSettings />}
                    {activeTab === 'echo' && <EchoSettings />}
                    {activeTab === 'guide' && <GuideSettings />}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};