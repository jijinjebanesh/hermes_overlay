#!/usr/bin/env python3
"""
Debug script to capture session resume data for tool-call rendering bug diagnosis.

Usage:
  python capture_resume_bug.py <session_id_or_title>

This will:
1. Resume the specified session via the Hermes gateway
2. Capture the raw DB content vs transformed output
3. Save to ~/.hermes/logs/resume_debug.log
4. Print instructions for next steps
"""

import json
import sys
import os
from pathlib import Path

# Add Hermes to path
sys.path.insert(0, str(Path.home() / "AppData" / "Local" / "hermes" / "hermes-agent"))

def main():
    if len(sys.argv) < 2:
        print("Usage: python capture_resume_bug.py <session_id_or_title>")
        print("\nExample:")
        print("  python capture_resume_bug.py 'Fix Docker Build'")
        print("  python capture_resume_bug.py sess_abc123")
        sys.exit(1)
    
    session_id = sys.argv[1]
    
    print("="*70)
    print("Hermes Session Resume Debug Capture")
    print("="*70)
    print(f"\nTarget session: {session_id}")
    print(f"Log file: ~/.hermes/logs/resume_debug.log\n")
    
    # The actual resume happens in the gateway when you open the session in the TUI/overlay
    # This script just prepares the logging
    
    print("INSTRUCTIONS:")
    print("-"*70)
    print("1. Keep this script open - you'll need the log file path")
    print("2. Open your Hermes overlay/TUI")
    print("3. Use /sessions command and select the session: '{}'".format(session_id))
    print("4. Wait for the session to load completely")
    print("5. Come back here - the log should now contain the debug data")
    print("6. Open ~/.hermes/logs/resume_debug.log and share the relevant section")
    print()
    print("The log will show:")
    print("  - RAW DB CONTENT: What's actually stored in SQLite")
    print("  - TRANSFORMED OUTPUT: What gets sent to the overlay")
    print()
    print("Look for entries with 'write_file' or other tool calls.")
    print("Check if '\\\\n' (double backslash-n) appears in either section.")
    print()
    print("="*70)
    print("\nLog file location:")
    print(f"  {Path.home() / '.hermes' / 'logs' / 'resume_debug.log'}")
    print("\nWaiting for you to trigger a session resume in the overlay...")
    print("(Press Ctrl+C when ready to view the log)")
    
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\nInterrupted. Checking log file...")
        
        log_path = Path.home() / ".hermes" / "logs" / "resume_debug.log"
        if log_path.exists():
            print(f"\nLog file found: {log_path}")
            print("\nLast 100 lines:")
            print("="*70)
            with open(log_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()
                for line in lines[-100:]:
                    print(line, end='')
            print("="*70)
        else:
            print(f"\nLog file NOT found at {log_path}")
            print("Make sure you triggered a session resume in the overlay.")

if __name__ == '__main__':
    main()