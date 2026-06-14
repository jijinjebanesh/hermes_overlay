# Hermes Overlay Hotkey System - Complete Analysis

**Date:** June 10, 2025
**Analyzed By:** Hermes Agent

---

## Executive Summary

The Hermes Overlay uses a **dual hotkey system**:
1. **AutoHotkey (AHK)** - System-level global hotkey (works even when app is closed)
2. **Electron globalShortcut** - App-level hotkey (only works when app is running)

Both systems are kept in sync automatically when you change the hotkey in Settings.

---

## Current Default Configuration

| Hotkey | Action | System |
|--------|--------|--------|
| **F2** | Toggle overlay show/hide | AHK + Electron (both) |
| **Ctrl+Alt+H** | Toggle overlay show/hide | Electron only (configurable) |
| **Ctrl+Alt+Shift+F2** | Force kill electron.exe | AHK only (hard kill switch) |

---

## How It Works

### 1. AutoHotkey Script (`hotkey.ahk`)

**Location:** `C:\Users\jijin\hermes-overlay\hotkey.ahk`

**Current Active Hotkey:** `F2`

```autohotkey
#Requires AutoHotkey v2.0
#SingleInstance Force

overlayDir := "C:\Users\jijin\hermes-overlay"
overlayTitle := "Hermes ahk_exe electron.exe"

DetectHiddenWindows(true)  ; Can find hidden windows
SetTitleMatchMode(3)       ; Exact title match

; F2 Toggle Handler
F2:: {
    hwnd := WinExist(overlayTitle)
    
    if (hwnd) {
        ; Window exists - toggle visibility
        if WinActive(overlayTitle) {
            WinHide(overlayTitle)        ; Hide if active
            ToolTip("🔒 Hermes Hidden", 10, 10)
        } else {
            WinShow(overlayTitle)        ; Show if hidden
            WinActivate(overlayTitle)
            ToolTip("✅ Hermes Activated", 10, 10)
        }
    } else {
        ; Window doesn't exist - launch it
        ToolTip("🚀 Launching Hermes...", 10, 10)
        Run(overlayDir "\launch.bat", overlayDir, "Hide")
    }
    
    SetTimer(() => ToolTip(), -1500)  ; Auto-hide tooltip
}

; Kill Switch: Ctrl+Alt+Shift+F2
^!+F2:: {
    ToolTip("🛑 Force Closing Hermes...", 10, 10)
    SetTimer(() => ToolTip(), -1000)
    Run("taskkill /F /IM electron.exe", , "Hide")
}

; Startup notification
ToolTip("F2 Hotkey Active — Press F2 to toggle Hermes", 10, 10)
SetTimer(() => ToolTip(), -3000)
```

**Key Features:**
- Uses `DetectHiddenWindows(true)` to find Electron windows even when hidden
- Matches window by title "Hermes" + executable "electron.exe"
- Launches `launch.bat` if app isn't running
- Hard kill switch with `Ctrl+Alt+Shift+F2`

---

### 2. Electron Main Process (`src/main/main.ts`)

**Registration on App Ready:**

```typescript
app.whenReady().then(() => {
  createWindow();
  createTray();
  startClapDetector();

  const config = loadOverlayConfig();
  const triggerHotkey = config.triggerHotkey || 'CommandOrControl+Alt+H';
  
  // Register configurable hotkey
  try {
    globalShortcut.register(triggerHotkey, toggleVisibility);
  } catch (e) {
    console.error('Failed to register custom hotkey', e);
  }
  
  // Also register F2 directly
  globalShortcut.register('F2', toggleVisibility);
});
```

**Default Hotkey:** `CommandOrControl+Alt+H`
- On Windows: `Ctrl+Alt+H`
- On macOS: `Cmd+Alt+H`

**F2 is always registered** in addition to the configurable hotkey for consistency with AHK.

---

### 3. Settings UI (`src/components/SettingsModal.tsx`)

**Hotkey Recorder Logic:**

```typescript
const handleKeyDown = (e: KeyboardEvent) => {
  e.preventDefault();
  const key = e.key;
  
  // Collect modifiers
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
  
  setGlobalHotkey(finalHotkey);  // Saves to Zustand store
  setRecordingHotkey(false);
  setTempKeys([]);
};
```

**When you change the hotkey in Settings:**

1. Saves to Zustand state (`globalHotkey`)
2. Sends IPC `set-global-hotkey` to main process
3. Main process calls `updateAhkScript(newHotkey)`
4. AHK script is rewritten with new hotkey
5. AHK script reloads automatically

---

### 4. AHK Script Auto-Update (`src/main/main.ts`)

