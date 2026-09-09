import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  ChevronLeft, 
  Sparkles, 
  Calendar as CalendarIcon, 
  CheckCheck, 
  History,
  AlertCircle,
  BookmarkPlus,
  Edit3,
  Barcode,
  Mic,
  MicOff,
  Ruler,
  CheckCircle2,
  RefreshCw,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';
import { 
  aggregateDailyNutrition, 
  calculateMovingAverageWeight, 
  calculateWeightVelocity, 
  getAdaptiveSurplusRecommendation,
  createMealEntry,
  parseMealDescription,
  DEFAULT_HOUSEHOLD_PANTRY,
  getCalibrationProgress,
  filterMealsByDate,
  getDailyNutritionHistory,
  calculateWeightTrend,
  synchronizeNutritionData
} from '../../utils/nutritionEngine.js';
import { analyzeQuickLogWithAI } from '../../utils/aiService.js';
import { getTodayIso, formatDateTitle, addDays } from '../../utils/calendarUtils.js';
import { MealLogModal } from '../nutrition/MealLogModal';
import { WeightTrackerModal } from '../nutrition/WeightTrackerModal';
import { KitchenCalibrationModal } from '../nutrition/KitchenCalibrationModal';
import { recordDeletion, recordAdditionOrUpdate, markLocalMutation, triggerImmediateCloudPush, syncFullOsWithCloud } from '../../utils/cloudSyncEngine.js';

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
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [isCalibrationModalOpen, setIsCalibrationModalOpen] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [calorieHistoryRange, setCalorieHistoryRange] = useState(14); // 7 | 14 | 30
  const [pantryCategory, setPantryCategory] = useState('common');
  const [justLoggedToast, setJustLoggedToast] = useState(null);
  const [quickAddText, setQuickAddText] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isQuickAnalyzing, setIsQuickAnalyzing] = useState(false);
  const [quickAddFeedback, setQuickAddFeedback] = useState(null);
  const speechRecognitionRef = useRef(null);

  // Date Navigation State: Dynamic today tracking that automatically updates on new day / midnight / window focus
  const [currentTodayIso, setCurrentTodayIso] = useState(() => getTodayIso());
  const [selectedDate, setSelectedDate] = useState(() => getTodayIso());
  const todayIso = currentTodayIso;
  const dayScrollRef = useRef(null);
  const selectedDayCardRef = useRef(null);

  // Auto-detect date change on window focus, visibility change, and periodic timer
  useEffect(() => {
    const checkRollover = () => {
      const freshToday = getTodayIso();
      setCurrentTodayIso(prev => {
        if (prev !== freshToday) {
          // If the user was viewing today, automatically advance to the new day
          setSelectedDate(currSel => (currSel === prev ? freshToday : currSel));
          return freshToday;
        }
        return prev;
      });
    };

    // Check immediately on window focus (phone wake / tab return)
    window.addEventListener('focus', checkRollover);
    const handleVis = () => {
      if (document.visibilityState === 'visible') checkRollover();
    };
    document.addEventListener('visibilitychange', handleVis);

    // Periodic check every 30 seconds
    const interval = setInterval(checkRollover, 30000);

    return () => {
      window.removeEventListener('focus', checkRollover);
      document.removeEventListener('visibilitychange', handleVis);
      clearInterval(interval);
    };
  }, []);

  // Side-Scrollable Day Window: 30 days before today up to 3 days ahead, calculated strictly in local timezone
  const dayWindow = useMemo(() => {
    const days = [];
    const base = new Date();
    for (let i = -30; i <= 3; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const dateIso = `${y}-${m}-${dayNum}`;
      days.push({
        dateIso,
        dayNumber: d.getDate(),
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        monthName: d.toLocaleDateString('en-US', { month: 'short' })
      });
    }
    return days;
  }, [currentTodayIso]);

  // Auto-center selected day card in horizontal carousel
  useEffect(() => {
    if (selectedDayCardRef.current) {
      selectedDayCardRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }
  }, [selectedDate]);

  // Synchronize nutrition on mount and date rollover to guarantee proper day boundaries
  useEffect(() => {
    const synced = synchronizeNutritionData(nutritionData, currentTodayIso);
    if (
      synced.currentDate !== nutritionData.currentDate ||
      synced.consumedCalories !== nutritionData.consumedCalories ||
      (synced.meals || []).length !== (nutritionData.meals || []).length
    ) {
      setNutritionData(synced);
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(synced));
      } catch (e) {}
    }
  }, [currentTodayIso]);

  // Proactively pull fresh meals from cloud on NutritionView mount
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  useEffect(() => {
    syncFullOsWithCloud({ forcePush: false }).catch(() => {});
  }, []);

  const handleTriggerCloudSync = async () => {
    playSound('click', soundEnabled);
    setIsSyncingCloud(true);
    try {
      await syncFullOsWithCloud({ forcePush: false });
    } catch (e) {
      console.debug("Manual nutrition cloud sync notice:", e);
    } finally {
      setTimeout(() => setIsSyncingCloud(false), 700);
    }
  };

  const handlePrevDay = () => {
    playSound('switch', soundEnabled);
    setSelectedDate(curr => addDays(curr, -1));
  };

  const handleNextDay = () => {
    playSound('switch', soundEnabled);
    setSelectedDate(curr => addDays(curr, 1));
  };

  const handleTodayJump = () => {
    playSound('switch', soundEnabled);
    const freshToday = getTodayIso();
    setCurrentTodayIso(freshToday);
    setSelectedDate(freshToday);
  };

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

  // Synchronize custom target fields with nutritionData targets
  useEffect(() => {
    setCustomCalories(targetCalories);
    setCustomProtein(targetProtein);
    setCustomCarbs(targetCarbs);
    setCustomFats(targetFats);
  }, [targetCalories, targetProtein, targetCarbs, targetFats, isTargetModalOpen]);

  // Filter meals strictly for the selected date
  const selectedDateMeals = useMemo(() => {
    return (meals || []).filter(m => m.date === selectedDate);
  }, [meals, selectedDate]);

  // Aggregate selected date nutrition totals
  const dailyTotals = useMemo(() => {
    return aggregateDailyNutrition(selectedDateMeals);
  }, [selectedDateMeals]);

  // Multi-day consistency and lookback history (7, 14, or 30 days)
  const nutritionHistory = useMemo(() => {
    return getDailyNutritionHistory(meals, targetCalories, targetProtein, calorieHistoryRange);
  }, [meals, targetCalories, targetProtein, calorieHistoryRange]);

  const weightTrend14 = useMemo(() => {
    return calculateWeightTrend(weightHistory, 14);
  }, [weightHistory]);

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
    return getCalibrationProgress(nutritionData?.kitchenCalibration);
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
    const mealDate = mealEntry?.date || selectedDate || currentTodayIso;
    const stampedMeal = {
      ...mealEntry,
      date: mealDate,
      createdAt: mealEntry?.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    if (stampedMeal?.id) recordAdditionOrUpdate(stampedMeal.id);
    markLocalMutation();

    setNutritionData(prev => {
      const existingMeals = (prev.meals || []).filter(m => m.id !== stampedMeal.id);
      const nextMeals = [stampedMeal, ...existingMeals];
      // Today's total strictly from meals logged for currentTodayIso
      const todayMeals = nextMeals.filter(m => m.date === currentTodayIso);
      const todayTotals = aggregateDailyNutrition(todayMeals);

      const nextData = {
        ...prev,
        currentDate: currentTodayIso,
        consumedCalories: todayTotals.calories,
        protein: { ...(prev.protein || {}), current: todayTotals.protein },
        carbs: { ...(prev.carbs || {}), current: todayTotals.carbs },
        fats: { ...(prev.fats || {}), current: todayTotals.fats },
        meals: nextMeals
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      return nextData;
    });

    triggerImmediateCloudPush(80);
  };

  const handleDeleteMeal = (mealId) => {
    playSound('click', soundEnabled);
    recordDeletion(mealId);
    markLocalMutation();

    setNutritionData(prev => {
      const nextMeals = (prev.meals || []).filter(m => m.id !== mealId);
      const todayMeals = nextMeals.filter(m => m.date === currentTodayIso);
      const todayTotals = aggregateDailyNutrition(todayMeals);

      const nextData = {
        ...prev,
        consumedCalories: todayTotals.calories,
        protein: { ...(prev.protein || {}), current: todayTotals.protein },
        carbs: { ...(prev.carbs || {}), current: todayTotals.carbs },
        fats: { ...(prev.fats || {}), current: todayTotals.fats },
        meals: nextMeals
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      return nextData;
    });

    triggerImmediateCloudPush(80);
  };

  const handleQuickLogStaple = (staple) => {
    playSound('success', soundEnabled);
    const meal = createMealEntry({
      date: selectedDate,
      name: staple.name,
      slot: 'meal',
      calories: staple.calories,
      protein: staple.protein,
      carbs: staple.carbs,
      fats: staple.fats,
      items: [`${staple.portion || staple.name} (${staple.calories} kcal, ${staple.protein}g P)`]
    });
    handleLogMeal(meal);
    const dayLabel = selectedDate === todayIso ? 'Today' : selectedDate;
    setJustLoggedToast(`Logged ${staple.name} into ${dayLabel} (+${staple.protein}g P, ${staple.calories} kcal)`);
    setTimeout(() => setJustLoggedToast(null), 3000);
  };

  const handleQuickAddSubmit = async () => {
    if (!quickAddText.trim() || isQuickAnalyzing) return;
    const text = quickAddText.trim();
    setIsQuickAnalyzing(true);
    try {
      const parsed = await analyzeQuickLogWithAI({
        query: text,
        aiConfig: settings?.aiConfig,
        kitchenCalibration: nutritionData?.kitchenCalibration,
        householdPantry
      });

      if (parsed && parsed.hasFood !== false && parsed.items && parsed.items.length > 0) {
        playSound('success', soundEnabled);
        const meal = createMealEntry({
          date: selectedDate,
          name: parsed.name,
          slot: parsed.slot || 'meal',
          calories: parsed.calories,
          protein: parsed.protein,
          carbs: parsed.carbs,
          fats: parsed.fats,
          items: parsed.items.map(i => `${i.portion || '1 serving'} ${i.name}`)
        });
        handleLogMeal(meal);
        setQuickAddText('');
        const slotBadge = (parsed.slot && parsed.slot !== 'meal') ? ` [${parsed.slot.toUpperCase()}]` : '';
        setQuickAddFeedback(`Logged${slotBadge}: ${parsed.name} (${parsed.calories} kcal, ${parsed.protein}g P)`);
        setTimeout(() => setQuickAddFeedback(null), 3500);
      } else {
        playSound('click', soundEnabled);
        setIsMealModalOpen(true);
      }
    } catch (err) {
      const local = parseMealDescription(text, { kitchenCalibration: nutritionData?.kitchenCalibration, householdPantry });
      if (local && local.items && local.items.length > 0) {
        playSound('success', soundEnabled);
        const meal = createMealEntry({
          date: selectedDate,
          name: local.name,
          slot: local.slot || 'meal',
          calories: local.calories,
          protein: local.protein,
          carbs: local.carbs,
          fats: local.fats,
          items: local.items.map(i => `${i.portion || '1 serving'} ${i.name}`)
        });
        handleLogMeal(meal);
        setQuickAddText('');
        setQuickAddFeedback(`Logged: ${local.name} (${local.calories} kcal, ${local.protein}g P)`);
        setTimeout(() => setQuickAddFeedback(null), 3500);
      } else {
        playSound('click', soundEnabled);
        setIsMealModalOpen(true);
      }
    } finally {
      setIsQuickAnalyzing(false);
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

      recognition.onresult = async (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setQuickAddText(transcript);
          setIsQuickAnalyzing(true);
          try {
            const parsed = await analyzeQuickLogWithAI({
              query: transcript,
              aiConfig: settings?.aiConfig,
              kitchenCalibration: nutritionData?.kitchenCalibration,
              householdPantry
            });
            if (parsed && parsed.hasFood !== false && parsed.items && parsed.items.length > 0) {
              playSound('success', soundEnabled);
              const meal = createMealEntry({
                date: selectedDate,
                name: parsed.name,
                slot: parsed.slot || 'meal',
                calories: parsed.calories,
                protein: parsed.protein,
                carbs: parsed.carbs,
                fats: parsed.fats,
                items: parsed.items.map(i => `${i.portion || '1 serving'} ${i.name}`)
              });
              handleLogMeal(meal);
              setQuickAddText('');
              const slotBadge = (parsed.slot && parsed.slot !== 'meal') ? ` [${parsed.slot.toUpperCase()}]` : '';
              setQuickAddFeedback(`Logged${slotBadge}: ${parsed.name} (${parsed.calories} kcal, ${parsed.protein}g P)`);
              setTimeout(() => setQuickAddFeedback(null), 3500);
            }
          } catch (err) {
            // Keep transcript in text field for user review
          } finally {
            setIsQuickAnalyzing(false);
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
    markLocalMutation();

    setNutritionData(prev => {
      const existing = (prev.weightHistory || []).filter(w => w.date !== weightEntry.date);
      const nextData = {
        ...prev,
        weightHistory: [weightEntry, ...existing]
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      return nextData;
    });

    triggerImmediateCloudPush(80);
  };

  const handleDeleteWeightLog = (idOrDate) => {
    recordDeletion(idOrDate);
    markLocalMutation();

    setNutritionData(prev => {
      const nextData = {
        ...prev,
        weightHistory: (prev.weightHistory || []).filter(w => w.id !== idOrDate && w.date !== idOrDate)
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      return nextData;
    });

    triggerImmediateCloudPush(80);
  };

  // Quick calorie target adjuster: adjusts draft value in edit modal
  const handleAdjustTargetCalories = (delta) => {
    playSound('click', soundEnabled);
    const current = parseInt(customCalories, 10) || targetCalories;
    const nextVal = Math.max(1500, Math.min(6500, current + delta));
    setCustomCalories(nextVal);
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
    if (e && e.preventDefault) e.preventDefault();
    playSound('success', soundEnabled);
    const newTargetCals = parseInt(customCalories, 10) || targetCalories;
    const newProtein = parseInt(customProtein, 10) || targetProtein;
    const newCarbs = parseInt(customCarbs, 10) || targetCarbs;
    const newFats = parseInt(customFats, 10) || targetFats;

    markLocalMutation();
    setNutritionData(prev => {
      const nextData = {
        ...prev,
        targetCalories: newTargetCals,
        protein: { ...(prev.protein || {}), target: newProtein },
        carbs: { ...(prev.carbs || {}), target: newCarbs },
        fats: { ...(prev.fats || {}), target: newFats },
        updatedAt: Date.now()
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (err) {}
      return nextData;
    });

    triggerImmediateCloudPush(80);
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
    markLocalMutation();

    setNutritionData(prev => {
      const nextData = {
        ...prev,
        householdPantry: [staple, ...(prev.householdPantry || [])]
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      return nextData;
    });

    triggerImmediateCloudPush(80);
  };

  const handleDeleteHouseholdStaple = (stapleId) => {
    recordDeletion(stapleId);
    markLocalMutation();

    setNutritionData(prev => {
      const nextData = {
        ...prev,
        householdPantry: (prev.householdPantry || []).filter(s => s.id !== stapleId)
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      return nextData;
    });

    triggerImmediateCloudPush(80);
  };

  const handleUpdateCalibration = (newCalibration) => {
    playSound('success', soundEnabled);
    
    // 1. Record addition/update for the changed task and mark local mutation
    const taskId = newCalibration?.lastUpdatedTaskId;
    if (taskId) {
      recordAdditionOrUpdate(taskId);
    }
    if (newCalibration?.deletedTaskId) {
      recordDeletion(newCalibration.deletedTaskId);
    }
    recordAdditionOrUpdate('kitchen_calibration');
    markLocalMutation();

    const stampedCalibration = {
      ...newCalibration,
      updatedAt: Date.now()
    };

    // 2. Immediately persist to localStorage synchronously so any export/sync reads latest data!
    try {
      const rawCurrent = localStorage.getItem('wolfe_nutrition_data');
      const parsedCurrent = rawCurrent ? JSON.parse(rawCurrent) : (nutritionData || {});
      const updatedNut = {
        ...parsedCurrent,
        ...nutritionData,
        kitchenCalibration: stampedCalibration
      };
      localStorage.setItem('wolfe_nutrition_data', JSON.stringify(updatedNut));
    } catch (e) {
      console.warn("Failed to write nutrition calibration to localStorage immediately:", e);
    }

    // 3. Update React state
    setNutritionData(prev => ({
      ...prev,
      kitchenCalibration: stampedCalibration
    }));

    // 4. Immediately trigger cloud sync so new data pushes to cloud BEFORE any background pull
    triggerImmediateCloudPush(60);
  };

  const addWater = (deltaMl = 250) => {
    playSound('click', soundEnabled);
    const nextMl = Math.max(0, Math.min(6000, waterMl + deltaMl));
    const glasses = Math.round(nextMl / 250);
    setNutritionData(prev => ({
      ...prev,
      waterMl: nextMl,
      waterGlasses: glasses,
      waterDate: currentTodayIso
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
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-xl bg-white/[0.04] text-slate-300 border border-white/10">
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
          {/* 1-Click Cloud Sync Button */}
          <button
            onClick={handleTriggerCloudSync}
            disabled={isSyncingCloud}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 cursor-pointer bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border-white/10 ${
              isSyncingCloud ? 'opacity-70 ring-1 ring-sky-400/30' : ''
            }`}
            title="Sync nutrition data across your phone and computer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isSyncingCloud ? 'animate-spin' : ''}`} />
            <span>{isSyncingCloud ? 'Syncing...' : 'Sync Cloud'}</span>
          </button>

          {/* Consistency Lookback Toggle Button */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsHistoryExpanded(prev => !prev);
            }}
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 cursor-pointer ${
              isHistoryExpanded 
                ? 'bg-white/15 text-white border-white/20 shadow-sm'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 border-white/10'
            }`}
            title="View 7-day calorie and macro target history"
          >
            <History className="w-3.5 h-3.5 text-sky-400" />
            <span>{isHistoryExpanded ? 'Hide History' : '7-Day History'}</span>
          </button>

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
            title="Calibrate your dishware dimensions so AI vision estimates exact portion sizes"
          >
            <Ruler className={`w-3.5 h-3.5 ${calibrationProgress.isAllCompleted ? 'text-emerald-400' : 'text-indigo-400'}`} />
            <span>
              {calibrationProgress.isAllCompleted 
                ? 'Hardware Calibrated' 
                : `Calibrate: ${calibrationProgress.completed}/${calibrationProgress.total || 2}`}
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

      {/* Side-Scrollable Day Navigation Strip */}
      <div className="p-3 sm:p-4 rounded-3xl bg-[#0f1220]/90 border border-white/10 shadow-xl space-y-3 font-sans">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-white/[0.04] border border-white/10">
              <CalendarIcon className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div>
              <span className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>{formatDateTitle(selectedDate)}</span>
              </span>
              <div className="text-[10px] font-mono text-slate-400">
                {selectedDateMeals.length} logged • {dailyTotals.calories} kcal ({dailyTotals.protein}g P)
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevDay}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {selectedDate !== todayIso && (
              <button
                onClick={handleTodayJump}
                className="px-2.5 py-1 rounded-xl text-xs font-bold text-white border transition-all cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                Today
              </button>
            )}
            <button
              onClick={handleNextDay}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal Carousel of Day Cards */}
        <div 
          ref={dayScrollRef}
          className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-none scroll-smooth touch-pan-x"
        >
          {dayWindow.map((day) => {
            const isSelected = day.dateIso === selectedDate;
            const isToday = day.dateIso === todayIso;
            const dayMeals = (meals || []).filter(m => m.date === day.dateIso);
            const dayTotals = aggregateDailyNutrition(dayMeals);
            const hitGoal = dayTotals.calories >= targetCalories;

            return (
              <button
                key={day.dateIso}
                ref={isSelected ? selectedDayCardRef : null}
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setSelectedDate(day.dateIso);
                }}
                className={`shrink-0 w-16 sm:w-20 py-2 px-1 rounded-2xl flex flex-col items-center justify-between transition-all cursor-pointer relative ${
                  isSelected
                    ? 'text-white shadow-lg scale-[1.03]'
                    : 'bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/5'
                }`}
                style={isSelected ? {
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  boxShadow: '0 0 18px -3px var(--accent-glow)'
                } : {}}
              >
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider opacity-80">
                  {day.dayName}
                </span>
                <span 
                  className={`text-base font-bold font-mono my-0.5 ${isSelected ? 'text-white' : 'text-slate-200'}`}
                  style={!isSelected && isToday ? { color: 'var(--accent-primary)', fontWeight: '800' } : {}}
                >
                  {day.dayNumber}
                </span>
                
                {/* Calorie status badge */}
                <div className="text-[10px] font-mono mt-0.5">
                  {dayTotals.calories > 0 ? (
                    <span className={`font-bold ${hitGoal ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {dayTotals.calories >= 1000 ? `${(dayTotals.calories / 1000).toFixed(1)}k` : dayTotals.calories}
                      {hitGoal && ' ✓'}
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* MULTI-WEEK CONSISTENCY & HISTORY LOOKBACK CARD (Expandable) */}
      {isHistoryExpanded && (
        <GlassCard hoverEffect={false} className="p-4 sm:p-5 space-y-4 hidden sm:block">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-sky-400" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Target Consistency & Calorie History ({calorieHistoryRange} Days)
                </h3>
                <p className="text-[10px] text-slate-400">
                  Track whether you've been hitting your caloric surplus & protein targets throughout
                </p>
              </div>
            </div>

            {/* Span Range Selector: 7d | 14d | 30d */}
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-white/10 text-xs self-start sm:self-auto">
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
          </div>

          {/* Period Aggregate Summary Bar */}
          {(() => {
            const loggedDays = nutritionHistory.filter(h => h.calories > 0);
            const hitDays = nutritionHistory.filter(h => h.hitCalories);
            const avgCalories = loggedDays.length > 0 ? Math.round(loggedDays.reduce((acc, h) => acc + h.calories, 0) / loggedDays.length) : 0;
            const avgProtein = loggedDays.length > 0 ? Math.round(loggedDays.reduce((acc, h) => acc + h.protein, 0) / loggedDays.length) : 0;
            const hitRate = Math.round((hitDays.length / calorieHistoryRange) * 100);

            return (
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-center font-mono">
                <div>
                  <span className="text-[9px] uppercase text-slate-400 block">Avg Caloric Intake</span>
                  <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                    {avgCalories > 0 ? `${avgCalories} kcal` : '—'}
                  </div>
                  <span className="text-[9px] text-slate-500">Goal: {targetCalories} kcal</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase text-indigo-300 block">Avg Daily Protein</span>
                  <div className="text-sm sm:text-base font-bold text-indigo-300 mt-0.5">
                    {avgProtein > 0 ? `${avgProtein}g` : '—'}
                  </div>
                  <span className="text-[9px] text-slate-500">Goal: {targetProtein}g</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase text-emerald-400 block">Goal Hit Rate</span>
                  <div className="text-sm sm:text-base font-bold text-emerald-400 mt-0.5">
                    {hitDays.length}/{calorieHistoryRange} Days ({hitRate}%)
                  </div>
                  <span className="text-[9px] text-slate-500">{hitDays.length >= (calorieHistoryRange * 0.7) ? 'On Track' : 'Need Consistency'}</span>
                </div>
              </div>
            );
          })()}

          {/* Visual Calorie Bar Chart */}
          <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Daily Calorie Bars vs Target ({targetCalories} kcal):</span>
              <span className="text-slate-500 text-[10px]">Click any bar to view that day</span>
            </div>

            <div className="flex items-end gap-1 sm:gap-1.5 h-28 pt-4 pb-1 overflow-x-auto scrollbar-none">
              {nutritionHistory.map((h) => {
                const isSelected = h.dateIso === selectedDate;
                const maxChartCal = Math.max(4000, targetCalories * 1.25);
                const heightPct = Math.min(100, Math.max(6, Math.round((h.calories / maxChartCal) * 100)));
                const hitGoal = h.hitCalories;

                return (
                  <button
                    key={h.dateIso}
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setSelectedDate(h.dateIso);
                    }}
                    className={`flex-1 min-w-[18px] sm:min-w-[24px] h-full flex flex-col justify-end items-center group cursor-pointer transition-transform ${
                      isSelected ? 'scale-105' : 'hover:opacity-100 opacity-85'
                    }`}
                    title={`${h.dateTitle}: ${h.calories} kcal (${h.protein}g P)`}
                  >
                    <div 
                      className={`w-full rounded-t-lg transition-all ${
                        isSelected 
                          ? 'ring-2 ring-white shadow-lg' 
                          : ''
                      } ${
                        hitGoal 
                          ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]' 
                          : h.calories > 0 
                            ? 'bg-amber-400/80' 
                            : 'bg-white/10'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className={`text-[8px] sm:text-[9px] font-mono mt-1 whitespace-nowrap ${
                      isSelected ? 'text-white font-bold' : 'text-slate-500 group-hover:text-slate-300'
                    }`}>
                      {h.dayName[0]}{h.dateIso.slice(8)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-0.5">
            {nutritionHistory.map((h) => {
              const isSelected = h.dateIso === selectedDate;
              return (
                <div
                  key={h.dateIso}
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedDate(h.dateIso);
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/[0.08] border-white/25 shadow-md scale-[1.02]'
                      : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{h.dateTitle}</span>
                    {h.hitCalories ? (
                      <span className="px-1.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-bold flex items-center gap-1">
                        <CheckCheck className="w-3 h-3" /> Hit Goal
                      </span>
                    ) : h.calories > 0 ? (
                      <span className="px-1.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 text-[9px] font-mono font-bold">
                        {h.pctCalories}%
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">No Logs</span>
                    )}
                  </div>

                  <div className="mt-2 space-y-1 font-mono">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Calories:</span>
                      <span className={`font-bold ${h.hitCalories ? 'text-emerald-400' : 'text-white'}`}>
                        {h.calories} / {h.targetCalories}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-md overflow-hidden">
                      <div 
                        className={`h-full rounded-md transition-all ${h.hitCalories ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        style={{ width: `${h.pctCalories}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
                      <span>Protein: <strong className="text-white">{h.protein}g</strong> / {h.targetProtein}g</span>
                      <span>{h.mealCount} meals</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* Quick Add Input Bar (Voice or Instant Text) */}
      <div className="flex flex-col gap-2">
        <div className="relative flex items-center gap-2 p-1.5 sm:p-2 bg-white/[0.03] border border-white/[0.08] rounded-2xl shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2 flex-1 px-2.5 py-1">
            <UtensilsCrossed className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              disabled={isQuickAnalyzing}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleQuickAddSubmit();
                }
              }}
              placeholder={isQuickAnalyzing ? "AI analyzing meal..." : 'Quick log: "1 peanutbutter toast", "chipotle bowl no cheese", "2 eggs and apple"...'}
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Voice Speech Recognition Button */}
          <button
            type="button"
            onClick={handleToggleVoiceQuickAdd}
            disabled={isQuickAnalyzing}
            className={`p-2 rounded-xl border transition-all cursor-pointer disabled:opacity-40 ${
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
            disabled={!quickAddText.trim() || isQuickAnalyzing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            {isQuickAnalyzing ? (
              <>
                <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-300" />
                <span>AI Analyzing...</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </>
            )}
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
              <div className="flex items-center gap-2 mt-0.5">
                <h3 className="text-lg font-bold text-white font-mono">
                  {targetCalories} kcal
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setCustomCalories(targetCalories);
                    setCustomProtein(targetProtein);
                    setCustomCarbs(targetCarbs);
                    setCustomFats(targetFats);
                    setIsTargetModalOpen(true);
                  }}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-sm"
                  title="Edit Daily Target Calories & Macros"
                >
                  <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-[11px] font-medium">Edit</span>
                </button>
              </div>
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
            {/* Calorie Progress Ring */}
            <div className="relative flex flex-col items-center justify-center p-2">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle 
                    cx="50" 
                    cy="50" 
                    r="40" 
                    fill="transparent" 
                    stroke="rgba(255, 255, 255, 0.08)" 
                    strokeWidth="7" 
                  />
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
                  <span className="text-[10px] font-mono font-bold mt-0.5" style={{ color: 'var(--accent-primary)' }}>
                    {Math.round(calPercent)}%
                  </span>
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
                <div className="w-full h-2 bg-black/40 rounded-lg overflow-hidden">
                  <div 
                    className="h-full bg-slate-300 rounded-lg transition-all duration-500" 
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
                <div className="w-full h-2 bg-black/40 rounded-lg overflow-hidden">
                  <div 
                    className="h-full bg-slate-400 rounded-lg transition-all duration-500" 
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
                <div className="w-full h-2 bg-black/40 rounded-lg overflow-hidden">
                  <div 
                    className="h-full bg-slate-500 rounded-lg transition-all duration-500" 
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
                <div className="text-slate-400">7d Avg: <span className="text-white font-bold">{movingAvgWeight ? `${movingAvgWeight} lbs` : '—'}</span></div>
                <div className="text-emerald-400 font-semibold">{weightTrend14?.changeLbs ? `${weightTrend14.changeLbs > 0 ? '+' : ''}${weightTrend14.changeLbs} lbs (14d)` : (weightVelocity.velocityLbsPerWeek > 0 ? `+${weightVelocity.velocityLbsPerWeek} lb/wk` : '')}</div>
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

      {/* 4. HOUSEHOLD PANTRY STAPLES (1-Tap Fast Logging - Icon + Name + Plus) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-base">🏠</span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
              <span>Quick Staples</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-xl bg-white/[0.04] text-slate-400 border border-white/10">
                1-Tap Fast Add
              </span>
            </h2>
          </div>
          {selectedDate !== todayIso && (
            <div 
              className="text-[11px] font-mono px-2.5 py-1 rounded-xl border shadow-sm"
              style={{
                backgroundColor: 'var(--accent-subtle)',
                borderColor: 'var(--accent-border)',
                color: 'var(--accent-primary)'
              }}
            >
              Logging into: <strong className="text-white">{formatDateTitle(selectedDate)}</strong>
            </div>
          )}
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
                className={`px-3 py-1 rounded-xl text-[11px] font-medium transition-all whitespace-nowrap cursor-pointer ${
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
            <span>{justLoggedToast}</span>
          </div>
        )}

        {/* Minimal Action Chips: Icon + Name + Plus button (No macro clutter) */}
        <div className="flex items-center gap-2 flex-wrap">
          {filteredPantry.map((staple) => (
            <button
              key={staple.id}
              type="button"
              onClick={() => handleQuickLogStaple(staple)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm hover:border-white/20 group"
              title={`Tap to log ${staple.name} into ${selectedDate === todayIso ? 'Today' : selectedDate}`}
            >
              <span className="text-base">{staple.icon || '🍽️'}</span>
              <span>{staple.name}</span>
              <div 
                className="w-5 h-5 rounded-lg flex items-center justify-center text-white transition-transform group-hover:scale-110 ml-0.5"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Plus className="w-3 h-3 text-white" strokeWidth={3} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 5. TODAY'S MEAL ENTRIES BY SLOT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <span>{selectedDate === todayIso ? "Today's Logged Meals" : `Logged Meals for ${formatDateTitle(selectedDate)}`}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-xl bg-white/5 text-slate-400">
              {selectedDateMeals.length} {selectedDateMeals.length === 1 ? 'Meal' : 'Meals'}
            </span>
          </h2>
        </div>

        {selectedDateMeals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedDateMeals.map((meal) => {
              return (
                <GlassCard key={meal.id} hoverEffect={false} className="p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-base shrink-0">
                        {meal.icon || '🍽️'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{meal.name}</span>
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
            <div className="text-xs font-bold text-white">{selectedDate === todayIso ? "No Meals Logged Today" : `No Meals Logged for ${formatDateTitle(selectedDate)}`}</div>
            <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
              Tap any household staple above or click "Log Food" to upload an image, talk to add, or quick log.
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
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">Daily Target Calories (kcal)</label>
                    <span className="text-[10px] font-mono text-slate-400">1,500 – 6,500 kcal</span>
                  </div>
                  <input
                    type="number"
                    step="50"
                    min="1500"
                    max="6500"
                    value={customCalories}
                    onChange={(e) => setCustomCalories(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-white font-mono font-bold text-sm focus:outline-none focus:border-white/30"
                  />
                  {/* Quick delta adjustment chips INSIDE edit modal */}
                  <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                    <span className="text-[10px] text-slate-400 font-mono mr-0.5">Quick Adjust:</span>
                    {[-250, -100, 100, 250, 500].map(delta => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() => handleAdjustTargetCalories(delta)}
                        className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-[11px] font-mono border border-white/10 transition-all active:scale-95 cursor-pointer"
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </div>
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
        selectedDate={selectedDate}
        onClose={() => setIsMealModalOpen(false)}
        onLogMeal={handleLogMeal}
        householdPantry={householdPantry}
        onAddHouseholdStaple={handleAddHouseholdStaple}
        onDeleteHouseholdStaple={handleDeleteHouseholdStaple}
        aiConfig={settings?.aiConfig}
        kitchenCalibration={nutritionData?.kitchenCalibration}
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

      <KitchenCalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
        kitchenCalibration={nutritionData?.kitchenCalibration}
        onUpdateCalibration={handleUpdateCalibration}
        aiConfig={settings?.aiConfig}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};
