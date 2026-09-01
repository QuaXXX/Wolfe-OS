import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, X, Loader2, CheckCircle2 } from 'lucide-react';
import { playSound } from '../../utils/soundFX';

export const UndoActionPopup = ({ 
  undoAction, 
  onUndo, 
  onDismiss, 
  soundEnabled = true 
}) => {
  if (!undoAction) return null;

  const handleUndo = () => {
    playSound('click', soundEnabled);
    if (onUndo) onUndo(undoAction);
  };

  const handleDismiss = () => {
    playSound('click', soundEnabled);
    if (onDismiss) onDismiss();
  };

  const sync = undoAction.syncProgress;
  const percent = sync && sync.total > 0 ? Math.round((sync.current / sync.total) * 100) : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="fixed bottom-20 sm:bottom-6 right-3 sm:right-6 left-3 sm:left-auto z-50 max-w-md sm:w-auto select-none"
      >
        <div className="flex items-center justify-between gap-3 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-[#0c0f1d]/95 border border-white/15 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.8)] backdrop-blur-xl">
          {/* Status Indicator Icon or Circular Progress */}
          <div className="relative w-8 h-8 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
            {sync?.inProgress ? (
              <Loader2 className="w-4 h-4 animate-spin text-slate-200" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
          </div>

          {/* Message & Live Progress Bar */}
          <div className="min-w-0 pr-2">
            <div className="text-xs font-bold text-white flex items-center gap-2 truncate">
              <span>{undoAction.title || "Calendar Updated"}</span>
              {sync?.inProgress && (
                <span className="text-[10px] font-mono text-slate-400 font-normal">
                  ({sync.current}/{sync.total})
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300 truncate max-w-[260px] mt-0.5">
              {undoAction.description || "Modified calendar items"}
            </div>

            {/* Mini Progress Bar for Background Uploads */}
            {sync?.inProgress && (
              <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mt-1.5">
                <motion.div 
                  className="h-full bg-emerald-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0 pl-1 border-l border-white/10">
            <button
              onClick={handleUndo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>

            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
