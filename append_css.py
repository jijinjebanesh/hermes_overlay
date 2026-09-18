css_path = r'C:\Users\jijin\hermes-overlay\src\renderer\styles\globals.css'

new_css = r'''
/* ═══════════════════════════════════════════════
   SETTINGS PANEL — VSCode Style Sidebar
   ═══════════════════════════════════════════════ */

.settings-panel-vscode {
  position: absolute;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  background: var(--surface-bg-solid);
  backdrop-filter: blur(40px) saturate(1.5);
  animation: fade-in var(--duration-normal) var(--ease-spring) both;
  overflow: hidden;
  border-radius: var(--radius-shell);
}

.settings-sidebar {
  width: 200px;
  min-width: 200px;
  background: var(--settings-sidebar-bg, rgba(10, 10, 12, 0.98));
  border-right: 1px solid var(--border-secondary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-sidebar-header {
  padding: var(--space-2) var(--space-1-5);
  border-bottom: 1px solid var(--border-secondary);
}

.settings-sidebar-title {
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.settings-sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: var(--space-1);
  overflow-y: auto;
}

.settings-sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  text-align: left;
  background: transparent;
  border: none;
  transition: background var(--duration-instant) var(--ease-in-out),
              color var(--duration-instant) var(--ease-in-out);
}

.settings-sidebar-item:hover {
  background: var(--surface-card-hover);
  color: var(--text-primary);
}

.settings-sidebar-item.active {
  background: var(--accent-muted);
  color: var(--accent);
  font-weight: var(--weight-medium);
}

.settings-sidebar-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.settings-sidebar-item-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-bg-solid);
}

.settings-content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border-secondary);
  flex-shrink: 0;
}

.settings-content-header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-content-title {
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  color: var(--text-primary);
  margin: 0;
}

.settings-content-subtitle {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.settings-content-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-in-out),
              color var(--duration-instant) var(--ease-in-out);
}

.settings-content-close:hover {
  background: var(--surface-card-hover);
  color: var(--text-primary);
}

.settings-content-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) var(--space-3);
}

.settings-section-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 700px;
}

.settings-vscode-card {
  background: var(--surface-card);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-card);
  overflow: hidden;
}

.settings-vscode-card.no-padding {
  padding: 0;
}

.settings-vscode-card-title {
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: var(--space-1) var(--space-1-5);
  border-bottom: 1px solid var(--border-secondary);
  background: rgba(0, 0, 0, 0.15);
}

.settings-vscode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-1) var(--space-1-5);
  min-height: 40px;
  transition: background var(--duration-instant) var(--ease-in-out);
}

.settings-vscode-row:hover {
  background: var(--surface-card-hover);
}

.settings-vscode-row + .settings-vscode-row {
  border-top: 1px solid var(--border-secondary);
}

.settings-vscode-row.vertical {
  flex-direction: column;
  align-items: stretch;
  gap: var(--space-1);
}

.settings-vscode-row-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  color: var(--text-primary);
}

.settings-vscode-row-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  font-weight: var(--weight-normal);
}

.settings-vscode-row-control {
  display: flex;
  align-items: center;
  gap: var(--space-0-5);
  flex-shrink: 0;
}

.theme-picker {
  display: flex;
  gap: var(--space-0-5);
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--surface-input);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: border-color var(--duration-instant) var(--ease-in-out),
              color var(--duration-instant) var(--ease-in-out);
}

.theme-option:hover {
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.theme-option.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-muted);
}

.segmented-control {
  display: flex;
  background: var(--surface-input);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.segmented-control-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-in-out),
              color var(--duration-instant) var(--ease-in-out);
}

.segmented-control-item:hover {
  background: var(--surface-card-hover);
  color: var(--text-primary);
}

.segmented-control-item.active {
  background: var(--accent);
  color: #fff;
}

.voice-picker {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-0-5);
}

.voice-option {
  padding: 5px 10px;
  background: var(--surface-input);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: border-color var(--duration-instant) var(--ease-in-out),
              color var(--duration-instant) var(--ease-in-out);
}

.voice-option:hover {
  border-color: var(--border-primary);
  color: var(--text-primary);
}

.voice-option.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-muted);
}

.settings-vscode-card.memory-card {
  padding: var(--space-1-5);
}

.memory-editor {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.memory-toolbar {
  display: flex;
  gap: var(--space-1);
  justify-content: flex-end;
}

.btn-danger {
  background: var(--color-error-muted);
  border: 1px solid rgba(248, 113, 113, 0.2);
  color: var(--color-error);
  border-radius: var(--radius-button);
  padding: 4px 10px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  font-family: var(--font-sans);
  cursor: pointer;
  transition: background var(--duration-instant) var(--ease-in-out);
}

.btn-danger:hover {
  background: rgba(248, 113, 113, 0.25);
}

.btn-danger-confirm {
  background: var(--color-error);
  border: 1px solid var(--color-error);
  color: #fff;
  border-radius: var(--radius-button);
  padding: 4px 10px;
  font-size: var(--text-xs);
  font-weight: var(--weight-medium);
  font-family: var(--font-sans);
  cursor: pointer;
}

.setting-input {
  background: var(--surface-input);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  font-size: var(--text-xs);
  color: var(--text-primary);
  outline: none;
  font-family: var(--font-sans);
  transition: border-color var(--duration-instant) var(--ease-in-out);
}

.setting-input:focus {
  border-color: var(--accent-border);
}

.setting-input::placeholder {
  color: var(--text-muted);
}
'''

with open(css_path, 'a') as f:
    f.write(new_css)

with open(css_path, 'r') as f:
    lines = f.readlines()
print(f'Appended. Total lines: {len(lines)}')
