# EchoEngine Decomposition & Implementation Roadmap

## Current State (Problems)

The current `EchoEngine.ts` (787 lines) is a monolith owning:
1. `navigator.mediaDevices.getUserMedia()` — mic management
2. `MediaRecorder` — audio capture
3. `AnalyserNode` + RMS loop — VAD
4. `webkitSpeechRecognition` — live/interim transcription
5. `MediaRecorder` → IPC → whisper_daemon — final transcription
6. IPC → `hermes.exe` — LLM response
7. `electronAPI.synthesizeSpeech` → audio chunks — TTS
8. `Audio` + `AudioContext` — playback
9. `webkitSpeechRecognition` — interrupt detection
10. Silencing, screenshot capture, exit-word logic — conversation control

All coupled in one class with mutable state, no error boundaries, no recovery.

## Target State (Modular)

### File Structure

```
src/audio/
  EchoEngine.ts          (thin orchestrator, <200 lines)
  pipeline/
    EventBus.ts          (typed event emitter)
    types.ts             (PipelineEvent union types)
    MicrophoneManager.ts (device state machine)
    AudioCaptureService.ts (chunk extraction + buffering)
    VADService.ts        (RMS + silence detection, pluggable)
    ActivationManager.ts (wake word + clap coordination)
    STTProvider.ts      (interface + factory)
    ConversationManager.ts (state machine + context)
    LLMStreamingService.ts (IPC → hermes → stream)
    TTSService.ts       (IPC → synthesize → audio)
    PlaybackManager.ts  (gapless audio queue)
    InterruptManager.ts (barge-in detection + cancel)
    HealthMonitor.ts    (structured logging + status)
  providers/
    FasterWhisperSTT.ts  (faster-whisper via Python daemon)
    MoonshineSTT.ts     (future: transformers streaming)
    WebSpeechSTT.ts     (fallback: Web Speech API)
  EchoState.ts          (state enum + transitions)
```

### EchoEngine V2 (Thin Orchestrator)

```typescript
class EchoEngine {
  // Wire up pipeline, own nothing except the EventBus
  private bus = new EventBus();
  private mic = new MicrophoneManager(this.bus);
  private capture = new AudioCaptureService(this.bus);
  private vad = new VADService(this.bus);
  private activation = new ActivationManager(this.bus);
  private stt = STTProvider.create(this.bus, config.sttProvider);
  private conversation = new ConversationManager(this.bus);
  private llm = new LLMStreamingService(this.bus);
  private tts = new TTSService(this.bus);
  private playback = new PlaybackManager(this.bus);
  private interrupt = new InterruptManager(this.bus);
  private health = new HealthMonitor(this.bus);

  start() {
    this.bus.emit({ type: 'pipeline_start' });
  }
  destroy() {
    this.bus.emit({ type: 'pipeline_stop' });
    this.bus.removeAllListeners();
  }
  // Wire renderer callbacks to events
  setupCallbacks(callbacks: EchoEngineCallbacks) {
    this.bus.on('conversation_state', e => callbacks.onStateChange(e.state));
    this.bus.on('stt_result', e => callbacks.onTranscriptUpdate(e.final));
    this.bus.on('stt_partial', e => callbacks.onInterimTranscriptUpdate(e.partial));
    this.bus.on('llm_chunk', e => callbacks.onAgentTextUpdate(e.text));
    this.bus.on('amplitude', e => callbacks.onAmplitudeUpdate(e.value));
    this.bus.on('tts_chunk_start', e => callbacks.onTtsChunkStart(e.text));
    this.bus.on('pipeline_exit', () => callbacks.onExit());
  }
}
```

### MicrophoneManager V2 (Deterministic State Machine)

```
States: inactive → requesting → active → suspended → recovering → error → inactive

Transitions (all logged):
  inactive → requesting   : start()
  requesting → active     : getUserMedia success
  requesting → error       : permission denied / no device
  active → suspended       : visibilitychange, resource pause
  active → recovering      : stream track ended unexpectedly
  suspended → active       : resume
  recovering → active      : re-acquire stream, same settings
  recovering → error       : 3 consecutive failures
  error → requesting       : retry with backoff (1s, 2s, 4s)
  any → inactive           : destroy()

Thread safety: all state transitions go through a single async queue.
No overlapping getUserMedia calls. No race conditions on stream tracks.
```

### ConversationManager V2 (State Machine)

```
States: idle → listening → processing → thinking → speaking → interrupted → idle

Transitions (event-driven):
  idle → listening         : activation event (wake word / clap / hotkey)
  listening → processing   : VAD speech_end
  processing → thinking   : STT final result received
  thinking → speaking     : first TTS chunk ready
  speaking → interrupted   : barge-in detected
  speaking → listening     : TTS playback complete
  interrupted → listening : interrupt cooldown (400ms)
  any → idle               : exit phrase / shutdown

Context memory:
  - Maintains conversation history within Echo session
  - Passes context to LLM via hermes session resume
  - Handles idle timeout (configurable, default 5min → auto-close)

Retry policy:
  - STT failure → retry once with fallback provider
  - LLM failure → notify user, return to listening
  - TTS failure → skip chunk, continue with next
```

