import React from 'react';
import { useOverlayStore } from '../../store/overlayStore';
import { Toggle } from '../ui/Toggle';
import { getElectronAPI } from '../../hooks/useElectronAPI';

const api = getElectronAPI();

export const GeneralSettings: React.FC = () => {
  const {
    launchAtStartup, setLaunchAtStartup,
    theme, setTheme,
    accentColor, setAccentColor,
    fontFamily, setFontFamily,
    clearSession,
  } = useOverlayStore();

  const handleClearSessions = async () => {
    if (api?.clearAllSessions) {
      if (confirm('Are you sure you want to clear all chat history? This cannot be undone.')) {
        await api.clearAllSessions();
        clearSession();
        alert('All sessions cleared.');
      }
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-row">
        <div className="settings-label">
          <span>Launch at Startup</span>
          <span className="settings-desc">Start Hermes in the background when you log in.</span>
        </div>
        <Toggle checked={launchAtStartup} onChange={setLaunchAtStartup} />
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
          <span>Accent Color</span>
          <span className="settings-desc">Choose your preferred system accent color.</span>
        </div>
        <div className="color-picker">
          {['blue', 'purple', 'pink', 'red', 'orange', 'green'].map(color => (
            <button
              key={color}
              className={`color-swatch ${color} ${accentColor === color ? 'active' : ''}`}
              onClick={() => setAccentColor(color)}
              aria-label={`${color} accent`}
            />
          ))}
        </div>
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
  );
};
