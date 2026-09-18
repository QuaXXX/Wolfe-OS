import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Settings, 
  Palette, 
  RotateCcw, 
  UtensilsCrossed, 
  CalendarDays, 
  Layers, 
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  LogOut,
  ShieldCheck,
  Cloud
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { 
  isGoogleCalendarConnected, 
  disconnectGoogleCalendar, 
  logoutGoogleAccount,
  fetchGoogleCalendarEvents,
  getGoogleAccount
} from '../../utils/googleCalendarService';
import { syncFullOsWithCloud } from '../../utils/cloudSyncEngine';

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
  const [isGCalConnected, setIsGCalConnected] = useState(false);
  const [account, setAccount] = useState(null);
  const [isSyncingGCal, setIsSyncingGCal] = useState(false);
  const [gcalMsg, setGcalMsg] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const connected = isGoogleCalendarConnected();
      setIsGCalConnected(connected && syncStatus !== 'disconnected');
      setAccount(getGoogleAccount());
      setGcalMsg(null);
    }
  }, [isOpen, syncStatus]);

  if (!isOpen) return null;

  const currentHue = settings?.accentHue || 222;

  const handleHueChange = (newHue) => {
    onUpdateSettings({
      ...settings,
      accentHue: Number(newHue)
    });
  };

  const toggleModule = (key) => {
    playSound('switch', soundEnabled);
    onUpdateSettings({
      ...settings,
      visibleModules: {
        ...settings?.visibleModules,
        [key]: !settings?.visibleModules?.[key]
      }
    });
  };

  const handleSyncGCalNow = async () => {
    playSound('click', soundEnabled);
    setIsSyncingGCal(true);
    setGcalMsg(null);
    try {
      await syncFullOsWithCloud({ forcePush: false });
      if (onSyncNow) {
        await onSyncNow();
        setGcalMsg("All hubs & Google Calendar synchronized!");
      } else {
        const events = await fetchGoogleCalendarEvents(true);
        playSound('success', soundEnabled);
        setGcalMsg(`Synced ${events ? events.length : 0} event(s) across devices!`);
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

  const handleLogOutGoogle = async () => {
    playSound('click', soundEnabled);
    await logoutGoogleAccount();
    setIsGCalConnected(false);
    setAccount(null);
    setGcalMsg(null);
  };

  const modulesList = [
    { key: 'timeline', label: "Today's Timeline", desc: 'Schedule & deadline stream at the top', icon: CalendarDays },
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
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/75 backdrop-blur-md"
        />

        {/* Slide-out Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="relative w-full max-w-lg h-full bg-[#0a0c14] border-l border-white/10 px-5 sm:px-6 shadow-2xl flex flex-col justify-between overflow-y-auto z-10"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 24px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)'
          }}
        >
          {/* Main Content */}
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div 
                  className="p-2.5 rounded-2xl bg-white/[0.04] text-white"
                  style={{ border: '1px solid var(--accent-border)' }}
                >
                  <Settings className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">System Settings</h3>
                  <p className="text-xs text-slate-400">Appearance, module visibility & sync</p>
                </div>
              </div>

              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                }}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SECTION 1: GOOGLE ACCOUNT & CROSS-DEVICE SYNC */}
            <div className="p-4 rounded-3xl bg-[#101322] border border-white/10 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Cloud className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Google Account & Sync
                  </span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-xl border ${
                  isGCalConnected
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : 'bg-white/5 text-slate-400 border-white/10'
                }`}>
                  {isGCalConnected ? 'Connected & Synced' : 'Not Connected'}
                </span>
              </div>

              {isGCalConnected ? (
                <div className="space-y-3">
                  {/* Account Badge Card */}
                  <div className="p-3 rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl border border-emerald-500/30 bg-emerald-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                        {account?.picture ? (
                          <img src={account.picture} alt="Google Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-emerald-200 truncate">
                          {account?.name || 'Google Account'}
                        </div>
                        <div className="text-[11px] font-mono text-slate-300 truncate">
                          {account?.email || 'Active Authorization'}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleSyncGCalNow}
                      disabled={isSyncingGCal}
                      title="Force sync now"
                      className="p-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white transition-all cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGCal ? 'animate-spin text-emerald-400' : ''}`} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed">
                    Nutrition logs, calendar events, and preferences synchronize automatically across your phone and computer.
                  </p>

                  {gcalMsg && (
                    <div className="text-[11px] text-emerald-300 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{gcalMsg}</span>
                    </div>
                  )}

                  {/* Single Clean Log Out Button */}
                  <button
                    type="button"
                    onClick={handleLogOutGoogle}
                    className="w-full py-2.5 px-4 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 border border-rose-500/25 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-[0.98]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Connect your Google account to automatically synchronize all your nutrition logs and calendar events between your iPhone and computer.
                  </p>

                  {/* Single Clean Connect Button */}
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      if (onOpenGoogleCalendarModal) {
                        onOpenGoogleCalendarModal();
                      }
                    }}
                    className="w-full py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-900 font-semibold text-xs shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2.5"
                  >
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                    <span>Connect with Google</span>
                  </button>
                </div>
              )}
            </div>

            {/* SECTION 2: SHOW / HIDE DASHBOARD MODULES */}
            <div className="p-4 rounded-3xl bg-[#101322] border border-white/10 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
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
                  const isVisible = settings?.visibleModules?.[m.key] !== false;

                  return (
                    <div
                      key={m.key}
                      onClick={() => toggleModule(m.key)}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
                        isVisible
                          ? 'bg-white/[0.04] border-white/15 text-slate-200'
                          : 'bg-black/30 border-white/5 text-slate-500 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl ${isVisible ? 'bg-white/[0.08] text-white' : 'bg-transparent text-slate-600'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{m.label}</div>
                          <div className="text-[11px] text-slate-400">{m.desc}</div>
                        </div>
                      </div>

                      {/* Switch Toggle */}
                      <div className={`relative w-11 h-6 rounded-xl transition-colors p-0.5 ${
                        isVisible ? 'bg-emerald-600' : 'bg-zinc-800'
                      }`}>
                        <div className={`w-5 h-5 rounded-lg bg-white transition-transform ${
                          isVisible ? 'translate-x-5' : 'translate-x-0'
                        }`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SECTION 4: THEME COLOR SLIDER */}
            <div className="p-4 rounded-3xl bg-[#101322] border border-white/10 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-slate-300" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Theme Color
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-black/40 text-slate-200 border border-white/10">
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
                      className={`p-2.5 rounded-2xl text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isSelected 
                          ? 'bg-white text-black border-white shadow-md font-bold' 
                          : 'bg-white/[0.03] border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      <span 
                        className="w-2.5 h-2.5 rounded-sm shrink-0" 
                        style={{ background: `hsl(${preset.hue}, 85%, 55%)` }}
                      />
                      <span className="truncate text-[11px]">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer: Reset & Done */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3 mt-4">
            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onResetSettings();
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={() => {
                playSound('success', soundEnabled);
                onClose();
              }}
              className="px-6 py-2.5 rounded-2xl bg-white text-black font-bold text-xs transition-all active:scale-95 shadow-md cursor-pointer"
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
