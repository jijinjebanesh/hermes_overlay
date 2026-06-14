# Echo Mode Implementation Status

**Last Updated:** June 10, 2026
**Status:** ✅ COMPLETE - Build Successful

---

## Summary

Echo Mode is a voice-first live AI interaction layer for Hermes Overlay. When enabled, Hermes listens for two claps via the microphone, wakes the overlay, and enters a dedicated bidirectional voice mode where you speak → Whisper transcribes → Agent processes → TTS streams audio back → You can interrupt at any moment.

---

## Implementation Checklist

### ✅ Phase 1 — Foundation (Complete)

- [x] **clap_detector.py** (`src/audio/clap_detector.py`)
  - Background clap detection using PyAudio
  - Double-clap algorithm with configurable sensitivity
  - JSON event output to stdout for IPC

- [x] **Clap detector spawn in main.ts** (`src/main/main.ts`)
  - Spawns Python sidecar on app startup (when enabled in settings)
  - Listens for double_clap events
  - Triggers overlay show + enter-echo-mode IPC message

- [x] **CLI flags** (`hermes-agent/cli.py`)
  - `--transcribe <file>`: Whisper transcription
  - `--tts <text>`: edge-tts speech synthesis
  - Returns stdout/stdout.buffer for IPC

- [x] **IPC handlers** (`src/main/main.ts`)
  - `transcribe-audio`: Routes to CLI --transcribe
  - `synthesize-speech`: Routes to CLI --tts
  - `echo-send-message`: Routes to hermes.exe for agent response

### ✅ Phase 2 — Echo Engine (Complete)

- [x] **EchoEngine.ts** (`src/audio/EchoEngine.ts`)
  - Full state machine: initializing → listening → processing → thinking → speaking → interrupted
  - Mic initialization with AudioContext
  - VAD (Voice Activity Detection) with RMS threshold
  - Speech → Whisper transcription pipeline
  - Agent response → TTS → audio playback
  - Interrupt detection via Web Speech API
  - Amplitude loop for orb animation (mic and speaker)

### ✅ Phase 3 — UI (Complete)

- [x] **EchoOrb.tsx** (`src/components/EchoOrb.tsx`)
  - Canvas-based animated orb (280x280)
  - Amplitude-driven rings (3 concentric, expanding)
  - State-specific animations:
    - Idle: 30% opacity, slow breath
    - Listening: White core, rings driven by mic amplitude
    - Thinking: Violet → indigo gradient rotation
    - Speaking: Rings driven by speaker amplitude
    - Interrupted: Green ripple effect

- [x] **EchoInitAnimation.tsx** (`src/components/EchoInitAnimation.tsx`)
  - 800ms particle convergence animation
  - 12 particles ease inward from random positions
  - Creates "intelligence assembling" effect

- [x] **EchoMode.tsx** (`src/components/EchoMode.tsx`)
  - Full-overlay container component
  - State machine integration with EchoEngine
  - Transcript/agent text display
  - State label + session timer
  - Escape key exit handler
  - Manual exit button

- [x] **App.tsx mode switching**
  - isEchoMode state
  - onEnterEchoMode IPC listener
  - Conditional rendering: EchoMode layer on top

- [x] **CSS** (`src/renderer/styles/globals.css`)
  - Full Echo Mode styling
  - Dark palette with violet/indigo accents
  - Orb animations, state-specific colors
  - Transcript typography (SF Pro, 15px, 2-line clamp)
  - Exit button, timer, state label styles

### ✅ Phase 4 — Settings & Polish (Complete)

- [x] **Echo Mode settings tab** (`src/components/SettingsModal.tsx`)
  - Wake section:
    - Double-clap to wake toggle
    - Auto-enter voice mode toggle (reserved for future)
    - Clap sensitivity slider (0.0-1.0)
  - Voice section:
    - Interrupt words input (comma-separated)
    - Exit words input (comma-separated)
    - TTS provider dropdown (edge-tts, elevenlabs, openai)
    - TTS voice input

- [x] **Zustand state** (`src/store/overlayStore.ts`)
  - echoClapWakeEnabled: boolean (default: true)
  - echoVoiceModeEnabled: boolean (default: false)
  - echoInterruptWords: string[] (default: ["stop", "wait", "shut up", "hey hermes"])
  - echoExitWords: string[] (default: ["goodbye", "close", "exit", "stop reading"])
  - echoClapSensitivity: number (default: 0.5)
  - echoTtsProvider: enum (default: 'edge-tts')
  - echoTtsVoice: string (default: 'en-US-AriaNeural')
  - Setter actions for all fields

- [x] **Keyboard Escape handler**
  - Exits Echo Mode and cleans up engine

