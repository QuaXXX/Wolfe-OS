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
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return 'audio/mp4';
}

/**
 * Transcribe recorded audio blob using Gemini 2.0 Flash / 1.5 Flash
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

  const mimeType = (audioBlob.type || 'audio/mp4').split(';')[0];
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'];

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
                  text: 'Transcribe this spoken audio verbatim. Output ONLY the transcribed words with zero additional explanations, zero quotes, and zero formatting. If there is no speech or only background silence, output an empty string.'
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
        return text;
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
  constructor({ onInterim, onFinal, onError, onStateChange }) {
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onError = onError;
    this.onStateChange = onStateChange;

    this.isListening = false;
    this.isProcessing = false;
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioChunks = [];
    this.capturedFinalText = '';
    this.useMediaRecorderOnly = isIosDevice() || isStandaloneApp();

    this._initNativeSpeech();
  }

  _initNativeSpeech() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // In iOS standalone PWA, native SpeechRecognition terminates without results.
    if (!SpeechRecognition || this.useMediaRecorderOnly) {
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

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
        if (active && this.onInterim) {
          this.onInterim(active);
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
      };

      recognition.onend = () => {
        if (!this.useMediaRecorderOnly && this.isListening) {
          this._handleEnd();
        }
      };

      this.recognition = recognition;
    } catch (e) {
      console.warn("[Voice] Could not initialize native SpeechRecognition:", e);
    }
  }

  async start() {
    if (this.isListening || this.isProcessing) return;
    this.isListening = true;
    this.capturedFinalText = '';
    this.audioChunks = [];

    // Trigger subtle haptic pulse on mobile (zero audio conflict)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(30); } catch {}
    }

    if (this.onStateChange) {
      this.onStateChange({ isListening: true, isProcessing: false });
    }

    // 1. If on desktop and native speech is available, try native speech first
    let nativeStarted = false;
    if (this.recognition && !this.useMediaRecorderOnly) {
      try {
        this.recognition.start();
        nativeStarted = true;
      } catch (err) {
        console.warn("[Voice] Native start error, falling back to MediaRecorder:", err);
      }
    }

    // 2. Start MediaRecorder (primary on iOS / PWA, backup on desktop)
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const mimeType = getSupportedAudioMimeType();
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        this.audioStream = stream;
        const options = mimeType ? { mimeType } : undefined;
        const recorder = new MediaRecorder(stream, options);

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.audioChunks.push(e.data);
          }
        };

        recorder.onstop = async () => {
          this._cleanupStream();
          await this._processAudioChunks();
        };

        recorder.start(250);
        this.mediaRecorder = recorder;
      } catch (micErr) {
        console.warn("[Voice] Microphone access error:", micErr);
        if (!nativeStarted) {
          this._handleEnd();
          if (this.onError) {
            this.onError(micErr.message || "Microphone permission denied or unavailable.");
          }
        }
      }
    }
  }

  stop() {
    if (!this.isListening) return;
    this.isListening = false;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(20); } catch {}
    }

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
    // If native speech already captured text, we don't need to transcribe audio
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

    // Audio must be at least ~3KB to contain actual words
    if (audioBlob.size < 3000) {
      this._handleEnd();
      return;
    }

    try {
      const transcribed = await transcribeAudioWithGemini(audioBlob);
      if (transcribed && transcribed.trim()) {
        this.capturedFinalText = transcribed.trim();
        if (this.onInterim) {
          this.onInterim(this.capturedFinalText);
        }
        if (this.onFinal) {
          this.onFinal(this.capturedFinalText);
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
    if (this.onStateChange) {
      this.onStateChange({ isListening: false, isProcessing: false });
    }
  }

  destroy() {
    this.stop();
    this.recognition = null;
    this.mediaRecorder = null;
    this._cleanupStream();
  }
}
