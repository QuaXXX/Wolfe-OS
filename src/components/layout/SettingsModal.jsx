import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Settings, 
  Palette, 
  Volume2, 
  VolumeX, 
  RotateCcw, 
  TrendingUp, 
  GraduationCap, 
  Dumbbell, 
  UtensilsCrossed, 
  CalendarDays, 
  Layers, 
  Sliders,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Unlink,
  ExternalLink,
  ShieldCheck,
  FolderSync,
  Radio,
  Copy,
  Check,
  Key,
  Zap,
  Sparkles,
  Eye,
  EyeOff,
  Cloud
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { 
  isGoogleCalendarConnected, 
  disconnectGoogleCalendar, 
  fetchGoogleCalendarEvents,
  getGoogleAccount,
  getDeviceSyncDetails
} from '../../utils/googleCalendarService';
import { syncFullOsWithCloud } from '../../utils/cloudSyncEngine';
import { 
  getVaultMetadata, 
  clearVaultHandle,
  connectObsidianVault 
} from '../../utils/obsidianService';
import { getTradingConfig } from '../../utils/tradingStorage';

const COLOR_PRESETS = [
  { name: 'Emerald Green', hue: 150 },
  { name: 'Deep Blue', hue: 222 },
  { name: 'Twilight Indigo', hue: 250 },
  { name: 'Royal Purple', hue: 280 },
];

