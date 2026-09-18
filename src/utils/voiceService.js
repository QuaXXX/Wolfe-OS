/**
 * Wolfe OS — Universal Voice & Speech Engine
 * Provides resilient voice recognition across Desktop, Mobile Safari, and iOS Home Screen PWAs.
 * Automatically falls back to MediaRecorder + Gemini audio transcription on iOS where Web Speech API is restricted.
 */

export function isIosDevice() {
  if (typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  return (
    window.navigator?.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
  );
}

function getGeminiApiKey() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('wolfe_settings');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.aiConfig?.apiKey) return parsed.aiConfig.apiKey;
      }
    } catch {}
  }
  return import.meta.env?.VITE_GEMINI_API_KEY || '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        const base64 = res.split(',')[1];
        resolve(base64);
      } else {
        resolve('');
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === 'undefined') return 'audio/mp4';
  const candidates = [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/aac',
    'audio/ogg'
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return '';
}

/**
 * Transcribe recorded audio blob using Gemini 3.6 Flash / 3.5 Flash / 3.7 Flash
 */
export async function transcribeAudioWithGemini(audioBlob, customApiKey = null) {
  const apiKey = customApiKey || getGeminiApiKey();
  if (!apiKey) {
    throw new Error("No Gemini API key configured for voice transcription.");
  }

  const base64Data = await blobToBase64(audioBlob);
  if (!base64Data) {
    return '';
  }

  const mimeType = (audioBlob.type || 'audio/mp4').split(';')[0] || 'audio/mp4';
  const models = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.7-flash'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: 'Transcribe this spoken audio verbatim into text. Output ONLY the transcribed words with zero additional explanations, zero quotes, and zero formatting. If there is no speech or only background silence, output an empty string.'
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 256
          }
        })
      });

      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const cleaned = text.replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '').trim();
        if (cleaned) return cleaned;
      }
    } catch (e) {
      console.warn(`[Voice] Transcription attempt with ${model} failed:`, e);
    }
  }

  return '';
}

/**
 * Universal Voice Controller
 * Manages both native Web Speech API and MediaRecorder fallback smoothly.
 */
export class UniversalVoiceController {
  constructor({ apiKey = null, onInterim, onFinal, onError, onStateChange } = {}) {
    this.apiKey = apiKey;
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onError = onError;
    this.onStateChange = onStateChange;

    this.isListening = false;
    this.isProcessing = false;
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioContext = null;
    this.analyserNode = null;
    this.vadInterval = null;
    this.audioChunks = [];
    this.capturedFinalText = '';
    this._hasReceivedSpeech = false;
    this._forceMediaRecorder = false;
    this._nativeStartTime = 0;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  async start() {
    if (this.isListening || this.isProcessing) return;
    this.isListening = true;
    this.capturedFinalText = '';
    this.audioChunks = [];
    this._hasReceivedSpeech = false;

    // Trigger subtle haptic pulse on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(30); } catch {}
    }

    if (this.onStateChange) {
      this.onStateChange({ isListening: true, isProcessing: false });
    }

    const SpeechRecognition = (typeof window !== 'undefined')
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;

    // 1. Try native speech recognition first if available and not explicitly broken
    if (SpeechRecognition && !this._forceMediaRecorder) {
      const started = this._startNativeSpeech(SpeechRecognition);
      if (started) {
        return;
      }
    }

    // 2. Fallback: Start MediaRecorder + VAD Audio Recorder
    await this._startMediaRecorderFallback();
  }

  _startNativeSpeech(SpeechRecognition) {
    try {
      if (this.recognition) {
        try { this.recognition.abort(); } catch {}
        this.recognition = null;
      }

      const recognition = new SpeechRecognition();
      // On iOS Safari, continuous MUST be false!
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';

      let speechCaptured = false;
      this._nativeStartTime = Date.now();

      recognition.onstart = () => {
        this._nativeStartTime = Date.now();
      };

      recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }

        const active = (final || interim).trim();
        if (active) {
          speechCaptured = true;
          this._hasReceivedSpeech = true;
          if (this.onInterim) {
            this.onInterim(active);
          }
        }

        if (final && final.trim()) {
          this.capturedFinalText = final.trim();
          if (this.onFinal) {
            this.onFinal(this.capturedFinalText);
          }
        }
      };

