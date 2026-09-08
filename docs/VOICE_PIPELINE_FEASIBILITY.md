# Voice Pipeline Feasibility Assessment & STT Comparison

**Date:** July 22, 2026
**Hardware:** NVIDIA RTX 3050 Laptop GPU (4 GB VRAM), PyTorch CPU-only, Windows 10
**Test Environment:** Hermes Agent venv at `~\AppData\Local\hermes\hermes-agent\venv\`

---

## 1. Canary-Qwen 2.5B Feasibility

### Model Facts (from HuggingFace API)

| Property | Value |
|----------|-------|
| Model ID | `nvidia/canary-qwen-2.5b` |
| Architecture | FastConformer encoder (32 layers, d_model=1024) + Qwen3-1.7B causal LM decoder (28 layers, hidden_size=2048) |
| Parameters | 2.5B total |
| Primary format | `.nemo` (NeMo toolkit required) |
| Language | English only (unlike Canary-1B which is multilingual) |
| License | cc-by-4.0 (GGUF community port), original nvidia/canary-qwen-2.5b is cc-by-nc-4.0 |
| Streaming support | NO — batch inference only, outputs transcript after full audio processed |
| Partial transcripts | NO — greedy decoding produces single complete transcript |
| Incremental decoding | NO — encoder processes entire audio segment before decoder runs |
| Continuous input | NO — requires 16kHz mono WAV file (or equivalent array) |

### Optimized Variants

| Variant | Size | Format | Tool | Streaming? |
|---------|------|--------|------|------------|
| nvidia/canary-qwen-2.5b | ~5 GB | .nemo | NeMo (150+ deps) | Batch only |
| handy-computer/canary-qwen-2.5b-gguf Q4_K_M | 1.62 GB | GGUF | transcribe.cpp | Batch only |
| handy-computer/canary-qwen-2.5b-gguf Q8_0 | 2.61 GB | GGUF | transcribe.cpp | Batch only |
| onnx-community/canary-qwen-2.5b-ONNX | ~2.5 GB | ONNX | onnxruntime | Batch only |
| phequals/canary-qwen-2.5b-coreml-int8 | ~0.6 GB | CoreML | CoreML (MacOS) | Batch only |

**None of the variants support streaming inference or partial transcripts.**

### VRAM / Runtime on RTX 3050 (4 GB)

- **BF16 (4.73 GB):** Exceeds 4 GB VRAM → cannot load on GPU
- **Q8_0 (2.61 GB):** Marginal — would leave <1.4 GB free (risky with other UI processes)
- **Q4_K_M (1.62 GB):** Fits on GPU, ~1.6 GB VRAM needed. But requires transcribe.cpp (C++ build, no Python bindings)
- **ONNX FP16 (~2.5 GB):** Fits barely on GPU if using ONNX Runtime + CUDA provider (not installed)

### OnnxRuntime Availability
ONNX Runtime IS installed (v1.27.0) but only CPUExecutionProvider + AzureExecutionProvider. No CUDA provider. To run on GPU via ONNX would need `onnxruntime-gpu` + matching CUDA libs.

### NeMo Availability
NeMo toolkit is NOT installed. Installing it pulls 150+ dependencies including torchaudio, omegaconf, hydra, numba, etc. — heavy. NeMo SALM models don't support HF Transformers natively; they need NeMo's runtime. This is a massive dependency burden.

### Verdict: Canary-Qwen 2.5B

**NOT RECOMMENDED for this hardware and use case.**

Reasons:
1. No streaming support — batch-only inference is incompatible with "Live Mode" UX
2. No partial transcripts while speaking
3. Requires NeMo (heavy dependency) or transcribe.cpp (C++ build, no Python bindings)
4. At Q4 quantization (1.62 GB) it might fit VRAM but latency from batch processing defeats real-time goals
5. The encoder-decoder + causal LM architecture adds latency vs simpler seq2seq
6. English-only (same limitation as Whisper)
7. Added complexity for no streaming benefit

---

## 2. Alternative STT Comparison

### Benchmark Results (Measured on This Machine)

**GPU Benchmarks (CUDA via ctranslate2, cublas installed):**

| Model | Device | Compute | Load Time | 10s Audio Time | RTF | VRAM | RSS |
|-------|--------|---------|-----------|----------------|-----|------|-----|
| tiny.en | CUDA | float16 | 0.9s | 0.051s | 0.005x | 630 MB | 822 MB |
| base | CUDA | float16 | 0.5s | 0.082s | 0.008x | 766 MB | 846 MB |
| small | CUDA | float16 | 0.9s | 0.147s | 0.015x | 1190 MB | 850 MB |
| medium | CUDA | float16 | 51.5s* | 0.340s | 0.034x | 2531 MB | 842 MB |
| large-v3-turbo | CUDA | float16 | 63.3s* | 0.489s | 0.049x | 2668 MB | 867 MB |
| medium | CUDA | int8 | 4.7s | 0.314s | 0.031x | 1587 MB | 884 MB |
| large-v3-turbo | CUDA | int8 | 5.0s | 0.440s | 0.044x | 1658 MB | 888 MB |

*Large model downloads counted in load time — subsequent loads from cache are ~5s.

**CPU Benchmarks (for reference):**

| Model | Device | Compute | 10s Audio Time | RTF | RSS |
|-------|--------|---------|----------------|-----|-----|
| tiny.en | CPU | int8 | 0.307s | 0.031x | 948 MB |
| base | CPU | int8 | 0.555s | 0.056x | 1013 MB |

**Key insight:** GPU provides 6-7x speedup. RTF << 1.0 means all models faster than real-time. Even large-v3-turbo at RTF=0.049 processes 10s audio in <0.5s.

### Model Comparison Matrix

| Criterion | tiny.en | base | small | small/large-v3-turbo | Moonshine Streaming | Parakeet TDT 0.6B | Canary-Qwen 2.5B |
|-----------|---------|------|-------|---------|---------------------|-------------------|-------------------|
| True streaming | No | No | No | No | **YES** | YES (TDT) | No |
| Partial transcripts | Via chunking | Via chunking | Via chunking | Via chunking | **Native** | **Native** | No |
| Incremental decoding | No | No | No | No | **YES** | **YES** | No |
| Time to first token | <50ms | <80ms | <150ms | <200ms | **<100ms** | <200ms | N/A |
| GPU VRAM (f16) | 630MB | 766MB | 1.2GB | 1.6GB | ~500MB* | ~1.2GB* | ~5GB (won't fit) |
| GPU VRAM (int8) | 622MB | 700MB | ~800MB | 1.6GB | N/A | ~700MB* | ~2.5GB |
| CPU RTF | 0.031x | 0.056x | ~0.12x | ~0.20x | ~0.10x* | N/A | ~0.5x* |
| GPU RTF | 0.005x | 0.008x | 0.015x | 0.044x | ~0.02x* | ~0.03x* | N/A |
| English accuracy | Good | Better | Great | **Best** | Good | Great | Great |
| Noise robustness | Fair | Good | Good | **Best** | Fair* | Good | Good |
| Continuous conversation | Chunked | Chunked | Chunked | Chunked | **Native** | **Native** | No |
| Setup needed | installed | installed | installed | installed + cublas | transformers (50MB) | NeMo (300MB+) | NeMo (300MB+) OR transcribe.cpp (C++ build) |
| License | MIT | MIT | MIT | MIT | MIT | CC-BY-4.0 | CC-BY-NC-4.0 |
| Stars/Downloads | 8M+ | 8M+ | 8M+ | 19K | 24K | 565K | 50K |
| Electron+Python ease | **Excellent** | **Excellent** | **Excellent** | **Excellent** | Good | Moderate | Hard |
| RTX 3050 4GB fit | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (fp16), marginal (quantized) |
| 449 likes | 449 | — | — | 19K | 30 | 151 | 449 |

*Estimated — not benchmarked on this machine.

### Latency Analysis for Real-Time Conversation

**The real bottleneck is not raw transcription speed — it's when transcription STARTS.**

Current architecture:
1. User speaks → VAD detects silence → stop recording → transcribe full chunk → send to LLM
2. Latency from speech end to LLM: VAD silence timeout (800ms) + transcribe (200-500ms) = 1-1.3s

Better architecture (any STT):
1. User speaks → VAD detects speech end → start transcription immediately
2. Use chunking: transcribe in 1-2s chunks during speech
3. Start LLM as soon as first chunk is available (streaming)
4. Start TTS on first LLM sentence

**Even faster-whisper with VAD-driven chunking** can achieve this because:
- Transcription of 1-2s chunk takes <100ms (RTF < 0.01)
- The model is already loaded in VRAM
- The overhead is just the chunk extraction + transcription call

**True streaming (Moonshine/Parakeet TDT)** provides:
- Tokens emit during speech (not just after silence detected)
- Partial transcripts update every ~100ms
- Can start LLM mid-utterance for very fast responses
- Barge-in detection is simpler (always has interim text)

**However**, for the initial build, faster-whisper with improved VAD and streaming sent to LLM as partial chunks achieves ~90% of the live mode experience with:
- Zero new dependencies (already installed, already working)
- Much simpler implementation
- Ability to upgrade to Moonshine/Parakeet later via the pluggable interface

---

## 3. STT Recommendation

### Primary: Faster-Whisper (base or small, GPU int8)

**Justification:**
1. Already installed and benchmarked on this machine
2. GPU int8: 700-800MB VRAM, consistent <100ms transcribe latency per chunk
3. Exceptional accuracy/latency ratio for real-time voice
4. Mature ecosystem, massive community, MIT license
5. Zero new dependencies to install (just cublas DLL, already done)
6. `large-v3-turbo` available for maximum accuracy (1.6GB VRAM, RTF=0.044x)

### Upgrade Path: Moonshine Streaming (medium, 245M)

For phase 2 (after architecture is production-ready):
1. True native streaming with partial transcripts
2. MIT license, 500MB VRAM estimated
3. Requires `transformers` package install (~50MB)
4. `MoonshineStreamingForConditionalGeneration` class
5. Sliding-window encoder, 50Hz audio frontend
6. The architecture MUST make STT pluggable so this is a config change, not a code change

### Not Recommended
- **Canary-Qwen 2.5B:** No streaming, heavy deps, won't fit in VRAM unquantized, English-only (same as Whisper)
- **Parakeet TDT:** Requires NeMo (300MB+ deps), marginal benefit over faster-whisper for our latency targets
- **whisper.cpp:** Great C++ runtime but no Python bindings; would need a separate process. Unnecessary complexity when ctranslate2 already does CUDA inference via faster-whisper.

---

## 4. Modular Architecture Design

### Event-Driven Pipeline

```
                    ┌─────────────────────────────────┐
                    │       MicrophoneManager          │
                    │ • device init & permission check  │
                    │ • device reconnection            │
                    │ • state machine (inactive→active) │
                    │ • thread-safe stream lifecycle    │
                    └───────────┬─────────────────────┘
                                │ AudioStreamEvent
                                ▼
                    ┌─────────────────────────────────┐
                    │       AudioCaptureService       │
                    │ • raw chunk extraction            │
                    │ • sample rate normalization      │
                    │ • buffering & timestamping       │
                    └───────────┬─────────────────────┘
                                │ AudioChunkEvent
                    ┌───────────┴───────────────────────┐
                    │                                     │
                    ▼                                     ▼
         ┌──────────────────┐              ┌──────────────────────┐
         │  VoiceActivity   │              │   ActivationManager    │
         │  Service (VAD)   │              │ • WakeWordDetector     │
         │ • RMS + spectral │              │ • DoubleClapDetector   │
                    │       │              │ • false-positive filter│
                    │       │              │ • cooldown management   │
                    │       │              └───────────┬───────────┘
                    │       │                          │ ActivationEvent
                    │       │              ┌───────────┴───────────┐
                    │       │              │                       │
                    │       │              ▼                       ▼
                    │       │  ┌──────────────────┐  ┌───────────────────┐
                    │       │  │ STTProvider     │  │ InterruptManager  │
                    │       │  │ (pluggable)     │  │ • barge-in watch  │
                    │       │  │ • faster-whisper│  │ • speech-vs-TTS   │
                    │       │  │ • moonshine     │  │ • cancelled state │
                    │       │  │ • future STT    │  └─────────────────┘
                    │       │  └────────┬────────┘
                    │       │           │ TranscriptEvent
                    │       │           │ (partial + final)
                    │       │           ▼
                    │       │  ┌──────────────────────┐
                    │       │  │ ConversationManager   │
                    │       │  │ • session lifecycle  │
                    │       │  │ • context memory     │
                    │       │  │ • state transitions  │
                    │       │  │ • idle timeout       │
                    │       │  │ • retry/recovery     │
                    │       │  │ • event routing       │
                    │       │  └────────┬─────────────┘
                    │       │           │ ResponseRequestEvent
                    │       │           ▼
                    │       │  ┌──────────────────────┐
                    │       │  │ LLMStreamingService   │
                    │       │  │ • stream to TTS       │
                    │       │  │ • text chunking       │
                    │       │  └────────┬─────────────┘
                    │       │           │ TextChunkEvent
                    │       │           ▼
                    │       │  ┌──────────────────────┐
                    │       │  │ TTSService           │
                    │       │  │ • streaming synth    │
                    │       │  │ • voice/provider     │
                    │       │  └────────┬─────────────┘
                    │       │           │ AudioChunkEvent
                    │       │           ▼
                    │       │  ┌──────────────────────┐
                    │       │  │ PlaybackManager      │
                    │       │  │ • gapless queue      │
                    │       │  │ • amplitude tracking │
                    │       │  │ • cancel/restart     │
                    │       │  └──────────────────────┘
