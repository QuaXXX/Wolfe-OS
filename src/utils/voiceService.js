/**
 * Wolfe OS — Universal Voice & Speech Engine
 * Real-time streaming speech recognition across Desktop, Mobile Safari, and iOS.
 * Words appear on screen in real time as spoken, with zero post-processing latency.
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
      const raw = localStorage.getItem('wolfe_settings') || localStorage.getItem('wolfe_os_settings_v3');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.aiConfig?.apiKey) return parsed.aiConfig.apiKey.trim();
      }
    } catch {}
  }
  return (import.meta.env?.VITE_GEMINI_API_KEY || '').trim();
}

export function getGroqApiKey() {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('wolfe_settings') || localStorage.getItem('wolfe_os_settings_v3');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.aiConfig?.groqApiKey) return parsed.aiConfig.groqApiKey.trim();
      }
    } catch {}
  }
  return (import.meta.env?.VITE_GROQ_API_KEY || '').trim();
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
 * Transcribe recorded audio blob using Groq Whisper Large v3 Turbo (~200ms latency)
 */
export async function transcribeAudioWithGroq(audioBlob, customApiKey = null) {
  const apiKey = customApiKey || getGroqApiKey();
  if (!apiKey) {
    throw new Error("No Groq API key configured for voice transcription.");
  }

  const mimeType = (audioBlob.type || 'audio/mp4').split(';')[0] || 'audio/mp4';
  let filename = 'audio.mp4';
  if (mimeType.includes('webm')) filename = 'audio.webm';
  else if (mimeType.includes('ogg')) filename = 'audio.ogg';
  else if (mimeType.includes('wav')) filename = 'audio.wav';
  else if (mimeType.includes('aac')) filename = 'audio.aac';
  else if (mimeType.includes('mp4') || mimeType.includes('m4a')) filename = 'audio.m4a';

  const formData = new FormData();
  formData.append('file', audioBlob, filename);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'json');
  formData.append('language', 'en');
  formData.append('temperature', '0');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Groq Whisper HTTP ${res.status}: ${errText || res.statusText}`);
    }

    const data = await res.json();
    const text = (data?.text || '').trim();
    return text.replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '').trim();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Transcribe recorded audio blob using Gemini 3.6 Flash / 3.5 Flash (Fast Fallback)
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
      const timer = setTimeout(() => controller.abort(), 10000);

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
            temperature: 0.0,
            maxOutputTokens: 64
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
 * Manages native real-time Web Speech API (with live word streaming on Desktop & Mobile Safari)
 * and MediaRecorder fallback when Web Speech is unavailable.
 */
export class UniversalVoiceController {
  constructor({ apiKey = null, groqApiKey = null, onInterim, onFinal, onError, onStateChange } = {}) {
    this.apiKey = apiKey;
    this.groqApiKey = groqApiKey;
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
    this.latestTranscript = '';
    this._hasReceivedSpeech = false;
    this._submitted = false;
    this._silenceTimer = null;
    this._restartCount = 0;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  setGroqApiKey(key) {
    this.groqApiKey = key;
  }

  async start() {
    if (this.isListening || this.isProcessing) return;
    this.isListening = true;
    this.isProcessing = false;
    this.capturedFinalText = '';
    this.latestTranscript = '';
    this.audioChunks = [];
    this._hasReceivedSpeech = false;
    this._submitted = false;
    this._restartCount = 0;
    this._cleanupSilenceTimer();
    this._cleanupVad();

    // Subtle tactile haptic pulse on mobile (zero audio session conflict)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(25); } catch {}
    }

    if (this.onStateChange) {
      this.onStateChange({ isListening: true, isProcessing: false });
    }

    const SpeechRecognition = (typeof window !== 'undefined')
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;

    // In iOS standalone PWA, Apple strips microphone access from webkitSpeechRecognition.
    // In standard Safari, Chrome, Edge, and Desktop, native SpeechRecognition works in real time.
    const isRestrictedPwa = isIosDevice() && isStandaloneApp();

    if (SpeechRecognition && !isRestrictedPwa) {
      const started = this._startNativeSpeech(SpeechRecognition);
      if (started) {
        return;
      }
    }

    // Fallback: Start MediaRecorder + VAD Audio Recorder
    await this._startMediaRecorderFallback();
  }

  _startNativeSpeech(SpeechRecognition) {
    try {
      if (this.recognition) {
        try { this.recognition.abort(); } catch {}
        this.recognition = null;
      }

      const recognition = new SpeechRecognition();
      // continuous = true ensures uninterrupted listening as the user speaks
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';

      recognition.onstart = () => {
        console.info("[Voice] Native speech recognition listening...");
      };

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = 0; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }

        const liveText = (finalTranscript + ' ' + interimTranscript).trim();
        if (liveText) {
          this._hasReceivedSpeech = true;
          this.latestTranscript = liveText;
          if (finalTranscript.trim()) {
            this.capturedFinalText = finalTranscript.trim();
          }
          if (this.onInterim) {
            this.onInterim(liveText);
          }
          // User is actively speaking — schedule auto-finalize after pause
          this._scheduleSilenceAutoSubmit();
        }
      };

      recognition.onerror = (e) => {
        console.warn("[Voice] Native speech notice:", e.error);
        if (e.error === 'no-speech' || e.error === 'aborted') {
          return;
        }
        // If native speech fails with not-allowed or service-not-allowed
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          if (this.isListening && !this._hasReceivedSpeech && !this._submitted) {
            console.info("[Voice] Native recognition not allowed, switching to fallback.");
            this._startMediaRecorderFallback();
          }
        }
      };

      recognition.onend = () => {
        if (this.isListening && !this._submitted) {
          const text = (this.capturedFinalText || this.latestTranscript || '').trim();
          if (text && this._hasReceivedSpeech) {
            // Words were spoken and user paused / finished. Submit immediately!
            this._finalizeWithText(text);
            return;
          }

          // If no speech heard yet, Safari may have timed out on ambient silence.
          // Seamlessly restart to keep listening for the user (up to 4 times).
          if (!this._hasReceivedSpeech && this._restartCount < 4) {
            this._restartCount++;
            this._restartNativeSpeech(SpeechRecognition);
            return;
          }
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

  _restartNativeSpeech(SpeechRecognition) {
    if (!this.isListening || this._hasReceivedSpeech || this._submitted) return;
    try {
      if (this.recognition) {
        try { this.recognition.abort(); } catch {}
        this.recognition = null;
      }
      setTimeout(() => {
        if (this.isListening && !this._hasReceivedSpeech && !this._submitted) {
          this._startNativeSpeech(SpeechRecognition);
        }
      }, 100);
    } catch (e) {
      console.warn("[Voice] Restart native speech error:", e);
    }
  }

  _scheduleSilenceAutoSubmit() {
    this._cleanupSilenceTimer();
    // After user pauses for 900ms after speaking, finalize immediately
    this._silenceTimer = setTimeout(() => {
      if (this.isListening && this._hasReceivedSpeech && !this._submitted) {
        const text = (this.capturedFinalText || this.latestTranscript || '').trim();
        if (text) {
          console.info("[Voice] Silence auto-submit triggered for text:", text);
          this._finalizeWithText(text);
        }
      }
    }, 900);
  }

  _cleanupSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  _finalizeWithText(text) {
    if (this._submitted) return;
    this._submitted = true;
    this.isListening = false;
    this._cleanupSilenceTimer();

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }

    if (this.onInterim) {
      this.onInterim(text);
    }
    if (this.onFinal) {
      this.onFinal(text);
    }
    this._handleEnd();
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

      recorder.start(150);
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
              this.onInterim("Hearing voice... (Pause or tap when done)");
            }
          }
          silenceStart = null;
        } else if (speechDetected) {
          // User paused talking: 380ms of silence to auto-send
          if (!silenceStart) {
            silenceStart = Date.now();
          } else if (Date.now() - silenceStart > 380) {
            console.info("[Voice VAD] Silence detected after speech. Auto-stopping recorder.");
            this._cleanupVad();
            this.stop();
          }
        }

        // Safety cutoff at 12s
        if (Date.now() - startTime > 12000) {
          console.info("[Voice VAD] Max duration reached (12s). Auto-stopping.");
          this._cleanupVad();
          this.stop();
        }
      }, 80);
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
    if (!this.isListening && !this.isProcessing) return;
    const wasListening = this.isListening;
    this.isListening = false;
    this._cleanupSilenceTimer();
    this._cleanupVad();

    const text = (this.capturedFinalText || this.latestTranscript || '').trim();

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(20); } catch {}
    }

    // Stop native recognition if active
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
      this.recognition = null;
    }

    // Stop MediaRecorder if active
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.isProcessing = true;
        if (this.onStateChange) {
          this.onStateChange({ isListening: false, isProcessing: true });
        }
        this.mediaRecorder.stop();
        return;
      } catch (e) {
        this._cleanupStream();
        this._handleEnd();
      }
    } else {
      this._cleanupStream();
      if (wasListening && text && !this._submitted) {
        this._submitted = true;
        if (this.onFinal) {
          this.onFinal(text);
        }
      }
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

    // If native speech already captured text, zero need for audio transcription
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

    if (audioBlob.size < 1000) {
      this._handleEnd();
      return;
    }

    try {
      if (this.onInterim) {
        this.onInterim("Processing voice...");
      }

      let transcribed = '';
      const groqKey = this.groqApiKey || getGroqApiKey();

      // Groq Whisper Large v3 Turbo on LPU (~200ms ultra-fast transcription)
      if (groqKey) {
        try {
          transcribed = await transcribeAudioWithGroq(audioBlob, groqKey);
        } catch (groqErr) {
          console.warn("[Voice] Groq Whisper failed, trying Gemini fallback:", groqErr);
          transcribed = await transcribeAudioWithGemini(audioBlob, this.apiKey);
        }
      } else {
        // Automatic fallback when Groq key is not provided
        transcribed = await transcribeAudioWithGemini(audioBlob, this.apiKey);
      }

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
    this._cleanupSilenceTimer();
    this._cleanupVad();
    if (this.onStateChange) {
      this.onStateChange({ isListening: false, isProcessing: false });
    }
  }

  destroy() {
    this._submitted = true;
    this._cleanupSilenceTimer();
    this.stop();
    this.recognition = null;
    this.mediaRecorder = null;
    this._cleanupVad();
    this._cleanupStream();
  }
}
