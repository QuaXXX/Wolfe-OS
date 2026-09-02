import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Shield, 
  ShieldAlert, 
  Smartphone, 
  Volume2, 
  VolumeX, 
  X, 
  CheckCircle2, 
  Flame, 
  Clock, 
  Lock, 
  Download, 
  Music, 
  Radio,
  Tv,
  ExternalLink
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playSound } from '../../utils/soundFX';

const DISTRACTION_APPS = [
  { id: 'youtube', name: 'YouTube', domain: 'youtube.com', icon: '📺' },
  { id: 'instagram', name: 'Instagram', domain: 'instagram.com', icon: '📸' },
  { id: 'tiktok', name: 'TikTok', domain: 'tiktok.com', icon: '🎵' },
  { id: 'reddit', name: 'Reddit', domain: 'reddit.com', icon: '🤖' },
  { id: 'twitter', name: 'X / Twitter', domain: 'x.com', icon: '🐦' },
  { id: 'netflix', name: 'Netflix', domain: 'netflix.com', icon: '🎬' }
];

const FOCUS_DURATIONS = [
  { label: '25m Pomodoro', seconds: 25 * 60 },
  { label: '45m Deep Work', seconds: 45 * 60 },
  { label: '60m Exam Prep', seconds: 60 * 60 },
  { label: '90m Master Block', seconds: 90 * 60 }
];

