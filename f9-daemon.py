#!/usr/bin/env python3
"""\nHermes Overlay F9 Global Hotkey Daemon\nListens for F9 key press and launches/toggles the overlay\nNow properly handles window focusing for already-running Electron instances.\n"""

import os
import sys
import subprocess
import threading
import time
from pathlib import Path

try:
    import pygetwindow as gw
    import pyautogui
    PYGETWINDOW_AVAILABLE = True
except ImportError:
    PYGETWINDOW_AVAILABLE = False
    print("WARNING: pygetwindow not installed. Window focusing will be limited.")
    print("Install with: pip install pygetwindow pyautogui")
    print("")

try:
    from pynput import keyboard
except ImportError:
    print("ERROR: pynput is not installed.")
    print("")
    print("Please install it with one of the following commands:")
    print("  pip install pynput")
    print("  python -m pip install pynput")
    print("")
    if not PYGETWINDOW_AVAILABLE:
        print("Alternatively, use the AutoHotkey script (f9-hotkey.ahk):")
        print("  1. Install AutoHotkey v2.0+ from https://www.autohotkey.com/")
        print("  2. Double-click f9-hotkey.ahk to run the hotkey listener")
        print("")
    sys.exit(1)


def focus_existing_window():
    """Find and focus an existing Hermes Electron window if it exists"""
    if not PYGETWINDOW_AVAILABLE:
        return False
    
    try:
        # Look for Electron windows with "Hermes" in the title
        windows = gw.getWindowsWithTitle('Hermes')
        if windows:
            win = windows[0]
            if win.isMinimized:
                win.restore()
            if not win.isActive:
                win.activate()
            print("[✓] Focused existing Hermes window")
            return True
        
        # Also check for any Electron window (in case title changed)
        all_electron = [w for w in gw.getAllWindows() if w.title and 'electron' in w.title.lower()]
        if all_electron:
            # Activate the most recently used one
            win = all_electron[-1]
            if win.isMinimized:
                win.restore()
            win.activate()
            print("[✓] Focused Electron window (Hermes)")
            return True
    except Exception as e:
        print(f"[!] Window focus failed: {e}")
    
    return False


class HermesHotkey:
    def __init__(self):
        self.overlay_process = None
        self.overlay_dir = Path(__file__).parent
        self.dev_server_running = False
        self.lock = threading.Lock()

    def launch_overlay(self):
        """Launch or focus the Hermes overlay"""
        with self.lock:
            # First try to focus an existing window
            if focus_existing_window():
                return
            
            print("[F9] Launching Hermes Overlay...")
            try:
                # Launch the dev server + Electron app
                env = os.environ.copy()
                env['NODE_ENV'] = 'development'

                self.overlay_process = subprocess.Popen(
                    ['npm', 'run', 'dev'],
                    cwd=str(self.overlay_dir),
                    env=env,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                print("[✓] Hermes Overlay started (PID: {})".format(self.overlay_process.pid))
            except Exception as e:
                print(f"[✗] Failed to launch overlay: {e}")

    def on_press(self, key):
        """Handle key press events"""
        try:
            if key == keyboard.Key.f9:
                threading.Thread(target=self.launch_overlay, daemon=True).start()
        except AttributeError:
            pass

    def on_release(self, key):
        """Handle key release events"""
        pass

    def run(self):
        """Start the global hotkey listener"""
        print("╔════════════════════════════════════════════╗")
        print("║ Hermes Overlay 2.0 — F9 Hotkey Daemon    ║")
        print("╚════════════════════════════════════════════╝")
        print()
        print("Status: Listening for F9 key press...")
        print()
        print("Shortcuts:")
        print("  • F9 ..................... Open/focus overlay")
        print("  • Ctrl+Alt+H (in-app) .... Toggle visibility")
        print("  • Ctrl+Shift+Z ........... Zen mode")
        print("  • Ctrl+P ................. Command palette")
        print()
        print("Press Ctrl+C to stop the daemon")
        print()

        try:
            with keyboard.Listener(
                on_press=self.on_press,
                on_release=self.on_release,
            ) as listener:
                listener.join()
        except KeyboardInterrupt:
            print("\n[✓] Shutting down...")
            if self.overlay_process:
                self.overlay_process.terminate()
                self.overlay_process.wait(timeout=5)
            sys.exit(0)
        except Exception as e:
            print(f"[✗] Error: {e}")
            sys.exit(1)


if __name__ == '__main__':
    daemon = HermesHotkey()
    daemon.run()
