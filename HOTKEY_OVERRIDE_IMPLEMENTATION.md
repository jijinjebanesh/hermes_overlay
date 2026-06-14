# Hotkey Override Feature - Custom Key Replaces F2

**Date:** June 10, 2025
**Status:** ✅ Implemented

---

## What Changed

Previously, both F2 and the configured hotkey (default: `Ctrl+Alt+H`) would toggle the overlay simultaneously. This could cause:
- Accidental triggers when pressing F2 for other purposes
- Confusion about which key is actually active
- Conflicts with other apps that use F2

**Now:** When you configure a custom hotkey in Settings, it **completely replaces F2**. Only your configured key will toggle the overlay.

---

## Technical Implementation

### 1. Electron Main Process (`src/main/main.ts`)

**Before:**
```typescript
// Always registered both
globalShortcut.register(triggerHotkey, toggleVisibility);
globalShortcut.register('F2', toggleVisibility);  // ← Always active
```

**After:**
```typescript
// Only register the configured hotkey
try {
  globalShortcut.register(triggerHotkey, toggleVisibility);
  console.log('Registered hotkey:', triggerHotkey);
} catch (e) {
  console.error('Failed to register custom hotkey:', e);
  // Fallback to F2 ONLY if custom hotkey fails
  globalShortcut.register('F2', toggleVisibility);
}

// F2 is NOT registered when a custom hotkey is set
if (triggerHotkey !== 'F2') {
  console.log('F2 disabled in Electron (custom hotkey active)');
}
```

**Behavior:**
- If custom hotkey registration succeeds → F2 is NOT registered
- If custom hotkey registration fails → Fallback to F2
- If user explicitly sets F2 as their hotkey → Only F2 is registered

---

### 2. AutoHotkey Script Update (`updateAhkScript`)

**Enhanced to:**
1. Replace the main toggle hotkey with the configured one
2. Update the kill switch to use the same base key (Ctrl+Alt+Shift+KEY)
3. Update the startup tooltip to show the current hotkey
4. Replace any F2 references in comments with the actual hotkey name

**Example:**
If you set `Ctrl+Shift+K`:
- Main hotkey: `^+k::` (Ctrl+Shift+K)
- Kill switch: `^!+k::` (Ctrl+Alt+Shift+K)
- Tooltip: "Ctrl+Shift+K Daemon Active — Press Ctrl+Shift+K to toggle Hermes"

---

### 3. Settings UI Warning (`src/components/SettingsModal.tsx`)

Added a visible warning when configuring the hotkey:

```tsx
<div className="settings-hint" style={{ marginTop: '12px', color: '#f59e0b' }}>
  ⚠️ Setting a custom hotkey will completely override F2. 
  Only your configured key will toggle the overlay.
</div>
```

---

## Hotkey Combinations - Examples

| Configured Hotkey | Electron Registers | AHK Uses | F2 Active? |
|-------------------|-------------------|----------|------------|
| `Ctrl+Alt+H` (default) | ✅ Ctrl+Alt+H | ✅ Ctrl+Alt+H | ❌ No |
| `Ctrl+Shift+K` | ✅ Ctrl+Shift+K | ✅ Ctrl+Shift+K | ❌ No |
| `Alt+Shift+F12` | ✅ Alt+Shift+F12 | ✅ Alt+Shift+F12 | ❌ No |
| `F2` | ✅ F2 | ✅ F2 | ✅ Yes (only F2) |
| Registration fails | ✅ F2 (fallback) | ❌ Unchanged | ✅ Yes |

---

## Kill Switch Behavior

The kill switch adapts to your configured hotkey:

**Pattern:** `Ctrl+Alt+Shift+<KEY>`

| Main Hotkey | Kill Switch |
|-------------|-------------|
| `Ctrl+Alt+H` | `Ctrl+Alt+Shift+H` |
| `Ctrl+Shift+K` | `Ctrl+Alt+Shift+K` |
| `Alt+Shift+F12` | `Ctrl+Alt+Shift+F12` |
| `F2` | `Ctrl+Alt+Shift+F2` |

**Purpose:** Force-close Hermes if it becomes unresponsive.

---

## Migration Path

### Existing Users (Currently Using F2)

If you've been using F2 and want to keep using it:

1. Open Settings → Hotkey tab
2. Press `F2` when prompted to record a hotkey
3. Save

Result: F2 will be explicitly registered as your configured hotkey.

### Users Who Want to Switch Away from F2

1. Open Settings → Hotkey tab
2. Press your desired combination (e.g., `Ctrl+Shift+K`)
3. Save

Result: 
- F2 immediately stops working for Hermes
- Your new key becomes the only toggle key
- AHK reloads automatically with the new key

### Users Who Want Both F2 and Another Key

**Not supported.** The system now enforces a single hotkey to avoid:
- State desynchronization
- Accidental double-toggling
- Conflicts with other applications

**Workaround:** Use AHK to create a second script that forwards F2 to your configured key:

```autohotkey
F2::Send, ^!h  ; Forwards F2 to Ctrl+Alt+H
```

---

## Testing Checklist

- [ ] Set custom hotkey (`Ctrl+Shift+K`) in Settings
- [ ] AHK script reloads automatically (tooltip shows new key)
- [ ] Press `Ctrl+Shift+K` → overlay toggles
- [ ] Press `F2` → overlay does NOT toggle (Electron ignores it)
- [ ] Kill switch works (`Ctrl+Alt+Shift+K`)
- [ ] Restart app → custom hotkey persists
- [ ] Set hotkey back to `F2` → only F2 works

---

## Edge Cases Handled

### 1. Hotkey Registration Fails
**Scenario:** Another app already uses your configured key.

**Behavior:**
- Electron catches the error
- Falls back to F2
- Console shows: `"Failed to register custom hotkey"`
- User sees overlay still responds to F2

### 2. AHK Script Missing
**Scenario:** `hotkey.ahk` file is deleted or moved.

**Behavior:**
- `updateAhkScript()` checks for file existence
- If missing, silently skips AHK update
- Electron hotkey still works (app-level only)
- User must restore AHK script manually

### 3. App Running During Hotkey Change
**Scenario:** User changes hotkey while app is open.

**Behavior:**
- Electron unregisters old hotkey, registers new one
- AHK script rewrites and reloads
- Both systems stay in sync
- Immediate effect (no restart needed)

### 4. Multiple Electron Apps Running
**Scenario:** VS Code, Discord, and Hermes all running.

**Behavior:**
- Kill switch (`Ctrl+Alt+Shift+KEY`) kills ALL `electron.exe` processes
- ⚠️ **Warning:** This will close VS Code, Discord, etc.
- Use with caution

---

## Files Modified

| File | Changes |
|------|---------|
| `src/main/main.ts` | Conditional F2 registration, enhanced `updateAhkScript()` |
| `src/components/SettingsModal.tsx` | Added warning UI |

---

## User Communication

The warning message is intentionally clear:

> ⚠️ Setting a custom hotkey will completely override F2. Only your configured key will toggle the overlay.

This appears in the Settings → Hotkey tab, directly below the key recorder.

---

## Conclusion

The hotkey system now enforces a **single active toggle key** to prevent confusion and conflicts. When a user configures a custom hotkey:

1. ✅ Electron registers only the custom key (not F2)
2. ✅ AHK script updates to use the custom key
3. ✅ Kill switch adapts to the custom key
4. ✅ User sees a clear warning about F2 override
5. ✅ Change takes effect immediately (no restart)

This design prioritizes **clarity and predictability** over flexibility, ensuring users always know exactly which key will toggle Hermes.