export const SettingsModal = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
  onOpenGoogleCalendarModal,
  onSyncGoogleCalendarSuccess,
  onSyncNow,
  syncStatus = 'synced',
  lastSyncTimestamp = 0,
  soundEnabled = true
}) => {
  const [isGCalConnected, setIsGCalConnected] = useState(isGoogleCalendarConnected());
  const [isSyncingGCal, setIsSyncingGCal] = useState(false);
  const [gcalMsg, setGcalMsg] = useState(null);
  const [vaultMeta, setVaultMeta] = useState(getVaultMetadata());
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [tradingConfig, setTradingConfig] = useState(getTradingConfig());
  const [copiedWhUrl, setCopiedWhUrl] = useState(false);
  const [copiedWhToken, setCopiedWhToken] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(settings?.aiConfig?.apiKey || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingAi, setIsTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);

  useEffect(() => {
    setApiKeyInput(settings?.aiConfig?.apiKey || '');
    setAiTestResult(null);
  }, [isOpen, settings?.aiConfig?.apiKey]);

  useEffect(() => {
    setIsGCalConnected(isGoogleCalendarConnected() && syncStatus !== 'disconnected');
    setVaultMeta(getVaultMetadata());
    setTradingConfig(getTradingConfig());
    setIsFullscreen(!!document.fullscreenElement);

    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [isOpen, syncStatus]);

  const handleToggleFullscreen = () => {
    playSound('click', soundEnabled);
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(e => {
          document.documentElement.requestFullscreen().catch(console.warn);
        });
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(console.warn);
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  const handleConnectVault = async () => {
    playSound('click', soundEnabled);
    try {
      const { handle, files, courses } = await connectObsidianVault();
      const newMeta = {
        connected: true,
        folderName: handle.name,
        totalNotes: files.length,
        courses,
        lastScanned: new Date().toISOString()
      };
      setVaultMeta(newMeta);
      playSound('success', soundEnabled);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn("Connect vault notice:", err);
      }
    }
  };

  const handleDisconnectVault = async () => {
    playSound('click', soundEnabled);
    await clearVaultHandle();
    setVaultMeta({ connected: false, folderName: null, totalNotes: 0, courses: [] });
  };

  if (!isOpen) return null;

  const currentHue = settings.accentHue || 222;
  const aiConfig = settings.aiConfig || { voiceResponse: false };

  const handleHueChange = (newHue) => {
    onUpdateSettings({
      ...settings,
      accentHue: Number(newHue)
    });
  };

  const handleAiUpdate = (updates) => {
    playSound('click', soundEnabled);
    onUpdateSettings({
      ...settings,
      aiConfig: {
        ...aiConfig,
        ...updates
      }
    });
  };

  const handleSaveApiKey = () => {
    playSound('success', soundEnabled);
    handleAiUpdate({ apiKey: apiKeyInput.trim() });
    setAiTestResult({ success: true, message: 'API Key saved securely to local settings.' });
  };

  const handleTestAiConnection = async () => {
    playSound('click', soundEnabled);
    const keyToTest = apiKeyInput.trim() || settings?.aiConfig?.apiKey || '';
    if (!keyToTest) {
      setAiTestResult({ success: false, message: 'Please enter a Gemini API key first.' });
      return;
    }
    setIsTestingAi(true);
    setAiTestResult(null);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${keyToTest}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Respond with: OK' }] }]
        })
      });
      clearTimeout(timeoutId);
      const data = await res.json();
      if (res.ok && data?.candidates?.[0]) {
        playSound('success', soundEnabled);
        setAiTestResult({ success: true, message: 'Verified! Gemini 3.5 & Vision is active.' });
        if (keyToTest !== settings?.aiConfig?.apiKey) {
          handleAiUpdate({ apiKey: keyToTest });
        }
      } else {
        const errorMsg = data?.error?.message || `API returned status ${res.status}`;
        setAiTestResult({ success: false, message: errorMsg });
      }
    } catch (err) {
      setAiTestResult({ success: false, message: err.message || 'Connection timed out' });
    } finally {
      setIsTestingAi(false);
    }
  };

  const toggleModule = (key) => {
    playSound('switch', soundEnabled);
    onUpdateSettings({
      ...settings,
      visibleModules: {
        ...settings.visibleModules,
        [key]: !settings.visibleModules[key]
      }
    });
  };

  const setGlow = (val) => {
    playSound('click', soundEnabled);
    onUpdateSettings({
      ...settings,
      glowIntensity: val
    });
  };

  const toggleSound = () => {
    const next = !settings.soundEnabled;
    onUpdateSettings({
      ...settings,
      soundEnabled: next
    });
    if (next) playSound('click', true);
  };

  const toggleCompact = () => {
    playSound('switch', soundEnabled);
    onUpdateSettings({
      ...settings,
      compactMode: !settings.compactMode
    });
  };

  const handleSyncGCalNow = async () => {
    setIsSyncingGCal(true);
    setGcalMsg(null);
    try {
      await syncFullOsWithCloud({ forcePush: false });
      if (onSyncNow) {
        await onSyncNow();
        setGcalMsg("All 6 OS hubs & Google Calendar synchronized!");
      } else {
        const events = await fetchGoogleCalendarEvents(true);
        playSound('success', soundEnabled);
        setGcalMsg(`Synced ${events ? events.length : 0} event(s) & all 6 OS hubs!`);
        if (onSyncGoogleCalendarSuccess && events) {
          onSyncGoogleCalendarSuccess(events);
        }
      }
    } catch (err) {
      setGcalMsg("Sync failed. Please reconnect.");
    } finally {
      setIsSyncingGCal(false);
    }
  };

  const handleDisconnectGCal = () => {
    playSound('click', soundEnabled);
    disconnectGoogleCalendar();
    setIsGCalConnected(false);
    setGcalMsg(null);
  };

  const modulesList = [
    { key: 'timeline', label: 'Today\'s Timeline', desc: 'Schedule & deadline stream at the top', icon: CalendarDays },
    { key: 'trading', label: 'Day Trading & Markets', desc: 'Realized P&L, stock sparklines & watchlist', icon: TrendingUp },
    { key: 'school', label: 'School & Academics', desc: 'GPA counter, courses & urgent assignments', icon: GraduationCap },
    { key: 'workouts', label: 'Workouts & Hypertrophy', desc: 'Daily routine, PR board & weekly split', icon: Dumbbell },
    { key: 'nutrition', label: 'Nutrition & Fuel', desc: 'Macro breakdown, calories & hydration', icon: UtensilsCrossed },
  ];

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-end select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/80 backdrop-blur-sm"
        />

        {/* Slide-out Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="relative w-full max-w-lg h-full bg-[#0a0c14] border-l border-white/10 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto z-10"
        >
          {/* Header */}
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-3">
                <div 
                  className="p-2.5 rounded-xl bg-white/[0.05] text-white"
                  style={{ border: '1px solid var(--accent-border)' }}
                >
                  <Settings className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">System Settings</h3>
                  <p className="text-xs text-slate-400">Integrations, appearance & module visibility</p>
                </div>
              </div>

              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                }}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SECTION 1: SHOW / HIDE DASHBOARD MODULES */}
            <div className="mb-5 p-4 rounded-2xl bg-[#101322] border border-white/10 space-y-3 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-300" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Visible Dashboard Modules
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Real-time</span>
              </div>

              <div className="space-y-2">
                {modulesList.map((m) => {
                  const Icon = m.icon;
                  const isVisible = settings.visibleModules[m.key] !== false;

                  return (
                    <div
                      key={m.key}
                      onClick={() => toggleModule(m.key)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isVisible
                          ? 'bg-white/[0.04] border-white/15 text-slate-200'
                          : 'bg-black/30 border-white/5 text-slate-500 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${isVisible ? 'bg-white/[0.08] text-white' : 'bg-transparent text-slate-600'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{m.label}</div>
                          <div className="text-[10px] text-slate-400">{m.desc}</div>
                        </div>
                      </div>

                      {/* Switch Toggle */}
                      <div className={`relative w-11 h-6 rounded-full transition-colors p-0.5 ${
                        isVisible ? 'bg-emerald-600' : 'bg-zinc-800'
                      }`}>
                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 2: SYSTEM EXPERIENCE */}
            <div className="mb-5 p-4 rounded-2xl bg-[#101322] border border-white/10 space-y-3.5 shadow-sm">
              <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                <Sliders className="w-4 h-4 text-slate-300" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  System Experience
                </span>
              </div>

              {/* Atmosphere Glow Mode */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Atmosphere Ambient Glow</span>
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
                  {['subtle', 'vibrant', 'off'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setGlow(mode)}
                      className={`px-2.5 py-1 rounded-lg text-xs capitalize transition-all ${
                        settings.glowIntensity === mode
                          ? 'bg-white text-black font-bold shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound Toggle */}
              <div
                onClick={toggleSound}
                className="flex items-center justify-between pt-2 border-t border-white/5 cursor-pointer"
              >
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  {settings.soundEnabled ? (
                    <Volume2 className="w-4 h-4 text-white" />
                  ) : (
                    <VolumeX className="w-4 h-4 text-slate-500" />
                  )}
                  <span>Tactile Synthesizer Audio</span>
                </div>
                <div className={`relative w-11 h-6 rounded-full transition-colors p-0.5 ${
                  settings.soundEnabled ? 'bg-emerald-600' : 'bg-zinc-800'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.soundEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>

              {/* Voice TTS option */}
              <div
                onClick={() => handleAiUpdate({ voiceResponse: !aiConfig.voiceResponse })}
                className="flex items-center justify-between pt-2 border-t border-white/5 cursor-pointer text-xs"
              >
                <span className="text-slate-300">Voice Audio Responses (TTS)</span>
                <div className={`relative w-11 h-6 rounded-full transition-colors p-0.5 ${
                  aiConfig.voiceResponse ? 'bg-emerald-600' : 'bg-zinc-800'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    aiConfig.voiceResponse ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>

              {/* Compact Density */}
              <div
                onClick={toggleCompact}
                className="flex items-center justify-between pt-2 border-t border-white/5 cursor-pointer"
              >
                <span className="text-xs text-slate-300">Compact Dashboard Density</span>
                <div className={`relative w-11 h-6 rounded-full transition-colors p-0.5 ${
                  settings.compactMode ? 'bg-emerald-600' : 'bg-zinc-800'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.compactMode ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>

              {/* Immersive Fullscreen Mode (Hide Android bars) */}
              <div
                onClick={handleToggleFullscreen}
                className="flex items-center justify-between pt-2 border-t border-white/5 cursor-pointer text-xs"
              >
                <div>
                  <div className="text-slate-200 font-medium">Immersive Fullscreen Mode</div>
                  <div className="text-[10px] text-slate-400">Hides Android top status bar & bottom navigation bar</div>
                </div>
                <div className={`relative w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                  isFullscreen ? 'bg-emerald-600' : 'bg-zinc-800'
                }`}>
                  <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    isFullscreen ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            </div>

            {/* SECTION 3: THEME COLOR SLIDER */}
            <div className="mb-5 p-4 rounded-2xl bg-[#101322] border border-white/10 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-slate-300" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Theme Color
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-black/40 text-slate-200 border border-white/10">
                  {currentHue}° Hue
                </span>
              </div>

              {/* Continuous Color Gradient Slider */}
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1.5 font-medium">
                  <span>Green (140°)</span>
                  <span>Blue (222°)</span>
                  <span>Purple (280°)</span>
                </div>
                <div className="relative flex items-center">
                  <input
                    type="range"
                    min="140"
                    max="280"
                    step="1"
                    value={currentHue}
                    onChange={(e) => handleHueChange(e.target.value)}
                    className="w-full h-2.5 rounded-lg cursor-pointer appearance-none outline-none"
                    style={{
                      background: 'linear-gradient(to right, #10b981 0%, #06b6d4 25%, #2563eb 55%, #4f46e5 80%, #7c3aed 100%)'
                    }}
                  />
                </div>
              </div>

              {/* Presets at the Bottom */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-white/5">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = Math.abs(currentHue - preset.hue) <= 8;
                  return (
                    <button
                      key={preset.name}
                      onClick={() => {
                        playSound('click', soundEnabled);
                        handleHueChange(preset.hue);
                      }}
                      className={`p-2 rounded-xl text-xs font-medium border flex items-center justify-center gap-1.5 transition-all ${
                        isSelected 
                          ? 'bg-white text-black border-white shadow-md font-bold' 
                          : 'bg-white/[0.03] border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ background: `hsl(${preset.hue}, 85%, 55%)` }}
                      />
                      <span className="truncate text-[11px]">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION: GOOGLE GEMINI AI & VISION ENGINE */}
            <div className="mb-5 p-4 rounded-2xl bg-[#101322] border border-white/10 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Google Gemini AI & Vision Engine
                  </span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  (settings?.aiConfig?.apiKey || '').trim()
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {(settings?.aiConfig?.apiKey || '').trim() ? 'AI Active' : 'Key Missing'}
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Powers camera meal scanning & macro breakdown, Hermes voice intelligence assistant, and academic tutor.
              </p>

              {/* API Key Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase font-mono text-slate-400">
                  <span>Gemini API Key (Local Device Storage)</span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
                  >
                    <span>Get Free Key</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      onBlur={() => {
                        if (apiKeyInput.trim() !== (settings?.aiConfig?.apiKey || '')) {
                          handleAiUpdate({ apiKey: apiKeyInput.trim() });
                        }
                      }}
                      placeholder="AIzaSy..."
                      className="w-full pl-3 pr-9 py-2 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none focus:border-emerald-500/50 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                      title={showApiKey ? "Hide key" : "Show key"}
                    >
                      {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveApiKey}
                    className="px-3 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all active:scale-95 shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleTestAiConnection}
                    disabled={isTestingAi}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all active:scale-95 disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTestingAi ? 'animate-spin' : ''}`} />
                    <span>{isTestingAi ? 'Testing...' : 'Test'}</span>
                  </button>
                </div>

                {/* Test Feedback Message */}
                {aiTestResult && (
                  <div className={`text-[11px] p-2 rounded-lg border flex items-center gap-2 ${
                    aiTestResult.success 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                  }`}>
                    {aiTestResult.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                    )}
                    <span className="truncate">{aiTestResult.message}</span>
                  </div>
                )}
              </div>

              {/* Model Selector */}
              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <div className="text-[10px] uppercase font-mono text-slate-400">Default Vision & Chat Model</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'gemini-3.5-flash-lite', label: '3.5 Flash Lite', badge: 'Fastest' },
                    { id: 'gemini-3.6-flash', label: '3.6 Flash', badge: 'Balanced' },
                  ].map((m) => {
                    const isSelected = (aiConfig.model || 'gemini-3.5-flash-lite') === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleAiUpdate({ model: m.id })}
                        className={`p-2 rounded-xl text-left border transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-white text-black border-white font-bold shadow-sm'
                            : 'bg-white/[0.03] border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="text-xs font-mono">{m.label}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                          isSelected ? 'bg-black/10 text-black' : 'bg-white/10 text-slate-400'
                        }`}>{m.badge}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* SECTION 4: GOOGLE ACCOUNT & CROSS-DEVICE CLOUD SYNC (NEAR BOTTOM) */}
            <div className="mb-5 p-4 rounded-2xl bg-[#101322] border border-white/10 space-y-3 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Google Account & Cross-Device Sync
                  </span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  !isGCalConnected || syncStatus === 'disconnected'
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                    : syncStatus === 'failed' || syncStatus === 'error'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : syncStatus === 'syncing'
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                        : syncStatus === 'synced'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                }`}>
                  {!isGCalConnected || syncStatus === 'disconnected'
                    ? 'Disconnected'
                    : syncStatus === 'failed' || syncStatus === 'error'
                      ? 'Sync Failed'
                      : syncStatus === 'syncing'
                        ? 'Syncing...'
                        : '6 Hubs Live'}
                </span>
              </div>

              {isGCalConnected && syncStatus !== 'disconnected' ? (
                <div className="space-y-2.5 pt-1">
                  {(syncStatus === 'failed' || syncStatus === 'error') && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-between text-rose-300 text-xs">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                        <div>
                          <span className="font-semibold text-rose-200">Sync Problem Detected</span>
                          <div className="text-[11px] text-rose-300/80">Unable to reach Google Calendar or Cloud Vault. Tap Retry.</div>
                        </div>
                      </div>
                      <button
                        onClick={handleSyncGCalNow}
                        disabled={isSyncingGCal}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncingGCal ? 'animate-spin' : ''}`} />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex flex-col">
                      <span className="text-slate-200 font-medium flex items-center gap-1.5">
                        {syncStatus === 'failed' || syncStatus === 'error' ? (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : syncStatus === 'synced' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span>{getGoogleAccount()?.email || 'Google Account Connected'}</span>
                      </span>
                      <span className={`text-[10px] pl-5 flex items-center gap-1 ${
                        syncStatus === 'failed' || syncStatus === 'error' ? 'text-rose-400/90' :
                        syncStatus === 'synced' ? 'text-emerald-400/90' :
                        'text-slate-400'
                      }`}>
                        <span>
                          {syncStatus === 'failed' || syncStatus === 'error' ? 'Sync Failed — Reconnect Account' :
                           syncStatus === 'synced' ? 'Phone ⇄ Computer Synced • Permanent Device Auth' :
                           'Device Connected — Pending Initial Sync'}
                        </span>
                        {lastSyncTimestamp > 0 && syncStatus === 'synced' && (
                          <span className="text-slate-400">
                            • {Math.max(1, Math.round((Date.now() - lastSyncTimestamp) / 1000))}s ago
                          </span>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={handleSyncGCalNow}
                      disabled={isSyncingGCal}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium flex items-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSyncingGCal ? 'animate-spin' : ''}`} />
                      <span>{isSyncingGCal ? 'Syncing...' : 'Sync Now'}</span>
                    </button>
                  </div>

                  <div className="p-2 rounded-xl bg-black/20 border border-white/5 text-[11px] text-slate-300 flex items-center justify-between">
                    <span>Syncs: Nutrition, Workouts, Trading, Academics, Calendar & Settings</span>
                    <span className="text-[10px] font-mono text-emerald-400">Auto</span>
                  </div>

                  {gcalMsg && (
                    <div className="text-[11px] text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
                      {gcalMsg}
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                    <button
                      onClick={() => {
                        playSound('click', soundEnabled);
                        if (onOpenGoogleCalendarModal) onOpenGoogleCalendarModal();
                      }}
                      className="text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Cloud Vault & Sync Details
                    </button>

                    <button
                      onClick={handleDisconnectGCal}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium border border-red-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlink className="w-3 h-3" />
                      <span>Disconnect Device</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2.5 text-rose-300 text-xs">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <div>
                      <div className="font-semibold text-rose-200">Device Disconnected</div>
                      <div className="text-[11px] text-rose-300/80">Cross-device sync and Google Calendar are currently offline.</div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Sign in once with your Google account to keep all your data (trading, nutrition, workouts, academics, and calendar) automatically synchronized between your phone and computer.
                  </p>
                  <button
                    onClick={() => {
                      playSound('click', soundEnabled);
                      if (onOpenGoogleCalendarModal) onOpenGoogleCalendarModal();
                    }}
                    className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-sm active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Connect Google Account (Sync Phone & PC)</span>
                  </button>
                </div>
              )}
            </div>

            {/* SECTION 5: OBSIDIAN VAULT INTEGRATION (NEAR BOTTOM) */}
            <div className="mb-5 p-4 rounded-2xl bg-[#101322] border border-white/10 space-y-3 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <FolderSync className="w-4 h-4 text-[#a78bfa]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Obsidian Vault Integration
                  </span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                  vaultMeta.connected ? 'bg-[#7c3aed]/20 text-[#c4b5fd]' : 'bg-white/5 text-slate-500'
                }`}>
                  {vaultMeta.connected ? 'Vault Linked' : 'Not Connected'}
                </span>
              </div>

              {vaultMeta.connected ? (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#a78bfa]" />
                      <span>Vault: "{vaultMeta.folderName}" ({vaultMeta.totalNotes || 0} Notes)</span>
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    AI reads your lecture notes & outlines to generate study decks and mock exams.
                  </p>

                  <div className="pt-2 border-t border-white/5 flex justify-end">
                    <button
                      onClick={handleDisconnectVault}
                      className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-medium border border-red-500/20 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Unlink className="w-3 h-3" />
                      <span>Disconnect Obsidian Vault</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 pt-1">
                  <p className="text-xs text-slate-400">
                    Connect your local Obsidian school folder to sync notes, outlines, and study decks.
                  </p>
                  <button
                    onClick={handleConnectVault}
                    className="w-full py-2 rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white text-xs font-bold shadow-sm active:scale-95 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <FolderSync className="w-3.5 h-3.5" />
                    <span>Connect Obsidian Vault</span>
                  </button>
                </div>
              )}
            </div>

            {/* SECTION 6: TRADING & WEBHOOK CONNECTIONS */}
            <div className="mb-5 p-4 rounded-2xl bg-[#101322] border border-white/10 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Trading & Webhook Connections
                  </span>
                </div>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  L1 Configured
                </span>
              </div>

              <div className="space-y-3 pt-1">
                {/* Webhook URL Field */}
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">
                    TradingView Webhook Endpoint URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value="https://wolfe-os.vercel.app/api/webhook/tradingview"
                      className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click', soundEnabled);
                        navigator.clipboard.writeText("https://wolfe-os.vercel.app/api/webhook/tradingview");
                        setCopiedWhUrl(true);
                        setTimeout(() => setCopiedWhUrl(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                    >
                      {copiedWhUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedWhUrl ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Webhook Auth Token */}
                <div>
                  <label className="text-[10px] uppercase font-mono text-slate-400 block mb-1">
                    Webhook Authorization Token (`api_token`)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={tradingConfig.webhookSecret || 'wolfe_wh_live_auth'}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click', soundEnabled);
                        navigator.clipboard.writeText(tradingConfig.webhookSecret || 'wolfe_wh_live_auth');
                        setCopiedWhToken(true);
                        setTimeout(() => setCopiedWhToken(false), 2000);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                    >
                      {copiedWhToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedWhToken ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Hyperliquid Master Wallet Info */}
                <div className="p-2.5 rounded-xl bg-black/30 border border-white/5 space-y-1 font-mono text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Hyperliquid Master:</span>
                    <span className="text-white font-bold">{tradingConfig.masterWalletAddress?.slice(0, 10)}...{tradingConfig.masterWalletAddress?.slice(-6)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Trading Engine:</span>
                    <span className="text-emerald-400 font-bold">L1 Mainnet Zero-Middleware</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Footer: Reset & Done */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onResetSettings();
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-400 hover:text-white transition-all border border-white/5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={() => {
                playSound('success', soundEnabled);
                onClose();
              }}
              className="px-6 py-2.5 rounded-xl bg-white text-black font-bold text-xs transition-all active:scale-95 shadow-md"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
