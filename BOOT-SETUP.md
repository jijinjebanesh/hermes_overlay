# Hermes Overlay Silent Boot - Setup Complete

## Changes Applied

### 1. ✓ Created VBS Launcher
- **File:** `C:\Users\jijin\hermes-overlay\start-hermes-overlay.vbs`
- **Purpose:** Launches AutoHotkey daemon completely hidden (no CMD flash)

### 2. ✓ Removed All ToolTips from hotkey.ahk
- Removed startup message ("F4 Daemon Active...")
- Removed launching message ("🚀 Launching Hermes...")
- Removed timeout message ("❌ Launch timeout")
- Removed force close message ("🛑 Force Closing Hermes...")
- Removed all cleanup timers

### 3. ✓ Added #NoTrayIcon to hotkey.ahk
- AutoHotkey tray icon now hidden

### 4. ✓ Fixed Electron Window Initialization
- Changed `show: true` to `show: false` in main.ts
- Window initializes hidden, appears only on first F9 press

### 5. ✓ Removed Old CMD Startup Entry
- Deleted `start-hermes-overlay.cmd` from Startup folder

---

## Final Step: Add VBS to Startup

You need to add the VBS file to your Windows Startup:

**Option A: Copy to Startup folder**
```bash
cp C:\Users\jijin\hermes-overlay\start-hermes-overlay.vbs "C:\Users\jijin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\"
```

**Option B: Create a shortcut**
1. Navigate to `C:\Users\jijin\hermes-overlay\`
2. Right-click `start-hermes-overlay.vbs`
3. Select "Create shortcut"
4. Move the shortcut to `C:\Users\jijin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\`

---

## Expected behavior after reboot

```
Windows Boot
      |
      v
start-hermes-overlay.vbs (hidden)
      |
      v
AutoHotkey daemon (no tray icon, no window)
      |
      v
Electron app (initialized but window is HIDDEN)
      |
      v
Waiting for F9 keypress... (silent, invisible)
```

**You will see:**
- ❌ No Command Prompt flash
- ❌ No PowerShell flash  
- ❌ No AutoHotkey tray icon
- ❌ No tooltips or notifications
- ❌ No Hermes window at boot

**Only when you press F9:** Hermes overlay appears

---

## Files Modified

- `C:\Users\jijin\hermes-overlay\hotkey.ahk` (added #NoTrayIcon, removed ToolTips)
- `C:\Users\jijin\hermes-overlay\src\main\main.ts` (show: false)
- `C:\Users\jijin\hermes-overlay\start-hermes-overlay.vbs` (NEW)
- Deleted: `Startup\start-hermes-overlay.cmd`