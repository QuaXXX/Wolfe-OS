import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Scale, 
  X, 
  Plus, 
  TrendingUp, 
  Calendar, 
  Trash2, 
  Flame, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight,
  Zap,
  Clock
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { getTodayIso } from '../../utils/calendarUtils.js';
import { 
  calculateMovingAverageWeight, 
  calculateWeightVelocity, 
  getAdaptiveSurplusRecommendation, 
  createWeightLogEntry 
} from '../../utils/nutritionEngine.js';

export const WeightTrackerModal = ({
  isOpen,
  onClose,
  weightHistory = [],
  currentCalorieTarget = 3250,
  onLogWeight,
  onDeleteWeightLog,
  onApplySurplus,
  soundEnabled = true
}) => {
  const [weightInput, setWeightInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [dateInput, setDateInput] = useState(getTodayIso());
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const movingAvg = calculateMovingAverageWeight(weightHistory, 7);
  const velocity = calculateWeightVelocity(weightHistory);
  const surplusRec = getAdaptiveSurplusRecommendation(weightHistory, currentCalorieTarget);

  const sortedHistory = [...weightHistory]
    .filter(w => w && typeof w.weightLbs === 'number')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const latestWeighIn = sortedHistory[0] || null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    try {
      const entry = createWeightLogEntry(weightInput, dateInput, notesInput);
      playSound('success', soundEnabled);
      onLogWeight(entry);
      setWeightInput('');
      setNotesInput('');
    } catch (err) {
      setError(err.message || "Invalid weight input.");
    }
  };

  const handleApplySurplusClick = () => {
    playSound('success', soundEnabled);
    if (onApplySurplus && surplusRec.newCalorieTarget) {
      onApplySurplus(surplusRec.newCalorieTarget);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/60 backdrop-blur-xl"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04]"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <Scale className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Morning Weight & Bulking Velocity</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Daily Progress
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Track fasted morning scale weight & auto-adjust caloric surplus</p>
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

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Latest Weight</span>
              <div className="text-lg font-bold font-mono text-white mt-0.5">
                {latestWeighIn ? `${latestWeighIn.weightLbs} lbs` : '—'}
              </div>
              <span className="text-[9px] text-slate-500 font-mono">
                {latestWeighIn ? latestWeighIn.date : 'No logs yet'}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
              <span className="text-[10px] font-mono uppercase text-indigo-300 block">7-Day Smoothed Avg</span>
              <div className="text-lg font-bold font-mono text-indigo-300 mt-0.5">
                {movingAvg ? `${movingAvg} lbs` : '—'}
              </div>
              <span className="text-[9px] text-slate-500 font-mono">Filters water weight</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
              <span className="text-[10px] font-mono uppercase text-sky-300 block">Bulking Velocity</span>
              <div className="text-lg font-bold font-mono text-sky-300 mt-0.5">
                {velocity.velocityLbsPerWeek > 0 ? `+${velocity.velocityLbsPerWeek}` : velocity.velocityLbsPerWeek} <span className="text-[10px] font-normal">lb/wk</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono truncate block">
                Target: +0.5 to 1.0 lb
              </span>
            </div>
          </div>

          {/* ADAPTIVE SURPLUS ADVISOR ALERT (When Weight Stalls) */}
          {surplusRec.needsSurplus && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-amber-200">
                  <Zap className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
                  <span>{surplusRec.title}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                  +{surplusRec.suggestedAddition} kcal Suggested
                </span>
              </div>

              <p className="text-[11px] leading-relaxed text-amber-200/90">
                {surplusRec.description}
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleApplySurplusClick}
                  className="flex-1 py-1.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5" />
                  <span>Bump Target to {surplusRec.newCalorieTarget} kcal/day</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* Log New Morning Weigh-In Form */}
          <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-[#131728] border border-white/10 space-y-3">
            <span className="text-xs font-bold text-white block">Log Morning Weigh-In</span>
            
            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400">Weight (lbs)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="e.g. 185.4"
                    className="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-sm font-mono font-bold text-white placeholder:text-slate-600 outline-none focus:border-white/30"
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs text-slate-500 font-mono">lbs</span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400">Date</label>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-white outline-none focus:border-white/30"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono uppercase text-slate-400">Notes (Optional)</label>
              <input
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="e.g. Fasted post-bathroom, leg day soreness"
                className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder:text-slate-600 outline-none"
              />
            </div>

            {error && (
              <div className="text-[11px] text-rose-300 bg-rose-500/10 p-2 rounded-lg border border-rose-500/20 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-white font-semibold text-xs shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-1.5"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Morning Weigh-In</span>
            </button>
          </form>

          {/* Historical Weigh-Ins Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Recent Weigh-Ins ({sortedHistory.length})</span>
              <span className="text-[10px] font-mono text-slate-500">Morning Fasted</span>
            </div>

            {sortedHistory.length > 0 ? (
              <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
                {sortedHistory.map((item, idx) => {
                  const prev = sortedHistory[idx + 1];
                  const diff = prev ? Number((item.weightLbs - prev.weightLbs).toFixed(1)) : null;
                  return (
                    <div
                      key={item.id || item.date}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs hover:bg-white/[0.04] transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <div>
                          <div className="font-mono text-white font-bold">{item.date}</div>
                          {item.notes && <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{item.notes}</div>}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {diff !== null && (
                          <span className={`text-[10px] font-mono font-semibold ${
                            diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-amber-400' : 'text-slate-500'
                          }`}>
                            {diff > 0 ? `+${diff}` : diff} lb
                          </span>
                        )}
                        <span className="font-mono text-sm font-bold text-white bg-black/40 px-2 py-0.5 rounded-lg border border-white/10">
                          {item.weightLbs} lbs
                        </span>

                        {onDeleteWeightLog && (
                          <button
                            type="button"
                            onClick={() => {
                              playSound('click', soundEnabled);
                              onDeleteWeightLog(item.id || item.date);
                            }}
                            className="p-1 text-slate-500 hover:text-rose-400 cursor-pointer transition-colors"
                            title="Delete log"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-slate-500 bg-white/[0.02] rounded-xl border border-white/5">
                No morning weigh-ins recorded yet. Record your first weigh-in above!
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
