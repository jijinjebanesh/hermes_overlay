# Hermes Overlay - Quick Reference

## 🔥 F9 Hotkey Controls

| Key Combination | Action |
|----------------|---------|
| **F9** | Toggle overlay (show/hide/focus) - works even if app not launched |
| **Ctrl+Alt+Shift+F9** | Force kill Electron (emergency only) |
| **Click tray icon** | Alternative toggle (if AHK script not running) |

## 📍 Window Behavior

- **Instant toggle** - No delay, no tray click required
- **Auto-launch** - Press F9 even if Hermes isn't running
- **Stays hidden** - Press F9 once to hide, once to show
- **Auto-focus** - When shown, input bar gets focus immediately
- **Bottom-right corner** - Default position (configurable in settings)

## 📚 Session History

**How to access:**
1. Press F9 to show overlay
2. Click the 🕐 **Clock icon** in the header
3. Browse recent sessions (shows title, timestamp, message count)
4. Click any session to load it

**What's fixed:**
- ✅ Proper message loading from SQLite database
- ✅ Timestamps displayed correctly
- ✅ Segment rendering (thinking blocks, tool calls)
- ✅ Error logging for debugging

## ⚙️ Settings Access

Click the ⚙️ gear icon to access:
- Hotkey configuration
- Always on top toggle
- Opacity slider
- Small window mode
- Theme (system/light/dark)
- Font selection
- Echo mode settings

## 🎯 Common Actions

| Action | How-To |
|--------|--------|
| New chat | Click ➕ button or close current session |
| Send message | Type + Enter |
| New line | Shift+Enter |
| Close overlay | Click ✕ or click outside |
| Open terminal | Click 💻 icon |
| Change model | Click the provider·model pill |

## 🐛 Troubleshooting

**F9 not working?**
1. Check if AHK script is running (check system tray)
2. Manually run: `C:\Users\jijin\hermes-overlay\hotkey.ahk`
3. Restart overlay: Close Electron, press F9 to relaunch

**History empty?**
1. Hermes CLI must have sessions in state.db
2. Run `hermes chat -q "test"` to create a session
3. Click refresh in settings to reload

**Window stuck?**
1. Press Ctrl+Alt+Shift+F9 to force kill
2. Press F9 to relaunch cleanly

## 📂 Project Location
```
C:\Users\jijin\hermes-overlay\
├── hotkey.ahk          # F9 hotkey script
├── scripts/
│   ├── get_session.py  # Session loading
│   └── list_sessions.py # Session listing
└── FIXES_SUMMARY.md    # Detailed fix documentation
```

## 🆕 What Changed (Latest Build)

✅ F9 now toggles instantly without tray clicks
✅ Window appears on first F9 press even if not running  
✅ Hide delay reduced from 50ms → 10ms for instant response
✅ Session history now properly loads messages from database
✅ Enhanced error logging for debugging
✅ Proper timestamp conversion for message display

---

**Build Version:** 3.0.0  
**Last Updated:** June 2026  
**Status:** ✅ Production Ready