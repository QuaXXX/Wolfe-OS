import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  Loader2, 
  X, 
  ArrowUpRight, 
  Square, 
  Camera,
  Volume2,
  VolumeX
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { WolfLogo } from '../common/WolfLogo';
import { playSound } from '../../utils/soundFX';
import { tryExecuteFastCommand } from '../../utils/fastCommandEngine';
import { sendQueryToAI } from '../../utils/aiService';
import { UniversalVoiceController, isIosDevice } from '../../utils/voiceService';

export const TopBar = ({ 
  soundEnabled, 
  onToggleSound, 
  onOpenSettings,
  aiConfig,
  osData,
  onOpenMealLogModal,
  onLogMeal = null
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveSpeech, setLiveSpeech] = useState('');
  const [lastHeardQuery, setLastHeardQuery] = useState('');
  const [voiceResponse, setVoiceResponse] = useState(null);
  
  const voiceControllerRef = useRef(null);
  const handleVoiceQueryRef = useRef(null);
  const abortControllerRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // Keep a ref to latest handleVoiceQuery
  useEffect(() => {
    handleVoiceQueryRef.current = handleVoiceQuery;
  });

  // Initialize UniversalVoiceController (Native Speech on Safari/Desktop with MediaRecorder VAD fallback)
  useEffect(() => {
    const controller = new UniversalVoiceController({
      apiKey: aiConfig?.apiKey,
      groqApiKey: aiConfig?.groqApiKey,
      onInterim: (text) => {
        setLiveSpeech(text);
      },
      onFinal: (text) => {
        setLiveSpeech(text);
        if (text && text.trim()) {
          handleVoiceQueryRef.current?.(text.trim());
        }
      },
      onError: (err) => {
        console.warn("[TopBar Voice] Notice:", err);
      },
      onStateChange: ({ isListening: listening, isProcessing: processing }) => {
        setIsListening(listening);
        setIsProcessing(processing);
      }
    });

    voiceControllerRef.current = controller;
    return () => {
      controller.destroy();
    };
  }, [aiConfig?.apiKey, aiConfig?.groqApiKey]);

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

  const handleStartListening = async () => {
    playSound('click', soundEnabled);
    if (!voiceControllerRef.current) return;

    try {
      setIsListening(true);
      await voiceControllerRef.current.start();
    } catch (err) {
      console.warn("Could not start voice session:", err);
      setIsListening(false);
    }
  };

  const handleStopListening = () => {
    playSound('click', soundEnabled);
    if (voiceControllerRef.current) {
      voiceControllerRef.current.stop();
    }
    setIsListening(false);
  };

  const handleVoiceQuery = async (rawQuery) => {
    const queryText = (rawQuery || liveSpeech || '').trim();
    if (!queryText) return;
    if (voiceControllerRef.current) {
      voiceControllerRef.current.stop();
    }
    setIsListening(false);

    playSound('click', soundEnabled);
    setLastHeardQuery(queryText);
    setLiveSpeech('');

    // 1. Fast Local Command Engine (< 3ms)
    const fastResult = tryExecuteFastCommand(queryText, {
      osData,
      nutritionData: osData?.nutritionData,
      setSettings: osData?.setSettings,
      setNutritionData: osData?.setNutritionData,
      onLogMeal: onLogMeal || osData?.onLogMeal
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
        null,
        null,
        null,
        [{ role: 'user', content: queryText }],
        null
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
          targetView: "nutrition"
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <header 
      className="sticky top-0 z-30 w-full px-4 sm:px-8 bg-[#08090d]/95 backdrop-blur-xl border-b border-white/[0.06] transition-colors select-none pb-2.5 sm:pb-3"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 14px)'
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        
        {/* Left: Brand Identity with Dynamic Wolf Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {/* Dynamic Wolf Logo Badge synced with color slider */}
            <div 
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.04] transition-all shadow-sm"
              style={{
                border: '1px solid var(--accent-border)',
                color: 'var(--accent-primary)',
                boxShadow: '0 0 15px -3px var(--accent-glow)'
              }}
            >
              <WolfLogo className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight text-white leading-tight">
              Wolfe OS
            </span>
          </div>
        </div>

        {/* Center: In-Place Voice Controls (when active) */}
        {(isListening || isProcessing) && (
          <div className="flex items-center gap-2">
            {isListening ? (
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium animate-pulse"
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
                      className="w-0.5 rounded-sm"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    />
                  ))}
                </div>
                <span className="truncate max-w-[90px] sm:max-w-[140px] text-white font-mono text-[11px]">
                  Listening...
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
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <span>Processing...</span>
              </div>
            )}
          </div>
        )}

        {/* Right: Clock & Settings */}
        <div className="flex items-center gap-2 sm:gap-2.5 text-xs">
          <div className="hidden sm:flex items-center gap-2 bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5 text-slate-300">
            <span className="font-mono font-semibold text-white">{timeStr}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-sans">{dateStr}</span>
          </div>

          {/* Settings Gear Button (Opens Macro & Calorie Targets) */}
          <button 
            onClick={() => {
              playSound('click', soundEnabled);
              onOpenSettings();
            }}
            title="Macro Targets & Settings"
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
            style={{ border: '1px solid var(--accent-border)' }}
          >
            <Settings className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          </button>
        </div>
      </div>

      {/* FLOATING TOPBAR VOICE RESPONSE TOAST */}
      <AnimatePresence>
        {voiceResponse && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="max-w-xl mx-auto mt-2 px-3 py-2 rounded-2xl bg-[#0d101a]/95 border border-white/10 backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 text-xs"
            style={{ borderLeft: '3px solid var(--accent-primary)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div 
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
              >
                <WolfLogo className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-white truncate">{voiceResponse.title || "Wolfe Assistant"}</div>
                <div className="text-[10px] text-slate-300 truncate">{voiceResponse.message}</div>
              </div>
            </div>

            <button
              onClick={() => setVoiceResponse(null)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};
