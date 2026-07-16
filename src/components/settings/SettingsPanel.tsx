import React, { useState, useEffect, useCallback } from 'react';
import { X, RotateCw, Trash2, Keyboard, HelpCircle } from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const ACCENT_COLORS = [
  { id: 'blue', color: '#3B82F6' },
  { id: 'purple', color: '#A855F7' },
  { id: 'pink', color: '#EC4899' },
  { id: 'red', color: '#EF4444' },
  { id: 'orange', color: '#F97316' },
  { id: 'green', color: '#22C55E' },
  { id: 'teal', color: '#14B8A6' },
  { id: 'indigo', color: '#6366F1' },
];

const EDGE_TTS_VOICES = [
  { id: 'en-US-AriaNeural', label: 'Aria' },
  { id: 'en-US-JennyNeural', label: 'Jenny' },
  { id: 'en-US-GuyNeural', label: 'Guy' },
  { id: 'en-US-DavisNeural', label: 'Davis' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia' },
  { id: 'en-GB-RyanNeural', label: 'Ryan' },
  { id: 'en-AU-NatashaNeural', label: 'Natasha' },
  { id: 'en-IN-NeerjaNeural', label: 'Neerja' },
];

/**
 * SettingsPanel — Inline settings panel (not modal).
 * 
 * All configuration in a single scrollable panel.
 * No sidebar, no tabs. Replaces SettingsModal + 6 tab components.
 * 
 * Sections: Appearance, Behavior, Voice, AI Engine, Memory
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const store = useOverlayStore();
  const api = (window as any).electronAPI;

  // Hotkey recording
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [hotkeyDisplay, setHotkeyDisplay] = useState(store.globalHotkey);

  // Memory
  const [memoryContent, setMemoryContent] = useState('');
  const [userContent, setUserContent] = useState('');
  const [memoryDirty, setMemoryDirty] = useState(false);

  // Clear history confirm
  const [confirmClear, setConfirmClear] = useState(false);

  // Interrupt/exit words
  const [interruptWordsInput, setInterruptWordsInput] = useState('');
  const [exitWordsInput, setExitWordsInput] = useState('');

  // Load memory and words on open
  useEffect(() => {
    if (isOpen) {
      setHotkeyDisplay(store.globalHotkey);
      setInterruptWordsInput(store.echoInterruptWords.join(', '));
      setExitWordsInput(store.echoExitWords.join(', '));
      setConfirmClear(false);

      api?.readMemory?.().then((data: { memory: string; user: string }) => {
        if (data) {
          setMemoryContent(data.memory || '');
          setUserContent(data.user || '');
          setMemoryDirty(false);
        }
      });
    }
  }, [isOpen]);

  // Hotkey recording
  const handleHotkeyKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isRecordingHotkey) return;
    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('CommandOrControl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const key = e.key;
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      const hotkey = parts.join('+');
      setHotkeyDisplay(hotkey);
      store.setGlobalHotkey(hotkey);
      setIsRecordingHotkey(false);
    }
  }, [isRecordingHotkey, store]);

  // Save memory
  const handleSaveMemory = useCallback(() => {
    api?.saveMemory?.({ memory: memoryContent, user: userContent });
    setMemoryDirty(false);
  }, [memoryContent, userContent]);

  // Clear all sessions
  const handleClearHistory = useCallback(() => {
    if (confirmClear) {
      api?.clearAllSessions?.();
      setConfirmClear(false);
    } else {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
    }
  }, [confirmClear]);

  // Save interrupt/exit words on blur
  const handleInterruptWordsBlur = useCallback(() => {
    const words = interruptWordsInput.split(',').map(w => w.trim()).filter(Boolean);
    store.setEchoInterruptWords(words);
  }, [interruptWordsInput, store]);

  const handleExitWordsBlur = useCallback(() => {
    const words = exitWordsInput.split(',').map(w => w.trim()).filter(Boolean);
    store.setEchoExitWords(words);
  }, [exitWordsInput, store]);

  if (!isOpen) return null;

  return (
    <>
      <div className="settings-overlay" onClick={onClose} />
      <div className="settings-panel">
        {/* Header */}
        <div className="settings-panel-header">
          <h2 className="settings-panel-title">Settings</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              className="settings-panel-close" 
              onClick={() => { onClose(); store.setGuideOpen(true); }}
              title="Open Guide"
            >
              <HelpCircle size={16} />
            </button>
            <button className="settings-panel-close" onClick={onClose} title="Close">
              <X />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="settings-panel-body">

          {/* ── APPEARANCE ── */}
          <div className="settings-section">
            <div className="settings-section-title">Appearance</div>
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Theme</div>
                </div>
                <div className="settings-row-value">
                  <select
                    className="select"
                    value={store.theme}
                    onChange={e => store.setTheme(e.target.value as any)}
                  >
                    <option value="system">System</option>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Accent color</div>
                </div>
                <div className="settings-row-value">
                  <div className="color-swatches">
                    {ACCENT_COLORS.map(c => (
                      <button
                        key={c.id}
                        className={`color-swatch${store.accentColor === c.id ? ' active' : ''}`}
                        style={{ background: c.color }}
                        onClick={() => store.setAccentColor(c.id)}
                        title={c.id}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Font</div>
                </div>
                <div className="settings-row-value">
                  <select
                    className="select"
                    value={store.fontFamily}
                    onChange={e => store.setFontFamily(e.target.value)}
                  >
                    <option value="system-ui">System</option>
                    <option value="Inter">Inter</option>
                    <option value="Roboto">Roboto</option>
                    <option value="JetBrains Mono">JetBrains Mono</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── BEHAVIOR ── */}
          <div className="settings-section">
            <div className="settings-section-title">Behavior</div>
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Always on top</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.alwaysOnTop ? ' active' : ''}`}
                    onClick={() => store.setAlwaysOnTop(!store.alwaysOnTop)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Compact mode</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.smallWindow ? ' active' : ''}`}
                    onClick={() => store.setSmallWindow(!store.smallWindow)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Launch at startup</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.launchAtStartup ? ' active' : ''}`}
                    onClick={() => store.setLaunchAtStartup(!store.launchAtStartup)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Auto-capture context</div>
                  <div className="settings-row-description">Capture screen context when summoned</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.autoCaptureContext ? ' active' : ''}`}
                    onClick={() => store.setAutoCaptureContext(!store.autoCaptureContext)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── HOTKEY ── */}
          <div className="settings-section">
            <div className="settings-section-title">Hotkey</div>
            <div className="settings-card">
              <div className="settings-row" onKeyDown={handleHotkeyKeyDown}>
                <div>
                  <div className="settings-row-label">Trigger hotkey</div>
                  <div className="settings-row-description">Global keyboard shortcut</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`hotkey-recorder${isRecordingHotkey ? ' recording' : ''}`}
                    onClick={() => setIsRecordingHotkey(!isRecordingHotkey)}
                    tabIndex={0}
                  >
                    <Keyboard style={{ width: 12, height: 12 }} />
                    {isRecordingHotkey ? 'Press keys...' : hotkeyDisplay}
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Reset window position</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className="btn btn-sm"
                    onClick={() => api?.resetBounds?.()}
                  >
                    <RotateCw style={{ width: 12, height: 12 }} />
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── AI ENGINE ── */}
          <div className="settings-section">
            <div className="settings-section-title">AI Engine</div>
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Default tool mode</div>
                </div>
                <div className="settings-row-value">
                  <div className="segmented-control">
                    {(['all', 'terminal', 'none'] as const).map(mode => (
                      <button
                        key={mode}
                        className={`segmented-control-item${store.toolMode === mode ? ' active' : ''}`}
                        onClick={() => store.setToolMode(mode)}
                      >
                        {mode === 'all' ? 'All Tools' : mode === 'terminal' ? 'Terminal' : 'Chat'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Local mode</div>
                  <div className="settings-row-description">Use local models only</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.localMode ? ' active' : ''}`}
                    onClick={() => store.setLocalMode(!store.localMode)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── VOICE ── */}
          <div className="settings-section">
            <div className="settings-section-title">Voice</div>
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Double-clap to wake</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.echoClapWakeEnabled ? ' active' : ''}`}
                    onClick={() => store.setEchoClapWakeEnabled(!store.echoClapWakeEnabled)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Wake word</div>
                </div>
                <div className="settings-row-value" style={{ gap: 'var(--space-0-5)' }}>
                  <button
                    className={`toggle${store.echoWakeWordEnabled ? ' active' : ''}`}
                    onClick={() => store.setEchoWakeWordEnabled(!store.echoWakeWordEnabled)}
                  >
                    <span className="toggle-knob" />
                  </button>
                  {store.echoWakeWordEnabled && (
                    <input
                      className="setting-input"
                      style={{ width: 100 }}
                      value={store.echoWakeWord}
                      onChange={e => store.setEchoWakeWord(e.target.value)}
                      placeholder="hey hermes"
                    />
                  )}
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Double-clap to minimize</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.echoDoubleClapMinimize ? ' active' : ''}`}
                    onClick={() => store.setEchoDoubleClapMinimize(!store.echoDoubleClapMinimize)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Clap sensitivity</div>
                </div>
                <div className="settings-row-value" style={{ minWidth: 120 }}>
                  <div className="slider-wrapper">
                    <input
                      type="range"
                      className="slider"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={store.echoClapSensitivity}
                      onChange={e => store.setEchoClapSensitivity(parseFloat(e.target.value))}
                    />
                    <span className="slider-value">{store.echoClapSensitivity.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Voice always-on</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className={`toggle${store.echoVoiceModeEnabled ? ' active' : ''}`}
                    onClick={() => store.setEchoVoiceModeEnabled(!store.echoVoiceModeEnabled)}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">TTS provider</div>
                </div>
                <div className="settings-row-value">
                  <select
                    className="select"
                    value={store.echoTtsProvider}
                    onChange={e => store.setEchoTtsProvider(e.target.value as any)}
                  >
                    <option value="edge-tts">Edge TTS</option>
                    <option value="openai">OpenAI</option>
                    <option value="elevenlabs">ElevenLabs</option>
                    <option value="qwen3">Qwen3</option>
                  </select>
                </div>
              </div>
              {store.echoTtsProvider === 'edge-tts' ? (
                <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-0-5)' }}>
                  <div className="settings-row-label">TTS voice</div>
                  <div className="voice-picker">
                    {EDGE_TTS_VOICES.map(v => (
                      <button
                        key={v.id}
                        className={`voice-option${store.echoTtsVoice === v.id ? ' active' : ''}`}
                        onClick={() => store.setEchoTtsVoice(v.id)}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="settings-row">
                  <div>
                    <div className="settings-row-label">TTS voice ID</div>
                  </div>
                  <div className="settings-row-value">
                    <input
                      className="setting-input"
                      style={{ width: 140 }}
                      value={store.echoTtsVoice}
                      onChange={e => store.setEchoTtsVoice(e.target.value)}
                      placeholder="Voice ID"
                    />
                  </div>
                </div>
              )}
              <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-0-5)' }}>
                <div className="settings-row-label">Interrupt words</div>
                <input
                  className="setting-input"
                  value={interruptWordsInput}
                  onChange={e => setInterruptWordsInput(e.target.value)}
                  onBlur={handleInterruptWordsBlur}
                  placeholder="stop, wait, shut up"
                />
              </div>
              <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-0-5)' }}>
                <div className="settings-row-label">Exit words</div>
                <input
                  className="setting-input"
                  value={exitWordsInput}
                  onChange={e => setExitWordsInput(e.target.value)}
                  onBlur={handleExitWordsBlur}
                  placeholder="goodbye, close, exit"
                />
              </div>
            </div>
          </div>

          {/* ── MEMORY ── */}
          <div className="settings-section">
            <div className="settings-section-title">Memory</div>
            <div className="settings-card" style={{ padding: 'var(--space-1-5)' }}>
              <div className="memory-section">
                <div className="memory-header">
                  <span className="memory-label">Agent Memory (MEMORY.md)</span>
                  <div className="memory-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => api?.readMemory?.().then((d: any) => { setMemoryContent(d?.memory || ''); setMemoryDirty(false); })}
                    >
                      <RotateCw style={{ width: 12, height: 12 }} />
                    </button>
                  </div>
                </div>
                <textarea
                  className="settings-textarea"
                  value={memoryContent}
                  onChange={e => { setMemoryContent(e.target.value); setMemoryDirty(true); }}
                  placeholder="Agent persistent memory..."
                  rows={4}
                />
              </div>
              <div className="memory-section">
                <div className="memory-header">
                  <span className="memory-label">User Profile (USER.md)</span>
                </div>
                <textarea
                  className="settings-textarea"
                  value={userContent}
                  onChange={e => { setUserContent(e.target.value); setMemoryDirty(true); }}
                  placeholder="User profile info..."
                  rows={3}
                />
              </div>
              {memoryDirty && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSaveMemory}
                  style={{ marginTop: 'var(--space-0-5)' }}
                >
                  Save Memory
                </button>
              )}
            </div>
          </div>

          {/* ── DANGER ZONE ── */}
          <div className="settings-section">
            <div className="settings-section-title">Data</div>
            <div className="settings-card">
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Clear all sessions</div>
                  <div className="settings-row-description">Permanently delete all chat history</div>
                </div>
                <div className="settings-row-value">
                  <button
                    className="settings-destructive-btn"
                    onClick={handleClearHistory}
                  >
                    <Trash2 style={{ width: 12, height: 12, display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                    {confirmClear ? 'Confirm delete?' : 'Clear history'}
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};
