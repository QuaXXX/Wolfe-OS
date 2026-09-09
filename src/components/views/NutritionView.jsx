import React, { useState, useMemo, useRef } from 'react';
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
  BookmarkPlus,
  Edit3,
  Barcode,
  Mic,
  MicOff,
  Ruler,
  CheckCircle2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';
import { 
  MEAL_SLOTS, 
  aggregateDailyNutrition, 
  calculateMovingAverageWeight, 
  calculateWeightVelocity, 
  getAdaptiveSurplusRecommendation,
  createMealEntry,
  parseMealDescription,
  DEFAULT_HOUSEHOLD_PANTRY,
  getCalibrationProgress 
} from '../../utils/nutritionEngine.js';
import { MealLogModal } from '../nutrition/MealLogModal';
import { WeightTrackerModal } from '../nutrition/WeightTrackerModal';
import { SnapMealModal } from '../nutrition/SnapMealModal';
import { KitchenCalibrationModal } from '../nutrition/KitchenCalibrationModal';
import { recordDeletion, recordAdditionOrUpdate } from '../../utils/cloudSyncEngine.js';

export const NutritionView = ({ 
  nutritionData, 
  setNutritionData, 
  settings = {},
  onOpenComingSoon, 
  soundEnabled = true 
}) => {
  // Modals state
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
  const [isSnapModalOpen, setIsSnapModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState(false);
  const [activeQuickSlot, setActiveQuickSlot] = useState('lunch');
  const [pantryCategory, setPantryCategory] = useState('common');
  const [justLoggedToast, setJustLoggedToast] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [quickAddFeedback, setQuickAddFeedback] = useState(null);
  const speechRecognitionRef = useRef(null);

  // Destructure state from nutritionData with safe fallbacks
  const targetCalories = nutritionData.targetCalories || 3250;
  const targetProtein = nutritionData.protein?.target || 180;
  const targetCarbs = nutritionData.carbs?.target || 450;
  const targetFats = nutritionData.fats?.target || 80;
  const targetWaterMl = nutritionData.targetWaterMl || 3500;
  const waterMl = nutritionData.waterMl || 0;
  const meals = nutritionData.meals || [];
  const weightHistory = nutritionData.weightHistory || [];
  const householdPantry = (nutritionData.householdPantry && nutritionData.householdPantry.length > 0) ? nutritionData.householdPantry : DEFAULT_HOUSEHOLD_PANTRY;

  // Target modal form state
  const [customCalories, setCustomCalories] = useState(targetCalories);
  const [customProtein, setCustomProtein] = useState(targetProtein);
  const [customCarbs, setCustomCarbs] = useState(targetCarbs);
  const [customFats, setCustomFats] = useState(targetFats);

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

  // Kitchen Hardware Calibration Progress
  const calibrationProgress = useMemo(() => {
    return getCalibrationProgress(nutritionData?.kitchenCalibration?.tasks || []);
  }, [nutritionData?.kitchenCalibration]);

  
  // Filtered pantry list based on category
  const filteredPantry = useMemo(() => {
    if (pantryCategory === 'all') return householdPantry;
    if (pantryCategory === 'common') {
      const commonIds = [
        'staple-eggs-2',
        'staple-apple',
        'staple-granola-bar',
        'staple-protein-bar',
        'staple-banana',
        'staple-whey',
        'staple-greek-yogurt',
        'staple-chicken',
        'staple-rice',
        'staple-pb'
      ];
      return householdPantry.filter(s => commonIds.includes(s.id) || s.category === 'Common' || s.category === 'Protein' || s.category === 'Fruit' || s.category === 'Snacks').slice(0, 10);
    }
    return householdPantry.filter(s => (s.category || '').toLowerCase() === pantryCategory.toLowerCase());
  }, [householdPantry, pantryCategory]);

  const latestWeightLog = useMemo(() => {
    if (!weightHistory.length) return null;
    return [...weightHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [weightHistory]);

  // Handlers for logging
  const handleLogMeal = (mealEntry) => {
    playSound('success', soundEnabled);
    if (mealEntry?.id) recordAdditionOrUpdate(mealEntry.id);
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
    recordDeletion(mealId);
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
      items: [`${staple.portion || staple.name} (${staple.calories} kcal, ${staple.protein}g P)`]
    });
    handleLogMeal(meal);
    setJustLoggedToast(`Logged ${staple.name} (+${staple.protein}g Protein, ${staple.calories} kcal)`);
    setTimeout(() => setJustLoggedToast(null), 3000);
  };

  const handleQuickAddSubmit = () => {
    if (!quickAddText.trim()) return;
    const text = quickAddText.trim();
    const parsed = parseMealDescription(text);
    if (parsed && parsed.items && parsed.items.length > 0) {
      playSound('success', soundEnabled);
      const meal = createMealEntry({
        name: parsed.name,
        slot: activeQuickSlot || 'lunch',
        calories: parsed.calories,
        protein: parsed.protein,
        carbs: parsed.carbs,
        fats: parsed.fats,
        items: parsed.items.map(i => `${i.portion || '1 serving'} ${i.name}`)
      });
      handleLogMeal(meal);
      setQuickAddText('');
      setQuickAddFeedback(`Logged ${parsed.name} (${parsed.calories} kcal, ${parsed.protein}g P)`);
      setTimeout(() => setQuickAddFeedback(null), 3500);
    } else {
      playSound('click', soundEnabled);
      setIsMealModalOpen(true);
    }
  };

  const handleToggleVoiceQuickAdd = () => {
    if (isVoiceListening) {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch (e) {}
      }
      setIsVoiceListening(false);
      return;
    }

    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice speech recognition is not supported on this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsVoiceListening(true);
        playSound('click', soundEnabled);
      };

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setQuickAddText(transcript);
          const parsed = parseMealDescription(transcript);
          if (parsed && parsed.items && parsed.items.length > 0) {
            playSound('success', soundEnabled);
            const meal = createMealEntry({
              name: parsed.name,
              slot: activeQuickSlot || 'lunch',
              calories: parsed.calories,
              protein: parsed.protein,
              carbs: parsed.carbs,
              fats: parsed.fats,
              items: parsed.items.map(i => `${i.portion || '1 serving'} ${i.name}`)
            });
            handleLogMeal(meal);
            setQuickAddText('');
            setQuickAddFeedback(`Logged ${parsed.name} (${parsed.calories} kcal, ${parsed.protein}g P)`);
            setTimeout(() => setQuickAddFeedback(null), 3500);
          }
        }
      };

      recognition.onerror = () => {
        setIsVoiceListening(false);
      };

      recognition.onend = () => {
        setIsVoiceListening(false);
      };

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsVoiceListening(false);
    }
  };

  const handleLogWeight = (weightEntry) => {
    if (weightEntry?.id || weightEntry?.date) recordAdditionOrUpdate(weightEntry.id || weightEntry.date);
    setNutritionData(prev => {
      const existing = (prev.weightHistory || []).filter(w => w.date !== weightEntry.date);
      return {
        ...prev,
        weightHistory: [weightEntry, ...existing]
      };
    });
  };

  const handleDeleteWeightLog = (idOrDate) => {
    recordDeletion(idOrDate);
    setNutritionData(prev => ({
      ...prev,
      weightHistory: (prev.weightHistory || []).filter(w => w.id !== idOrDate && w.date !== idOrDate)
    }));
  };

  // Quick calorie target adjuster: +/- delta
  const handleAdjustTargetCalories = (delta) => {
    playSound('click', soundEnabled);
    const newTarget = Math.max(1500, Math.min(6500, targetCalories + delta));
    setNutritionData(prev => ({
      ...prev,
      targetCalories: newTarget
    }));
  };

  const handleApplySurplus = (newTarget) => {
    playSound('success', soundEnabled);
    setNutritionData(prev => ({
      ...prev,
      targetCalories: newTarget
    }));
  };

  // Save custom targets from modal
  const handleSaveCustomTargets = (e) => {
    e.preventDefault();
    playSound('success', soundEnabled);
    setNutritionData(prev => ({
      ...prev,
      targetCalories: parseInt(customCalories, 10) || targetCalories,
      protein: { ...prev.protein, target: parseInt(customProtein, 10) || targetProtein },
      carbs: { ...prev.carbs, target: parseInt(customCarbs, 10) || targetCarbs },
      fats: { ...prev.fats, target: parseInt(customFats, 10) || targetFats }
    }));
    setIsTargetModalOpen(false);
  };

  const handleAutoRebalanceMacros = () => {
    const cals = parseInt(customCalories, 10) || targetCalories;
    const p = 180; // Standard 180g protein base
    const pCals = p * 4; // 720 kcal
    const fCals = Math.round(cals * 0.22); // 22% fats
    const f = Math.round(fCals / 9);
    const remainingCalsForCarbs = Math.max(0, cals - pCals - (f * 9));
    const c = Math.round(remainingCalsForCarbs / 4);

    setCustomProtein(p);
    setCustomFats(f);
    setCustomCarbs(c);
  };

  const handleAddHouseholdStaple = (staple) => {
    if (staple?.id) recordAdditionOrUpdate(staple.id);
    setNutritionData(prev => ({
      ...prev,
      householdPantry: [staple, ...(prev.householdPantry || [])]
    }));
  };

  const handleDeleteHouseholdStaple = (stapleId) => {
    recordDeletion(stapleId);
    setNutritionData(prev => ({
      ...prev,
      householdPantry: (prev.householdPantry || []).filter(s => s.id !== stapleId)
    }));
  };

  const handleUpdateCalibration = (newCalibration) => {
    playSound('success', soundEnabled);
    if (newCalibration?.id) recordAdditionOrUpdate(newCalibration.id);
    setNutritionData(prev => ({
      ...prev,
      kitchenCalibration: newCalibration
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
            <span>Performance Nutrition & Fuel</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/10">
              {targetProtein}g Protein • High Carb
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
          {/* Hardware & Dish Calibration Pill */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsCalibrationModalOpen(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 cursor-pointer ${
              calibrationProgress.isAllCompleted
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border-white/10'
            }`}
            title="Calibrate your dishes, pantry staples & everyday meals for accurate AI food vision"
          >
            <Ruler className={`w-3.5 h-3.5 ${calibrationProgress.isAllCompleted ? 'text-emerald-400' : 'text-indigo-400'}`} />
            <span>
              {calibrationProgress.isAllCompleted 
                ? 'Kitchen Calibrated' 
                : `Calibrate: ${calibrationProgress.completed}/${calibrationProgress.total || 22}`}
            </span>
            {calibrationProgress.isAllCompleted && (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />
            )}
          </button>

          {/* Morning Weight Tracker */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWeightModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer"
          >
            <Scale className="w-3.5 h-3.5 text-slate-400" />
            <span>Morning Weight</span>
          </button>

          {/* One Primary Log Food Modal */}
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

      {/* Quick Add Input Bar (Voice or Instant Text) */}
      <div className="flex flex-col gap-2">
        <div className="relative flex items-center gap-2 p-1.5 sm:p-2 bg-white/[0.03] border border-white/[0.08] rounded-2xl shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 flex-1 px-2.5 py-1">
            <UtensilsCrossed className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleQuickAddSubmit();
                }
              }}
              placeholder='Quick log: "1 peanutbutter toast", "quinoa and chickpeas bowl", "2 eggs and apple"...'
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          {/* Voice Speech Recognition Button */}
          <button
            type="button"
            onClick={handleToggleVoiceQuickAdd}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isVoiceListening 
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse' 
                : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-400 hover:text-white'
            }`}
            title={isVoiceListening ? "Listening... click to stop" : "Speak meal to log (e.g. '1 peanutbutter toast')"}
          >
            {isVoiceListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Add Button */}
          <button
            type="button"
            onClick={handleQuickAddSubmit}
            disabled={!quickAddText.trim()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </div>

        {/* Quick Add Feedback Toast */}
        {quickAddFeedback && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-medium">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span>{quickAddFeedback}</span>
          </div>
        )}
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
                <span>Scale Stalled — Calorie Adjustment Available</span>
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
              <span className="text-[10px] font-mono font-semibold uppercase text-slate-400">Daily Target</span>
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

          {/* Quick Calorie Target Adjuster Controls */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <span className="text-[10px] text-slate-400 font-mono uppercase mr-1">Adjust Target:</span>
            <button 
              type="button"
              onClick={() => handleAdjustTargetCalories(-250)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              title="Decrease daily target by 250 kcal"
            >
              -250
            </button>
            <button 
              type="button"
              onClick={() => handleAdjustTargetCalories(-100)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              title="Decrease daily target by 100 kcal"
            >
              -100
            </button>
            <button 
              type="button"
              onClick={() => handleAdjustTargetCalories(100)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              title="Increase daily target by 100 kcal"
            >
              +100
            </button>
            <button 
              type="button"
              onClick={() => handleAdjustTargetCalories(250)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              title="Increase daily target by 250 kcal"
            >
              +250
            </button>
            <button 
              type="button"
              onClick={() => handleAdjustTargetCalories(500)}
              className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
              title="Increase daily target by 500 kcal"
            >
              +500
            </button>

            <button
              type="button"
              onClick={() => {
                setCustomCalories(targetCalories);
                setCustomProtein(targetProtein);
                setCustomCarbs(targetCarbs);
                setCustomFats(targetFats);
                setIsTargetModalOpen(true);
              }}
              className="ml-auto px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-semibold border border-white/10 transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
            >
              <Edit3 className="w-3 h-3 text-slate-400" />
              <span>Edit Target</span>
            </button>
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
            <div className="sm:col-span-3 space-y-2.5">
              {/* Protein: 180g Target */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                    <span>🥩 Protein</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(4 kcal/g)</span>
                  </span>
                  <span className="font-mono text-white font-bold">
                    {dailyTotals.protein}g <span className="text-slate-400 font-normal">/ {targetProtein}g</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-300 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (dailyTotals.protein / targetProtein) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Carbs: 450g Target */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                    <span>🍚 Carbohydrates</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(4 kcal/g)</span>
                  </span>
                  <span className="font-mono text-white font-bold">
                    {dailyTotals.carbs}g <span className="text-slate-400 font-normal">/ {targetCarbs}g</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-400 rounded-full transition-all duration-500" 
                    style={{ width: `${Math.min(100, (dailyTotals.carbs / targetCarbs) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Fats: 80g Target */}
              <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                    <span>🥑 Healthy Fats</span>
                    <span className="text-[10px] text-slate-400 font-mono font-normal">(9 kcal/g)</span>
                  </span>
                  <span className="font-mono text-white font-bold">
                    {dailyTotals.fats}g <span className="text-slate-400 font-normal">/ {targetFats}g</span>
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-slate-500 rounded-full transition-all duration-500" 
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
                className="py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-slate-200 active:scale-95 transition-all cursor-pointer text-center"
              >
                +750ml (Shaker)
              </button>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* 4. HOUSEHOLD PANTRY STAPLES (1-Tap Fast Logging) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">🏠</span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>Kitchen Staples & Quick Add</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-400 border border-white/10">
                1-Tap Fast Log
              </span>
            </h2>
          </div>
          
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Slot:</span>
              <select
                value={activeQuickSlot}
                onChange={(e) => setActiveQuickSlot(e.target.value)}
                className="bg-black/60 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono text-white outline-none cursor-pointer"
              >
                {MEAL_SLOTS.map(s => (
                  <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'common', label: '⭐ Quick Staples' },
            { id: 'all', label: 'All Items' },
            { id: 'protein', label: '🥩 Protein' },
            { id: 'carbs', label: '🍚 Carbs' },
            { id: 'fruit', label: '🍎 Fruit' },
            { id: 'snacks', label: '🍫 Snacks & Bars' },
            { id: 'dairy', label: '🥛 Dairy' }
          ].map(cat => {
            const active = pantryCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setPantryCategory(cat.id);
                }}
                className={`px-3 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
                  active 
                    ? 'bg-white text-black font-bold shadow-sm' 
                    : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Toast Notification */}
        {justLoggedToast && (
          <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-slate-200 text-xs font-mono font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{justLoggedToast} to {MEAL_SLOTS.find(s => s.id === activeQuickSlot)?.label}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
          {filteredPantry.map((staple) => (
            <button
              key={staple.id}
              onClick={() => handleQuickLogStaple(staple)}
              className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20 border border-white/10 text-left transition-all active:scale-95 cursor-pointer flex flex-col justify-between space-y-2 group relative overflow-hidden"
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-xl">{staple.icon || '🍽️'}</span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                  +{staple.protein}g P
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-white truncate">{staple.name}</div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {staple.calories} kcal • {staple.portion}
                </div>
              </div>
              <div className="w-full pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-slate-400 group-hover:text-white transition-colors">
                <span>Tap to Log</span>
                <Plus className="w-3 h-3 text-slate-500 group-hover:text-white" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 5. TODAY'S MEAL ENTRIES BY SLOT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <span>Today's Logged Meals</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-slate-400">
              {meals.length} {meals.length === 1 ? 'Meal' : 'Meals'}
            </span>
          </h2>
        </div>

        {meals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {meals.map((meal) => {
              const slotInfo = MEAL_SLOTS.find(s => s.id === meal.slot) || MEAL_SLOTS[1];
              return (
                <GlassCard key={meal.id} hoverEffect={false} className="p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-base shrink-0">
                        {slotInfo.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{meal.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-slate-400 uppercase">
                            {slotInfo.label}
                          </span>
                        </div>
                        {meal.time && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{meal.time}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold text-white">{meal.calories} kcal</div>
                        <div className="text-[10px] text-emerald-400 font-semibold">{meal.protein}g Protein</div>
                      </div>

                      <button
                        onClick={() => handleDeleteMeal(meal.id)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
                        title="Delete meal"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {meal.items && meal.items.length > 0 && (
                    <div className="text-[11px] text-slate-300 font-mono bg-black/40 p-2 rounded-xl border border-white/5 space-y-0.5">
                      {meal.items.map((it, idx) => (
                        <div key={idx} className="truncate">• {it}</div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-2 border-t border-white/5">
                    <span>{meal.protein}g P</span>
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

      {/* CUSTOM TARGET ADJUSTMENT MODAL */}
      <AnimatePresence>
        {isTargetModalOpen && (
          <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTargetModalOpen(false)}
              className="fixed inset-0 top-0 left-0 w-full h-full bg-black/70 backdrop-blur-xl"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              className="relative w-full max-w-md bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-amber-400">
                    <Flame className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Adjust Daily Targets</h3>
                    <p className="text-[11px] text-slate-400">Fine-tune your daily calorie surplus and macros</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTargetModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveCustomTargets} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Daily Target Calories (kcal)</label>
                  <input
                    type="number"
                    step="50"
                    min="1500"
                    max="6500"
                    value={customCalories}
                    onChange={(e) => setCustomCalories(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/15 text-white font-mono font-bold text-sm focus:outline-none focus:border-white/30"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-indigo-300">Protein (g)</label>
                    <input
                      type="number"
                      value={customProtein}
                      onChange={(e) => setCustomProtein(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-white/5 border border-white/15 text-white font-mono font-bold text-xs focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-sky-300">Carbs (g)</label>
                    <input
                      type="number"
                      value={customCarbs}
                      onChange={(e) => setCustomCarbs(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-white/5 border border-white/15 text-white font-mono font-bold text-xs focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-amber-300">Fats (g)</label>
                    <input
                      type="number"
                      value={customFats}
                      onChange={(e) => setCustomFats(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-white/5 border border-white/15 text-white font-mono font-bold text-xs focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAutoRebalanceMacros}
                  className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-mono text-[11px] border border-white/10 transition-all cursor-pointer"
                >
                  ⚡ Auto-Calculate Macros from Calories (180g P Baseline)
                </button>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl text-white font-semibold text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    Save Target
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTargetModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-white/5 text-slate-300 font-medium text-xs hover:bg-white/10 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODALS */}
      <MealLogModal
        isOpen={isMealModalOpen}
        onClose={() => setIsMealModalOpen(false)}
        onLogMeal={handleLogMeal}
        householdPantry={householdPantry}
        onAddHouseholdStaple={handleAddHouseholdStaple}
        onDeleteHouseholdStaple={handleDeleteHouseholdStaple}
        onOpenSnapModal={() => setIsSnapModalOpen(true)}
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
        aiConfig={settings?.aiConfig}
        kitchenCalibration={nutritionData?.kitchenCalibration}
        soundEnabled={soundEnabled}
      />

      <KitchenCalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
        kitchenCalibration={nutritionData?.kitchenCalibration}
        onUpdateCalibration={handleUpdateCalibration}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};
