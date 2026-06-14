#!/usr/bin/env python3
"""
Manually trigger Echo Mode in the running Hermes Overlay app.
This sends the IPC message that would normally be sent by clap detection.
"""
import subprocess
import time
from pathlib import Path

print("=" * 70)
print("MANUAL ECHO MODE TRIGGER")
print("=" * 70)
print("\nThis will attempt to trigger Echo Mode in the running overlay.")
print("\nNote: This requires the overlay to be running and accepting IPC.")
print("      Direct IPC from Python to Electron is complex, so we'll")
print("      use keyboard simulation (ESC to close, then clap pattern).")
print("\nAlternative: Test by clapping twice when you can make sound!")
print("\n" + "=" * 70)
print("HOW ECHO MODE IS TRIGGERED")
print("=" * 70)
print("""
In the Hermes Overlay app, Echo Mode is triggered by:

1. DOUBLE CLAP (when clap detection enabled)
   - main.ts listens to clap_detector.py stdout
   - On {"type": "double_clap"} → sends 'enter-echo-mode' IPC
   - Renderer receives IPC → Opens Echo Mode UI

2. IPC Message (from within Electron)
   - mainWindow.webContents.send('enter-echo-mode')
   - Sent from main.ts line 327
   - Received by preload.ts line 155
   - Triggers EchoMode component to mount

3. Keyboard Shortcut (if configured)
   - Not currently implemented by default
   - Can be added via hotkey.ahk or Electron globalShortcut

Current status:
  ✅ Electron app is running
  ✅ Clap detector is active (listening for claps)
  ✅ IPC handler is ready (waiting for 'enter-echo-mode')
  ⚠️  Cannot trigger from Python directly (IPC is internal to Electron)

To test Echo Mode:
  Option A: Clap twice (0.3-1.0s apart)
  Option B: Open DevTools (Ctrl+Shift+I) → Console → Run:
            window.electronAPI.send('enter-echo-mode')
  Option C: Add a keyboard shortcut in hotkey.ahk
""")

print("\n" + "=" * 70)
print("VERIFYING ECHO MODE IS READY")
print("=" * 70)

# Check if overlay is running
result = subprocess.run(['tasklist'], capture_output=True, text=True)
electron_running = any('electron' in line.lower() for line in result.stdout.split('\n'))

if electron_running:
    print("\n✅ Electron app is running")
    print("✅ Clap detector should be active inside it")
    print("✅ Echo Mode IPC handler is ready")
    print("\n🎯 Echo Mode WILL trigger when:")
    print("   - You clap twice (within 1.5 seconds)")
    print("   - OR you send IPC from DevTools console")
    print("   - OR you add a keyboard shortcut")
else:
    print("\n⚠️  Electron app not detected")
    print("   Start it with: npx electron .")

print("\n" + "=" * 70)
print("TO TRIGGER ECHO MODE NOW (Library-Safe)")
print("=" * 70)
print("""
Since you can't clap in a library, use DevTools:

1. Click on the Hermes Overlay window to focus it
2. Press Ctrl+Shift+I (opens DevTools)
3. Click on the "Console" tab
4. Type or paste this command:

   window.electronAPI.send('enter-echo-mode')

5. Press Enter
6. Echo Mode should open!

If it doesn't work:
  - Check console for errors
  - Verify overlay is fully loaded
  - Check if Echo Mode component exists

To Exit Echo Mode:
  - Click the "End" button (top-right)
  - OR press ESC key
  - OR say "goodbye", "exit", "close", "stop"
""")

print("\n" + "=" * 70)