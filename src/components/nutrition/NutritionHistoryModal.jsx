import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  History, 
  X, 
  CheckCheck, 
  Calendar, 
  ChevronRight, 
  Flame,
  ArrowRight
} from 'lucide-react';
import { playSound } from '../../utils/soundFX.js';
import { getDailyNutritionHistory } from '../../utils/nutritionEngine.js';

export const NutritionHistoryModal = ({
  isOpen,
  onClose,
  nutritionData,
  dailySummaries,
  selectedDate,
  onSelectDate,
  targetCalories = 3000,
  targetProtein = 180,
  soundEnabled = true
}) => {
  const [calorieHistoryRange, setCalorieHistoryRange] = useState(14); // 7 | 14 | 30

  const safeNutritionData = (nutritionData && typeof nutritionData === 'object') ? nutritionData : {};
  const rawMeals = Array.isArray(safeNutritionData.meals) ? safeNutritionData.meals : [];
  const activeDailySummaries = dailySummaries || safeNutritionData.dailySummaries || {};
  const dailyTargets = (safeNutritionData.dailyTargets && typeof safeNutritionData.dailyTargets === 'object')
    ? safeNutritionData.dailyTargets 
    : {};

  const nutritionHistory = useMemo(() => {
    return getDailyNutritionHistory(rawMeals, targetCalories, targetProtein, calorieHistoryRange, dailyTargets, activeDailySummaries);
  }, [rawMeals, targetCalories, targetProtein, calorieHistoryRange, dailyTargets, activeDailySummaries]);

  if (!isOpen || typeof document === 'undefined' || !document.body) return null;

  const loggedDays = (nutritionHistory || []).filter(h => h && (h.calories || 0) > 0);
  const hitDays = (nutritionHistory || []).filter(h => h && h.hitCalories);
  const avgCalories = loggedDays.length > 0 ? Math.round(loggedDays.reduce((acc, h) => acc + (h?.calories || 0), 0) / loggedDays.length) : 0;
  const avgProtein = loggedDays.length > 0 ? Math.round(loggedDays.reduce((acc, h) => acc + (h?.protein || 0), 0) / loggedDays.length) : 0;
  const hitRate = Math.round((hitDays.length / (calorieHistoryRange || 1)) * 100);

  const handleSelectDay = (dateIso) => {
    playSound('click', soundEnabled);
    if (typeof onSelectDate === 'function' && dateIso) {
      onSelectDate(dateIso);
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 top-0 left-0 w-full h-full flex items-center justify-center p-3 sm:p-4 z-[99999] pointer-events-auto">
      <AnimatePresence>
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
          className="relative w-full max-w-2xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04] shrink-0"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <History className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Calendar & Calorie History</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-xl bg-white/[0.06] text-slate-300 border border-white/10">
                    {calorieHistoryRange} Days
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Review daily caloric intake, protein adherence, and consistency</p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {/* Span Selector */}
              <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/10 text-xs">
                {[
                  { id: 7, label: '7 Days' },
                  { id: 14, label: '14 Days' },
                  { id: 30, label: '30 Days' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setCalorieHistoryRange(tab.id);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      calorieHistoryRange === tab.id 
                        ? 'bg-white/20 text-white shadow-sm font-bold' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Close Button */}
              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                }}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Period Aggregate Summary Bar */}
          <div className="grid grid-cols-3 gap-2 p-3 sm:p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 text-center font-mono">
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase text-slate-400 block tracking-wider">Avg Caloric Intake</span>
              <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                {avgCalories > 0 ? `${avgCalories.toLocaleString()} kcal` : '—'}
              </div>
              <span className="text-[9px] text-slate-500">Goal: {targetCalories.toLocaleString()} kcal</span>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase text-slate-300 block tracking-wider">Avg Daily Protein</span>
              <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                {avgProtein > 0 ? `${avgProtein}g` : '—'}
              </div>
              <span className="text-[9px] text-slate-500">Goal: {targetProtein}g</span>
            </div>
            <div>
              <span className="text-[9px] sm:text-[10px] uppercase text-emerald-400 block tracking-wider">Goal Hit Rate</span>
              <div className="text-sm sm:text-base font-bold text-emerald-400 mt-0.5">
                {hitDays.length}/{calorieHistoryRange} Days ({hitRate}%)
              </div>
              <span className="text-[9px] text-slate-500">{hitDays.length >= (calorieHistoryRange * 0.7) ? 'On Track' : 'Need Consistency'}</span>
            </div>
          </div>

          {/* Calorie Bar Chart */}
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Daily Calorie Bars vs Target ({targetCalories.toLocaleString()} kcal):</span>
              <span className="text-slate-500 text-[10px]">Click any bar or card to view that day</span>
            </div>

            <div className="flex items-end gap-1 sm:gap-1.5 h-28 pt-4 pb-1 overflow-x-auto scrollbar-none">
              {(nutritionHistory || []).map((h, hIdx) => {
                if (!h) return null;
                const isSelected = h.dateIso === selectedDate;
                const maxChartCal = Math.max(4000, targetCalories * 1.25);
                const hCalories = Number(h.calories) || 0;
                const heightPct = Math.min(100, Math.max(6, Math.round((hCalories / maxChartCal) * 100)));
                const hitGoal = !!h.hitCalories;
                const dayInitial = (h.dayName && typeof h.dayName === 'string') ? (h.dayName[0] || 'D') : 'D';
                const dateSlice = (h.dateIso && typeof h.dateIso === 'string') ? h.dateIso.slice(8) : '';

                return (
                  <button
                    key={h.dateIso || `hist-bar-${hIdx}`}
                    type="button"
                    onClick={() => handleSelectDay(h.dateIso)}
                    className={`flex-1 min-w-[18px] sm:min-w-[24px] h-full flex flex-col justify-end items-center group cursor-pointer transition-transform ${
                      isSelected ? 'scale-105' : 'hover:opacity-100 opacity-85'
                    }`}
                    title={`${h.dateTitle || h.dateIso}: ${hCalories.toLocaleString()} kcal (${h.protein || 0}g P) - Click to view`}
                  >
                    <div 
                      className={`w-full rounded-t-lg transition-all ${
                        isSelected 
                          ? 'ring-2 ring-white shadow-lg' 
                          : ''
                      } ${
                        hitGoal 
                          ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]' 
                          : hCalories > 0 
                            ? 'bg-amber-400/80' 
                            : 'bg-white/10'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className={`text-[8px] sm:text-[9px] font-mono mt-1 whitespace-nowrap ${
                      isSelected ? 'text-white font-bold' : 'text-slate-500 group-hover:text-slate-300'
                    }`}>
                      {dayInitial}{dateSlice}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cards Grid */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between px-0.5">
              <span>Day-by-Day Adherence:</span>
              <span className="text-[10px] text-slate-500">Select any day to open its logs</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-0.5">
              {(nutritionHistory || []).map((h, hIdx) => {
                if (!h) return null;
                const isSelected = h.dateIso === selectedDate;
                return (
                  <div
                    key={h.dateIso || `hist-card-${hIdx}`}
                    onClick={() => handleSelectDay(h.dateIso)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer group ${
                      isSelected
                        ? 'bg-white/[0.08] border-white/25 shadow-md scale-[1.01]'
                        : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                        {h.dateTitle || h.dateIso}
                      </span>
                      {h.hitCalories ? (
                        <span className="px-1.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-bold flex items-center gap-1">
                          <CheckCheck className="w-3 h-3" /> Hit Goal
                        </span>
                      ) : (h.calories || 0) > 0 ? (
                        <span className="px-1.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">
                          {h.pctCalories || 0}%
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500">No Logs</span>
                      )}
                    </div>

                    <div className="mt-2 space-y-1 font-mono">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-400">Calories:</span>
                        <span className={`font-bold ${h.hitCalories ? 'text-emerald-400' : 'text-white'}`}>
                          {(h.calories || 0).toLocaleString()} / {(h.targetCalories || targetCalories).toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-black/40 rounded-md overflow-hidden">
                        <div 
                          className={`h-full rounded-md transition-all ${h.hitCalories ? 'bg-emerald-400' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, Math.max(0, h.pctCalories || 0))}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
                        <span>Protein: <strong className="text-white">{h.protein || 0}g</strong> / {h.targetProtein || targetProtein}g</span>
                        <span>{h.mealCount || 0} meals</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>,
    document.body
  );
};
