import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  CheckCircle2, 
  RefreshCw, 
  Unlink, 
  X, 
  AlertCircle,
  Clock,
  RotateCw,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  Settings2,
  Sparkles,
  Cloud,
  Smartphone,
  Laptop,
  Dumbbell,
  UtensilsCrossed,
  TrendingUp,
  GraduationCap
} from 'lucide-react';
import { 
  isGoogleCalendarConnected, 
  saveGoogleToken, 
  disconnectGoogleCalendar, 
  fetchGoogleCalendarEvents,
  signInWithGooglePopup,
  signInWithGoogleCode,
  getDeviceSyncDetails,
  getGoogleAccount,
  isMobileDevice
} from '../../utils/googleCalendarService';
import { syncFullOsWithCloud } from '../../utils/cloudSyncEngine';
import { playSound } from '../../utils/soundFX';

export const GoogleCalendarModal = ({ 
  isOpen, 
  onClose, 
  onSyncSuccess,
  soundEnabled = true,
  syncStatus = 'connected',
  lastSyncTimestamp = 0,
  onSyncNow = null
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [syncDetails, setSyncDetails] = useState({ isConnected: false, hasPermanentAccess: false });
  const [account, setAccount] = useState(null);
  const [manualToken, setManualToken] = useState('');
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [error, setError] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  // Refresh status on open
  useEffect(() => {
    if (isOpen) {
      const connected = isGoogleCalendarConnected();
      setIsConnected(connected);
      setSyncDetails(getDeviceSyncDetails());
      setAccount(getGoogleAccount());
      setError(null);
      setSyncMessage(null);
      setManualToken('');

      if (typeof localStorage !== 'undefined') {
        setCustomClientId(localStorage.getItem('wolfe_gcal_client_id') || '');
        setCustomClientSecret(localStorage.getItem('wolfe_gcal_client_secret') || '');
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const refreshStatus = () => {
    const connected = isGoogleCalendarConnected();
    setIsConnected(connected);
    setSyncDetails(getDeviceSyncDetails());
    setAccount(getGoogleAccount());
  };

  const handleGoogleSignIn = async () => {
    playSound('click', soundEnabled);
    setError(null);
    setSyncMessage(null);
    setIsSyncing(true);

    try {
      // 1. Prioritize permanent authorization code flow (offline refresh_token)
      try {
        await signInWithGoogleCode();
      } catch (codeErr) {
        console.warn("GIS code flow fallback to token client:", codeErr);
        await signInWithGooglePopup();
      }

      refreshStatus();

      // 2. Immediately trigger 2-way cloud sync across all 6 hubs (Trading, Nutrition, Workouts, Academics, Calendar, Settings)
      const cloudRes = await syncFullOsWithCloud({ forcePush: false });

      // 3. Immediately sync Google Calendar & Google Tasks
      await handleSyncNow();

      if (cloudRes?.success) {
        setSyncMessage("All 6 command hubs synchronized across phone & computer!");
      }
    } catch (err) {
      console.warn("Google sign-in notice:", err);
      setError(err.message || "Google Sign-In was cancelled or interrupted.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForcePushCloud = async () => {
    playSound('click', soundEnabled);
    setIsSyncing(true);
    setError(null);
    try {
      const res = await syncFullOsWithCloud({ forcePush: true });
      if (res.success) {
        playSound('success', soundEnabled);
        setSyncMessage("Successfully pushed this device's state to cloud master!");
      } else {
        setError(res.error || "Failed to push to cloud.");
      }
    } catch (e) {
      setError(e.message || "Force push failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleForcePullCloud = async () => {
    playSound('click', soundEnabled);
    setIsSyncing(true);
    setError(null);
    try {
      const res = await syncFullOsWithCloud({ forcePull: true });
      if (res.success) {
        playSound('success', soundEnabled);
        setSyncMessage("Successfully downloaded latest cloud master to this device!");
      } else {
        setError(res.error || "Failed to pull from cloud.");
      }
    } catch (e) {
      setError(e.message || "Force pull failed.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncMessage(null);

    try {
      // 1. Sync full OS state with cloud
      await syncFullOsWithCloud({ forcePush: false });

      // 2. Sync Google Calendar & Tasks
      const events = await fetchGoogleCalendarEvents(true);
      playSound('success', soundEnabled);
      refreshStatus();
      setSyncMessage(`Synced ${events ? events.length : 0} calendar items & all 6 OS hubs across devices!`);
      if (onSyncSuccess) {
        onSyncSuccess(events);
      }
    } catch (err) {
      setError(err.message || "Failed to sync with Google.");
      if (err.message?.includes('expired') || err.message?.includes('401')) {
        disconnectGoogleCalendar();
        refreshStatus();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = () => {
    playSound('click', soundEnabled);
    disconnectGoogleCalendar();
    refreshStatus();
    setSyncMessage(null);
    setError(null);
  };

  const handleCopyOrigin = () => {
    if (navigator.clipboard && currentOrigin) {
      navigator.clipboard.writeText(currentOrigin);
      setCopiedOrigin(true);
      setTimeout(() => setCopiedOrigin(false), 2500);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
        {/* Frosted Glass Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/60 backdrop-blur-xl transition-all"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04]"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <Cloud className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Google Account & Cross-Device Sync</span>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                    6 Hubs Live
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Persistent authorization • Sync phone & computer automatically</p>
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

          {/* Connected State Card */}
          {isConnected ? (
            <div className={`p-4.5 rounded-2xl border space-y-3.5 ${
              (error || syncStatus === 'failed' || syncStatus === 'error')
                ? 'bg-rose-500/10 border-rose-500/20'
                : 'bg-emerald-500/10 border-emerald-500/20'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${
                    (error || syncStatus === 'failed' || syncStatus === 'error')
                      ? 'bg-rose-500/20 border-rose-500/30'
                      : 'bg-emerald-500/20 border-emerald-500/30'
                  }`}>
                    {account?.picture ? (
                      <img src={account.picture} alt="Google Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (error || syncStatus === 'failed' || syncStatus === 'error') ? (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div>
                    <div className={`text-xs font-bold flex items-center gap-1.5 ${
                      (error || syncStatus === 'failed' || syncStatus === 'error') ? 'text-rose-300' : 'text-emerald-300'
                    }`}>
                      <span>{account?.name || ((error || syncStatus === 'failed' || syncStatus === 'error') ? 'Sync Failed' : 'Device Authenticated')}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                        (error || syncStatus === 'failed' || syncStatus === 'error') ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {(error || syncStatus === 'failed' || syncStatus === 'error') ? 'Attention' : 'Connected'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono truncate max-w-[240px]">
                      {account?.email || 'Google Account Active'}
                    </div>
                  </div>
                </div>

                <span className={`flex items-center gap-1 text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  (error || syncStatus === 'failed' || syncStatus === 'error')
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : syncStatus === 'synced'
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      : isSyncing
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {(error || syncStatus === 'failed' || syncStatus === 'error') ? (
                    <>
                      <AlertCircle className="w-3 h-3 text-rose-400" />
                      <span>Sync Failed</span>
                    </>
                  ) : syncStatus === 'synced' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>All Hubs Synced</span>
                    </>
                  ) : isSyncing ? (
                    <>
                      <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" />
                      <span>Syncing...</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Connected</span>
                    </>
                  )}
                </span>
              </div>

              {/* 6 Hubs Sync Grid */}
              <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-medium">Cross-Device Synchronized Modules</span>
                  <span className="text-[10px] font-mono text-emerald-400">Phone ⇄ Computer</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-slate-200">
                    <UtensilsCrossed className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="truncate">Nutrition</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-slate-200">
                    <Dumbbell className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span className="truncate">Workouts</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-slate-200">
                    <TrendingUp className="w-3 h-3 text-blue-400 shrink-0" />
                    <span className="truncate">Trading</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-slate-200">
                    <GraduationCap className="w-3 h-3 text-purple-400 shrink-0" />
                    <span className="truncate">Academics</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-slate-200">
                    <Calendar className="w-3 h-3 text-amber-400 shrink-0" />
                    <span className="truncate">Calendar</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-slate-200">
                    <Settings2 className="w-3 h-3 text-rose-400 shrink-0" />
                    <span className="truncate">Settings</span>
                  </div>
                </div>
              </div>

              {(error || syncStatus === 'failed' || syncStatus === 'error') ? (
                <div className="text-xs text-rose-300 bg-rose-500/10 p-3 rounded-xl border border-rose-500/25 space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-rose-200">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Session Expired or Unauthorized</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-300/90">
                    Your Google session is no longer valid. Tap <strong>Reconnect Account</strong> below to re-authorize permanently.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-slate-300/90 leading-relaxed bg-black/20 p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-300 font-medium">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Permanent Offline Access</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">0 logins needed</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2 pt-1 border-t border-white/10">
                {(error || syncStatus === 'failed' || syncStatus === 'error') ? (
                  <button
                    onClick={handleGoogleSignIn}
                    disabled={isSyncing}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer bg-rose-600 hover:bg-rose-500 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? "Connecting..." : "Reconnect Account"}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? "Syncing All 6 Hubs..." : "Sync All Hubs Now"}</span>
                  </button>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleForcePushCloud}
                    disabled={isSyncing}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white text-[11px] font-medium border border-white/10 transition-colors cursor-pointer"
                    title="Upload this device's current data as cloud master"
                  >
                    Force Push
                  </button>
                  <button
                    onClick={handleForcePullCloud}
                    disabled={isSyncing}
                    className="flex-1 py-1.5 px-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white text-[11px] font-medium border border-white/10 transition-colors cursor-pointer"
                    title="Download cloud master to overwrite this device"
                  >
                    Force Pull
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 text-[11px] font-medium border border-white/10 transition-colors cursor-pointer flex items-center gap-1"
                    title="Disconnect Device"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Primary 1-Click Sign-In Hero Card */}
              <div className="p-5 rounded-2xl bg-[#131728] border border-white/10 space-y-4 text-center">
                <div className="space-y-1.5 text-center">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium mb-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>Sign in once • Synchronize phone & computer</span>
                  </div>
                  <h4 className="text-sm font-bold text-white tracking-tight">Connect Your Google Account</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Access your trading, nutrition, workouts, and calendar as one unified system across all devices with permanent authentication.
                  </p>
                </div>

                {/* 1-Click Official Google Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSyncing}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-900 font-semibold text-sm shadow-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>
                    {isSyncing ? "Connecting device..." : "Sign in with Google"}
                  </span>
                </button>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 text-left pt-2 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>One-time sign in</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>0 popup disruptions</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>2-Way calendar sync</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Google Tasks integration</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Advanced / Developer Configuration Accordion */}
          <div className="pt-1 border-t border-white/10">
            <button
              type="button"
              onClick={() => setShowAdvanced(prev => !prev)}
              className="w-full flex items-center justify-between py-2 text-[11px] text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5" />
                <span>Advanced Connection & Custom Credentials</span>
              </span>
              {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3.5 pt-2 pb-1 text-left"
              >
                {/* Current Origin & Redirect URI Info */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5">
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-white flex items-center justify-between">
                      <span>Authorized JavaScript Origin (for 1-Click Sign-In):</span>
                      <button
                        type="button"
                        onClick={handleCopyOrigin}
                        className="text-[10px] flex items-center gap-1 font-mono cursor-pointer transition-opacity hover:opacity-80"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {copiedOrigin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOrigin ? "Copied" : "Copy URL"}</span>
                      </button>
                    </div>
                    <div className="text-xs font-mono truncate bg-black/40 p-2 rounded-lg border border-white/5" style={{ color: 'var(--accent-primary)' }}>
                      {currentOrigin}
                    </div>
                  </div>

                  <div className="space-y-1 pt-1.5 border-t border-white/5">
                    <div className="text-[11px] font-bold text-white flex items-center justify-between">
                      <span>Authorized Redirect URI (for Code / Offline Flow):</span>
                      <button
                        type="button"
                        onClick={handleCopyOrigin}
                        className="text-[10px] flex items-center gap-1 font-mono cursor-pointer transition-opacity hover:opacity-80"
                        style={{ color: 'var(--accent-primary)' }}
                      >
                        {copiedOrigin ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedOrigin ? "Copied" : "Copy URI"}</span>
                      </button>
                    </div>
                    <div className="text-xs font-mono truncate bg-black/40 p-2 rounded-lg border border-white/5 text-slate-300">
                      {currentOrigin}
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 leading-normal pt-1">
                    In Google Cloud Console &gt; Credentials, register <code>{currentOrigin}</code> under <strong>Authorized JavaScript origins</strong>. If using serverless code exchange, also add it under <strong>Authorized redirect URIs</strong> to prevent Error 400 &quot;Access blocked: app&apos;s request is invalid&quot;.
                  </p>
                </div>

                {/* Custom Client ID & Client Secret Form */}
                <form onSubmit={handleSaveCustomCreds} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-white">Custom GCP Project Credentials (Optional):</span>
                    {savedNotice && (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={customClientId}
                      onChange={(e) => setCustomClientId(e.target.value)}
                      placeholder="Google OAuth Client ID (.apps.googleusercontent.com)"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-600 outline-none font-mono focus:border-white/30"
                    />
                    <input
                      type="password"
                      value={customClientSecret}
                      onChange={(e) => setCustomClientSecret(e.target.value)}
                      placeholder="Google OAuth Client Secret (GOCSPX-...)"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-600 outline-none font-mono focus:border-white/30"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white text-[11px] font-medium transition-colors cursor-pointer"
                  >
                    Save Custom Credentials
                  </button>
                </form>

                {/* Manual Token or Refresh Token Paste */}
                <form onSubmit={handleManualTokenSubmit} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                  <label className="text-[11px] font-bold text-white block">
                    Direct Token or Refresh Token (1//... or ya29...):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="Paste Token or Refresh Token..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-600 outline-none font-mono focus:border-white/30"
                    />
                    <button
                      type="submit"
                      disabled={!manualToken.trim() || isSyncing}
                      className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-30 shrink-0 cursor-pointer"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      Connect
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </div>

          {/* Feedback & Error Messages */}
          {syncMessage && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncMessage}</span>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-1.5"
            >
              <div className="flex items-center gap-2 font-semibold text-rose-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Sync Notice:</span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-300/90">{error}</p>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
