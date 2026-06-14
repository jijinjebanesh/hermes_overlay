#!/usr/bin/env python3
"""Test clap detector and show audio levels in real-time."""
import subprocess
import sys
import time
import json
from pathlib import Path

print("=" * 70)
print("CLAP DETECTOR DIAGNOSTIC TEST")
print("=" * 70)

venv_python = Path.home() / 'AppData/Local/hermes/hermes-agent/venv/Scripts/python.exe'
clap_script = Path(r'C:\Users\jijin\hermes-overlay\src\audio\clap_detector.py')

print(f"\nStarting clap detector...\n")

proc = subprocess.Popen(
    [str(venv_python), str(clap_script)],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1
)

start_time = time.time()
has_sound = False
max_amplitude = 0.0
clap_events = []

try:
    # Run for 15 seconds max
    while time.time() - start_time < 15:
        line = proc.stdout.readline().strip()
        if not line:
            continue
            
        try:
            msg = json.loads(line)
            
            # Debug amplitude (first 100 frames)
            if 'debug_amplitude' in msg:
                amp = msg['debug_amplitude']
                frame = msg.get('frame', 0)
                if amp > 0.01:
                    has_sound = True
                    max_amplitude = max(max_amplitude, amp)
                print(f"  Frame {frame:3d}: amplitude = {amp:.6f} {'← SOUND!' if amp > 0.01 else ''}")
            
            # Status updates
            elif 'status' in msg:
                status = msg['status']
                amp = status.get('amplitude', 0)
                if amp > 0.01:
                    has_sound = True
                    max_amplitude = max(max_amplitude, amp)
                # Print every 5th status to reduce spam
                if status['frame'] % 500 == 0:
                    print(f"  Status @ {status['frame']}: amp={amp:.4f}, thresh={status['threshold']:.3f}, quiet={status['quietcount']:.0f}")
            
            # Clap events
            elif msg.get('type') in ['single_clap', 'double_clap']:
                clap_events.append(msg)
                print(f"\n  🎉 CLAP DETECTED: {msg['type']}")
                if msg['type'] == 'double_clap':
                    print(f"      Gap: {msg['gap_ms']:.0f}ms (max allowed: 1500ms)")
                print()
                
            # Init message
            elif 'init' in msg:
                print(f"  ✓ {msg['init']}")
                print(f"    Initial threshold: {msg['threshold']}")
                print()
                
        except json.JSONDecodeError:
            pass
            
except KeyboardInterrupt:
    pass

proc.kill()
proc.wait()

# Summary
print("\n" + "=" * 70)
print("DIAGNOSTIC RESULTS")
print("=" * 70)

if not has_sound:
    print("\n  ❌ NO AUDIO DETECTED - Microphone is silent!")
    print("\n  Possible causes:")
    print("    1. Wrong microphone selected (check Windows Sound Settings)")
    print("    2. Microphone muted or volume too low")
    print("    3. No microphone connected")
    print("    4. PyAudio device selection issue")
    print("\n  Run this to check mic levels:")
    print("    python C:\\Users\\jijin\\hermes-overlay\\scripts\\check_mic_level.py")
else:
    print(f"\n  ✓ Audio detected - Max amplitude: {max_amplitude:.4f}")
    
    if max_amplitude < 0.05:
        print(f"\n  ⚠️ Amplitude very low - threshold might be too high")
        print(f"    Consider lowering INITIAL_TAP_THRESHOLD in clap_detector.py")
    elif max_amplitude > 0.3:
        print(f"\n  ✓ Good amplitude - threshold should be fine")

if clap_events:
    print(f"\n  ✓ Clap events detected: {len(clap_events)}")
    double_claps = [e for e in clap_events if e.get('type') == 'double_clap']
    if double_claps:
        print(f"\n  🎉 SUCCESS! {len(double_claps)} double-clap(s) detected!")
        for dc in double_claps:
            print(f"      Gap: {dc['gap_ms']:.0f}ms")
    else:
        print(f"\n  ⚠️ Only single claps detected - try clapping twice within 1500ms")
else:
    print(f"\n  ⚠️ No claps detected - try clapping loudly twice")

print("\n" + "=" * 70)