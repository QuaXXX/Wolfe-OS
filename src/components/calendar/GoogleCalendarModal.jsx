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
  Copy,
  Check,
  ShieldCheck,
  Lock,
  ChevronDown,
  ChevronUp,
  Settings2,
  Sparkles
} from 'lucide-react';
import { 
  isGoogleCalendarConnected, 
  saveGoogleToken, 
  disconnectGoogleCalendar, 
  fetchGoogleCalendarEvents,
  signInWithGooglePopup,
  getDeviceSyncDetails,
  getGoogleAccount,
  isMobileDevice
} from '../../utils/googleCalendarService';
import { playSound } from '../../utils/soundFX';

export const GoogleCalendarModal = ({ 
  isOpen, 
  onClose, 
  onSyncSuccess,
  soundEnabled = true 
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
      await signInWithGooglePopup();
      refreshStatus();
      await handleSyncNow();
    } catch (err) {
      console.warn("Google sign-in notice:", err);
      setError(err.message || "Google Sign-In was cancelled or interrupted.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveCustomCreds = (e) => {
    e.preventDefault();
    if (typeof localStorage === 'undefined') return;
    playSound('click', soundEnabled);

    if (customClientId.trim()) {
      localStorage.setItem('wolfe_gcal_client_id', customClientId.trim());
    } else {
      localStorage.removeItem('wolfe_gcal_client_id');
    }

    if (customClientSecret.trim()) {
      localStorage.setItem('wolfe_gcal_client_secret', customClientSecret.trim());
    } else {
      localStorage.removeItem('wolfe_gcal_client_secret');
    }

    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleManualTokenSubmit = async (e) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    playSound('click', soundEnabled);
    setError(null);
    saveGoogleToken(manualToken.trim());
    refreshStatus();
    await handleSyncNow();
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncMessage(null);

    try {
      const events = await fetchGoogleCalendarEvents(true);
      playSound('success', soundEnabled);
      refreshStatus();
      setSyncMessage(`Successfully synced ${events.length} item(s) across all Google Calendars & Tasks!`);
      if (onSyncSuccess) {
        onSyncSuccess(events);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch events from Google Calendar.");
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
                <Calendar className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Google Calendar & Tasks</span>
                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
                    2-Way Sync
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Persistent device authentication with background auto-sync</p>
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
            <div className="p-4.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    {account?.picture ? (
                      <img src={account.picture} alt="Google Avatar" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <span>{account?.name || 'Device Authenticated'}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">
                        Permanent
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-300 font-mono truncate max-w-[240px]">
                      {account?.email || 'Google Calendar & Tasks Active'}
                    </div>
                  </div>
                </div>

                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
              </div>

              <div className="text-xs text-slate-300/90 leading-relaxed bg-black/20 p-3 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 text-emerald-300 font-medium mb-1">
                  <Lock className="w-3 h-3" />
                  <span>Permanent Device Access</span>
                </div>
                You signed in once on this device. Events, classes, and tasks sync automatically in the background with zero popup prompts.
              </div>

              <div className="pt-2 border-t border-emerald-500/20 flex items-center gap-2">
                <button
                  onClick={handleSyncNow}
                  disabled={isSyncing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? "Syncing Calendar & Tasks..." : "Sync 2-Way Now"}</span>
                </button>

                <button
                  onClick={handleDisconnect}
                  className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 text-xs font-medium border border-white/10 transition-colors cursor-pointer flex items-center gap-1"
                  title="Disconnect Device"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Disconnect</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Primary 1-Click Sign-In Hero Card */}
              <div className="p-5 rounded-2xl bg-[#131728] border border-white/10 space-y-4 text-center">
                <div className="space-y-1.5 text-center">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-medium mb-1">
                    <Sparkles className="w-3 h-3 text-indigo-400" />
                    <span>Sign in once • Stay connected on this device</span>
                  </div>
                  <h4 className="text-sm font-bold text-white tracking-tight">Connect Your Google Account</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Sync calendar events, exams, assignments, and Google Tasks seamlessly across your phone, laptop, and Wolfe OS.
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
                    {isSyncing ? (isMobileDevice() ? "Redirecting to Google..." : "Connecting device...") : "Sign in with Google"}
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
                {/* Current Origin Info */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-1.5">
                  <div className="text-[11px] font-bold text-white flex items-center justify-between">
                    <span>Authorized JavaScript Origin:</span>
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
                  <p className="text-[10px] text-slate-400 leading-normal">
                    In Google Cloud Console &gt; Credentials, ensure <code>{currentOrigin}</code> is registered under <strong>Authorized JavaScript origins</strong>.
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