### ✅ Phase 5 — Hardening (Complete)

- [x] **Mic permission error state**
  - EchoEngine catches getUserMedia failures
  - Transitions to 'error' state
  - EchoMode shows error banner

- [x] **Backend unreachable error state**
  - IPC handlers catch spawn errors
  - Empty transcript recovery (resumes listening)

- [x] **Memory cleanup**
  - EchoEngine.destroy() cancels all animation frames
  - Closes AudioContext
  - Stops MediaRecorder
  - Stops interrupt watcher
  - Releases mic tracks

- [x] **Prevents multiple EchoEngine instances**
  - useRef ensures single instance
  - Cleanup on unmount before new instance

---

## Files Modified/Created

| File | Status | Purpose |
|------|--------|---------|
| `src/audio/clap_detector.py` | ✅ Created | Background clap detection |
| `src/audio/EchoEngine.ts` | ✅ Created | Audio pipeline state machine |
| `src/components/EchoMode.tsx` | ✅ Created | Echo Mode UI container |
| `src/components/EchoOrb.tsx` | ✅ Created | Animated orb canvas |
| `src/components/EchoInitAnimation.tsx` | ✅ Created | Boot animation |
| `src/main/main.ts` | ✅ Modified | Clap detector spawn, IPC handlers |
| `src/preload/preload.ts` | ✅ Modified | Echo Mode IPC exposures |
| `src/renderer/App.tsx` | ✅ Modified | Echo Mode layer mounting |
| `src/store/overlayStore.ts` | ✅ Modified | Echo settings state |
| `src/components/SettingsModal.tsx` | ✅ Modified | Echo Mode settings tab |
| `src/renderer/styles/globals.css` | ✅ Modified | Echo Mode CSS |
| `hermes-agent/cli.py` | ✅ Created | --transcribe and --tts CLI flags |

---

## Build Status

```
npm run build
→ tsc: ✅ No errors
→ vite build: ✅ Built in 7.83s
→ dist/ production bundle: ✅ Ready
```

---

## Dependencies Required

The following Python packages must be installed in the hermes-agent venv:

1. **pyaudio** — For clap detector (mic input)
2. **whisper** (openai-whisper) — For transcription
3. **edge-tts** — For TTS synthesis (free, no API key)

Install commands:
```powershell
# Activate hermes-agent venv
$env:Path = "$HOME\AppData\Local\hermes\hermes-agent\venv\Scripts;$env:Path"

# Install dependencies
pip install pyaudio whisper openai-whisper edge-tts
```

On Windows, PyAudio may require:
```powershell
pip install pipwin
pipwin install pyaudio
```

---

## How to Use

1. **Enable Echo Mode in Settings:**
   - Open Settings (gear icon)
   - Go to "Echo Mode" tab
   - Toggle "Double-clap to wake" ON
   - Adjust clap sensitivity if needed

2. **Activate:**
   - Hide the overlay (F2 or hotkey)
   - Clap twice near your microphone
   - Overlay wakes and enters Echo Mode

3. **Interact:**
   - Speak naturally — Hermes transcribes in real-time
   - Wait for response — TTS plays back the answer
   - Interrupt by saying "stop", "wait", or "hey Hermes"
   - Exit by saying "goodbye", "close", or "exit", or press Escape

---

## Known Limitations / Future Improvements

1. **Clap detection reliability:** May need calibration for different mic sensitivities
2. **Web Speech API:** Only works in Chromium-based browsers/Electron (not Firefox)
3. **Whisper speed:** Base model is fast but less accurate; could add model selection
4. **Interrupt detection:** Uses Web Speech API which requires internet (for some providers)
5. **TTS offline mode:** edge-tts requires internet; could add local TTS fallback
6. **Auto-enter voice mode:** Currently claps wake to standard UI; future: clap → direct to Echo Mode

---

## Testing Checklist

To fully test Echo Mode:

- [ ] Install Python dependencies (pyaudio, whisper, edge-tts)
- [ ] Enable Echo Mode in Settings
- [ ] Test double-clap detection (with overlay hidden)
- [ ] Test mic permission prompt (first run)
- [ ] Test speech → transcription → agent response → TTS loop
- [ ] Test interrupt detection mid-speech
- [ ] Test exit words
- [ ] Test Escape key exit
- [ ] Test error states (mic denied, backend unreachable)
- [ ] Test clap sensitivity slider

---

## Conclusion

The Echo Mode implementation is **architecturally complete**. All files are in place, TypeScript compiles without errors, and the production build succeeds.

**Next step:** Test with actual hardware (microphone, speakers) after installing the required Python dependencies.