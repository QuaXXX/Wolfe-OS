import React, { useState, useMemo } from 'react';
import { 
  UtensilsCrossed, 
  Droplet, 
  Plus, 
  Camera, 
  Clock, 
  Scale, 
  TrendingUp, 
  Flame, 
  Zap, 
  Check, 
  Trash2, 
  ChevronRight, 
  Sparkles,
  AlertCircle,
  BookmarkPlus
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';
import { 
  MEAL_SLOTS, 
  aggregateDailyNutrition, 
  calculateMovingAverageWeight, 
  calculateWeightVelocity, 
  getAdaptiveSurplusRecommendation,
  createMealEntry 
} from '../../utils/nutritionEngine.js';
import { MealLogModal } from '../nutrition/MealLogModal';
import { WeightTrackerModal } from '../nutrition/WeightTrackerModal';
import { SnapMealModal } from '../nutrition/SnapMealModal';

export const NutritionView = ({ 
  nutritionData, 
  setNutritionData, 
  onOpenComingSoon, 
  soundEnabled = true 
}) => {
  // Modals state
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isSnapModalOpen, setIsSnapModalOpen] = useState(false);
  const [activeQuickSlot, setActiveQuickSlot] = useState('lunch');

  // Destructure state from nutritionData with safe fallbacks
  const targetCalories = nutritionData.targetCalories || 3250;
  const targetProtein = nutritionData.protein?.target || 180;
  const targetCarbs = nutritionData.carbs?.target || 450;
  const targetFats = nutritionData.fats?.target || 80;
  const targetWaterMl = nutritionData.targetWaterMl || 3500;
  const waterMl = nutritionData.waterMl || 0;
  const meals = nutritionData.meals || [];
  const weightHistory = nutritionData.weightHistory || [];
  const householdPantry = nutritionData.householdPantry || [];

  // Aggregate current daily totals from meals
  const dailyTotals = useMemo(() => {
    return aggregateDailyNutrition(meals);
  }, [meals]);

  const remainingCals = targetCalories - dailyTotals.calories;
  const calPercent = Math.min(100, Math.round((dailyTotals.calories / targetCalories) * 100));

  // Weight statistics
  const movingAvgWeight = useMemo(() => {
    return calculateMovingAverageWeight(weightHistory, 7);
  }, [weightHistory]);

  const weightVelocity = useMemo(() => {
    return calculateWeightVelocity(weightHistory);
  }, [weightHistory]);

  const surplusRecommendation = useMemo(() => {
    return getAdaptiveSurplusRecommendation(weightHistory, targetCalories);
  }, [weightHistory, targetCalories]);

  const latestWeightLog = useMemo(() => {
    if (!weightHistory.length) return null;
    return [...weightHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [weightHistory]);

  // Handlers for logging
  const handleLogMeal = (mealEntry) => {
    playSound('success', soundEnabled);
    setNutritionData(prev => {
      const nextMeals = [mealEntry, ...(prev.meals || [])];
      const newTotals = aggregateDailyNutrition(nextMeals);
      return {
        ...prev,
        consumedCalories: newTotals.calories,
        protein: { ...prev.protein, current: newTotals.protein },
        carbs: { ...prev.carbs, current: newTotals.carbs },
        fats: { ...prev.fats, current: newTotals.fats },
        meals: nextMeals
      };
    });
  };

  const handleDeleteMeal = (mealId) => {
    playSound('click', soundEnabled);
    setNutritionData(prev => {
      const nextMeals = (prev.meals || []).filter(m => m.id !== mealId);
      const newTotals = aggregateDailyNutrition(nextMeals);
      return {
        ...prev,
        consumedCalories: newTotals.calories,
        protein: { ...prev.protein, current: newTotals.protein },
        carbs: { ...prev.carbs, current: newTotals.carbs },
        fats: { ...prev.fats, current: newTotals.fats },
        meals: nextMeals
      };
    });
  };

  const handleQuickLogStaple = (staple) => {
    playSound('success', soundEnabled);
    const meal = createMealEntry({
      name: staple.name,
      slot: activeQuickSlot,
      calories: staple.calories,
      protein: staple.protein,
      carbs: staple.carbs,
      fats: staple.fats,
      items: [staple.portion || staple.name]
    });
    handleLogMeal(meal);
  };

  const handleLogWeight = (weightEntry) => {
    setNutritionData(prev => {
      const existing = (prev.weightHistory || []).filter(w => w.date !== weightEntry.date);
      return {
        ...prev,
        weightHistory: [weightEntry, ...existing]
      };
    });
  };

  const handleDeleteWeightLog = (idOrDate) => {
    setNutritionData(prev => ({
      ...prev,
      weightHistory: (prev.weightHistory || []).filter(w => w.id !== idOrDate && w.date !== idOrDate)
    }));
  };

  const handleApplySurplus = (newTarget) => {
    playSound('success', soundEnabled);
    setNutritionData(prev => ({
      ...prev,
      targetCalories: newTarget
    }));
  };

  const handleAddHouseholdStaple = (staple) => {
    setNutritionData(prev => ({
      ...prev,
      householdPantry: [staple, ...(prev.householdPantry || [])]
    }));
  };

  const handleDeleteHouseholdStaple = (stapleId) => {
    setNutritionData(prev => ({
      ...prev,
      householdPantry: (prev.householdPantry || []).filter(s => s.id !== stapleId)
    }));
  };

  const addWater = (deltaMl = 250) => {
    playSound('click', soundEnabled);
    const nextMl = Math.max(0, Math.min(6000, waterMl + deltaMl));
    const glasses = Math.round(nextMl / 250);
    setNutritionData(prev => ({
      ...prev,
      waterMl: nextMl,
      waterGlasses: glasses
    }));
    if (nextMl >= targetWaterMl && waterMl < targetWaterMl) {
      playSound('success', soundEnabled);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 select-none">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <UtensilsCrossed className="w-4 h-4" />
            <span>Bulking & Muscle Hypertrophy Protocol</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              High Carb • 180g Protein
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5 flex items-center gap-2">
            <span>Nutrition & Macro Tracker</span>
            <span className="text-xs font-mono font-normal text-slate-400">
              ({targetCalories} kcal Target)
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Snap Meal Camera */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsSnapModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-purple-400" />
            <span>Snap Meal</span>
          </button>

          {/* Morning Weight Tracker */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWeightModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5 text-sky-400" />
            <span>Morning Weight</span>
          </button>

          {/* Log Food Modal */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsMealModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Food</span>
          </button>
        </div>
      </div>

      {/* 2. ADAPTIVE SURPLUS BANNER (Appears if weight stalls) */}
      {surplusRecommendation.needsSurplus && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-200 flex items-center gap-2">
                <span>Scale Stalled — Adaptive Surplus Recommendation</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                  +{surplusRecommendation.suggestedAddition} kcal
                </span>
              </div>
              <p className="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">
                {surplusRecommendation.description}
              </p>
            </div>
          </div>

          <button
            onClick={() => handleApplySurplus(surplusRecommendation.newCalorieTarget)}
            className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Bump Target to {surplusRecommendation.newCalorieTarget} kcal</span>
          </button>
        </div>
      )}

      {/* 3. Overview Grid: Calorie Ring + Macros + Morning Weight + Water */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Calorie & Macro Card */}
        <GlassCard hoverEffect={false} className="p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <span className="text-[10px] font-mono font-semibold uppercase text-slate-400">Bulking Target</span>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span>{targetCalories} kcal</span>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                  Daily Goal
                </span>
              </h3>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase font-mono">
                {remainingCals >= 0 ? "Remaining to Eat" : "Surplus Achieved"}
              </span>
              <div className={`text-base font-mono font-bold ${remainingCals < 0 ? 'text-emerald-400' : 'text-white'}`}>
                {Math.abs(remainingCals)} kcal {remainingCals < 0 ? 'over' : ''}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 items-center">
            {/* Concentric Calorie Progress Gauge */}
            <div className="relative flex flex-col items-center justify-center p-2">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="7" />
                  <circle 
                    cx="50" 
                    cy="50" 
                    r="40" 
                    fill="transparent" 
                    stroke="var(--accent-primary)" 
                    strokeWidth="7"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 * (1 - Math.min(1, calPercent / 100))}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute flex flex-col items-center text-center">
                  <span className="text-xl font-bold font-mono text-white">{dailyTotals.calories}</span>
                  <span className="text-[9px] text-slate-400 uppercase font-mono">of {targetCalories} kcal</span>
                </div>
              </div>
            </div>

            {/* Macro Bars */}
            <div className="sm:col-span-3 space-y-3">
              {/* Protein: 180g Target */}
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-indigo-200 font-bold flex items-center gap-1.5">
                    <span>🥩 Protein</span>
                    <span className="text-[10px] text-indigo-400/80 font-mono font-normal">(4 kcal/g)</span>
                  </span>
                  <span className="font-mono text-white font-bold">
                    {dailyTotals.protein}g <span className="text-slate-400 font-normal">/ {targetProtein}g</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (dailyTotals.protein / targetProtein) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Carbs: 450g Target */}
              <div className="p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-sky-200 font-bold flex items-center gap-1.5">
                    <span>🍚 Carbohydrates</span>
                    <span className="text-[10px] text-sky-400/80 font-mono font-normal">(4 kcal/g)</span>
                  </span>
                  <span className="font-mono text-white font-bold">
                    {dailyTotals.carbs}g <span className="text-slate-400 font-normal">/ {targetCarbs}g</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-sky-400 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (dailyTotals.carbs / targetCarbs) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Fats: 80g Target */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-amber-200 font-bold flex items-center gap-1.5">
                    <span>🥑 Healthy Fats</span>
                    <span className="text-[10px] text-amber-400/80 font-mono font-normal">(9 kcal/g)</span>
                  </span>
                  <span className="font-mono text-white font-bold">
                    {dailyTotals.fats}g <span className="text-slate-400 font-normal">/ {targetFats}g</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-400 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (dailyTotals.fats / targetFats) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Side Stack: Morning Weight Status + Water */}
        <div className="space-y-4">
          {/* Morning Weight Card */}
          <GlassCard 
            hoverEffect={true} 
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWeightModalOpen(true);
            }}
            className="p-4 cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Scale className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 block">Morning Fasted Weight</span>
                  <span className="text-xs font-bold text-white">Daily Progress</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-2xl font-bold font-mono text-white">
                  {latestWeightLog ? `${latestWeightLog.weightLbs}` : '—'}
                </span>
                <span className="text-xs text-slate-400 font-mono ml-1">lbs</span>
              </div>
              <div className="text-right font-mono text-[11px]">
                <div className="text-slate-400">7-Day Avg: <span className="text-white font-bold">{movingAvgWeight ? `${movingAvgWeight} lbs` : '—'}</span></div>
                <div className="text-emerald-400 font-semibold">{weightVelocity.velocityLbsPerWeek > 0 ? `+${weightVelocity.velocityLbsPerWeek} lb/wk` : ''}</div>
              </div>
            </div>
          </GlassCard>

          {/* Hydration Tracker */}
          <GlassCard hoverEffect={false} className="p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                <Droplet className="w-3.5 h-3.5 text-sky-400" />
                <span>Hydration</span>
              </div>
              <span className="text-xs font-mono text-white font-bold">
                {waterMl} / {targetWaterMl} ml
              </span>
            </div>

            {/* Quick Add Water Buttons */}
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button
                onClick={() => addWater(250)}
                className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-slate-200 active:scale-95 transition-all cursor-pointer text-center"
              >
                +250ml (Cup)
              </button>
              <button
                onClick={() => addWater(500)}
                className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-slate-200 active:scale-95 transition-all cursor-pointer text-center"
              >
                +500ml (Bottle)
              </button>
              <button
                onClick={() => addWater(750)}
                className="py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-[11px] font-mono text-sky-300 active:scale-95 transition-all cursor-pointer text-center"
              >
                +750ml (Shaker)
              </button>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* 4. HOUSEHOLD PANTRY STAPLES (1-Tap Logging directly on the page) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🏠</span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200">
              Kitchen Staples & Pantry (1-Tap Quick Log)
            </h2>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 hidden sm:inline">Logging into:</span>
            <select
              value={activeQuickSlot}
              onChange={(e) => setActiveQuickSlot(e.target.value)}
              className="bg-black/60 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono text-white outline-none cursor-pointer"
            >
              {MEAL_SLOTS.map(s => (
                <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Horizontal Staples Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {householdPantry.slice(0, 10).map((staple) => (
            <button
              key={staple.id}
              type="button"
              onClick={() => handleQuickLogStaple(staple)}
              className="p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 transition-all text-left group cursor-pointer active:scale-95 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">{staple.icon || '🍴'}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/40 text-slate-400 group-hover:text-white border border-white/5">
                  + Log
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-white truncate">{staple.name}</div>
                <div className="text-[10px] text-slate-400 truncate">{staple.portion}</div>
              </div>
              <div className="text-[10px] font-mono text-emerald-400 font-semibold pt-1 border-t border-white/5">
                {staple.calories} kcal • {staple.protein}g P
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Today's Logged Meals */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <span>Today's Logged Meals ({meals.length})</span>
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Total: <strong className="text-white">{dailyTotals.calories} kcal</strong> ({dailyTotals.protein}g Protein)
          </span>
        </div>

        {meals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {meals.map((meal) => {
              const slotInfo = MEAL_SLOTS.find(s => s.id === meal.slot) || { name: meal.slot, icon: "🍴" };
              return (
                <GlassCard key={meal.id} hoverEffect={false} className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                      <span>{slotInfo.icon}</span>
                      <span className="font-semibold text-slate-200">{slotInfo.name}</span>
                      <span>• {meal.time}</span>
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white bg-white/5 px-2 py-0.5 rounded border border-white/10">
                        {meal.calories} kcal
                      </span>
                      <button
                        onClick={() => handleDeleteMeal(meal.id)}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        title="Delete meal"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-white">{meal.name}</h3>
                    {meal.items && meal.items.length > 0 && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {meal.items.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs font-mono text-slate-300">
                    <span className="text-indigo-300 font-semibold">{meal.protein}g P</span>
                    <span className="text-sky-300 font-semibold">{meal.carbs}g C</span>
                    <span className="text-amber-300 font-semibold">{meal.fats}g F</span>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        ) : (
          <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="text-xs font-bold text-white">No Meals Logged Today</div>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Tap any household staple above, use "Log Food", or tap "Snap Meal" to log your plate.
            </p>
          </GlassCard>
        )}
      </div>

      {/* MODALS */}
      <MealLogModal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        onLogMeal={handleLogMeal}
        householdPantry={householdPantry}
        onAddHouseholdStaple={handleAddHouseholdStaple}
        onDeleteHouseholdStaple={handleDeleteHouseholdStaple}
        soundEnabled={soundEnabled}
      />

      <WeightTrackerModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        weightHistory={weightHistory}
        currentCalorieTarget={targetCalories}
        onLogWeight={handleLogWeight}
        onDeleteWeightLog={handleDeleteWeightLog}
        onApplySurplus={handleApplySurplus}
        soundEnabled={soundEnabled}
      />

      <SnapMealModal
        isOpen={isSnapModalOpen}
        onClose={() => setIsSnapModalOpen(false)}
        onLogMeal={handleLogMeal}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};