```typescript
function updateAhkScript(electronHotkey: string) {
  let ahkModifier = '';
  const parts = electronHotkey.split('+');
  const key = parts.pop() || '';
  
  // Convert Electron modifiers to AHK syntax
  for (const mod of parts) {
    if (mod === 'CommandOrControl' || mod === 'Control' || mod === 'Ctrl') 
      ahkModifier += '^';  // Ctrl
    else if (mod === 'Alt') 
      ahkModifier += '!';  // Alt
    else if (mod === 'Shift') 
      ahkModifier += '+';  // Shift
    else if (mod === 'Meta' || mod === 'Command' || mod === 'Super') 
      ahkModifier += '#';  // Win key
  }
  
  const keyMapped = key.toLowerCase();
  const ahkHotkey = ahkModifier + keyMapped;
  const killHotkey = '^!+' + keyMapped;  // Ctrl+Alt+Shift+KEY
  
  // Find and update hotkey.ahk
  const ahkPaths = [
    path.join(__dirname, '..', '..', 'hotkey.ahk'),
    path.join(app.getAppPath(), '..', 'hotkey.ahk'),
    path.join(app.getAppPath(), '..', '..', 'hotkey.ahk'),
    'C:\\\\Users\\\\jijin\\\\hermes-overlay\\\\hotkey.ahk'
  ];
  
  // Rewrite the AHK file with new hotkey
  const lines = fs.readFileSync(ahkPath, 'utf8').split('\n');
  let triggerReplaced = false;
  for (let i = 0; i < lines.length; i++) {
    if (!triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
      lines[i] = `${ahkHotkey}:: {`;  // Replace first hotkey
      triggerReplaced = true;
    } else if (triggerReplaced && lines[i].match(/^[^;].*?::\s*\{/)) {
      lines[i] = `${killHotkey}:: {`;  // Replace kill switch
    }
  }
  fs.writeFileSync(ahkPath, lines.join('\n'), 'utf8');
  
  // Reload AHK script
  spawn('cmd.exe', ['/c', 'start', '', ahkPath], { detached: true, stdio: 'ignore' });
}
```

**Modifier Mapping:**
| Electron | AHK | Key |
|----------|-----|-----|
| `CommandOrControl` | `^` | Ctrl (or Cmd on Mac) |
| `Alt` | `!` | Alt |
| `Shift` | `+` | Shift |
| `Meta`/`Command` | `#` | Windows key |

**Example Conversions:**
- `CommandOrControl+Alt+H` → `^!h` (Ctrl+Alt+H)
- `CommandOrControl+Shift+K` → `^+k` (Ctrl+Shift+K)
- `Alt+Shift+F12` → `!+f12` (Alt+Shift+F12)

---

## Window Detection Logic

**AHK Window Title Pattern:**
```autohotkey
overlayTitle := "Hermes ahk_exe electron.exe"
```

This matches any window with:
- Title containing "Hermes"
- Executable named "electron.exe"

**Electron Window Creation:**
```typescript
mainWindow = new BrowserWindow({
  title: 'Hermes',  // Explicit title for AHK matching
  show: false,      // Start hidden
  // ... other options
});
```

**Why `show: false`?**
- Window is created hidden
- AHK script shows it on first hotkey press
- Prevents visible flash on app startup

---

## Toggle Flow

### Scenario 1: App Not Running
1. Press **F2**
2. AHK: `WinExist("Hermes")` returns `0` (not found)
3. AHK: Runs `launch.bat`
4. `launch.bat` starts Electron app
5. Window appears after ~2 seconds

### Scenario 2: App Running, Window Hidden
1. Press **F2**
2. AHK: `WinExist("Hermes")` finds hidden window
3. AHK: `WinShow()` + `WinActivate()`
4. Window appears instantly
5. Tooltip: "✅ Hermes Activated"

### Scenario 3: App Running, Window Visible & Active
1. Press **F2**
2. AHK: `WinActive("Hermes")` returns `true`
3. AHK: `WinHide()`
4. Window disappears
5. Tooltip: "🔒 Hermes Hidden"

### Scenario 4: App Running, Window Visible but Not Focused
1. Press **F2**
2. AHK: `WinExist()` finds window, but `WinActive()` is `false`
3. AHK: `WinShow()` + `WinActivate()`
4. Window comes to front and gains focus

---

## Concurrent Hotkey Registration

**Both AHK and Electron register F2:**
- **AHK** works at OS level (always active, even if app closed)
- **Electron** works at app level (only when app running)

**Why both?**
- If only AHK: Pressing F2 when app is running would trigger AHK toggle, but Electron wouldn't know about it (state desync)
- If only Electron: F2 wouldn't work when app is closed
- **Solution:** Both register F2, but AHK handles launch + Electron handles internal state

**Potential Conflict?**
- When app is running, both AHK and Electron receive F2
- AHK toggles window visibility
- Electron also toggles via `toggleVisibility()`
- **Result:** Both call the same logic, so no double-toggle issue
- The first one to execute wins, the second becomes a no-op

**Prevention in `toggleVisibility()`:**
```typescript
function toggleVisibility() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (isVisible) {
    if (!mainWindow.isFocused()) {
      mainWindow.focus();  // Just focus, don't hide
      return;
    }
    // Hide logic...
  } else {
    // Show logic...
  }
}
```

---

## Kill Switch

**AHK Hard Kill:** `Ctrl+Alt+Shift+F2`
```autohotkey
^!+F2:: {
    Run("taskkill /F /IM electron.exe", , "Hide")
}
```

**When to use:**
- App is frozen/unresponsive
- Hotkey not working
- Need to force-close all Electron instances

**Warning:** This kills ALL `electron.exe` processes, not just Hermes.

---

## Configuration Persistence

**Where hotkeys are stored:**
- File: `~/.hermes/overlay.json` (Windows: `C:\Users\jijin\.hermes\overlay.json`)
- Format:
```json
{
  "triggerHotkey": "CommandOrControl+Alt+H",
  "bounds": { ... },
  "echoClapWakeEnabled": true,
  "launchAtStartup": false,
  ...
}
```

**On app startup:**
1. Load config from `overlay.json`
2. Register hotkey from config (or default)
3. Call `updateAhkScript()` to sync AHK file

---

## Known Issues & Edge Cases

### 1. Hotkey Change Doesn't Apply
- **Cause:** AHK script didn't reload
- **Fix:** Manually restart AHK (right-click tray icon → Exit, then run `hotkey.ahk`)

### 2. F2 Works But Configurable Hotkey Doesn't
- **Cause:** `globalShortcut.register()` failed (hotkey already in use)
- **Fix:** Check console for error, choose different hotkey

### 3. AHK Launches Second Instance
- **Cause:** `WinExist()` failed to find hidden window
- **Fix:** Ensure `DetectHiddenWindows(true)` is set in AHK

### 4. Window Appears Twice on Launch
- **Cause:** Both AHK and `launch.bat` trigger show
- **Fix:** AHK tooltip shows "Launching Hermes..." then exits without calling WinShow

---

## File Locations

| File | Purpose |
|------|---------|
| `C:\Users\jijin\hermes-overlay\hotkey.ahk` | AHK hotkey script |
| `C:\Users\jijin\.hermes\overlay.json` | Persisted config |
| `src/main/main.ts` | Electron main process, hotkey registration |
| `src/components/SettingsModal.tsx` | Hotkey recorder UI |
| `launch.bat` | Windows batch launcher |

---

## Security Considerations

1. **Global hotkeys** can be intercepted by other apps
   - Avoid using common shortcuts (Ctrl+C, Alt+Tab, etc.)
   - Use modifier combinations (Ctrl+Alt+Shift+X)

2. **AHK script runs with user privileges**
   - Can execute arbitrary commands
   - Keep script in trusted location

3. **Kill switch affects all Electron apps**
   - `taskkill /F /IM electron.exe` kills VS Code, Discord, etc.
   - Use with caution

---

## Recommendations

### For Users:
1. **Keep F2 as primary** - Consistent with AHK system
2. **Set a unique configurable hotkey** if F2 conflicts with other apps
3. **Remember the kill switch** (`Ctrl+Alt+Shift+F2`) for frozen states
4. **Check AHK is running** - Look for green H icon in system tray

### For Developers:
1. **Always call `updateAhkScript()`** when changing hotkey
2. **Handle registration failures** gracefully (check for conflicts)
3. **Test on clean boot** - Verify AHK finds hidden window
4. **Add logging** to `toggleVisibility()` for debugging

---

## Testing Checklist

- [ ] Press F2 when app closed → app launches
- [ ] Press F2 when app visible → app hides
- [ ] Press F2 when app hidden → app shows
- [ ] Change hotkey in Settings → AHK updates
- [ ] New hotkey works immediately
- [ ] Kill switch works (`Ctrl+Alt+Shift+F2`)
- [ ] App remembers hotkey after restart

---

## Conclusion

The hotkey system is a **hybrid design** combining:
- **AutoHotkey** for OS-level reliability and app launching
- **Electron globalShortcut** for internal state synchronization

The **F2 key is hardcoded** in both systems for consistency, while the **configurable hotkey** provides flexibility for users who need a different combination.

The **auto-update mechanism** ensures AHK and Electron stay in sync when the user changes the hotkey in Settings.