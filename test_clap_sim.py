
import pyaudio
import struct
import math
import time
import json
import sys

# SUPER LOW threshold to detect ANY sound
INITIAL_TAP_THRESHOLD = 0.0001  # Detects even tiny sounds
FORMAT = pyaudio.paInt16 
SHORT_NORMALIZE = (1.0/32768.0)
CHANNELS = 1
RATE = 16000
INPUT_BLOCK_TIME = 0.01
INPUT_FRAMES_PER_BLOCK = int(RATE * INPUT_BLOCK_TIME)

OVERSENSITIVE = 15.0 / INPUT_BLOCK_TIME
UNDERSENSITIVE = 120.0 / INPUT_BLOCK_TIME
MAX_TAP_BLOCKS = 0.15 / INPUT_BLOCK_TIME

MIN_GAP_MS = 100
MAX_GAP_MS = 1500

class ClapDetector:
    def __init__(self):
        self.pa = pyaudio.PyAudio()
        self.stream = self.open_mic_stream()
        self.tap_threshold = INITIAL_TAP_THRESHOLD
        self.noisycount = MAX_TAP_BLOCKS + 1
        self.quietcount = 0 
        self.errorcount = 0
        self.clap_times = []
        self.frame = 0
        
    def open_mic_stream(self, device_index=None):
        try:
            default_info = self.pa.get_default_input_device_info()
            print(f"Using: {default_info['name']}", file=sys.stderr)
            return self.pa.open(
                format=FORMAT,
                channels=min(CHANNELS, default_info['maxInputChannels']),
                rate=RATE,
                input=True,
                input_device_index=default_info['index'],
                frames_per_buffer=INPUT_FRAMES_PER_BLOCK
            )
        except Exception as e:
            print(f"Failed: {e}", file=sys.stderr)
            sys.exit(1)
    
    def get_rms(self, block):
        count = len(block) // 2
        shorts = struct.unpack("%dh" % count, block)
        sum_squares = sum((sample * SHORT_NORMALIZE)**2 for sample in shorts)
        return math.sqrt(sum_squares / count)
    
    def tap_detected(self, amplitude, duration_blocks):
        now = time.time() * 1000
        duration_ms = duration_blocks * INPUT_BLOCK_TIME * 1000
        
        if 10 <= duration_ms <= 150:
            self.clap_times = [t for t in self.clap_times if now - t < MAX_GAP_MS + 100]
            self.clap_times.append(now)
            
            if len(self.clap_times) >= 2:
                gap = self.clap_times[-1] - self.clap_times[-2]
                if MIN_GAP_MS <= gap <= MAX_GAP_MS:
                    result = {
                        "type": "double_clap",
                        "gap_ms": round(gap, 1),
                        "threshold": round(self.tap_threshold, 3)
                    }
                    print(json.dumps(result), flush=True)
                    self.clap_times = []
                    return
                elif gap < MIN_GAP_MS:
                    msg = f"Too fast ({gap:.0f}ms)"
                else:
                    msg = f"Too slow ({gap:.0f}ms)"
            else:
                msg = f"Single clap (duration: {duration_ms:.0f}ms)"
            
            result = {
                "type": "single_clap",
                "message": msg,
                "duration_ms": round(duration_ms, 1),
                "amplitude": round(amplitude, 3),
                "threshold": round(self.tap_threshold, 3)
            }
            print(json.dumps(result), flush=True)
    
    def listen(self):
        try:
            block = self.stream.read(INPUT_FRAMES_PER_BLOCK, exception_on_overflow=False)
        except Exception as e:
            self.errorcount += 1
            self.noisycount = 1
            return
        
        amplitude = self.get_rms(block)
        self.frame += 1
        
        if amplitude > self.tap_threshold:
            self.quietcount = 0
            self.noisycount += 1
            if self.noisycount > OVERSENSITIVE:
                self.tap_threshold = min(0.9, self.tap_threshold * 1.05)
                self.noisycount = OVERSENSITIVE
        else:
            if 1 <= self.noisycount <= MAX_TAP_BLOCKS:
                self.tap_detected(amplitude, self.noisycount)
            self.noisycount = 0
            self.quietcount += 1
            if self.quietcount > UNDERSENSITIVE:
                self.tap_threshold = max(0.00001, self.tap_threshold * 0.95)
                self.quietcount = UNDERSENSITIVE
    
    def run(self):
        try:
            while True:
                self.listen()
                if self.frame % 100 == 0:
                    status = {
                        "frame": self.frame,
                        "amplitude": 0.0,
                        "threshold": round(self.tap_threshold, 4),
                        "quietcount": self.quietcount
                    }
                    if self.frame % 200 == 0:
                        print(json.dumps({"status": status}), flush=True)
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()
    
    def stop(self):
        if hasattr(self, 'stream'):
            self.stream.stop_stream()
            self.stream.close()
        if hasattr(self, 'pa'):
            self.pa.terminate()

if __name__ == "__main__":
    print(json.dumps({"init": "Simulated Clap Detector", "threshold": INITIAL_TAP_THRESHOLD}), flush=True)
    detector = ClapDetector()
    detector.run()
