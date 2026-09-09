import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Scale, 
  X, 
  TrendingUp, 
  Zap, 
  Plus, 
  Trash2, 
  Check, 
  Calendar, 
  Flame 
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { 
  createWeightLogEntry, 
  calculateMovingAverageWeight, 
  calculateWeightVelocity,
  getAdaptiveSurplusRecommendation, 
  calculateWeightTrend 
} from '../../utils/nutritionEngine.js';
import { getTodayIso } from '../../utils/calendarUtils.js';

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
  const [dateInput, setDateInput] = useState(getTodayIso());
  const [notesInput, setNotesInput] = useState('');
  const [error, setError] = useState(null);
  const [weightSpan, setWeightSpan] = useState(14); // 7 | 14 | 30 | 'all'

  if (!isOpen) return null;

  const sortedHistory = [...weightHistory]
    .filter(w => w && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const trend = calculateWeightTrend(weightHistory, weightSpan);
  const movingAvg = calculateMovingAverageWeight(weightHistory, weightSpan === 'all' ? 30 : Number(weightSpan));
  const velocity = calculateWeightVelocity(weightHistory);
  const surplusRec = getAdaptiveSurplusRecommendation(weightHistory, currentCalorieTarget);
  const latestWeighIn = sortedHistory[0];

  // SVG Chart points calculation
  const chartPoints = (trend?.points || []).slice(-15);
  const minWeight = chartPoints.length > 0 ? Math.min(...chartPoints.map(p => p.weightLbs)) - 0.5 : 180;
  const maxWeight = chartPoints.length > 0 ? Math.max(...chartPoints.map(p => p.weightLbs)) + 0.5 : 190;
  const weightRange = Math.max(1, maxWeight - minWeight);

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
      setError(err.message || "Invalid weight entry");
      playSound('click', soundEnabled);
    }
  };

  const handleApplySurplusClick = () => {
    if (surplusRec.needsSurplus && onApplySurplus) {
      playSound('success', soundEnabled);
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

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-lg bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
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
                  <span>Morning Weight Tracker & Weekly Velocity</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Daily Progress
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Track fasted morning scale weight & adjust daily caloric intake</p>
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

          {/* Time Span Selector Filter */}
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider font-mono">
              Tracker Span:
            </span>
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/10 text-xs">
              {[
                { id: 7, label: '7 Days' },
                { id: 14, label: '14 Days' },
                { id: 30, label: '30 Days' },
                { id: 'all', label: 'All Time' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setWeightSpan(tab.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    weightSpan === tab.id 
                      ? 'bg-white/20 text-white shadow-sm font-bold' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-Week SVG Weight Trend Graph */}
          {chartPoints.length >= 2 && (
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">
                  {weightSpan === 'all' ? 'All-Time' : `${weightSpan}-Day`} Scale Trajectory:
                </span>
                <span className={`font-bold ${trend.changeLbs >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {trend.changeLbs > 0 ? `+${trend.changeLbs}` : trend.changeLbs} lbs ({trend.startWeight} → {trend.endWeight})
                </span>
              </div>

              {/* Sparkline / SVG Graph */}
              <div className="relative h-24 w-full pt-2">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Area fill */}
                  {chartPoints.length > 1 && (
                    <polygon
                      points={`
                        0,80 
                        ${chartPoints.map((p, idx) => {
                          const x = (idx / (chartPoints.length - 1)) * 300;
                          const y = 80 - ((p.weightLbs - minWeight) / weightRange) * 70;
                          return `${x},${y}`;
                        }).join(' ')} 
                        300,80
                      `}
                      fill="url(#weightGrad)"
                    />
                  )}

                  {/* Connecting Line */}
                  {chartPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={chartPoints.map((p, idx) => {
                        const x = (idx / (chartPoints.length - 1)) * 300;
                        const y = 80 - ((p.weightLbs - minWeight) / weightRange) * 70;
                        return `${x},${y}`;
                      }).join(' ')}
                    />
                  )}

                  {/* Data Points */}
                  {chartPoints.map((p, idx) => {
                    const x = (idx / (chartPoints.length - 1)) * 300;
                    const y = 80 - ((p.weightLbs - minWeight) / weightRange) * 70;
                    return (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="3.5"
                        fill="#fff"
                        stroke="var(--accent-primary)"
                        strokeWidth="2"
                      />
                    );
                  })}
                </svg>
              </div>

              <div className="flex justify-between text-[9px] font-mono text-slate-500 pt-0.5">
                <span>{chartPoints[0]?.date}</span>
                <span>{chartPoints[chartPoints.length - 1]?.date}</span>
              </div>
            </div>
          )}

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
              <span className="text-[10px] font-mono uppercase text-indigo-300 block">
                {weightSpan === 'all' ? '30d' : `${weightSpan}d`} Smoothed Avg
              </span>
              <div className="text-lg font-bold font-mono text-indigo-300 mt-0.5">
                {movingAvg ? `${movingAvg} lbs` : '—'}
              </div>
              <span className="text-[9px] text-slate-500 font-mono">Filtered trend</span>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-center">
              <span className="text-[10px] font-mono uppercase text-sky-300 block">Weekly Velocity</span>
              <div className="text-lg font-bold font-mono text-sky-300 mt-0.5">
                {velocity.velocityLbsPerWeek > 0 ? `+${velocity.velocityLbsPerWeek}` : velocity.velocityLbsPerWeek} <span className="text-[10px] font-normal">lb/wk</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono truncate block">
                Target: +0.5 to 1.0 lb
              </span>
            </div>
          </div>


          {/* On-the-fly Daily Calorie Target Adjuster */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Daily Target: <span className="font-mono text-emerald-400 font-bold">{currentCalorieTarget} kcal</span></span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">Scale not moving? Adjust target:</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onApplySurplus(Math.max(1500, currentCalorieTarget - 250))}
                className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              >
                -250 kcal
              </button>
              <button
                type="button"
                onClick={() => onApplySurplus(Math.max(1500, currentCalorieTarget - 100))}
                className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              >
                -100 kcal
              </button>
              <button
                type="button"
                onClick={() => onApplySurplus(currentCalorieTarget + 100)}
                className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              >
                +100 kcal
              </button>
              <button
                type="button"
                onClick={() => onApplySurplus(currentCalorieTarget + 250)}
                className="px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-mono border border-emerald-500/30 transition-all active:scale-95 cursor-pointer font-bold"
              >
                +250 kcal
              </button>
              <button
                type="button"
                onClick={() => onApplySurplus(currentCalorieTarget + 500)}
                className="px-2.5 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-mono border border-emerald-500/30 transition-all active:scale-95 cursor-pointer font-bold"
              >
                +500 kcal
              </button>
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
              <label className="text-[10px] font-mono uppercase text-slate-400">Notes / Condition (Optional)</label>
              <input
                type="text"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                placeholder="e.g. Fasted, 8 hrs sleep, post-leg day"
                className="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-600 outline-none focus:border-white/30"
              />
            </div>

            {error && (
              <div className="text-xs text-rose-400 font-mono">{error}</div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-white font-semibold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Plus className="w-4 h-4" />
              <span>Save Morning Weigh-In</span>
            </button>
          </form>

          {/* Historical Weigh-In List */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-300 block">Weigh-In History</span>
            
            <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
              {sortedHistory.length > 0 ? (
                sortedHistory.map((log) => (
                  <div
                    key={log.id || log.date}
                    className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 flex items-center justify-between transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center font-mono text-xs font-bold text-slate-300">
                        ⚖️
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-sm font-bold font-mono text-white">{log.weightLbs} lbs</span>
                          <span className="text-[10px] text-slate-400 font-mono">{log.date}</span>
                        </div>
                        {log.notes && (
                          <div className="text-[10px] text-slate-500 truncate max-w-xs">{log.notes}</div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        playSound('click', soundEnabled);
                        onDeleteWeightLog(log.id || log.date);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-xs text-slate-500 text-center py-4">
                  No weigh-in entries logged yet. Record your morning weight to track trend velocity.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
