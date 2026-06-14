#!/usr/bin/env python3
"""
Visual guide for double-clap timing.
Shows exactly when claps need to occur to trigger double-clap detection.
"""
import time

print("=" * 70)
print("DOUBLE-CLAP TIMING VISUALIZER")
print("=" * 70)
print("\nThe detector needs TWO claps within 100-1500ms (0.1-1.5 seconds)")
print("\nCorrect timing:")
print("  CLAP...........CLAP  ← GOOD! (~300-800ms gap)")
print("  ↑              ↑")
print("  First clap     Second clap (within 1.5s)")
print("\nToo slow:")
print("  CLAP...............................CLAP  ← BAD! (> 1500ms)")
print("\nToo fast:")
print("  CLAPCLAP  ← BAD! (< 100ms, sounds like one clap)")
print("\n" + "=" * 70)
print("\nLet's practice the timing...")
print("\nI'll show you when to clap. Follow the prompts:")
print("\nReady?")
time.sleep(1)

input("\nPress ENTER to start timing practice...")

print("\nGet ready...")
time.sleep(1)

print("\nFirst clap NOW!  👏")
clap1_time = time.time()

input("\nPress ENTER when you clap (or just clap and wait)...")

print(f"\n✓ First clap recorded at t={time.time() - clap1_time:.1f}s")
print(f"\nNow clap AGAIN within 1.5 seconds!")
print(f"Timing window: {time.time() - clap1_time:.1f}s to {time.time() - clap1_time + 1.5:.1f}s")

clap2_time = time.time()
input("\nPress ENTER for second clap...")

gap_ms = (time.time() - clap1_time) * 1000

print(f"\n{'='*60}")
print(f"Results:")
print(f"  Gap: {gap_ms:.0f}ms")
print(f"  Valid range: 100-1500ms")

if 100 <= gap_ms <= 1500:
    print(f"  ✅ PERFECT! This would trigger double-clap!")
    print(f"  → Overlay would OPEN")
    print(f"  → Echo mode would START")
else:
    if gap_ms < 100:
        print(f"  ❌ Too fast! Need to wait at least 0.1s between claps")
    else:
        print(f"  ❌ Too slow! Need to clap within 1.5s")
        
print(f"{'='*60}")

print("\n💡 Tips for real clapping:")
print("  - Clap once, then clap again about 0.5 seconds later")
print("  - Like a rhythm: CLAP...CLAP (not machine-gun clapping)")
print("  - Then STOP and wait for overlay to open")
print("  - Don't keep clapping - just TWO claps!")

print("\n" + "=" * 70)