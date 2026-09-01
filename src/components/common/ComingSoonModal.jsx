import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Bell, CheckCircle2 } from 'lucide-react';
import { playSound } from '../../utils/soundFX';

export const ComingSoonModal = ({
  isOpen,
  onClose,
  title = "Feature in Development",
  subtitle = "We're building this capability into Wolfe OS.",
  badge = "Roadmap",
  features = [
    "Autonomous real-time synchronization",
    "Deep AI contextual recall",
    "Cross-device push alerts"
  ],
  soundEnabled = true
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="relative w-full max-w-md rounded-2xl bg-[#10131d]/95 border border-white/10 p-6 shadow-2xl backdrop-blur-2xl z-10 overflow-hidden"
        >
          {/* Close button */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              onClose();
            }}
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all border border-white/5"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-white/5 text-slate-300 border border-white/10 mb-3">
            <Zap className="w-3 h-3 text-slate-400" />
            {badge}
          </div>

          <h3 className="text-lg font-bold text-white tracking-tight mb-1">
            {title}
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">
            {subtitle}
          </p>

          {/* Capabilities */}
          <div className="space-y-2 mb-5 bg-white/[0.02] p-3.5 rounded-xl border border-white/5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Planned Capabilities
            </p>
            {features.map((feat, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>{feat}</span>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                playSound('success', soundEnabled);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-white text-black font-semibold text-xs transition-all active:scale-[0.98]"
            >
              <Bell className="w-3.5 h-3.5" />
              Notify When Live
            </button>
            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onClose();
              }}
              className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs border border-white/10 transition-all"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
