import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, Plus, Settings, History, Palette, Mic, X,
  MessageSquare, Zap, Monitor, Moon, Sun, ChevronRight, HelpCircle,
} from 'lucide-react';
import { useOverlayStore } from '../../store/overlayStore';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
  onSwitchSession: (sessionId: string) => void;
  onEnterEchoMode: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  section: string;
  shortcut?: string;
  icon?: React.ReactNode;
  meta?: string;
  action: () => void;
  active?: boolean;
}

/**
 * CommandPalette — Universal navigator (⌘K / Ctrl+K).
 * 
 * Absorbs: ModelSelector, SessionHistory, settings navigation.
 * Supports: sessions, actions, models, configuration.
 * Searchable with keyboard navigation.
 */
export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNewSession,
  onOpenSettings,
  onSwitchSession,
  onEnterEchoMode,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sessions, setSessions] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeModel = useOverlayStore(s => s.activeModel);
  const activeProvider = useOverlayStore(s => s.activeProvider);
  const inventory = useOverlayStore(s => s.inventory);
  const theme = useOverlayStore(s => s.theme);
  const setTheme = useOverlayStore(s => s.setTheme);
  const setActiveModel = useOverlayStore(s => s.setActiveModel);
  const setActiveProvider = useOverlayStore(s => s.setActiveProvider);
  const setGuideOpen = useOverlayStore(s => s.setGuideOpen);

  const api = (window as any).electronAPI;

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      // Fetch recent sessions
      api?.listSessions?.().then((s: any[]) => setSessions(s?.slice(0, 8) || []));
    }
  }, [isOpen]);

  // Build items list
  const items = useMemo((): PaletteItem[] => {
    const result: PaletteItem[] = [];

    // ── ACTIONS ──
    result.push({
      id: 'action-new',
      label: 'New session',
      section: 'Actions',
      shortcut: 'Ctrl+N',
      icon: <Plus />,
      action: () => { onNewSession(); onClose(); },
    });
    result.push({
      id: 'action-settings',
      label: 'Settings',
      section: 'Actions',
      shortcut: 'Ctrl+,',
      icon: <Settings />,
      action: () => { onOpenSettings(); onClose(); },
    });
    result.push({
      id: 'action-echo',
      label: 'Voice mode',
      section: 'Actions',
      shortcut: 'Ctrl+Shift+E',
      icon: <Mic />,
      action: () => { onEnterEchoMode(); onClose(); },
    });
    result.push({
      id: 'action-guide',
      label: 'Guide & Shortcuts',
      section: 'Actions',
      icon: <HelpCircle />,
      action: () => { setGuideOpen(true); onClose(); },
    });

    // ── SESSIONS ──
    for (const session of sessions) {
      result.push({
        id: `session-${session.id}`,
        label: session.title || 'Untitled session',
        section: 'Sessions',
        icon: <MessageSquare />,
        meta: session.messageCount ? `${session.messageCount} msgs` : undefined,
        action: () => { onSwitchSession(session.id); onClose(); },
      });
    }

    // ── MODELS ──
    for (const provider of inventory) {
      if (!provider.models?.length) continue;
      for (const model of provider.models.slice(0, 5)) {
        const isActive = model === activeModel && provider.slug === activeProvider;
        result.push({
          id: `model-${provider.slug}-${model}`,
          label: model,
          section: 'Models',
          icon: <Zap />,
          meta: provider.name,
          active: isActive,
          action: () => {
            setActiveProvider(provider.slug);
            setActiveModel(model);
            api?.setProviderAndModel?.(provider.slug, model);
            onClose();
          },
        });
      }
    }

    // ── CONFIGURATION ──
    result.push({
      id: 'config-theme-system',
      label: 'Theme: System',
      section: 'Configuration',
      icon: <Monitor />,
      active: theme === 'system',
      action: () => { setTheme('system'); onClose(); },
    });
    result.push({
      id: 'config-theme-dark',
      label: 'Theme: Dark',
      section: 'Configuration',
      icon: <Moon />,
      active: theme === 'dark',
      action: () => { setTheme('dark'); onClose(); },
    });
    result.push({
      id: 'config-theme-light',
      label: 'Theme: Light',
      section: 'Configuration',
      icon: <Sun />,
      active: theme === 'light',
      action: () => { setTheme('light'); onClose(); },
    });

    return result;
  }, [sessions, inventory, activeModel, activeProvider, theme,
      onNewSession, onOpenSettings, onSwitchSession, onEnterEchoMode, onClose,
      setTheme, setActiveModel, setActiveProvider]);

  // Filter items by query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(item =>
      item.label.toLowerCase().includes(q) ||
      item.section.toLowerCase().includes(q) ||
      item.meta?.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Group filtered items by section
  const groupedItems = useMemo(() => {
    const groups: Record<string, PaletteItem[]> = {};
    for (const item of filteredItems) {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    }
    return groups;
  }, [filteredItems]);

  // Flat list for keyboard navigation
  const flatItems = filteredItems;

  // Clamp selected index
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, flatItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatItems[selectedIndex]) {
          flatItems[selectedIndex].action();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [flatItems, selectedIndex, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.querySelector('.command-palette-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <>
      {/* Backdrop */}
      <div className="command-palette-backdrop" onClick={onClose} />

      {/* Palette */}
      <div className="command-palette" onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className="command-palette-input-wrapper">
          <Search />
          <input
            ref={inputRef}
            className="command-palette-input"
            type="text"
            placeholder="Search actions, models, sessions..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              className="context-bar-more"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              style={{ flexShrink: 0 }}
            >
              <X />
            </button>
          )}
        </div>

        {/* Item list */}
        <div className="command-palette-list" ref={listRef}>
          {Object.entries(groupedItems).map(([section, sectionItems]) => (
            <div key={section} className="command-palette-section">
              <div className="command-palette-section-title">{section}</div>
              {sectionItems.map(item => {
                const thisIndex = flatIndex++;
                return (
                  <div
                    key={item.id}
                    className={`command-palette-item${thisIndex === selectedIndex ? ' selected' : ''}${item.active ? ' active' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(thisIndex)}
                  >
                    {item.icon}
                    <span className="command-palette-item-label">{item.label}</span>
                    {item.meta && (
                      <span className="command-palette-item-meta">{item.meta}</span>
                    )}
                    {item.shortcut && (
                      <span className="command-palette-item-shortcut">{item.shortcut}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {flatItems.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              No results for "{query}"
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="command-palette-footer">
          <span>
            <kbd>↑↓</kbd> navigate &nbsp; <kbd>↵</kbd> select &nbsp; <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </>
  );
};
