#!/usr/bin/env python3
import pyaudio
import struct

p = pyaudio.PyAudio()

print("=" * 70)
print("AVAILABLE INPUT DEVICES")
print("=" * 70)

for i in range(p.get_device_count()):
    try:
        info = p.get_device_info_by_index(i)
        if info['maxInputChannels'] > 0:
            is_default = "← DEFAULT" if info['index'] == p.get_default_input_device_info()['index'] else ""
            print(f"\n[{i}] {info['name']} {is_default}")
            print(f"    Channels: {info['maxInputChannels']}, Sample Rate: {info['defaultSampleRate']}")
    except:
        pass

print("\n" + "=" * 70)
print("TESTING DEFAULT DEVICE AT 16kHz")
print("=" * 70)

try:
    default = p.get_default_input_device_info()
    print(f"Default: [{default['index']}] {default['name']}")
    print(f"Native sample rate: {default['defaultSampleRate']:.0f}Hz")
    
    # Try to open at 16kHz (what clap_detector uses)
    print(f"\nOpening stream at 16kHz...")
    stream = p.open(
        format=pyaudio.paInt16, 
        channels=1, 
        rate=16000,
        input=True, 
        input_device_index=default['index'],
        frames_per_buffer=160
    )
    
    # Read samples
    print("Reading audio (speak/clap now!)...")
    max_seen = 0
    for i in range(50):
        data = stream.read(160, exception_on_overflow=False)
        shorts = struct.unpack('160h', data)
        rms = (sum(s*s for s in shorts) / len(shorts)) ** 0.5 / 32768.0
        max_seen = max(max_seen, rms)
        
        if rms > 0.001:
            marker = "← SOUND!"
        else:
            marker = ""
        print(f"  {rms:.6f}{marker}")
    
    stream.close()
    
    print(f"\n✓ Default device WORKS at 16kHz!")
    print(f"Max amplitude seen: {max_seen:.6f}")
    
    if max_seen < 0.001:
        print("\n⚠️ But amplitude is very low - mic might be quiet")
    else:
        print("\n✓ Good signal detected!")
    
except Exception as e:
    print(f"✗ Failed at 16kHz: {e}")
    
    # Try native rate
    print(f"\nTrying at native rate ({default['defaultSampleRate']:.0f}Hz)...")
    try:
        stream = p.open(
            format=pyaudio.paInt16, 
            channels=1, 
            rate=int(default['defaultSampleRate']),
            input=True, 
            input_device_index=default['index'],
            frames_per_buffer=160
        )
        data = stream.read(160)
        stream.close()
        print(f"✓ Works at native rate!")
    except Exception as e2:
        print(f"✗ Also failed: {e2}")

p.terminate()
print("\n" + "=" * 70)