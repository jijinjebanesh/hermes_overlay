import { useOverlayStore } from '../store/overlayStore';
import '../types/electron-api.d';

export type EchoState =
  | 'initializing'   // Mic permission check, first 800ms
  | 'listening'      // VAD active, waiting for speech
  | 'processing'     // Speech ended, Whisper running
  | 'thinking'       // Transcript sent to backend, waiting for response
  | 'speaking'       // TTS playing, agent is talking
  | 'interrupted'    // Interrupt word detected mid-speak
  | 'error';         // Mic denied or backend unreachable

export interface EchoEngineCallbacks {
  onStateChange: (state: EchoState) => void;
  onTranscriptUpdate: (text: string) => void;
  onAgentTextUpdate: (text: string) => void;
  onAmplitudeUpdate: (amplitude: number) => void;
  onExit: () => void;
}

/**
 * EchoEngine — Core audio pipeline for Echo voice mode.
 *
 * Architecture:
 * 1. Mic → AnalyserNode (amplitude) + MediaRecorder (capture)
 * 2. VAD via RMS threshold → silence detection → speech end
 * 3. Live interim transcription via Web Speech API
 * 4. Whisper transcription (final) via IPC
 * 5. LLM response via IPC
 * 6. TTS streaming: sentence-boundary chunking → synthesize per chunk → gapless playback
 * 7. Interrupt detection via parallel Speech Recognition during TTS
 *
 * Key change: streamTTS now chunks the response at sentence boundaries
 * and sends each chunk to TTS immediately, rather than waiting for the
 * full response. Audio chunks are queued for gapless playback.
 */
export class EchoEngine {
  private audioCtx: AudioContext | null = null;
  public micStream: MediaStream | null = null; // public for mute access
  private analyser: AnalyserNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private ttsAudio: HTMLAudioElement | null = null;
  private ttsAnalyser: AnalyserNode | null = null;
  private ttsCtx: AudioContext | null = null;
  private amplitudeFrame: number = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private interruptWatcher: any = null;
  private liveRecognition: any = null;
  private currentState: EchoState = 'initializing';
  private isDestroyed: boolean = false;

  // TTS chunk queue for gapless playback
  private ttsQueue: { blob: Blob; text: string }[] = [];
  private ttsPlaying: boolean = false;
  private ttsCancelled: boolean = false;
  private currentTtsUrl: string | null = null;

