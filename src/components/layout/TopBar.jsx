import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Volume2, 
  VolumeX, 
  ChevronRight,
  Mic,
  Settings,
  Loader2,
  X,
  ArrowUpRight,
  Square
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { WolfLogo } from '../common/WolfLogo';
import { playSound } from '../../utils/soundFX';
import { tryExecuteFastCommand } from '../../utils/fastCommandEngine';
import { sendQueryToAI } from '../../utils/aiService';

export const TopBar = ({ 
  soundEnabled, 
  onToggleSound, 
  onOpenSettings,
  activeView, 
  onNavigate,
  aiConfig,
  osData,
  onEventCreated,
  onClearCalendar,
  onDeleteSpecificItem,
  onPurgeItems
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  // In-place TopBar voice listening state
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveSpeech, setLiveSpeech] = useState('');
  const [voiceResponse, setVoiceResponse] = useState(null);
  
  const recognitionRef = useRef(null);
  const abortControllerRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
      setDateStr(
        now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Speech Recognition for in-place voice
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const activeText = finalTranscript || interimTranscript;
        if (activeText) {
          setLiveSpeech(activeText);
        }

        if (finalTranscript && finalTranscript.trim()) {
          handleVoiceQuery(finalTranscript.trim());
        }
      };

      recognition.onerror = (event) => {
        console.warn("TopBar speech notice:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, [osData, aiConfig]);

  const toggleTopBarListening = () => {
    if (!recognitionRef.current) {
      setIsListening(prev => !prev);
      playSound(!isListening ? 'voice-open' : 'click', soundEnabled);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      playSound('click', soundEnabled);
    } else {
      setLiveSpeech('');
      setVoiceResponse(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
        playSound('voice-open', soundEnabled);
      } catch (err) {
        console.error("TopBar voice start notice:", err);
      }
    }
  };

  const handleStopListening = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    setIsProcessing(false);
    playSound('click', soundEnabled);
  };

  const handleVoiceQuery = async (queryText) => {
    if (!queryText) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    playSound('click', soundEnabled);
    setLiveSpeech('');

    // 1. Fast Local Command Engine (< 3ms)
    const fastResult = tryExecuteFastCommand(queryText, {
      osData,
      setSettings: osData?.setSettings,
      setCalendarData: osData?.setCalendarData,
      setNutritionData: osData?.setNutritionData,
      setWorkoutData: osData?.setWorkoutData,
      setTradingData: osData?.setTradingData,
      setSchoolData: osData?.setSchoolData,
      onNavigate,
      onClearCalendar,
      onDeleteSpecificItem,
      onPurgeItems: onPurgeItems || osData?.onPurgeItems,
      onEventCreated
    });

    if (fastResult.handled) {
      setVoiceResponse(fastResult);
      playSound('success', soundEnabled);
      if (fastResult.confetti) {
        try {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        } catch (e) {}
      }

      // Auto dismiss after 6 seconds
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setVoiceResponse(null);
      }, 6000);
      return;
    }

    // 2. Gemini AI fallback
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendQueryToAI(
        queryText,
        aiConfig,
        osData,
        onEventCreated,
        onClearCalendar,
        onDeleteSpecificItem,
        [{ role: 'user', content: queryText }],
        onPurgeItems || osData?.onPurgeItems
      );
      setVoiceResponse(response);
      playSound('success', soundEnabled);

      // Auto dismiss after 7 seconds
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setVoiceResponse(null);
      }, 7000);
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setVoiceResponse({
          title: "Wolfe Assistant",
          message: "Command processed successfully.",
          targetView: "home"
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 w-full px-4 sm:px-8 py-2.5 bg-[#08090d]/90 backdrop-blur-xl border-b border-white/[0.06] transition-colors select-none">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        
        {/* Left: Brand Identity with Dynamic Wolf Logo */}
        <div className="flex items-center gap-3">
          <div 
            onClick={() => {
              playSound('click', soundEnabled);
              onNavigate('home');
            }}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            {/* Dynamic Wolf Logo Badge synced with color slider */}
            <div 
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.04] transition-all shadow-sm group-hover:scale-105"
              style={{
                border: '1px solid var(--accent-border)',
                color: 'var(--accent-primary)',
                boxShadow: '0 0 15px -3px var(--accent-glow)'
              }}
            >
              <WolfLogo className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight text-white group-hover:text-slate-200 transition-colors">
              Wolfe OS
            </span>
          </div>

          {activeView !== 'home' && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 pl-3 border-l border-white/10">
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="capitalize font-semibold" style={{ color: 'var(--accent-primary)' }}>
                {activeView}
              </span>
            </div>
          )}
        </div>

        {/* Center: In-Place Voice Listening Controller */}
        {activeView !== 'home' && (
          <div className="flex items-center gap-2">
            {!isListening && !isProcessing ? (
              <button
                onClick={toggleTopBarListening}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
                style={{ border: '1px solid var(--accent-border)' }}
                title="Speak a command from this view"
              >
                <Mic className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <span>Speak</span>
              </button>
            ) : isListening ? (
              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium animate-pulse"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)', 
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                {/* Audio Waveform Bars */}
                <div className="flex items-center gap-0.5">
                  {[0.6, 1.4, 0.8, 1.3, 0.7].map((h, i) => (
                    <motion.span
                      key={i}
                      animate={{ height: ['4px', `${h * 12}px`, '4px'] }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.6 + (i * 0.08),
                        ease: "easeInOut"
                      }}
                      className="w-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    />
                  ))}
                </div>
                <span className="truncate max-w-[140px] text-white">
                  {liveSpeech ? `"${liveSpeech}"` : "Listening..."}
                </span>
                <button
                  onClick={handleStopListening}
                  className="p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                  title="Cancel"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                </button>
              </div>
            ) : (
              <div 
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <span>Thinking...</span>
              </div>
            )}
          </div>
        )}

        {/* Right: Clock, Sound Toggle & Settings */}
        <div className="flex items-center gap-2.5 sm:gap-3 text-xs">
          <div className="hidden sm:flex items-center gap-2 bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5 text-slate-300">
            <span className="font-mono font-semibold text-white">{timeStr}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-sans">{dateStr}</span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              const next = !soundEnabled;
              onToggleSound();
              if (next) playSound('click', true);
            }}
            title={soundEnabled ? "Mute audio" : "Enable audio"}
            className="p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/5 transition-colors cursor-pointer"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Settings Gear Button */}
          <button 
            onClick={() => {
              playSound('click', soundEnabled);
              onOpenSettings();
            }}
            title="System Settings"
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
            style={{ border: '1px solid var(--accent-border)' }}
          >
            <Settings className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          </button>
        </div>
      </div>

      {/* FLOATING TOPBAR VOICE RESPONSE TOAST (Non-intrusive) */}
      <AnimatePresence>
        {voiceResponse && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[92%] max-w-xl p-3 rounded-2xl bg-[#0d101d]/95 backdrop-blur-2xl border border-white/15 shadow-2xl z-50 text-xs flex items-center justify-between gap-3"
            style={{ boxShadow: '0 10px 30px -5px rgba(0,0,0,0.8)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span 
                className="w-2 h-2 rounded-full shrink-0" 
                style={{ backgroundColor: 'var(--accent-primary)' }}
              />
              <div className="min-w-0">
                <span className="font-bold text-white mr-1.5">{voiceResponse.title || "Wolfe AI"}:</span>
                <span className="text-slate-300 leading-snug">{voiceResponse.message}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {voiceResponse.targetView && voiceResponse.targetView !== activeView && (
                <button
                  onClick={() => {
                    playSound('click', soundEnabled);
                    onNavigate(voiceResponse.targetView);
                    setVoiceResponse(null);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                >
                  <span>{voiceResponse.actionLabel || "View"}</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              )}

              <button
                onClick={() => setVoiceResponse(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
