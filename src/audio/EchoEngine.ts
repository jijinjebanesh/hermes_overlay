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
  onInterimTranscriptUpdate: (text: string) => void;
  onAgentTextUpdate: (text: string) => void;
  onAmplitudeUpdate: (amplitude: number) => void;
  /** Fired when a chunk of text starts being spoken by TTS.
   *  The renderer uses this to sync word highlighting with audio. */
  onTtsChunkStart: (chunkText: string) => void;
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
  private liveFinalTranscript: string = '';

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
  /**
   * Public API: Start recording immediately (Push-to-Talk).
   * Bypasses silence detection — user holds hotkey, mic streams,
   * release triggers send. Called from EchoMode renderer.
   */
  async startPushToTalk() {
    if (this.isDestroyed) return;
    // If already listening, restart fresh
    cancelAnimationFrame(this.amplitudeFrame);
    this.stopLiveRecognition();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.liveFinalTranscript = '';
    this.callbacks.onStateChange('listening');
    this.callbacks.onTranscriptUpdate('🎙 Hold to speak...');
    this.callbacks.onInterimTranscriptUpdate('');
    this.startAmplitudeLoop('mic');

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.micStream!, {
      mimeType: 'audio/webm;codecs=opus'
    });
    this.mediaRecorder.ondataavailable = (e) => this.chunks.push(e.data);
    this.mediaRecorder.start(100);

    this.startLiveRecognition();
  }

  /**
   * Public API: Stop recording and immediately send (Push-to-Talk release).
   * Bypasses silence detection — user released hotkey, process and send now.
   */
  async stopPushToTalkAndSend() {
    if (this.isDestroyed) return;
    cancelAnimationFrame(this.amplitudeFrame);
    this.stopLiveRecognition();

    if (this.mediaRecorder?.state !== 'inactive') {
      this.mediaRecorder?.stop();
    }

    this.callbacks.onStateChange('processing');

    // Use live transcript if available, otherwise wait for Whisper
    if (!this.liveFinalTranscript.trim() || this.liveFinalTranscript.trim().length < 2) {
      await this.delay(50);
      const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      try {
        const whisperResult = await window.electronAPI.transcribeAudio(uint8Array);
        this.liveFinalTranscript = whisperResult;
      } catch (e) {
        console.error('[EchoEngine] Push-to-talk transcription error:', e);
      }
    }

    const transcript = this.liveFinalTranscript.trim();
    if (!transcript || transcript.length < 2) {
      this.callbacks.onTranscriptUpdate('');
      this.callbacks.onStateChange('listening');
      this.startListening();
      return;
    }

    const lower = transcript.toLowerCase();
    if (this.isExitPhrase(lower)) {
      this.callbacks.onExit();
      return;
    }

    // Screen context check
    let agentText = transcript;
    if (this.isScreenContextPhrase(lower)) {
      try {
        const screenshot = await window.electronAPI.captureScreenshot();
        if (screenshot?.path) {
          agentText = `<file name="${screenshot.name}" path="${screenshot.path}" type="image">[Screenshot captured]</file>\n\n${transcript}`;
          this.callbacks.onTranscriptUpdate('📸 Capturing screen...');
        }
      } catch (e) {
        console.warn('[EchoEngine] Screenshot capture failed:', e);
      }
    }

    this.callbacks.onTranscriptUpdate(agentText);
    this.callbacks.onStateChange('thinking');
    await this.sendToAgent(agentText);
  }

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

    // Screen context: capture screenshot and prepend to agent prompt
    let agentText = text;
    if (this.isScreenContextPhrase(text.toLowerCase())) {
      try {
        const screenshot = await window.electronAPI.captureScreenshot();
        if (screenshot?.path) {
          agentText = `<file name="${screenshot.name}" path="${screenshot.path}" type="image">[Screenshot captured]</file>\n\n${text}`;
          this.callbacks.onTranscriptUpdate('📸 Capturing screen...');
        }
      } catch (e) {
        console.warn('[EchoEngine] Screenshot capture failed:', e);
      }
    }

    // Set transcript and transition to thinking
    this.callbacks.onTranscriptUpdate(agentText);
    this.callbacks.onStateChange('thinking');
    await this.sendToAgent(agentText);
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
    this.liveFinalTranscript = '';
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

        // Show final text (once committed) in the main transcript
        if (finalTranscript) {
          this.liveFinalTranscript = finalTranscript;
          this.callbacks.onTranscriptUpdate(finalTranscript.trim());
          this.callbacks.onInterimTranscriptUpdate(''); // clear interim when final arrives
        }
        // Show interim (partial) text separately for live streaming display
        if (interimTranscript) {
          this.callbacks.onInterimTranscriptUpdate(interimTranscript.trim());
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

      // Web Speech API detects end-of-speech internally — use it
      // to trigger onSpeechEnd faster than the VAD silence timer.
      // The VAD timer (800ms) acts as a fallback if this doesn't fire.
      recognition.onspeechend = () => {
        if (this.currentState === 'listening') {
          // Small delay to let any trailing final result arrive
          setTimeout(() => {
            if (this.currentState === 'listening') {
              this.onSpeechEnd();
            }
          }, 50);
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
    const SILENCE_DURATION_MS = 800;
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

    // If we already have a transcript from Web Speech API, skip the delay
    // and use it immediately
    if (!this.liveFinalTranscript.trim() || this.liveFinalTranscript.trim().length < 2) {
      // No live transcript — wait for mediaRecorder to finalize the buffer
      await this.delay(50);

      const blob = new Blob(this.chunks, { type: 'audio/webm;codecs=opus' });
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      try {
        const whisperResult = await window.electronAPI.transcribeAudio(uint8Array);
        this.liveFinalTranscript = whisperResult;
      } catch (e) {
        console.error('Transcription error', e);
      }
    }

    let transcript = this.liveFinalTranscript.trim();

    if (!transcript || transcript.trim().length < 2) {
      this.startListening();
      return;
    }

    const lower = transcript.toLowerCase();
    if (this.isExitPhrase(lower)) {
      this.callbacks.onExit();
      return;
    }

    // Screen context: capture screenshot and prepend to agent prompt
    if (this.isScreenContextPhrase(lower)) {
      try {
        const screenshot = await window.electronAPI.captureScreenshot();
        if (screenshot?.path) {
          transcript = `<file name="${screenshot.name}" path="${screenshot.path}" type="image">[Screenshot captured]</file>\n\n${transcript}`;
          this.callbacks.onTranscriptUpdate('📸 Capturing screen...');
        }
      } catch (e) {
        console.warn('[EchoEngine] Screenshot capture failed:', e);
      }
    }

    this.callbacks.onTranscriptUpdate(transcript);
    this.callbacks.onStateChange('thinking');
    await this.sendToAgent(transcript);
  }

  private isExitPhrase(phrase: string) {
    const { echoExitWords } = useOverlayStore.getState() as any;
    const words = echoExitWords || ['goodbye', 'close', 'exit', 'stop reading'];
    return words.some((w: string) => phrase.includes(w));
  }

  /** Check for screen-context voice commands ("what am I looking at", "see my screen"). */
  private isScreenContextPhrase(phrase: string): boolean {
    const triggers = [
      'what am i looking at',
      'see my screen',
      'look at my screen',
      'screenshot',
      'capture screen',
      'what is on my screen',
      'show me my screen',
      'what do you see',
    ];
    return triggers.some(t => phrase.includes(t));
  }

  private async sendToAgent(text: string) {
    if (this.isDestroyed) return;
    this.callbacks.onAgentTextUpdate('');

    try {
      console.log('[EchoEngine] Sending to agent:', text);
      this.callbacks.onStateChange('thinking');
      
      this.ttsCancelled = false;
      this.ttsQueue = [];
      this.startInterruptWatcher();

      const voice = useOverlayStore.getState().echoTtsVoice;
      const provider = useOverlayStore.getState().echoTtsProvider;

      // Extract screenshot path from XML-wrapped text if present
      let imagePath: string | undefined;
      const fileMatch = text.match(/<file name="([^"]+)" path="([^"]+)" type="image">/);
      if (fileMatch) {
        imagePath = fileMatch[2];
      }

      let fullResponse = '';
      let currentBuffer = '';
      let playQueuePromise: Promise<void> = Promise.resolve();

      const unsubscribe = window.electronAPI.onEchoStreamChunk((chunk: string) => {
        if (this.isDestroyed || this.ttsCancelled) return;
        
        fullResponse += chunk;
        currentBuffer += chunk;
        
        // Tell renderer about new text so it updates the bubble
        this.callbacks.onAgentTextUpdate(fullResponse);
        
        // Transition to speaking once we have content
        
        // Aggressively scan for sentence boundaries — every chunk arrival
        // Also split at commas and colons for more frequent TTS chunks
        const sentenceMatch = currentBuffer.match(/^([^.!?;]+[.!?;]\s*)/);
        const clauseMatch = currentBuffer.match(/^([^,]+,\s*)/);
        
        let textToSpeak = '';
        if (sentenceMatch && sentenceMatch[1].trim().length > 0) {
          textToSpeak = sentenceMatch[1].trim();
          currentBuffer = currentBuffer.substring(sentenceMatch[0].length);
        } else if (currentBuffer.length > 80) {
          // No sentence boundary but buffer is long — split at last natural break
          const commaBreak = currentBuffer.lastIndexOf(', ');
          const spaceBreak = currentBuffer.lastIndexOf(' ');
          const breakPoint = commaBreak > 0 ? commaBreak + 2 : (spaceBreak > 0 ? spaceBreak + 1 : -1);
          if (breakPoint > 0 && breakPoint < currentBuffer.length - 10) {
            textToSpeak = currentBuffer.substring(0, breakPoint).trim();
            currentBuffer = currentBuffer.substring(breakPoint);
          } else {
            // No good break — force-split at 80 chars
            const forcePoint = Math.min(80, currentBuffer.length);
            textToSpeak = currentBuffer.substring(0, forcePoint).trim();
            currentBuffer = currentBuffer.substring(forcePoint);
          }
        }

        if (textToSpeak.length > 0) {
          const synthPromise = window.electronAPI.synthesizeSpeech({ text: textToSpeak, voice, provider });
          
          playQueuePromise = playQueuePromise.then(async () => {
            if (this.ttsCancelled || this.isDestroyed) return;
            try {
              const audioArray: number[] = await synthPromise;
              if (!audioArray || audioArray.length === 0) {
                console.warn('[EchoEngine] TTS returned empty audio for chunk:', textToSpeak.substring(0, 40));
                return;
              }
              
              if (this.currentState !== 'speaking') {
                this.callbacks.onStateChange('speaking');
              }
              
              // Fire callback so renderer can sync word highlighting exactly when audio starts
              this.callbacks.onTtsChunkStart(textToSpeak);
              
              const audioBuffer = new Uint8Array(audioArray).buffer;
              const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
              await this.playChunk(blob, textToSpeak);
            } catch (e) {
              console.error('[EchoEngine] Chunk TTS error:', e);
            }
          });
        }
      });
      
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), 120000);
      });
      
      try {
        const responsePromise = window.electronAPI.echoSendMessage({ text, imagePath });
        await Promise.race([responsePromise, timeoutPromise]);
      } finally {
        unsubscribe();
      }
      
      // Speak any remaining buffer — this catches text without terminal punctuation
      if (currentBuffer.trim().length > 0 && !this.ttsCancelled && !this.isDestroyed) {
        const textToSpeak = currentBuffer.trim();
        const synthPromise = window.electronAPI.synthesizeSpeech({ text: textToSpeak, voice, provider });
        
        playQueuePromise = playQueuePromise.then(async () => {
          if (this.ttsCancelled || this.isDestroyed) return;
          try {
            const audioArray: number[] = await synthPromise;
            if (!audioArray || audioArray.length === 0) return;
            
            if (this.currentState !== 'speaking') {
              this.callbacks.onStateChange('speaking');
            }
            this.callbacks.onTtsChunkStart(textToSpeak);
            
            const audioBuffer = new Uint8Array(audioArray).buffer;
            const blob = new Blob([audioBuffer], { type: 'audio/mpeg' });
            await this.playChunk(blob, textToSpeak);
          } catch (e) {
            console.error('[EchoEngine] Final chunk TTS error:', e);
          }
        });
      }
      
      // Wait for ALL queued TTS chunks to finish playing
      await playQueuePromise;
      
      this.stopInterruptWatcher();
      if (!this.ttsCancelled && !this.isDestroyed) {
        this.callbacks.onAmplitudeUpdate(0);
        this.startListening();
      }

    } catch (e: any) {
      console.error('[EchoEngine] Agent communication error:', e.message || e);
      this.callbacks.onStateChange('listening');
      this.callbacks.onTranscriptUpdate('');
      this.callbacks.onAgentTextUpdate('');
      if (!this.isDestroyed) this.startListening();
    }
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