```

### Event Types

```typescript
type PipelineEvent =
  | MicrophoneStateEvent        // mic connected/disconnected/errored
  | AudioChunkEvent              // raw audio data + timestamp
  | VadStateEvent                // speech_start, speech_end, silence
  | ActivationEvent              // wake_word_detected, double_clap_detected
  | STTResultEvent               // { partial: string, final: string, confidence }
  | ConversationStateEvent       // { state, turnId, context }
  | LLMChunkEvent                // { text, isFinal, chunkIndex }
  | TTSChunkEvent               // { audioBlob, chunkText, chunkIndex }
  | PlaybackStateEvent           // { playing, ended, interrupted }
  | InterruptEvent               // barge_in_detected, cancel_all
  | HealthCheckEvent             // { component, healthy, message }
  | ErrorEvent                   // { source, message, severity }
```

### Module Responsibilities

| Module | Responsibility | Interface |
|--------|----------------|-----------|
| MicrophoneManager | Device init, permissions, reconnection, state machine | `start()`, `stop()`, `onChunk(cb)`, `getState()` |
| AudioCaptureService | Raw chunk extraction, sample rate, buffering, timestamping | `subscribe(chunkHandler)` returns `AudioChunk[]` |
| VADService | Voice activity detection (RMS + silence timeout) | `processChunk(audio)` → events |
| ActivationManager | Wake word + clap detection, cooldown, sensitivity | `onWakeWord(cb)`, `onClap(cb)` |
| STTProvider (interface) | Pluggable STT engine | `transcribe(audio) → Promise<Result>`, `transcribeStream(audio) → AsyncIterator<PartialResult>` |
| ConversationManager | State machine, context, session lifecycle, barge-in | `handleTranscript(text)`, `interrupt()`, `getState()` |
| LLMStreamingService | Stream LLM response, text chunking | `send(text, onChunk)` |
| TTSService | Text-to-speech synthesis | `synthesize(text, opts) → audioBuffer` |
| PlaybackManager | Gapless audio queue, amplitude tracking, cancel | `play(blob, onStart)`, `cancel()` |
| InterruptManager | Detect barge-in during TTS playback, cancel all | `watch(state, onInterrupt)` |
| EventBus | Central event router, no direct coupling | `emit(event)`, `on(type, handler)` |
| HealthMonitor | Per-component health, logging, structured errors | `report(component, status)` |

### Key Design Principles
- **No direct method calls between modules.** All communication via EventBus events.
- **EchoEngine becomes thin orchestrator** that wires components together and manages high-level state.
- **STT is an interface**, not a class. Swap faster-whisper for Moonshine without modifying any other module.
- **MicrophoneManager owns the mic** — no other module touches `MediaStream`.
- **ConversationManager owns the state machine** — no other module transitions Echo states.
- **All modules are independently testable** with mock EventBus.