      recognition.onerror = (e) => {
        console.warn("[Voice] Native speech notice:", e.error);
        // If native speech fails with not-allowed or service-not-allowed, fall back to MediaRecorder
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'network') {
          if (!speechCaptured && this.isListening) {
            console.info("[Voice] Switching to MediaRecorder fallback due to native error:", e.error);
            this._forceMediaRecorder = true;
            this._startMediaRecorderFallback();
          }
        }
      };

      recognition.onend = () => {
        const sessionDuration = Date.now() - this._nativeStartTime;
        // iOS standalone PWA quirk: recognition immediately ends without error or results in < 400ms
        if (!speechCaptured && sessionDuration < 400 && this.isListening && !this._hasReceivedSpeech) {
          console.info("[Voice] Native speech ended prematurely (<400ms) with no speech. Switching to MediaRecorder fallback...");
          this._forceMediaRecorder = true;
          this._startMediaRecorderFallback();
          return;
        }

        if (this.isListening) {
          this._handleEnd();
        }
      };

      recognition.start();
      this.recognition = recognition;
      return true;
    } catch (err) {
      console.warn("[Voice] Could not start native SpeechRecognition:", err);
      return false;
    }
  }

  async _startMediaRecorderFallback() {
    if (!this.isListening) return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      this._handleEnd();
      if (this.onError) this.onError("Microphone is not available on this device.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      if (!this.isListening) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      this.audioStream = stream;
      this.audioChunks = [];

      // Set up AudioContext for Voice Activity Detection (VAD) & live volume feedback
      this._setupVad(stream);

      const mimeType = getSupportedAudioMimeType();
      const options = mimeType ? { mimeType } : undefined;
      let recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (recErr) {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.audioChunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        this._cleanupStream();
        await this._processAudioChunks();
      };

      recorder.start(200);
      this.mediaRecorder = recorder;
    } catch (micErr) {
      console.warn("[Voice] Microphone access error:", micErr);
      this._handleEnd();
      if (this.onError) {
        this.onError(micErr.message || "Microphone permission denied.");
      }
    }
  }

  _setupVad(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;

      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);

      this.audioContext = audioCtx;
      this.analyserNode = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      let silenceStart = null;
      let speechDetected = false;
      const startTime = Date.now();

      this.vadInterval = setInterval(() => {
        if (!this.isListening || !this.mediaRecorder) {
          this._cleanupVad();
          return;
        }

        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;

        // Human speech activity threshold
        if (avg > 14) {
          if (!speechDetected) {
            speechDetected = true;
            if (this.onInterim) {
              this.onInterim("Listening... (Hearing your voice)");
            }
          }
          silenceStart = null;
        } else if (speechDetected) {
          // User paused talking: monitor for 1.3s of silence to auto-send
          if (!silenceStart) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > 1300) {
            console.info("[Voice VAD] Silence detected after speech. Auto-stopping recorder.");
            this._cleanupVad();
            this.stop();
          }
        }

        // Safety cutoff at 14s
        if (Date.now() - startTime > 14000) {
          console.info("[Voice VAD] Max duration reached (14s). Auto-stopping.");
          this._cleanupVad();
          this.stop();
        }
      }, 100);
    } catch (e) {
      console.warn("[Voice] VAD setup notice:", e);
    }
  }

  _cleanupVad() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.analyserNode = null;
  }

  stop() {
    if (!this.isListening) return;
    this.isListening = false;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(20); } catch {}
    }

    this._cleanupVad();

    // Stop native recognition if active
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }

    // Stop MediaRecorder if active
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.isProcessing = true;
        if (this.onStateChange) {
          this.onStateChange({ isListening: false, isProcessing: true });
        }
        this.mediaRecorder.stop();
      } catch (e) {
        this._cleanupStream();
        this._handleEnd();
      }
    } else {
      this._cleanupStream();
      this._handleEnd();
    }
  }

  _cleanupStream() {
    if (this.audioStream) {
      try {
        this.audioStream.getTracks().forEach(t => t.stop());
      } catch {}
      this.audioStream = null;
    }
  }

  async _processAudioChunks() {
    this._cleanupVad();

    // If native speech already captured text, we don't need transcription
    if (this.capturedFinalText && this.capturedFinalText.trim()) {
      this._handleEnd();
      return;
    }

    if (this.audioChunks.length === 0) {
      this._handleEnd();
      return;
    }

    const mimeType = this.mediaRecorder?.mimeType || getSupportedAudioMimeType();
    const audioBlob = new Blob(this.audioChunks, { type: mimeType });
    this.audioChunks = [];

    // Audio must be at least ~1.5KB to contain words
    if (audioBlob.size < 1500) {
      this._handleEnd();
      return;
    }

    try {
      if (this.onInterim) {
        this.onInterim("Processing audio...");
      }
      const transcribed = await transcribeAudioWithGemini(audioBlob, this.apiKey);
      if (transcribed && transcribed.trim()) {
        this.capturedFinalText = transcribed.trim();
        if (this.onInterim) {
          this.onInterim(this.capturedFinalText);
        }
        if (this.onFinal) {
          this.onFinal(this.capturedFinalText);
        }
      } else {
        if (this.onError) {
          this.onError("Could not hear speech clearly. Please try again.");
        }
      }
    } catch (err) {
      console.warn("[Voice] Audio transcription error:", err);
      if (this.onError) {
        this.onError("Could not transcribe speech. Please try speaking again.");
      }
    } finally {
      this._handleEnd();
    }
  }

  _handleEnd() {
    this.isListening = false;
    this.isProcessing = false;
    this._cleanupVad();
    if (this.onStateChange) {
      this.onStateChange({ isListening: false, isProcessing: false });
    }
  }

  destroy() {
    this.stop();
    this.recognition = null;
    this.mediaRecorder = null;
    this._cleanupVad();
    this._cleanupStream();
  }
}
