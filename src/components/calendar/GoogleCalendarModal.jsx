import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, 
  CheckCircle2, 
  RefreshCw, 
  ExternalLink, 
  Key, 
  Unlink, 
  X, 
  AlertCircle,
  ListTodo
} from 'lucide-react';
import { 
  isGoogleCalendarConnected, 
  saveGoogleToken, 
  disconnectGoogleCalendar, 
  fetchGoogleCalendarEvents,
  signInWithGooglePopup
} from '../../utils/googleCalendarService';
import { playSound } from '../../utils/soundFX';

export const GoogleCalendarModal = ({ 
  isOpen, 
  onClose, 
  onSyncSuccess,
  soundEnabled = true 
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [error, setError] = useState(null);
  const [showManualInput, setShowManualInput] = useState(false);

  // Check connection status on open
  useEffect(() => {
    if (isOpen) {
      setIsConnected(isGoogleCalendarConnected());
      setError(null);
      setSyncMessage(null);
      setManualToken('');
      setShowManualInput(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    playSound('click', soundEnabled);
    setError(null);
    setSyncMessage(null);
    setIsSyncing(true);

    try {
      await signInWithGooglePopup();
      setIsConnected(true);
      await handleSyncNow();
    } catch (err) {
      console.warn("Google sign-in notice:", err);
      setError(err.message || "Google Sign-In was cancelled or interrupted.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualTokenSubmit = async (e) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    playSound('click', soundEnabled);
    setError(null);
    saveGoogleToken(manualToken.trim());
    setIsConnected(true);
    await handleSyncNow();
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setError(null);
    setSyncMessage(null);

    try {
      const events = await fetchGoogleCalendarEvents();
      playSound('success', soundEnabled);
      setSyncMessage(`Successfully synced ${events.length} item(s) from your Google Calendar & Tasks!`);
      if (onSyncSuccess) {
        onSyncSuccess(events);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch events from Google Calendar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDisconnect = () => {
    playSound('click', soundEnabled);
    disconnectGoogleCalendar();
    setIsConnected(false);
    setSyncMessage(null);
    setError(null);
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
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/50 backdrop-blur-xl transition-all"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-[#0b0e18]/90 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04]"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <Calendar className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Google Calendar & Tasks 2-Way Sync</h3>
                <p className="text-xs text-slate-400">Stream schedule & voice-book events (Full 1-Year Sync)</p>
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
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-300">Google Calendar & Tasks Connected</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400/80 px-2 py-0.5 rounded bg-emerald-500/20">
                  Live
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Your Google Calendar & Tasks are synchronized. Full 1-year timeline streaming is active. Adding or deleting items in Wolfe OS updates Google instantly.
              </p>

              <div className="pt-2 border-t border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? "Syncing..." : "Sync / Refresh Full Year"}</span>
                  </button>

                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 text-xs font-medium border border-white/10 transition-colors cursor-pointer"
                    title="Disconnect Google Account"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Prominent Official 1-Click Google Sign-In Card */}
              <div className="p-5 rounded-2xl bg-[#131728] border border-white/10 space-y-4 text-center">
                <div className="space-y-1.5 text-center">
                  <h4 className="text-sm font-bold text-white tracking-tight">Connect Your Google Account</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    Sign in with Google to sync your calendar events, exams, assignments, and Google Tasks directly into Wolfe OS.
                  </p>
                </div>

                {/* 1-Click Official Google Button */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSyncing}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-2xl bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-900 font-semibold text-sm shadow-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                  {/* Google Official 4-Color SVG Icon */}
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  <span>{isSyncing ? "Signing in..." : "Sign in with Google"}</span>
                </button>

                {/* Collapsible Manual Token Option */}
                <div className="pt-2 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => setShowManualInput(prev => !prev)}
                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors underline cursor-pointer"
                  >
                    {showManualInput ? "Hide manual token option" : "Or enter token manually"}
                  </button>

                  {showManualInput && (
                    <form onSubmit={handleManualTokenSubmit} className="mt-3 space-y-2 text-left">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={manualToken}
                          onChange={(e) => setManualToken(e.target.value)}
                          placeholder="Paste Token (ya29... or 1//...)"
                          className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-600 outline-none font-mono focus:border-white/30"
                        />
                        <button
                          type="submit"
                          disabled={!manualToken.trim() || isSyncing}
                          className="px-3.5 py-2 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-30 shrink-0 cursor-pointer"
                          style={{ backgroundColor: 'var(--accent-primary)' }}
                        >
                          Connect
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {/* Information Cards */}
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <div className="font-semibold text-slate-300 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-rose-400" />
                    <span>Deadlines & Events</span>
                  </div>
                  <p className="text-[10px] text-slate-500">Deadlines display in bold red at the top of due dates.</p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <div className="font-semibold text-slate-300 flex items-center gap-1">
                    <ListTodo className="w-3 h-3 text-blue-400" />
                    <span>Tasks & 1-Year Sync</span>
                  </div>
                  <p className="text-[10px] text-slate-500">Syncs your upcoming 365 days of events and tasks.</p>
                </div>
              </div>
            </div>
          )}

          {/* Feedback Banners */}
          {syncMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{syncMessage}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">{error}</p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