  constructor(private callbacks: EchoEngineCallbacks) {
    const originalOnStateChange = callbacks.onStateChange;
    (this as any).callbacks.onStateChange = (state: EchoState) => {
      this.currentState = state;
      originalOnStateChange(state);
    };
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async start() {
    this.callbacks.onStateChange('initializing');
    await this.delay(1200);

    try {
      await this.initMic();
      this.startListening();
    } catch (e) {
      console.error('Mic initialization failed', e);
      this.callbacks.onStateChange('error');
    }
  }

  destroy() {
    this.isDestroyed = true;
    this.ttsCancelled = true;
    cancelAnimationFrame(this.amplitudeFrame);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.ttsAudio) {
      this.ttsAudio.pause();
      this.ttsAudio.src = '';
    }
    if (this.currentTtsUrl) {
      URL.revokeObjectURL(this.currentTtsUrl);
    }
    this.ttsQueue = [];
    this.stopLiveRecognition();
    this.stopInterruptWatcher();
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
    }
    if (this.audioCtx) {
      this.audioCtx.close();
    }
    if (this.ttsCtx) {
      this.ttsCtx.close();
    }
  }

  /**
   * Public API: Send a typed text message into the Echo pipeline.
   * Bypasses STT — goes directly to the LLM agent, then TTS response.
   * Called from "Type to Echo" input in EchoMode.
   */
  async sendTextMessage(text: string) {
    if (this.isDestroyed || !text.trim()) return;

    // Stop listening while processing the text message
    cancelAnimationFrame(this.amplitudeFrame);
    this.stopLiveRecognition();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Check for exit phrase
    if (this.isExitPhrase(text.toLowerCase())) {
      this.callbacks.onExit();
      return;
    }

    // Set transcript and transition to thinking
    this.callbacks.onTranscriptUpdate(text);
    this.callbacks.onStateChange('thinking');
    await this.sendToAgent(text);
  }

  private async initMic() {
    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
    });
    this.audioCtx = new AudioContext({ sampleRate: 16000 });
    
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    
    const source = this.audioCtx.createMediaStreamSource(this.micStream);
    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
  }

  private startListening() {
    if (this.isDestroyed) return;
    this.callbacks.onStateChange('listening');
    this.callbacks.onTranscriptUpdate('');
    this.startAmplitudeLoop('mic');

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.micStream!, {
      mimeType: 'audio/webm;codecs=opus'
    });
    this.mediaRecorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.mediaRecorder.start(100);

    this.startLiveRecognition();
    this.watchForSpeech();
  }

  /** Live Web Speech API recognition for interim (streaming) transcript display */
  private startLiveRecognition() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        if (this.currentState !== 'listening') return;

        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const display = finalTranscript || interimTranscript;
        if (display) {
          this.callbacks.onTranscriptUpdate(display.trim());
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('[EchoEngine] Live recognition error:', event.error);
        }
      };

      recognition.onend = () => {
        if (this.currentState === 'listening' && this.liveRecognition) {
          try { recognition.start(); } catch (_) {}
        }
      };

      this.liveRecognition = recognition;
      recognition.start();
    } catch (e) {
      console.warn('[EchoEngine] Could not start live recognition:', e);
    }
  }

  private stopLiveRecognition() {
    if (this.liveRecognition) {
      try {
        this.liveRecognition.onend = null;
        this.liveRecognition.stop();
      } catch (_) {}
      this.liveRecognition = null;
    }
  }

  private watchForSpeech() {
    const dataArray = new Uint8Array(this.analyser!.frequencyBinCount);
    const SPEECH_THRESHOLD = 0.15;
    const SILENCE_DURATION_MS = 1400;
    let speechStarted = false;

    const check = () => {
      if (this.isDestroyed) return;
      this.analyser!.getByteTimeDomainData(dataArray);
      const rms = this.computeRMS(dataArray);
      this.callbacks.onAmplitudeUpdate(rms);

      if (rms > SPEECH_THRESHOLD && !speechStarted) {
        speechStarted = true;
        if (this.silenceTimer) clearTimeout(this.silenceTimer);
      }

      if (speechStarted && rms < SPEECH_THRESHOLD) {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            this.onSpeechEnd();
          }, SILENCE_DURATION_MS);
        }
      } else if (rms > SPEECH_THRESHOLD && this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      this.amplitudeFrame = requestAnimationFrame(check);
    };

    this.amplitudeFrame = requestAnimationFrame(check);
  }

  private async onSpeechEnd() {
    if (this.isDestroyed) return;
    cancelAnimationFrame(this.amplitudeFrame);
    this.stopLiveRecognition();

    this.callbacks.onStateChange('processing');
    if (this.mediaRecorder?.state !== 'inactive') {
      this.mediaRecorder?.stop();
    }

    await this.delay(100);

    const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
    const arrayBuffer = await blob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    try {
      const transcript = await window.electronAPI.transcribeAudio(uint8Array);

      if (!transcript || transcript.trim().length < 2) {
        this.startListening();
        return;
      }

      const lower = transcript.toLowerCase();
      if (this.isExitPhrase(lower)) {
        this.callbacks.onExit();
        return;
      }

      this.callbacks.onTranscriptUpdate(transcript);
      this.callbacks.onStateChange('thinking');
      await this.sendToAgent(transcript);
    } catch (e) {
      console.error('Transcription error', e);
      this.startListening();
    }
  }

  private isExitPhrase(phrase: string) {
    const { echoExitWords } = useOverlayStore.getState() as any;
    const words = echoExitWords || ['goodbye', 'close', 'exit', 'stop reading'];
    return words.some((w: string) => phrase.includes(w));
  }

  private async sendToAgent(text: string) {
    if (this.isDestroyed) return;
    this.callbacks.onAgentTextUpdate('');

    try {
      console.log('[EchoEngine] Sending to agent:', text);
      this.callbacks.onStateChange('thinking');
      
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 60000);
      });
      
      const responsePromise = window.electronAPI.echoSendMessage({ text });
      const response = await Promise.race([responsePromise, timeoutPromise]);
      
      console.log('[EchoEngine] Agent response received:', response ? response.substring(0, 100) + '...' : 'NULL');
      
      if (!response || response.trim().length === 0) {
        console.warn('[EchoEngine] Empty response, retrying once...');
        await this.delay(500);
        const retryResponse = await window.electronAPI.echoSendMessage({ text });
        
        if (!retryResponse || retryResponse.trim().length === 0) {
          this.callbacks.onStateChange('listening');
          this.callbacks.onTranscriptUpdate('');
          this.callbacks.onAgentTextUpdate('');
          return;
        }
        
        this.callbacks.onStateChange('speaking');
        this.callbacks.onAgentTextUpdate(retryResponse);
        await this.streamTTSChunked(retryResponse);
        return;
      }

      this.callbacks.onStateChange('speaking');
      this.callbacks.onAgentTextUpdate(response);
      await this.streamTTSChunked(response);
    } catch (e: any) {
      console.error('[EchoEngine] Agent communication error:', e.message || e);
      this.callbacks.onStateChange('listening');
      this.callbacks.onTranscriptUpdate('');
      this.callbacks.onAgentTextUpdate('');
      if (!this.isDestroyed) this.startListening();
    }
  }

  /**
   * Stream TTS in sentence-sized chunks for lower latency.
   * Splits text at sentence boundaries (.!?;) with a minimum chunk
   * size of 40 chars, then sends each chunk to synthesize immediately.
   * Audio is queued for gapless sequential playback.
   */
  private async streamTTSChunked(fullText: string) {
    if (this.isDestroyed) return;

    this.ttsCancelled = false;
    this.ttsQueue = [];

    // Split into sentence-boundary chunks
    const chunks = this.splitIntoChunks(fullText);
    
    this.startInterruptWatcher();

    const voice = useOverlayStore.getState().echoTtsVoice;
    const provider = useOverlayStore.getState().echoTtsProvider;

    // Fire off all chunk synthesis requests in parallel
    const synthesizePromises = chunks.map(async (chunkText) => {
      if (this.ttsCancelled || this.isDestroyed) return null;
      try {
        const audioArray: number[] = await window.electronAPI.synthesizeSpeech({ text: chunkText, voice, provider });
        if (!audioArray || audioArray.length === 0) return null;
        const audioBuffer = new Uint8Array(audioArray).buffer;
        const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
        return { blob, text: chunkText };
      } catch (e) {
        console.error('[EchoEngine] Chunk TTS error:', e);
        return null;
      }
    });

    // Play chunks as they arrive, in order
    for (let i = 0; i < synthesizePromises.length; i++) {
      if (this.ttsCancelled || this.isDestroyed) break;
      
      const result = await synthesizePromises[i];
      if (!result || this.ttsCancelled || this.isDestroyed) break;
      
      await this.playChunk(result.blob, result.text);
    }

    // All chunks played (or cancelled)
    this.stopInterruptWatcher();
    if (!this.ttsCancelled && !this.isDestroyed) {
      this.callbacks.onAmplitudeUpdate(0);
      this.startListening();
    }
  }

  /**
   * Split text into sentence-sized chunks at natural boundaries.
   * Minimum chunk size: 40 chars to avoid very short TTS calls.
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let current = '';
    
    // Split on sentence boundaries
    const sentences = text.split(/(?<=[.!?;])\s+/);
    
    for (const sentence of sentences) {
      if (current.length + sentence.length < 40) {
        current += (current ? ' ' : '') + sentence;
      } else if (current.length >= 40) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current += (current ? ' ' : '') + sentence;
        if (current.length >= 40) {
          chunks.push(current.trim());
          current = '';
        }
      }
    }
    
    if (current.trim()) {
      chunks.push(current.trim());
    }
    
    // Fallback: if no chunks were created, use the full text
    if (chunks.length === 0) {
      chunks.push(text.trim());
    }
    
    return chunks;
  }

  /**
   * Play a single audio chunk and wait for it to complete.
   */
  private playChunk(blob: Blob, _text: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.ttsCancelled || this.isDestroyed) {
        resolve();
        return;
      }

      const url = URL.createObjectURL(blob);
      this.currentTtsUrl = url;
      this.ttsAudio = new Audio(url);

      // Set up analyser for amplitude tracking
      try {
        if (!this.ttsCtx || this.ttsCtx.state === 'closed') {
          this.ttsCtx = new AudioContext();
        }
        
        if (this.ttsCtx.state === 'suspended') {
          this.ttsCtx.resume();
        }

        const ttsSource = this.ttsCtx.createMediaElementSource(this.ttsAudio);
        this.ttsAnalyser = this.ttsCtx.createAnalyser();
        this.ttsAnalyser.fftSize = 256;
        ttsSource.connect(this.ttsAnalyser);
        ttsSource.connect(this.ttsCtx.destination);
        this.startAmplitudeLoop('speaker');
      } catch (e) {
        // Fallback: play without analyser
        console.warn('[EchoEngine] Could not set up TTS analyser:', e);
      }

      this.ttsAudio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentTtsUrl = null;
        this.callbacks.onAmplitudeUpdate(0);
        resolve();
      };

      this.ttsAudio.onerror = () => {
        URL.revokeObjectURL(url);
        this.currentTtsUrl = null;
        resolve();
      };

      this.ttsAudio.play().catch(() => {
        URL.revokeObjectURL(url);
        this.currentTtsUrl = null;
        resolve();
      });
    });
  }

  private startInterruptWatcher() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      this.interruptWatcher = new SpeechRecognition();
      this.interruptWatcher.continuous = true;
      this.interruptWatcher.interimResults = true;
      this.interruptWatcher.lang = 'en-US';

      this.interruptWatcher.onresult = (event: any) => {
        const last = event.results[event.results.length - 1];
        const phrase = last[0].transcript.toLowerCase().trim();

        const { echoInterruptWords } = useOverlayStore.getState() as any;
        const words = echoInterruptWords || ['stop', 'wait', 'shut up', 'hey hermes'];
        const isInterrupt = words.some((w: string) => phrase.includes(w));

        if (isInterrupt) {
          this.interrupt();
        }
      };

      this.interruptWatcher.onerror = (e: any) => {
        if (e.error === 'no-speech') {
          try { this.interruptWatcher.start(); } catch (err) {}
        }
      };

      this.interruptWatcher.onend = () => {
        if (this.currentState === 'speaking') {
          try { this.interruptWatcher.start(); } catch (err) {}
        }
      };

      this.interruptWatcher.start();
    } catch (e) {
      console.error('Failed to start interrupt watcher', e);
    }
  }

  private interrupt() {
    // Cancel TTS immediately — no fade
    this.ttsCancelled = true;
    if (this.ttsAudio) {
      this.ttsAudio.pause();
      this.ttsAudio.currentTime = 0;
    }
    if (this.currentTtsUrl) {
      URL.revokeObjectURL(this.currentTtsUrl);
      this.currentTtsUrl = null;
    }
    this.ttsQueue = [];

    this.stopInterruptWatcher();
    this.callbacks.onStateChange('interrupted');
    this.callbacks.onAmplitudeUpdate(0);

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.startListening();
      }
    }, 400);
  }

  private stopInterruptWatcher() {
    if (this.interruptWatcher) {
      try {
        this.interruptWatcher.stop();
      } catch (e) {}
      this.interruptWatcher = null;
    }
  }

  private startAmplitudeLoop(source: 'mic' | 'speaker') {
    cancelAnimationFrame(this.amplitudeFrame);
    const analyser = source === 'mic' ? this.analyser : this.ttsAnalyser;
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      if (this.isDestroyed) return;
      analyser.getByteTimeDomainData(dataArray);
      const rms = this.computeRMS(dataArray);
      this.callbacks.onAmplitudeUpdate(Math.min(rms * 3, 1));
      this.amplitudeFrame = requestAnimationFrame(loop);
    };
    this.amplitudeFrame = requestAnimationFrame(loop);
  }

  private computeRMS(dataArray: Uint8Array): number {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const norm = (dataArray[i] - 128) / 128;
      sum += norm * norm;
    }
    return Math.sqrt(sum / dataArray.length);
  }
}
