#!/usr/bin/env python3
"""
Hermes Overlay F9 Global Hotkey Daemon
Listens for F9 key press and launches/toggles the overlay
"""

import os
import sys
import subprocess
import threading
import time
from pathlib import Path

try:
    from pynput import keyboard
except ImportError:
    print("ERROR: pynput is not installed.")
    print("")
    print("Please install it with one of the following commands:")
    print("  pip install pynput")
    print("  python -m pip install pynput")
    print("")
    print("Alternatively, use the AutoHotkey script (f9-hotkey.ahk):")
    print("  1. Install AutoHotkey v2.0+ from https://www.autohotkey.com/")
    print("  2. Double-click f9-hotkey.ahk to run the hotkey listener")
    print("")
    sys.exit(1)


class HermesHotkey:
    def __init__(self):
        self.overlay_process = None
        self.overlay_dir = Path(__file__).parent
        self.dev_server_running = False
        self.lock = threading.Lock()

    def launch_overlay(self):
        """Launch or focus the Hermes overlay"""
        with self.lock:
            if self.overlay_process is None or self.overlay_process.poll() is not None:
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
            else:
                print("[✓] Hermes Overlay already running")

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