export const DeepFocusModal = ({ 
  isOpen, 
  onClose, 
  courseCode = "Focus Session",
  soundEnabled = true,
  onSessionCompleted
}) => {
  const [duration, setDuration] = useState(25 * 60);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [distractionWarnings, setDistractionWarnings] = useState(0);
  const [showDistractionAlert, setShowDistractionAlert] = useState(false);
  
  // Audio state: 'none' | 'binaural' | 'rain' | 'white' | 'youtube'
  const [activeSound, setActiveSound] = useState('none');
  const [youtubeVideoId, setYoutubeVideoId] = useState('jfKfPfyJRdk');
  const [customYoutubeInput, setCustomYoutubeInput] = useState('');
  const [hasCustomYoutubeLink, setHasCustomYoutubeLink] = useState(false);

  const [showPhoneGuide, setShowPhoneGuide] = useState(false);
  const [blockedApps, setBlockedApps] = useState(['youtube', 'instagram', 'tiktok', 'reddit']);

  const audioCtxRef = useRef(null);
  const noiseNodeRef = useRef(null);

  // Timer Tick
  useEffect(() => {
    let timer = null;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleCompleteSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft]);

  // Tab Distraction Guardian (Monitors Window Blur)
  useEffect(() => {
    const handleWindowBlur = () => {
      if (isActive) {
        setDistractionWarnings(prev => prev + 1);
        setShowDistractionAlert(true);
        playSound('switch', soundEnabled);
      }
    };

    const handleWindowFocus = () => {
      setTimeout(() => setShowDistractionAlert(false), 4000);
    };

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isActive, soundEnabled]);

  // Ambient Audio Synthesizer (Web Audio API for Binaural, Rain, White Noise)
  useEffect(() => {
    if (!isActive || (activeSound !== 'binaural' && activeSound !== 'rain' && activeSound !== 'white')) {
      stopAmbientSynth();
      return;
    }
    startAmbientSynth(activeSound);
    return () => stopAmbientSynth();
  }, [activeSound, isActive]);

  const startAmbientSynth = (type) => {
    try {
      stopAmbientSynth();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      if (type === 'binaural') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const merger = ctx.createChannelMerger(2);
        const gain = ctx.createGain();

        osc1.frequency.value = 200;
        osc2.frequency.value = 240; // 40Hz Gamma Beat
        gain.gain.value = 0.08;

        osc1.connect(merger, 0, 0);
        osc2.connect(merger, 0, 1);
        merger.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        noiseNodeRef.current = { stop: () => { osc1.stop(); osc2.stop(); } };
      } else if (type === 'white' || type === 'rain') {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * (type === 'rain' ? 0.04 : 0.02);
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = type === 'rain' ? 'lowpass' : 'bandpass';
        filter.frequency.value = type === 'rain' ? 800 : 1200;

        const gain = ctx.createGain();
        gain.gain.value = 0.06;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
        noiseNodeRef.current = noise;
      }
    } catch (e) {
      console.warn("Synth audio notice:", e);
    }
  };

  const stopAmbientSynth = () => {
    if (noiseNodeRef.current) {
      try { noiseNodeRef.current.stop?.(); } catch (e) {}
      noiseNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch (e) {}
      audioCtxRef.current = null;
    }
  };

  const handleCompleteSession = () => {
    setIsActive(false);
    stopAmbientSynth();
    playSound('success', soundEnabled);
    try {
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });
    } catch (e) {}
    if (onSessionCompleted) {
      onSessionCompleted(Math.round(duration / 3600 * 10) / 10);
    }
  };

  const handleToggleTimer = () => {
    playSound('click', soundEnabled);
    setIsActive(prev => !prev);
  };

  const handleResetTimer = () => {
    playSound('switch', soundEnabled);
    setIsActive(false);
    setTimeLeft(duration);
    stopAmbientSynth();
  };

  const handleSelectDuration = (secs) => {
    playSound('click', soundEnabled);
    setDuration(secs);
    setTimeLeft(secs);
    setIsActive(false);
  };

  // Parse YouTube URL to Video ID
  const handleApplyYouTubeUrl = (e) => {
    e.preventDefault();
    const url = customYoutubeInput.trim();
    if (!url) return;

    let vid = null;
    const match1 = url.match(/(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#&?]*).*/);
    if (match1 && match1[1].length === 11) {
      vid = match1[1];
    } else if (url.length === 11) {
      vid = url;
    }

    if (vid) {
      setYoutubeVideoId(vid);
      setHasCustomYoutubeLink(true);
      setActiveSound('youtube');
      setCustomYoutubeInput('');
      playSound('success', soundEnabled);
    }
  };

  // Generate 1-Click Windows Hosts Blocker Script (.bat)
  const handleDownloadWindowsBlocker = () => {
    playSound('click', soundEnabled);
    const domainsToBlock = blockedApps.map(id => {
      const app = DISTRACTION_APPS.find(a => a.id === id);
      return app?.domain;
    }).filter(Boolean);

    const scriptContent = `@echo off
:: Wolfe OS Deep Focus Shield Blocker (Windows)
echo ==============================================
echo   WOLFE OS DEEP FOCUS SHIELD ACTIVE
echo   Blocking ${domainsToBlock.join(', ')}
echo ==============================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Administrator permissions required. Right click and Run as Administrator.
    pause
    exit /b
)

${domainsToBlock.map(d => `echo 127.0.0.1 ${d} >> %windir%\\System32\\drivers\\etc\\hosts\necho 127.0.0.1 www.${d} >> %windir%\\System32\\drivers\\etc\\hosts`).join('\n')}

ipconfig /flushdns >nul
echo Deep Focus Shield Activated! Distractions blocked.
echo To unblock after session, remove entries from hosts.
pause
`;

    const blob = new Blob([scriptContent], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WolfeOS_Block_Distractions.bat`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const progressPercent = Math.round(((duration - timeLeft) / duration) * 100);

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
        {/* Frosted Dark Glass Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!isActive) {
              playSound('click', soundEnabled);
              stopAmbientSynth();
              onClose();
            }
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/75 backdrop-blur-2xl transition-all"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl bg-[#080a12]/95 border border-white/15 rounded-3xl p-4 sm:p-7 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.9)] backdrop-blur-2xl z-10 space-y-4 text-center max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2 text-left min-w-0 pr-2">
              <div 
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)',
                  color: 'var(--accent-primary)',
                  border: '1px solid var(--accent-border)'
                }}
              >
                <Shield className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                  Deep Focus Shield • {courseCode}
                </h3>
                <p className="text-[11px] text-slate-400 truncate">Anti-distraction deep work mode</p>
              </div>
            </div>

            <button
              onClick={() => {
                playSound('click', soundEnabled);
                stopAmbientSynth();
                onClose();
              }}
              className="p-1.5 sm:p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Distraction Alert Banner */}
          {showDistractionAlert && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 animate-bounce" />
              <span>⚠️ Stay in the zone! Focus block in progress.</span>
            </motion.div>
          )}

          {/* Duration Selector */}
          {!isActive && (
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {FOCUS_DURATIONS.map(d => (
                <button
                  key={d.seconds}
                  onClick={() => handleSelectDuration(d.seconds)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    duration === d.seconds
                      ? 'shadow-sm font-bold'
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] text-slate-400'
                  }`}
                  style={duration === d.seconds ? {
                    backgroundColor: 'var(--accent-subtle)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--accent-primary)'
                  } : {}}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}

          {/* GIANT COUNTDOWN DISPLAY */}
          <div className="relative py-2">
            <div className="text-6xl sm:text-7xl font-mono font-bold tracking-tight text-white drop-shadow-[0_0_35px_rgba(168,85,247,0.3)]">
              {formattedTime}
            </div>

            {/* Progress Bar */}
            <div className="w-48 sm:w-64 bg-white/10 h-1.5 rounded-full overflow-hidden mx-auto mt-4">
              <motion.div 
                className="h-full bg-purple-500 rounded-full"
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="text-[11px] font-mono text-slate-400 mt-2">
              {isActive ? `🔥 Session Active (${distractionWarnings} distractions avoided)` : "Ready for deep cognitive immersion"}
            </div>
          </div>

          {/* TIMER CONTROLS */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleToggleTimer}
              className="px-8 py-3 rounded-2xl text-white text-sm font-bold shadow-lg active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              style={{ backgroundColor: isActive ? '#e11d48' : 'var(--accent-primary)' }}
            >
              {isActive ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{isActive ? "Pause Focus" : "Start Deep Focus"}</span>
            </button>

            <button
              onClick={handleResetTimer}
              title="Reset Timer"
              className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* INVISIBLE YOUTUBE AUDIO PLAYER (Zero lag on mobile - no video rendering canvas) */}
          {activeSound === 'youtube' && youtubeVideoId && (
            <div style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', overflow: 'hidden' }}>
              <iframe
                width="200"
                height="200"
                src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=${isActive ? 1 : 0}&loop=1&playlist=${youtubeVideoId}&enablejsapi=1`}
                title="Study Audio Stream"
                allow="autoplay"
              />
            </div>
          )}

          {/* AMBIENT SOUNDS & YOUTUBE AUDIO CONTROLLER */}
          <div className="pt-2 border-t border-white/10 space-y-3 text-left">
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
                <span>🧠 Background Study Audio</span>
                {activeSound !== 'none' && (
                  <span className="text-emerald-400 text-[10px] font-semibold">
                    {isActive ? "● Audio Streaming" : "Paused"}
                  </span>
                )}
              </div>

              {/* Exact Uniform Pill Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { id: 'none', label: '🔇 Mute' },
                  { id: 'binaural', label: '⚡ 40Hz Focus' },
                  { id: 'rain', label: '🌧️ Rain' },
                  { id: 'white', label: '🌊 White Noise' },
                  { id: 'youtube', label: '📺 YouTube' }
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setActiveSound(s.id);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                      activeSound === s.id
                        ? 'font-bold'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                    }`}
                    style={activeSound === s.id ? {
                      backgroundColor: 'var(--accent-subtle)',
                      borderColor: 'var(--accent-border)',
                      color: 'var(--accent-primary)'
                    } : {}}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Clean YouTube Link Input (Only shown when YouTube option is selected) */}
              {activeSound === 'youtube' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="pt-2 border-t border-white/5 space-y-1.5"
                >
                  <label className="text-[10px] font-mono text-slate-400 block">
                    Paste YouTube Link (Audio will stream in background):
                  </label>
                  <form onSubmit={handleApplyYouTubeUrl} className="flex gap-2">
                    <input
                      type="text"
                      value={customYoutubeInput}
                      onChange={(e) => setCustomYoutubeInput(e.target.value)}
                      placeholder="e.g. https://www.youtube.com/watch?v=..."
                      className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-xl theme-active-btn text-xs font-bold shadow-md transition-all cursor-pointer shrink-0"
                    >
                      Set Audio
                    </button>
                  </form>
                  {hasCustomYoutubeLink && (
                    <div className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>YouTube audio linked & ready. Starts when focus timer runs.</span>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Lock Distractions & Phone Lock */}
            <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setShowPhoneGuide(prev => !prev)}
                className="text-slate-400 hover:text-white flex items-center gap-1.5 font-medium cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{showPhoneGuide ? "Hide Phone Lock Guide" : "Lock Phone Distractions (iOS / Android)"}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadWindowsBlocker}
                className="text-slate-400 hover:text-white flex items-center gap-1 font-mono text-[11px] cursor-pointer"
                title="Download 1-Click Windows Blocker"
              >
                <Download className="w-3 h-3" />
                <span>Hosts Blocker (.bat)</span>
              </button>
            </div>

            {/* Phone Lock Guide Accordion */}
            {showPhoneGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 text-left text-xs text-slate-300 space-y-2 font-sans"
              >
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span>How to Lock Phone Distractions:</span>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-300 list-disc list-inside">
                  <li><strong className="text-white">iPhone (iOS)</strong>: Enable <em>Focus &gt; Deep Work</em> and add Screen Time App Limits.</li>
                  <li><strong className="text-white">Android</strong>: Enable <em>Digital Wellbeing &gt; Focus Mode</em> to pause distracting apps.</li>
                </ul>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
