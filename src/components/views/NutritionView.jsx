import React, { useState } from 'react';
import { 
  UtensilsCrossed, 
  Droplet, 
  Plus, 
  Camera, 
  Clock 
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';

export const NutritionView = ({ 
  nutritionData, 
  onOpenComingSoon, 
  soundEnabled = true 
}) => {
  const [waterGlasses, setWaterGlasses] = useState(nutritionData.waterGlasses);
  const [meals, setMeals] = useState(nutritionData.meals);

  const addWater = (delta = 1) => {
    playSound('click', soundEnabled);
    const next = Math.max(0, Math.min(16, waterGlasses + delta));
    setWaterGlasses(next);
    if (next >= nutritionData.targetGlasses) {
      playSound('success', soundEnabled);
    }
  };

  const remainingCals = nutritionData.targetCalories - nutritionData.consumedCalories;
  const calPercent = Math.min(100, Math.round((nutritionData.consumedCalories / nutritionData.targetCalories) * 100));

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <UtensilsCrossed className="w-4 h-4" />
            <span>Daily Nutrition & Fuel</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Nutrition & Macros
          </h1>
        </div>

        <button
          onClick={() => {
            playSound('click', soundEnabled);
            onOpenComingSoon({
              title: "AI Food Photo Scanner",
              subtitle: "Snap a photo of your plate to auto-calculate calories.",
              badge: "Nutrition Vision",
              features: [
                "Ingredient breakdown",
                "Nutritional database verification",
                "Barcode scanning"
              ]
            });
          }}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>Snap Meal</span>
        </button>
      </div>

      {/* Grid: Calorie & Macro Breakdown + Hydration */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Calorie Overview */}
        <GlassCard hoverEffect={false} className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
            <div>
              <span className="text-xs font-mono font-semibold uppercase" style={{ color: 'var(--accent-primary)' }}>Target</span>
              <h3 className="text-lg font-bold text-white">{nutritionData.targetCalories} kcal</h3>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Remaining</span>
              <div className="text-sm font-mono font-bold text-white">
                {remainingCals} kcal
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 items-center">
            {/* Concentric Gauge */}
            <div className="relative flex flex-col items-center justify-center p-2">
              <div className="relative w-28 h-28 flex items-center justify-center">
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
                    strokeDashoffset={251.2 * (1 - calPercent / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute flex flex-col items-center text-center">
                  <span className="text-lg font-bold font-mono text-white">{nutritionData.consumedCalories}</span>
                  <span className="text-[9px] text-slate-400 uppercase">kcal</span>
                </div>
              </div>
            </div>

            {/* Macro Bars */}
            <div className="sm:col-span-3 space-y-2.5">
              {/* Protein */}
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Protein</span>
                  <span className="font-mono text-white">
                    {nutritionData.protein.current}g <span className="text-slate-500">/ {nutritionData.protein.target}g</span>
                  </span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full" 
                    style={{ width: `${(nutritionData.protein.current / nutritionData.protein.target) * 100}%`, backgroundColor: 'var(--accent-primary)' }}
                  />
                </div>
              </div>

              {/* Carbs */}
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Carbs</span>
                  <span className="font-mono text-white">
                    {nutritionData.carbs.current}g <span className="text-slate-500">/ {nutritionData.carbs.target}g</span>
                  </span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-300 rounded-full" 
                    style={{ width: `${(nutritionData.carbs.current / nutritionData.carbs.target) * 100}%` }}
                  />
                </div>
              </div>

              {/* Fats */}
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Fats</span>
                  <span className="font-mono text-white">
                    {nutritionData.fats.current}g <span className="text-slate-500">/ {nutritionData.fats.target}g</span>
                  </span>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-400 rounded-full" 
                    style={{ width: `${(nutritionData.fats.current / nutritionData.fats.target) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Hydration */}
        <GlassCard hoverEffect={false} className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Droplet className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Water</h3>
              </div>
              <span className="text-xs font-mono text-white">
                {waterGlasses * 250} ml / 2,500 ml
              </span>
            </div>

            <div className="grid grid-cols-5 gap-2 my-3">
              {Array.from({ length: nutritionData.targetGlasses }).map((_, i) => {
                const filled = i < waterGlasses;
                return (
                  <div 
                    key={i}
                    onClick={() => addWater(filled ? -1 : 1)}
                    className={`aspect-square rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      filled 
                        ? 'text-white' 
                        : 'bg-white/[0.02] border-white/5 text-slate-600 hover:border-white/20'
                    }`}
                    style={
                      filled 
                        ? { 
                            backgroundColor: 'var(--accent-primary)',
                            borderColor: 'var(--accent-primary)',
                            boxShadow: '0 0 10px var(--accent-glow)' 
                          } 
                        : {}
                    }
                  >
                    <Droplet className={`w-3.5 h-3.5 ${filled ? 'fill-white' : ''}`} />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-white/10">
            <button
              onClick={() => addWater(1)}
              className="flex-1 py-1.5 rounded-xl text-white text-xs font-semibold flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Plus className="w-3 h-3" />
              <span>+250ml</span>
            </button>
            <button
              onClick={() => addWater(-1)}
              disabled={waterGlasses === 0}
              className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-20 text-slate-400 text-xs border border-white/10 transition-all"
            >
              -1
            </button>
          </div>
        </GlassCard>
      </div>

      {/* Meals List */}
      <div className="space-y-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          Today's Meals ({meals.length})
        </h2>

        {meals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {meals.map((meal) => (
              <GlassCard key={meal.id} hoverEffect={true} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} /> {meal.time}
                  </span>
                  <span className="font-mono text-xs font-bold text-white bg-white/5 px-2 py-0.5 rounded border border-white/10">
                    {meal.calories} kcal
                  </span>
                </div>

                <h3 className="text-xs font-bold text-white mb-0.5">{meal.name}</h3>
                <p className="text-[11px] text-slate-400 mb-2 truncate">{meal.items}</p>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>P: {meal.protein}</span>
                  <span>C: {meal.carbs}</span>
                  <span>F: {meal.fats}</span>
                </div>
              </GlassCard>
            ))}
          </div>
        ) : (
          <GlassCard hoverEffect={false} className="p-8 text-center space-y-2">
            <div className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <UtensilsCrossed className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-white">No Meals Logged Today</div>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Use voice command or "Snap Meal" to log your food, macros, and calorie breakdown.
            </p>
          </GlassCard>
        )}
      </div>
    </div>
  );
};
