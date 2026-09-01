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
  purgeGoogleCalendarEntriesByKeywords
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
  const [isPurging, setIsPurging] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);
  const [error, setError] = useState(null);

  // Check connection status on open
  useEffect(() => {
    if (isOpen) {
      setIsConnected(isGoogleCalendarConnected());
      setError(null);
      setSyncMessage(null);
      setManualToken('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

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

  const handlePurgeFnceOpma = async () => {
    setIsPurging(true);
    setError(null);
    setSyncMessage(null);
    playSound('click', soundEnabled);

    try {
      const { deletedCount } = await purgeGoogleCalendarEntriesByKeywords(['FNCE', 'OPMA']);
      playSound('success', soundEnabled);
      setSyncMessage(`🧹 Successfully deleted ${deletedCount} FNCE & OPMA event(s) from Google Calendar & Tasks!`);
      
      // Refresh local view after purge
      const freshEvents = await fetchGoogleCalendarEvents();
      if (onSyncSuccess) {
        onSyncSuccess(freshEvents);
      }
    } catch (err) {
      setError(err.message || "Failed to purge items from Google Calendar.");
    } finally {
      setIsPurging(false);
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

              <div className="flex flex-col gap-2 pt-2 border-t border-emerald-500/20">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSyncNow}
                    disabled={isSyncing || isPurging}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-white text-xs font-semibold shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? "Syncing..." : "Sync / Refresh Full Year"}</span>
                  </button>

                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 text-xs font-medium border border-white/10 transition-colors cursor-pointer"
                    title="Disconnect Google Account"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Direct One-Click Purge Button */}
                <button
                  type="button"
                  onClick={handlePurgeFnceOpma}
                  disabled={isPurging || isSyncing}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPurging ? 'animate-spin text-rose-400' : ''}`} />
                  <span>{isPurging ? "Purging FNCE & OPMA from Google..." : "🧹 Purge FNCE & OPMA from Google"}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* Quick 10-Second Token Method */}
              <div className="p-4 rounded-2xl bg-[#131728] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                    <span>Quick Access Token (Takes 10s)</span>
                  </span>
                  <a
                    href="https://developers.google.com/oauthplayground"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] flex items-center gap-1 hover:underline font-semibold"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <span>OAuth Playground</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                {/* 3 Step Guide */}
                <div className="text-[11px] text-slate-300 space-y-1.5 bg-black/30 p-3 rounded-xl border border-white/5">
                  <div>1. Open <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="underline text-blue-400 font-semibold">Google OAuth Playground</a>.</div>
                  <div>2. Select <strong>Google Calendar API v3</strong> (<code className="text-[10px] bg-white/10 px-1 py-0.5 rounded">calendar.events</code>) and <strong>Tasks API v1</strong> (<code className="text-[10px] bg-white/10 px-1 py-0.5 rounded">tasks</code>).</div>
                  <div>3. Click <strong>Authorize APIs</strong> &rarr; Click <strong>Exchange authorization code for tokens</strong> &rarr; Copy <strong>Access token</strong>.</div>
                </div>

                <form onSubmit={handleManualTokenSubmit} className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={manualToken}
                      onChange={(e) => setManualToken(e.target.value)}
                      placeholder="Paste Refresh Token (1//...) or Access Token (ya29...)"
                      className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-600 outline-none font-mono focus:border-white/30"
                    />
                    <button
                      type="submit"
                      disabled={!manualToken.trim()}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-30 shrink-0"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      Connect & Sync
                    </button>
                  </div>
                </form>
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
