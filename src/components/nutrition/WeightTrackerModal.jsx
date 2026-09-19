import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Scale, 
  X, 
  TrendingUp, 
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
  calculateWeightVelocity 
} from '../../utils/nutritionEngine.js';
import { getTodayIso, formatShortDate, addDays } from '../../utils/calendarUtils.js';

export const WeightTrackerModal = ({
  isOpen,
  onClose,
  weightHistory = [],
  currentCalorieTarget = 3000,
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

  // Parse YYYY-MM-DD to local timestamp to avoid UTC midnight date shifts
  const parseDateIso = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return 0;
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length < 3) return 0;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return 0;
    return new Date(y, m, d).getTime();
  };

  const sortedHistory = (Array.isArray(weightHistory) ? weightHistory : [])
    .filter(w => w && w.date && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs))
    .sort((a, b) => {
      const tb = parseDateIso(b.date);
      const ta = parseDateIso(a.date);
      if (tb !== ta) return tb - ta;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

  // Unique daily logs (latest log of each day) sorted ascending (oldest to newest)
  const dailyMap = new Map();
  [...sortedHistory].reverse().forEach(log => {
    dailyMap.set(log.date, log);
  });
  const uniqueDailyLogs = Array.from(dailyMap.values()).sort(
    (a, b) => parseDateIso(a.date) - parseDateIso(b.date)
  );

  const movingAvg = calculateMovingAverageWeight(weightHistory, weightSpan === 'all' ? 30 : Number(weightSpan));
  const velocity = calculateWeightVelocity(weightHistory);
  const latestWeighIn = sortedHistory[0];

  // Determine timeline boundary for the chart (X-axis domain)
  const todayIso = getTodayIso();
  const latestLogIso = latestWeighIn?.date || todayIso;
  const latestLogTime = parseDateIso(latestLogIso);
  const todayTime = parseDateIso(todayIso);

  // If latest log is recent or in the future, anchor timeline to today/latestLog
  // If user is viewing older historical data, anchor to latestLog so data remains visible
  let endIso = todayIso;
  if (latestLogTime > todayTime) {
    endIso = latestLogIso;
  } else if (weightSpan !== 'all') {
    const daysSinceLatest = Math.max(0, Math.round((todayTime - latestLogTime) / 86400000));
    if (daysSinceLatest > Number(weightSpan)) {
      endIso = latestLogIso;
    } else {
      endIso = todayIso;
    }
  } else {
    endIso = todayIso >= latestLogIso ? todayIso : latestLogIso;
  }

  let startIso;
  if (weightSpan === 7) {
    startIso = addDays(endIso, -6);
  } else if (weightSpan === 14) {
    startIso = addDays(endIso, -13);
  } else if (weightSpan === 30) {
    startIso = addDays(endIso, -29);
  } else {
    // 'all'
    const earliestIso = uniqueDailyLogs[0]?.date || addDays(endIso, -6);
    startIso = earliestIso === endIso ? addDays(endIso, -6) : earliestIso;
  }

  let startTime = parseDateIso(startIso);
  let endTime = parseDateIso(endIso);
  let totalDuration = Math.max(86400000, endTime - startTime);

  // Active points in the timeline
  let activePoints = uniqueDailyLogs.filter(p => {
    const t = parseDateIso(p.date);
    return t >= startTime && t <= endTime;
  });

  // Fallback if current span window has no points but user has logs in history
  if (activePoints.length === 0 && uniqueDailyLogs.length > 0) {
    const sliceCount = weightSpan === 'all' ? uniqueDailyLogs.length : Number(weightSpan);
    activePoints = uniqueDailyLogs.slice(-sliceCount);
    endIso = activePoints[activePoints.length - 1].date;
    startIso = weightSpan === 'all'
      ? activePoints[0].date
      : addDays(endIso, -(Number(weightSpan) - 1));
    if (startIso === endIso) {
      startIso = addDays(endIso, -6);
    }
    startTime = parseDateIso(startIso);
    endTime = parseDateIso(endIso);
    totalDuration = Math.max(86400000, endTime - startTime);
  }

  // SVG dimensions and plot area
  const svgWidth = 320;
  const svgHeight = 94;
  const paddingLeft = 24;
  const paddingRight = 24;
  const paddingTop = 12;
  const paddingBottom = 22;
  const plotWidth = svgWidth - paddingLeft - paddingRight; // 272
  const plotHeight = svgHeight - paddingTop - paddingBottom; // 60

  // Y-axis range
  const pointWeights = activePoints.map(p => p.weightLbs);
  const minW = pointWeights.length > 0 ? Math.min(...pointWeights) : 180;
  const maxW = pointWeights.length > 0 ? Math.max(...pointWeights) : 190;
  const wDiff = maxW - minW;
  const yBuffer = Math.max(0.6, wDiff * 0.18);
  const chartMinY = minW - yBuffer;
  const chartMaxY = maxW + yBuffer;
  const yRange = Math.max(1, chartMaxY - chartMinY);

  // Consistent X-axis Ladder Rungs (evenly spaced ticks and grid lines)
  const numRungs = weightSpan === 7 ? 4 : 5;
  const ladderRungs = [];
  for (let i = 0; i < numRungs; i++) {
    const fraction = i / (numRungs - 1);
    const rungTime = startTime + fraction * totalDuration;
    const x = Number((paddingLeft + fraction * plotWidth).toFixed(1));
    const d = new Date(rungTime);
    const rungIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    ladderRungs.push({
      x,
      time: rungTime,
      label: formatShortDate(rungIso),
      fraction
    });
  }

  // Map each data point distance-wise strictly proportional to its logged date
  const plottedPoints = activePoints.map((p, idx) => {
    const pTime = parseDateIso(p.date);
    const progress = totalDuration > 0
      ? Math.max(0, Math.min(1, (pTime - startTime) / totalDuration))
      : 0.5;
    const x = Number((paddingLeft + progress * plotWidth).toFixed(1));
    const y = Number((paddingTop + (1 - (p.weightLbs - chartMinY) / yRange) * plotHeight).toFixed(1));
    return {
      ...p,
      x,
      y,
      progress
    };
  });

  const startPt = plottedPoints[0];
  const endPt = plottedPoints[plottedPoints.length - 1];
  const trajectoryChange = (startPt && endPt)
    ? Number((endPt.weightLbs - startPt.weightLbs).toFixed(1))
    : 0;

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
                <h3 className="text-base font-bold text-white tracking-tight">
                  Morning Weight Tracker & Weekly Velocity
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

          {/* Multi-Week SVG Weight Trend Graph with Consistent Date Ladder */}
          {uniqueDailyLogs.length > 0 ? (
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-400">
                  {weightSpan === 'all' ? 'All-Time' : `${weightSpan}-Day`} Scale Trajectory:
                </span>
                <span className={`font-bold ${trajectoryChange >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {plottedPoints.length >= 2 
                    ? `${trajectoryChange > 0 ? `+${trajectoryChange}` : trajectoryChange} lbs (${startPt.weightLbs} → ${endPt.weightLbs})`
                    : `${startPt?.weightLbs || 0} lbs (${startPt ? formatShortDate(startPt.date) : ''})`
                  }
                </span>
              </div>

              {/* Sparkline / SVG Graph */}
              <div className="relative h-28 w-full pt-1">
                <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Guide Lines */}
                  <line
                    x1={paddingLeft}
                    y1={paddingTop}
                    x2={paddingLeft + plotWidth}
                    y2={paddingTop}
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <line
                    x1={paddingLeft}
                    y1={paddingTop + plotHeight / 2}
                    x2={paddingLeft + plotWidth}
                    y2={paddingTop + plotHeight / 2}
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <line
                    x1={paddingLeft}
                    y1={paddingTop + plotHeight}
                    x2={paddingLeft + plotWidth}
                    y2={paddingTop + plotHeight}
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1"
                  />

                  {/* Consistent X-Axis Ladder (Vertical Grid & Date Labels) */}
                  {ladderRungs.map((rung, i) => (
                    <g key={`ladder-rung-${i}`}>
                      <line
                        x1={rung.x}
                        y1={paddingTop}
                        x2={rung.x}
                        y2={paddingTop + plotHeight}
                        stroke="rgba(255, 255, 255, 0.07)"
                        strokeDasharray="2 3"
                        strokeWidth="1"
                      />
                      <line
                        x1={rung.x}
                        y1={paddingTop + plotHeight}
                        x2={rung.x}
                        y2={paddingTop + plotHeight + 3}
                        stroke="rgba(255, 255, 255, 0.3)"
                        strokeWidth="1"
                      />
                      <text
                        x={rung.x}
                        y={paddingTop + plotHeight + 14}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize="8"
                        fontFamily="monospace"
                        fontWeight="500"
                      >
                        {rung.label}
                      </text>
                    </g>
                  ))}

                  {/* Y-Axis Weight Bounds */}
                  <text
                    x={paddingLeft - 4}
                    y={paddingTop + 3}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="7"
                    fontFamily="monospace"
                  >
                    {chartMaxY.toFixed(1)}
                  </text>
                  <text
                    x={paddingLeft - 4}
                    y={paddingTop + plotHeight + 1}
                    textAnchor="end"
                    fill="#64748b"
                    fontSize="7"
                    fontFamily="monospace"
                  >
                    {chartMinY.toFixed(1)}
                  </text>

                  {/* Shaded Area Fill */}
                  {plottedPoints.length > 1 && (
                    <polygon
                      points={`
                        ${plottedPoints[0].x},${paddingTop + plotHeight} 
                        ${plottedPoints.map(p => `${p.x},${p.y}`).join(' ')} 
                        ${plottedPoints[plottedPoints.length - 1].x},${paddingTop + plotHeight}
                      `}
                      fill="url(#weightGrad)"
                    />
                  )}

                  {/* Connecting Line */}
                  {plottedPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="var(--accent-primary)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={plottedPoints.map(p => `${p.x},${p.y}`).join(' ')}
                    />
                  )}

                  {/* Single Point Horizontal Guide */}
                  {plottedPoints.length === 1 && (
                    <line
                      x1={paddingLeft}
                      y1={plottedPoints[0].y}
                      x2={paddingLeft + plotWidth}
                      y2={plottedPoints[0].y}
                      stroke="var(--accent-primary)"
                      strokeOpacity="0.4"
                      strokeDasharray="4 4"
                      strokeWidth="1.5"
                    />
                  )}

                  {/* Data Points (Positioned distance-wise by actual logged date) */}
                  {plottedPoints.map((p, idx) => (
                    <g key={p.id || idx} className="cursor-pointer">
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="4"
                        fill="#0b0e18"
                        stroke="var(--accent-primary)"
                        strokeWidth="2.5"
                      />
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="1.8"
                        fill="#fff"
                      />
                      <title>{`${p.date}: ${p.weightLbs} lbs${p.notes ? ` (${p.notes})` : ''}`}</title>
                    </g>
                  ))}
                </svg>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-center space-y-1">
              <span className="text-xs font-semibold text-slate-300">No Weight Logs Recorded</span>
              <p className="text-[11px] text-slate-500 font-mono">
                Log your morning weight below to view your velocity trend line and date ladder.
              </p>
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

          {/* Log New Morning Weigh-In Form */}
          <form onSubmit={handleSubmit} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
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
