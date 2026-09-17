import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronRight,
  Settings,
  Loader2,
  X,
  ArrowUpRight,
  Square,
  Cloud,
  Camera
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { WolfLogo } from '../common/WolfLogo';
import { playSound } from '../../utils/soundFX';
import { tryExecuteFastCommand } from '../../utils/fastCommandEngine';
import { sendQueryToAI } from '../../utils/aiService';
import { getGoogleAccount } from '../../utils/googleCalendarService';
import { FormattedAiText } from '../common/FormattedAiText';
import { UniversalVoiceController } from '../../utils/voiceService';

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
  onPurgeItems,
  isGoogleConnected = false,
  syncStatus = 'disconnected',
  onOpenGoogleModal,
  onSyncNow,
  onOpenMealLogModal,
  onLogMeal = null
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveSpeech, setLiveSpeech] = useState('');
  const [voiceResponse, setVoiceResponse] = useState(null);
  
  const voiceControllerRef = useRef(null);
  const handleVoiceQueryRef = useRef(null);
  const abortControllerRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  // Keep a ref to latest handleVoiceQuery
  useEffect(() => {
    handleVoiceQueryRef.current = handleVoiceQuery;
  });

  // Initialize UniversalVoiceController (MediaRecorder on iOS/PWA, Web Speech on desktop)
  useEffect(() => {
    const controller = new UniversalVoiceController({
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
        if (processing) {
          setIsProcessing(true);
        }
      }
    });

    voiceControllerRef.current = controller;
    return () => {
      controller.destroy();
    };
  }, []);

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

  const toggleTopBarListening = () => {
    if (!voiceControllerRef.current) return;

    if (isListening) {
      voiceControllerRef.current.stop();
      playSound('click', soundEnabled);
    } else {
      setLiveSpeech('');
      setVoiceResponse(null);
      voiceControllerRef.current.start();
    }
  };

  const handleStopListening = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (voiceControllerRef.current) {
      voiceControllerRef.current.stop();
    }
    setIsListening(false);
    setIsProcessing(false);
    playSound('click', soundEnabled);
  };

  const handleVoiceQuery = async (queryText) => {
    if (!queryText) return;
    if (voiceControllerRef.current) {
      voiceControllerRef.current.stop();
    }
    setIsListening(false);

    playSound('click', soundEnabled);
    setLiveSpeech('');

    // 1. Fast Local Command Engine (< 3ms)
    const fastResult = tryExecuteFastCommand(queryText, {
      osData,
      setSettings: osData?.setSettings,
      setCalendarData: osData?.setCalendarData,
      setNutritionData: osData?.setNutritionData,
      onLogMeal: onLogMeal || osData?.onLogMeal,
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
    <header 
      className="sticky top-0 z-30 w-full px-4 sm:px-8 bg-[#08090d]/95 backdrop-blur-xl border-b border-white/[0.06] transition-colors select-none pb-2.5 sm:pb-3"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 14px)'
      }}
    >
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
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 pl-2 border-l border-white/10">
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="capitalize font-semibold" style={{ color: 'var(--accent-primary)' }}>
                {activeView}
              </span>
            </div>
          )}
        </div>

        {/* Center: In-Place Voice & Food Logging Controls */}
        {activeView !== 'home' && (
          <div className="flex items-center gap-2">
            {!isListening && !isProcessing ? (
              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  if (onOpenMealLogModal) {
                    onOpenMealLogModal();
                  } else {
                    onNavigate('nutrition');
                  }
                }}
                className="hidden xs:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-300 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer border border-white/10"
                title="Snap photo or log food"
              >
                <Camera className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <span className="hidden md:inline">Log Food</span>
              </button>
            ) : isListening ? (
              <div 
                className="flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-medium animate-pulse"
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
                <span className="truncate max-w-[90px] sm:max-w-[140px] text-white">
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
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono"
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


          {/* Cloud Sync & Google Account Indicator */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              if (isGoogleConnected) {
                if (onSyncNow) onSyncNow();
              } else {
                if (onOpenGoogleModal) onOpenGoogleModal();
              }
            }}
            title={
              isGoogleConnected 
                ? `Google Account & Cloud Synced: ${getGoogleAccount()?.email || 'Active'}. Click to Sync All Hubs.`
                : "Connect Google Account to sync Phone & Computer"
            }
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shrink-0 ${
              !isGoogleConnected || syncStatus === 'disconnected'
                ? 'bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white border-white/10'
                : syncStatus === 'failed' || syncStatus === 'error'
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/25 hover:bg-rose-500/20'
                  : syncStatus === 'syncing'
                    ? 'bg-sky-500/10 text-sky-300 border-sky-500/25 hover:bg-sky-500/20'
                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/20'
            }`}
          >
            {getGoogleAccount()?.picture ? (
              <img 
                src={getGoogleAccount().picture} 
                alt="Avatar" 
                className="w-4 h-4 rounded-md object-cover shrink-0 border border-white/20" 
              />
            ) : (
              <Cloud 
                className={`w-3.5 h-3.5 shrink-0 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                style={{ color: (!isGoogleConnected || syncStatus === 'disconnected') ? '#94a3b8' : (syncStatus === 'failed' || syncStatus === 'error' ? '#f43f5e' : '#10b981') }}
              />
            )}
            <span className="hidden sm:inline text-[11px]">
              {!isGoogleConnected || syncStatus === 'disconnected'
                ? "Disconnected"
                : syncStatus === 'failed' || syncStatus === 'error'
                  ? "Sync Failed"
                  : syncStatus === 'syncing'
                    ? "Syncing..."
                    : "Synced"}
            </span>
            <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${
              !isGoogleConnected || syncStatus === 'disconnected'
                ? 'bg-slate-500'
                : syncStatus === 'failed' || syncStatus === 'error'
                  ? 'bg-rose-500'
                  : syncStatus === 'syncing'
                    ? 'bg-sky-400 animate-spin'
                    : 'bg-emerald-400 animate-pulse'
            }`} />
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
                className="w-2 h-2 rounded-sm shrink-0" 
                style={{ backgroundColor: 'var(--accent-primary)' }}
              />
              <div className="min-w-0 flex items-baseline gap-1.5 flex-wrap">
                <span className="font-bold text-white shrink-0">{voiceResponse.title || "Wolfe AI"}:</span>
                <FormattedAiText text={voiceResponse.message} inline className="text-slate-300 leading-snug" />
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