---

## Implementation Roadmap

### Phase 1 — Foundation (Day 1)
1. Create `EventBus.ts` — typed event emitter with debug logging
2. Create `types.ts` — all pipeline event types
3. Create `MicrophoneManager.ts` — device state machine with recovery
4. Create `AudioCaptureService.ts` — chunk extraction + buffering
5. Create `VADService.ts` — extract VAD logic from EchoEngine
6. Integration test: mic → capture → VAD events flowing through bus

### Phase 2 — STT Provider (Day 1)
1. Create `STTProvider.ts` — interface with `transcribe(audio)` and `transcribeStream(audio)`
2. Refactor whisper_daemon.py → accept streaming audio chunks via stdio
3. Create `FasterWhisperSTT.ts` — Python daemon client, now with GPU support
4. Create `WebSpeechSTT.ts` — fallback provider using Web Speech API
5. STT provider factory: select by config (`stt.engine: 'faster-whisper' | 'web-speech'`)
6. Integration test: VAD speech_end → STT → partial + final transcript events

### Phase 3 — Conversation + LLM (Day 2)
1. Create `ConversationManager.ts` — state machine + context
2. Create `LLMStreamingService.ts` — extract from EchoEngine.sendToAgent
3. Wire: STT final → ConversationManager → LLM → chunk events
4. Add idle timeout, exit phrase handling
5. Integration test: speech → transcript → LLM response → text streaming

### Phase 4 — TTS + Playback (Day 2)
1. Create `TTSService.ts` — extract from EchoEngine chunking
2. Create `PlaybackManager.ts` — gapless queue + amplitude
3. Create `InterruptManager.ts` — barge-in detection
4. Wire: LLM chunk → TTS → playback → amplitude events
5. Interrupt: speech during speaking → cancel TTS → return to listening
6. Integration test: full pipeline speech → LLM → TTS → playback

### Phase 5 — Activation (Day 3)
1. Refactor `clap-detector.ts` → subscribe to ActivationManager
2. Refactor `wake-detector.ts` → subscribe to ActivationManager
3. Add sensitivity, cooldown, false-positive filtering
4. Wire: activation → ConversationManager.startListening()
5. Integration test: clap/wake → echo mode → full pipeline

### Phase 6 — EchoEngine V2 + Migration (Day 3)
1. Create thin `EchoEngine.ts` — orchestrator only
2. Map all renderer callbacks to EventBus events
3. Migrate `useEchoSession.ts` hook to work with new events
4. Migrate `useEchoKeyboard.ts` — push-to-talk via events
5. Integration test: full end-to-end in Electron app

### Phase 7 — Polish & Testing (Day 4)
1. Error boundaries: every module has `try/catch` with `ErrorEvent` emission
2. Health monitor: structured logging, per-module status reports
3. Auto-recovery: mic disconnect → reconnect, STT failure → fallback
4. Performance: first transcript <300ms after VAD speech_end
5. Build verification: `npm run build` passes
6. Manual test: clap activation, wake word, voice conversation, interrupt

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Microphone permission revoked mid-session | Medium | High | MicrophoneManager auto-recovery with user notification |
| STT daemon crash | Medium | High | HealthMonitor restarts daemon, falls back to Web Speech |
| GPU VRAM exhaustion (other apps) | Medium | Medium | STT provider can fall back to CPU int8 |
| Event ordering bugs | Low | Medium | EventBus keeps ordering guarantees, ConversationManager validates sequences |
| Barge-in false positives | Medium | Low | Configurable sensitivity, cooldown, VAD gate |
| LLM timeout | Low | Medium | 120s timeout, graceful recovery to listening |
| TTS synth failure | Medium | Low | Skip failed chunk, continue queue |
| Electron renderer tab visibility pausing mic | High | Medium | MicrophoneManager handles visibilitychange |
| Push-to-talk key conflicts | Low | Low | Config hotkey, already handled |

### Fallback Strategy

If architecture refactor takes too long or introduces instability:
- Keep Whisper daemon fallback working at all stages
- Boot new pipeline behind feature flag: `config.useNewPipeline: true/false`
- Old EchoEngine available as fallback until new pipeline is validated
- Each module has integration tests that can run independently

---

## Latency Budget (Target)

```
VAD speech detected → 50ms
VAD silence (speech end) → config (200ms aggressive, 800ms conservative)
STT transcription start → <10ms (model in VRAM)
STT first result → <100ms (1-2s chunk, GPU)
LLM first token → <300ms (streaming via hermes IPC)
TTS first audio → <500ms (first sentence chunk)
Total: speech end to audio start → <1s (conservative)
Total: speech end to audio start → <600ms (aggressive)
```

This is achievable with faster-whisper on GPU (measured RTF=0.008x for base model).
