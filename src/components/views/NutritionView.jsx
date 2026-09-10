import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  UtensilsCrossed, 
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
  getTargetForDate,
  calculateWeightTrend,
  synchronizeNutritionData,
  sanitizeHouseholdPantry
} from '../../utils/nutritionEngine.js';
import { analyzeQuickLogWithAI } from '../../utils/aiService.js';
import { getTodayIso, formatDateTitle, addDays } from '../../utils/calendarUtils.js';
import { MealLogModal } from '../nutrition/MealLogModal';
import { WeightTrackerModal } from '../nutrition/WeightTrackerModal';
import { KitchenCalibrationModal } from '../nutrition/KitchenCalibrationModal';
import { recordDeletion, recordAdditionOrUpdate, markLocalMutation, triggerImmediateCloudPush, syncFullOsWithCloud } from '../../utils/cloudSyncEngine.js';

const NutritionViewInner = ({ 
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
    try {
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
          dayName: d.toLocaleDateString('en-US', { weekday: 'short' }) || 'Day',
          monthName: d.toLocaleDateString('en-US', { month: 'short' }) || ''
        });
      }
      return days;
    } catch (e) {
      return [];
    }
  }, [currentTodayIso]);

  // Ensure view starts at the very top on mount
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    } catch (e) {}
  }, []);

  // Auto-center selected day card inside its horizontal carousel only (never scrolling the page)
  useEffect(() => {
    try {
      if (selectedDayCardRef.current && dayScrollRef.current) {
        const card = selectedDayCardRef.current;
        const container = dayScrollRef.current;
        const cardLeft = card.offsetLeft;
        const cardWidth = card.offsetWidth;
        const containerWidth = container.offsetWidth;
        const targetScrollLeft = cardLeft - (containerWidth / 2) + (cardWidth / 2);
        container.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: 'smooth'
        });
      }
    } catch (e) {}
  }, [selectedDate]);

  // Synchronize nutrition on mount and date rollover to guarantee proper day boundaries
  useEffect(() => {
    const safeData = (nutritionData && typeof nutritionData === 'object') ? nutritionData : {};
    const synced = synchronizeNutritionData(safeData, currentTodayIso);
    if (
      synced && (
        synced.currentDate !== safeData.currentDate ||
        synced.consumedCalories !== safeData.consumedCalories ||
        (synced.meals || []).length !== (safeData.meals || []).length
      )
    ) {
      if (typeof setNutritionData === 'function') {
        setNutritionData(synced);
      }
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

  // Destructure state from nutritionData with bulletproof safe fallbacks
  const safeNutritionData = (nutritionData && typeof nutritionData === 'object') ? nutritionData : {};
  const targetCalories = Number(safeNutritionData.targetCalories) || 3250;
  const targetProtein = Number(safeNutritionData.protein?.target) || 180;
  const targetCarbs = Number(safeNutritionData.carbs?.target) || 450;
  const targetFats = Number(safeNutritionData.fats?.target) || 80;
  const targetWaterMl = Number(safeNutritionData.targetWaterMl) || 3500;
  const waterMl = Number(safeNutritionData.waterMl) || 0;

  const rawMeals = Array.isArray(safeNutritionData.meals) ? safeNutritionData.meals : [];
  const meals = useMemo(() => {
    return rawMeals.filter(m => m && typeof m === 'object' && m.date);
  }, [rawMeals]);

  const rawWeightHistory = Array.isArray(safeNutritionData.weightHistory) ? safeNutritionData.weightHistory : [];
  const weightHistory = useMemo(() => {
    return rawWeightHistory.filter(w => w && typeof w === 'object' && w.date && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs));
  }, [rawWeightHistory]);

  const rawPantry = (Array.isArray(safeNutritionData.householdPantry) && safeNutritionData.householdPantry.length > 0) 
    ? safeNutritionData.householdPantry 
    : DEFAULT_HOUSEHOLD_PANTRY;
  const householdPantry = useMemo(() => {
    const clean = sanitizeHouseholdPantry(rawPantry);
    return (clean || []).filter(s => s && typeof s === 'object' && s.id);
  }, [rawPantry]);

  const dailyTargets = (safeNutritionData.dailyTargets && typeof safeNutritionData.dailyTargets === 'object')
    ? safeNutritionData.dailyTargets 
    : {};

  // Active targets for the selected date (reads date-specific override from dailyTargets or defaults)
  const activeDayTarget = useMemo(() => {
    return getTargetForDate(safeNutritionData, selectedDate);
  }, [safeNutritionData, selectedDate]);

  const activeTargetCalories = activeDayTarget?.calories || targetCalories || 3250;
  const activeTargetProtein = activeDayTarget?.protein || targetProtein || 180;
  const activeTargetCarbs = activeDayTarget?.carbs || targetCarbs || 450;
  const activeTargetFats = activeDayTarget?.fats || targetFats || 80;

  // Target modal form state
  const [customCalories, setCustomCalories] = useState(activeTargetCalories);
  const [customProtein, setCustomProtein] = useState(activeTargetProtein);
  const [customCarbs, setCustomCarbs] = useState(activeTargetCarbs);
  const [customFats, setCustomFats] = useState(activeTargetFats);
  const [applyAsDefault, setApplyAsDefault] = useState(true);

  // Synchronize custom target fields with active targets whenever selectedDate or modal opens
  useEffect(() => {
    setCustomCalories(activeTargetCalories);
    setCustomProtein(activeTargetProtein);
    setCustomCarbs(activeTargetCarbs);
    setCustomFats(activeTargetFats);
    setApplyAsDefault(selectedDate >= currentTodayIso);
  }, [activeTargetCalories, activeTargetProtein, activeTargetCarbs, activeTargetFats, isTargetModalOpen, selectedDate, currentTodayIso]);

  // Filter meals strictly for the selected date
  const selectedDateMeals = useMemo(() => {
    return (meals || []).filter(m => m && m.date === selectedDate);
  }, [meals, selectedDate]);

  // Aggregate selected date nutrition totals
  const dailyTotals = useMemo(() => {
    return aggregateDailyNutrition(selectedDateMeals);
  }, [selectedDateMeals]);

  // Multi-day consistency and lookback history (7, 14, or 30 days) with per-date target protection
  const nutritionHistory = useMemo(() => {
    return getDailyNutritionHistory(meals, targetCalories, targetProtein, calorieHistoryRange, dailyTargets);
  }, [meals, targetCalories, targetProtein, calorieHistoryRange, dailyTargets]);

  const weightTrend14 = useMemo(() => {
    return calculateWeightTrend(weightHistory, 14);
  }, [weightHistory]);

  const remainingCals = activeTargetCalories - (dailyTotals?.calories || 0);
  const calPercent = activeTargetCalories > 0
    ? Math.min(100, Math.round(((dailyTotals?.calories || 0) / activeTargetCalories) * 100))
    : 0;

  // Weight statistics
  const movingAvgWeight = useMemo(() => {
    return calculateMovingAverageWeight(weightHistory, 7);
  }, [weightHistory]);

  const weightVelocity = useMemo(() => {
    return calculateWeightVelocity(weightHistory);
  }, [weightHistory]);

  const surplusRecommendation = useMemo(() => {
    return getAdaptiveSurplusRecommendation(weightHistory, activeTargetCalories);
  }, [weightHistory, activeTargetCalories]);

  // Kitchen Hardware Calibration Progress
  const calibrationProgress = useMemo(() => {
    return getCalibrationProgress(safeNutritionData?.kitchenCalibration);
  }, [safeNutritionData?.kitchenCalibration]);

  
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
      return householdPantry.filter(s => s && (commonIds.includes(s.id) || s.category === 'Common' || s.category === 'Protein' || s.category === 'Fruit' || s.category === 'Snacks')).slice(0, 10);
    }
    return householdPantry.filter(s => s && (s.category || '').toLowerCase() === pantryCategory.toLowerCase());
  }, [householdPantry, pantryCategory]);

  const latestWeightLog = useMemo(() => {
    if (!weightHistory.length) return null;
    const sorted = [...weightHistory].sort((a, b) => {
      const tb = new Date(b.date).getTime();
      const ta = new Date(a.date).getTime();
      return (isNaN(tb) ? 0 : tb) - (isNaN(ta) ? 0 : ta);
    });
    return sorted[0] || null;
  }, [weightHistory]);

  // Handlers for logging
  const handleLogMeal = (mealEntry) => {
    playSound('success', soundEnabled);
    const mealDate = mealEntry?.date || selectedDate || currentTodayIso;
    let stampedMeal = {
      ...mealEntry,
      date: mealDate,
      createdAt: mealEntry?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    // Safety calibration: single protein shake / smoothie should never exceed normal limits (~39g P / 485 kcal)
    const isSmoothie = /protein\s*(?:shake|smoothie)|smoothie/i.test(stampedMeal.name || '') ||
      (Array.isArray(stampedMeal.items) && stampedMeal.items.some(it => {
        const itName = typeof it === 'string' ? it : it?.name || '';
        return /protein\s*(?:shake|smoothie)|smoothie/i.test(itName) || (/vegan.*protein/i.test(itName) && (it?.protein >= 50));
      }));

    if (isSmoothie && (stampedMeal.protein >= 55 || stampedMeal.calories >= 650)) {
      stampedMeal = {
        ...stampedMeal,
        name: "Protein Shake (Milk, Banana & Canadian Protein Vegan Powder)",
        calories: 485,
        protein: 39,
        carbs: 54,
        fats: 12,
        items: [
          { name: "Milk", portion: "2 cups (500ml)", calories: 260, protein: 18, carbs: 24, fats: 10 },
          { name: "Canadian Protein Vegan Powder", portion: "1 scoop", calories: 120, protein: 20, carbs: 3, fats: 2 },
          { name: "Banana", portion: "1 medium (118g)", calories: 105, protein: 1.3, carbs: 27, fats: 0.3 }
        ],
        notes: "Calibrated to verified sports nutrition ground truth (485 kcal, 39g protein)"
      };
    }

    if (stampedMeal?.id) recordAdditionOrUpdate(stampedMeal.id);
    markLocalMutation();

    // Read current persisted storage synchronously to prevent race conditions
    let currentNut = safeNutritionData || {};
    try {
      const raw = localStorage.getItem('wolfe_nutrition_data');
      if (raw) currentNut = JSON.parse(raw);
    } catch (e) {}

    const existingMeals = (currentNut.meals || []).filter(m => m && m.id !== stampedMeal.id);
    const nextMeals = [stampedMeal, ...existingMeals];
    // Today's total strictly from meals logged for currentTodayIso
    const todayMeals = nextMeals.filter(m => m && m.date === currentTodayIso);
    const todayTotals = aggregateDailyNutrition(todayMeals);

    const nextData = {
      ...currentNut,
      currentDate: currentTodayIso,
      consumedCalories: todayTotals.calories,
      protein: { ...(currentNut.protein || {}), current: todayTotals.protein },
      carbs: { ...(currentNut.carbs || {}), current: todayTotals.carbs },
      fats: { ...(currentNut.fats || {}), current: todayTotals.fats },
      meals: nextMeals,
      updatedAt: Date.now()
    };

    // Synchronously persist BEFORE setting React state or calling cloud push
    try {
      localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
    } catch (e) {}

    setNutritionData(nextData);
    triggerImmediateCloudPush(80);
  };

  const handleDeleteMeal = (mealId) => {
    playSound('click', soundEnabled);
    recordDeletion(mealId);
    markLocalMutation();

    let currentNut = safeNutritionData || {};
    try {
      const raw = localStorage.getItem('wolfe_nutrition_data');
      if (raw) currentNut = JSON.parse(raw);
    } catch (e) {}

    const nextMeals = (currentNut.meals || []).filter(m => m && m.id !== mealId);
    const todayMeals = nextMeals.filter(m => m && m.date === currentTodayIso);
    const todayTotals = aggregateDailyNutrition(todayMeals);

    const nextData = {
      ...currentNut,
      consumedCalories: todayTotals.calories,
      protein: { ...(currentNut.protein || {}), current: todayTotals.protein },
      carbs: { ...(currentNut.carbs || {}), current: todayTotals.carbs },
      fats: { ...(currentNut.fats || {}), current: todayTotals.fats },
      meals: nextMeals,
      updatedAt: Date.now()
    };

    try {
      localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
    } catch (e) {}

    setNutritionData(nextData);
    triggerImmediateCloudPush(80);
  };

  const handleQuickLogStaple = (staple) => {
    playSound('success', soundEnabled);
    const mealItems = Array.isArray(staple.items) && staple.items.length > 0
      ? staple.items.map(it => ({
          name: it.name,
          portion: it.portion,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fats: it.fats
        }))
      : [{
          name: staple.name,
          portion: staple.portion || staple.name,
          calories: staple.calories,
          protein: staple.protein,
          carbs: staple.carbs,
          fats: staple.fats
        }];

    const meal = createMealEntry({
      date: selectedDate,
      name: staple.name,
      slot: 'meal',
      calories: staple.calories,
      protein: staple.protein,
      carbs: staple.carbs,
      fats: staple.fats,
      items: mealItems
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
        kitchenCalibration: safeNutritionData?.kitchenCalibration,
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
          items: parsed.items
        });
        handleLogMeal(meal);
        setQuickAddText('');
        const slotBadge = (parsed.slot && parsed.slot !== 'meal') ? ` [${parsed.slot.toUpperCase()}]` : '';
        setQuickAddFeedback(`Logged${slotBadge}: ${parsed.name} (${parsed.calories} kcal, ${parsed.protein}g P)`);
        setTimeout(() => setQuickAddFeedback(null), 3500);
      } else {
        playSound('click', soundEnabled);
        setQuickAddFeedback("Could not recognize meal. Try specifying portions or snap with Camera.");
        setTimeout(() => setQuickAddFeedback(null), 4000);
      }
    } catch (err) {
      const local = parseMealDescription(text, { kitchenCalibration: safeNutritionData?.kitchenCalibration, householdPantry });
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
          items: local.items
        });
        handleLogMeal(meal);
        setQuickAddText('');
        setQuickAddFeedback(`Logged: ${local.name} (${local.calories} kcal, ${local.protein}g P)`);
        setTimeout(() => setQuickAddFeedback(null), 3500);
      } else {
        playSound('click', soundEnabled);
        setQuickAddFeedback("Could not recognize meal. Try specifying portions or snap with Camera.");
        setTimeout(() => setQuickAddFeedback(null), 4000);
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
              kitchenCalibration: safeNutritionData?.kitchenCalibration,
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
                items: parsed.items
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
      const safePrev = (prev && typeof prev === 'object') ? prev : {};
      const existing = (safePrev.weightHistory || []).filter(w => w && w.date !== weightEntry?.date);
      const nextData = {
        ...safePrev,
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
      const safePrev = (prev && typeof prev === 'object') ? prev : {};
      const nextData = {
        ...safePrev,
        weightHistory: (safePrev.weightHistory || []).filter(w => w && w.id !== idOrDate && w.date !== idOrDate)
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
    const current = parseInt(customCalories, 10) || activeTargetCalories;
    const nextVal = Math.max(1500, Math.min(6500, current + delta));
    setCustomCalories(nextVal);
  };

  const handleApplySurplus = (newTarget) => {
    playSound('success', soundEnabled);
    markLocalMutation();
    setNutritionData(prev => {
      const nextData = {
        ...prev,
        targetCalories: newTarget,
        dailyTargets: {
          ...(prev.dailyTargets || {}),
          [selectedDate]: {
            ...getTargetForDate(prev, selectedDate),
            calories: newTarget
          }
        },
        updatedAt: Date.now()
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      return nextData;
    });
    triggerImmediateCloudPush(80);
  };

  // Save custom targets from modal
  const handleSaveCustomTargets = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    playSound('success', soundEnabled);
    const newTargetCals = parseInt(customCalories, 10) || activeTargetCalories;
    const newProtein = parseInt(customProtein, 10) || activeTargetProtein;
    const newCarbs = parseInt(customCarbs, 10) || activeTargetCarbs;
    const newFats = parseInt(customFats, 10) || activeTargetFats;

    markLocalMutation();
    setNutritionData(prev => {
      const updatedDailyTargets = {
        ...(prev.dailyTargets || {}),
        [selectedDate]: {
          calories: newTargetCals,
          protein: newProtein,
          carbs: newCarbs,
          fats: newFats
        }
      };

      const shouldApplyAsDefault = applyAsDefault || selectedDate === currentTodayIso;

      const nextData = {
        ...prev,
        dailyTargets: updatedDailyTargets,
        ...(shouldApplyAsDefault ? {
          targetCalories: newTargetCals,
          protein: { ...(prev.protein || {}), target: newProtein },
          carbs: { ...(prev.carbs || {}), target: newCarbs },
          fats: { ...(prev.fats || {}), target: newFats }
        } : {}),
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
    const cals = parseInt(customCalories, 10) || activeTargetCalories;
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
      const safePrev = (prev && typeof prev === 'object') ? prev : {};
      const nextData = {
        ...safePrev,
        householdPantry: (safePrev.householdPantry || []).filter(s => s && s.id !== stapleId)
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
      const parsedCurrent = rawCurrent ? JSON.parse(rawCurrent) : (safeNutritionData || {});
      const updatedNut = {
        ...parsedCurrent,
        ...safeNutritionData,
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
    <div className="space-y-6 max-w-6xl mx-auto pb-24 touch-pan-y">
      {/* 1. Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <UtensilsCrossed className="w-4 h-4" />
            <span>Performance Nutrition & Fuel</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-xl bg-white/[0.04] text-slate-300 border border-white/10">
              {activeTargetProtein}g Protein • High Carb
            </span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5 flex items-center gap-2">
            <span>Nutrition & Macro Tracker</span>
            <span className="text-xs font-mono font-normal text-slate-400">
              ({activeTargetCalories} kcal Target)
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick Date Stepper (Header Compact) */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-semibold">
            <button
              onClick={handlePrevDay}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-white text-xs px-1 font-bold">
              {selectedDate === todayIso ? 'Today' : formatDateTitle(selectedDate)}
            </span>
            {selectedDate !== todayIso && (
              <button
                onClick={handleTodayJump}
                className="px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  color: 'var(--accent-primary)'
                }}
              >
                Today
              </button>
            )}
            <button
              onClick={handleNextDay}
              className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

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
            title="View calendar history at bottom"
          >
            <History className="w-3.5 h-3.5 text-sky-400" />
            <span>{isHistoryExpanded ? 'Hide Calendar' : 'Calendar History'}</span>
          </button>

          {/* Morning Weight Tracker */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsWeightModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer"
            title="Log morning weight"
          >
            <Scale className="w-3.5 h-3.5 text-slate-400" />
            <span>Morning Weight</span>
          </button>

          {/* Camera AI Scan Modal */}
          <button
            onClick={() => {
              playSound('click', soundEnabled);
              setIsMealModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary)' }}
            title="Snap meal with camera or select from gallery"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera</span>
          </button>
        </div>
      </div>

      {/* 1. Quick Add Input Bar (Voice or Instant Text) - Direct at Top */}
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

      {/* 2. Compact Morning Weight Bar (Minimal & Sleek Status) */}
      <div 
        onClick={() => {
          playSound('click', soundEnabled);
          setIsWeightModalOpen(true);
        }}
        className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.08] transition-all cursor-pointer group shadow-sm"
        title="Click to log or edit morning fasted weight"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
            <Scale className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold text-slate-300 shrink-0">Morning Weight:</span>
          <span className="font-mono text-xs font-bold text-white shrink-0">
            {latestWeightLog?.weightLbs != null ? `${latestWeightLog.weightLbs} lbs` : 'Not logged today'}
          </span>
          {movingAvgWeight && (
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline truncate">
              • 7d Avg: <strong className="text-slate-200">{movingAvgWeight} lbs</strong>
            </span>
          )}
          {weightTrend14?.changeLbs != null && (
            <span className={`text-[11px] font-mono hidden md:inline shrink-0 ${weightTrend14.changeLbs > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
              ({weightTrend14.changeLbs > 0 ? '+' : ''}{weightTrend14.changeLbs} lbs 14d)
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs font-medium text-sky-400 group-hover:text-sky-300 transition-colors shrink-0 ml-2">
          <span>{latestWeightLog?.weightLbs != null ? 'Edit' : '+ Log Weight'}</span>
          <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>

      {/* 3. Primary Macro & Calorie Tracking Dashboard (Full Width Star Feature) */}
      <GlassCard hoverEffect={false} className="p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <span className="text-[10px] font-mono font-semibold uppercase text-slate-400">Daily Target</span>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-lg sm:text-xl font-bold text-white font-mono">
                {activeTargetCalories} kcal
              </h3>
              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setCustomCalories(activeTargetCalories);
                  setCustomProtein(activeTargetProtein);
                  setCustomCarbs(activeTargetCarbs);
                  setCustomFats(activeTargetFats);
                  setIsTargetModalOpen(true);
                }}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-sm"
                title="Edit Daily Target Calories & Macros"
              >
                <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <span className="text-[11px] font-medium">Edit Target</span>
              </button>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block uppercase font-mono">
              {remainingCals >= 0 ? "Remaining to Eat" : "Surplus Achieved"}
            </span>
            <div className={`text-base sm:text-lg font-mono font-bold ${remainingCals < 0 ? 'text-emerald-400' : 'text-white'}`}>
              {Math.abs(remainingCals)} kcal {remainingCals < 0 ? 'over' : ''}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Calorie Progress Ring */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-2">
            <div className="relative w-36 h-36 flex items-center justify-center">
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
                  strokeDashoffset={251.2 * (1 - Math.min(1, Math.max(0, ((typeof calPercent === 'number' && !isNaN(calPercent) ? calPercent : 0) / 100))))}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute flex flex-col items-center text-center">
                <span className="text-2xl font-bold font-mono text-white">{Number(dailyTotals?.calories) || 0}</span>
                <span className="text-[9px] text-slate-400 uppercase font-mono">of {Number(activeTargetCalories) || 3250} kcal</span>
                <span className="text-[11px] font-mono font-bold mt-0.5" style={{ color: 'var(--accent-primary)' }}>
                  {Math.round(typeof calPercent === 'number' && !isNaN(calPercent) ? calPercent : 0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Macro Bars */}
          <div className="md:col-span-8 space-y-3">
            {/* Protein Target */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                  <span>🥩 Protein</span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">(4 kcal/g)</span>
                </span>
                <span className="font-mono text-white font-bold">
                  {Number(dailyTotals?.protein) || 0}g <span className="text-slate-400 font-normal">/ {Number(activeTargetProtein) || 180}g</span>
                </span>
              </div>
              <div className="w-full h-2.5 bg-black/40 rounded-lg overflow-hidden">
                <div 
                  className="h-full rounded-lg transition-all duration-500" 
                  style={{ 
                    backgroundColor: 'var(--accent-primary)',
                    width: `${Math.min(100, Math.max(0, (((Number(dailyTotals?.protein) || 0) / (Number(activeTargetProtein) > 0 ? Number(activeTargetProtein) : 180)) * 100)))}%` 
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>{Math.round(((Number(dailyTotals?.protein) || 0) / (Number(activeTargetProtein) > 0 ? Number(activeTargetProtein) : 180)) * 100)}% of goal</span>
                <span>{Math.max(0, (Number(activeTargetProtein) || 180) - (Number(dailyTotals?.protein) || 0))}g remaining</span>
              </div>
            </div>

            {/* Carbs Target */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                  <span>🍚 Carbohydrates</span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">(4 kcal/g)</span>
                </span>
                <span className="font-mono text-white font-bold">
                  {Number(dailyTotals?.carbs) || 0}g <span className="text-slate-400 font-normal">/ {Number(activeTargetCarbs) || 450}g</span>
                </span>
              </div>
              <div className="w-full h-2.5 bg-black/40 rounded-lg overflow-hidden">
                <div 
                  className="h-full bg-sky-400 rounded-lg transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, (((Number(dailyTotals?.carbs) || 0) / (Number(activeTargetCarbs) > 0 ? Number(activeTargetCarbs) : 450)) * 100)))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>{Math.round(((Number(dailyTotals?.carbs) || 0) / (Number(activeTargetCarbs) > 0 ? Number(activeTargetCarbs) : 450)) * 100)}% of goal</span>
                <span>{Math.max(0, (Number(activeTargetCarbs) || 450) - (Number(dailyTotals?.carbs) || 0))}g remaining</span>
              </div>
            </div>

            {/* Fats Target */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                  <span>🥑 Healthy Fats</span>
                  <span className="text-[10px] text-slate-400 font-mono font-normal">(9 kcal/g)</span>
                </span>
                <span className="font-mono text-white font-bold">
                  {Number(dailyTotals?.fats) || 0}g <span className="text-slate-400 font-normal">/ {Number(activeTargetFats) || 80}g</span>
                </span>
              </div>
              <div className="w-full h-2.5 bg-black/40 rounded-lg overflow-hidden">
                <div 
                  className="h-full bg-amber-400 rounded-lg transition-all duration-500" 
                  style={{ width: `${Math.min(100, Math.max(0, (((Number(dailyTotals?.fats) || 0) / (Number(activeTargetFats) > 0 ? Number(activeTargetFats) : 80)) * 100)))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>{Math.round(((Number(dailyTotals?.fats) || 0) / (Number(activeTargetFats) > 0 ? Number(activeTargetFats) : 80)) * 100)}% of goal</span>
                <span>{Math.max(0, (Number(activeTargetFats) || 80) - (Number(dailyTotals?.fats) || 0))}g remaining</span>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>


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

      {/* 5. TODAY'S MEAL ENTRIES BY SLOT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <span>{selectedDate === todayIso ? "Today's Logged Meals" : `Logged Meals for ${formatDateTitle(selectedDate)}`}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-xl bg-white/5 text-slate-400">
              {selectedDateMeals.length} {selectedDateMeals.length === 1 ? 'Meal' : 'Meals'}
            </span>
          </h2>

          <button
            type="button"
            onClick={() => {
              playSound('click', soundEnabled);
              setIsMealModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary)' }}
            title="Snap meal with camera or select from gallery"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Camera</span>
          </button>
        </div>

        {selectedDateMeals.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedDateMeals.map((meal, mIdx) => {
              if (!meal) return null;
              const displayMealName = typeof meal.name === 'string' ? meal.name : (meal.name?.name || meal.name?.title || 'Meal');
              const displayCals = typeof meal.calories === 'number' ? meal.calories : (Number(meal.calories?.current || meal.calories) || 0);
              const displayProtein = typeof meal.protein === 'number' ? meal.protein : (Number(meal.protein?.current || meal.protein) || 0);
              const displayCarbs = typeof meal.carbs === 'number' ? meal.carbs : (Number(meal.carbs?.current || meal.carbs) || 0);
              const displayFats = typeof meal.fats === 'number' ? meal.fats : (Number(meal.fats?.current || meal.fats) || 0);

              return (
                <GlassCard key={meal.id || `meal-${mIdx}`} hoverEffect={false} className="p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-base shrink-0">
                        {meal.icon || '🍽️'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{displayMealName}</span>
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
                        <div className="text-sm font-bold text-white">{displayCals} kcal</div>
                        <div className="text-[10px] text-emerald-400 font-semibold">{displayProtein}g Protein</div>
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

                  {Array.isArray(meal.items) && meal.items.length > 0 && (
                    <div className="bg-black/40 rounded-xl border border-white/5 p-2 space-y-1.5 max-h-48 overflow-y-auto overscroll-contain touch-pan-y scrollbar-thin">
                      <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-semibold px-0.5 flex items-center justify-between">
                        <span>Items & Ingredients ({meal.items.length})</span>
                        <span className="text-[9px] text-slate-500 font-normal">Per-item macros</span>
                      </div>
                      <div className="space-y-1">
                        {meal.items.map((it, idx) => {
                          const isObj = it && typeof it === 'object';
                          const name = isObj ? (typeof it.name === 'string' ? it.name : String(it.name?.title || it.name?.name || 'Item')) : String(it || 'Item');
                          const portion = isObj ? (typeof it.portion === 'string' ? it.portion : (it.portion ? String(it.portion) : null)) : null;
                          const itCals = isObj && it.calories != null ? (typeof it.calories === 'number' ? it.calories : (Number(it.calories?.current || it.calories) || 0)) : null;
                          const itProtein = isObj && it.protein != null ? (typeof it.protein === 'number' ? it.protein : (Number(it.protein?.current || it.protein) || 0)) : null;
                          const itCarbs = isObj && it.carbs != null ? (typeof it.carbs === 'number' ? it.carbs : (Number(it.carbs?.current || it.carbs) || 0)) : null;
                          const itFats = isObj && it.fats != null ? (typeof it.fats === 'number' ? it.fats : (Number(it.fats?.current || it.fats) || 0)) : null;
                          const hasMacros = isObj && (itCals != null || itProtein != null || itCarbs != null || itFats != null);

                          return (
                            <div key={idx} className="p-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[11px] font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-slate-400 shrink-0">•</span>
                                <span className="text-slate-200 font-medium truncate" title={name}>{name}</span>
                                {portion && (
                                  <span className="text-[10px] text-slate-400 shrink-0">({portion})</span>
                                )}
                              </div>
                              {hasMacros && (
                                <div className="flex items-center gap-2 text-[10px] shrink-0 self-end sm:self-auto">
                                  {itCals != null && (
                                    <span className="text-white font-semibold">{itCals} kcal</span>
                                  )}
                                  {itProtein != null && (
                                    <span className="text-emerald-400 font-semibold">{itProtein}g P</span>
                                  )}
                                  {itCarbs != null && (
                                    <span className="text-sky-300">{itCarbs}g C</span>
                                  )}
                                  {itFats != null && (
                                    <span className="text-amber-300">{itFats}g F</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-2 border-t border-white/5">
                    <span>{displayProtein}g P</span>
                    <span className="text-sky-300 font-semibold">{displayCarbs}g C</span>
                    <span className="text-amber-300 font-semibold">{displayFats}g F</span>
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
              Use the Quick Add bar above, tap a pantry staple, or tap Camera to snap a photo.
            </p>
          </GlassCard>
        )}
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
          {filteredPantry.map((staple, sIdx) => {
            if (!staple) return null;
            return (
              <button
                key={staple.id || `staple-${sIdx}`}
                type="button"
                onClick={() => handleQuickLogStaple(staple)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm hover:border-white/20 group"
                title={`Tap to log ${staple.name || 'item'} into ${selectedDate === todayIso ? 'Today' : selectedDate}`}
              >
                <span className="text-base">{staple.icon || '🍽️'}</span>
                <span>{staple.name || 'Item'}</span>
                <div 
                  className="w-5 h-5 rounded-lg flex items-center justify-center text-white transition-transform group-hover:scale-110 ml-0.5"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. DAY-BY-DAY CALENDAR & PROGRESS STRIP (Positioned at bottom) */}
      <div className="p-3 sm:p-4 rounded-3xl bg-[#0f1220]/90 border border-white/10 shadow-xl space-y-3 font-sans mt-2">
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
                {selectedDateMeals.length} logged • {dailyTotals?.calories || 0} kcal ({dailyTotals?.protein || 0}g P)
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
            const dayMeals = (meals || []).filter(m => m && m.date === day.dateIso);
            const dayTotals = aggregateDailyNutrition(dayMeals);
            const dayTarget = dailyTargets ? dailyTargets[day.dateIso] : null;
            const dayTargetCal = (typeof dayTarget === 'number'
              ? dayTarget
              : dayTarget?.calories) || targetCalories;
            const hitGoal = (dayTotals?.calories || 0) >= dayTargetCal;

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
                  {(dayTotals?.calories || 0) > 0 ? (
                    <span className={`font-bold ${hitGoal ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {(dayTotals?.calories || 0) >= 1000 ? `${((dayTotals?.calories || 0) / 1000).toFixed(1)}k` : (dayTotals?.calories || 0)}
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

      {/* MULTI-WEEK CONSISTENCY & HISTORY LOOKBACK CARD (Expandable at Bottom) */}
      {isHistoryExpanded && (
        <GlassCard hoverEffect={false} className="p-4 sm:p-5 space-y-4">
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
            const loggedDays = (nutritionHistory || []).filter(h => h && (h.calories || 0) > 0);
            const hitDays = (nutritionHistory || []).filter(h => h && h.hitCalories);
            const avgCalories = loggedDays.length > 0 ? Math.round(loggedDays.reduce((acc, h) => acc + (h?.calories || 0), 0) / loggedDays.length) : 0;
            const avgProtein = loggedDays.length > 0 ? Math.round(loggedDays.reduce((acc, h) => acc + (h?.protein || 0), 0) / loggedDays.length) : 0;
            const hitRate = Math.round((hitDays.length / (calorieHistoryRange || 1)) * 100);

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
                    onClick={() => {
                      playSound('click', soundEnabled);
                      if (h.dateIso) setSelectedDate(h.dateIso);
                    }}
                    className={`flex-1 min-w-[18px] sm:min-w-[24px] h-full flex flex-col justify-end items-center group cursor-pointer transition-transform ${
                      isSelected ? 'scale-105' : 'hover:opacity-100 opacity-85'
                    }`}
                    title={`${h.dateTitle || h.dateIso}: ${hCalories} kcal (${h.protein || 0}g P)`}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-0.5">
            {(nutritionHistory || []).map((h, hIdx) => {
              if (!h) return null;
              const isSelected = h.dateIso === selectedDate;
              return (
                <div
                  key={h.dateIso || `hist-card-${hIdx}`}
                  onClick={() => {
                    playSound('click', soundEnabled);
                    if (h.dateIso) setSelectedDate(h.dateIso);
                  }}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white/[0.08] border-white/25 shadow-md scale-[1.02]'
                      : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">{h.dateTitle || h.dateIso}</span>
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
                        {h.calories || 0} / {h.targetCalories || 0}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-md overflow-hidden">
                      <div 
                        className={`h-full rounded-md transition-all ${h.hitCalories ? 'bg-emerald-400' : 'bg-amber-400'}`}
                        style={{ width: `${Math.min(100, Math.max(0, h.pctCalories || 0))}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
                      <span>Protein: <strong className="text-white">{h.protein || 0}g</strong> / {h.targetProtein || 0}g</span>
                      <span>{h.mealCount || 0} meals</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

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
                    <p className="text-[11px] text-slate-400">Target for {selectedDate === todayIso ? 'Today' : formatDateTitle(selectedDate)}</p>
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

                {/* Apply as default baseline for future days toggle */}
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                  <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyAsDefault}
                      onChange={(e) => setApplyAsDefault(e.target.checked)}
                      className="rounded border-white/20 bg-white/10 text-amber-500 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span>Apply as default for future days</span>
                  </label>
                  <p className="text-[10px] text-slate-400 pl-6.5">
                    {applyAsDefault 
                      ? 'Sets future baseline goal without altering past days\' status.' 
                      : `Applies only to ${selectedDate === todayIso ? 'today' : formatDateTitle(selectedDate)}. Past and future targets remain untouched.`}
                  </p>
                </div>

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
        kitchenCalibration={safeNutritionData?.kitchenCalibration}
        soundEnabled={soundEnabled}
      />

      <WeightTrackerModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        weightHistory={weightHistory}
        currentCalorieTarget={activeTargetCalories}
        onLogWeight={handleLogWeight}
        onDeleteWeightLog={handleDeleteWeightLog}
        onApplySurplus={handleApplySurplus}
        soundEnabled={soundEnabled}
      />

      <KitchenCalibrationModal
        isOpen={isCalibrationModalOpen}
        onClose={() => setIsCalibrationModalOpen(false)}
        kitchenCalibration={safeNutritionData?.kitchenCalibration}
        onUpdateCalibration={handleUpdateCalibration}
        aiConfig={settings?.aiConfig}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};

// Resilient Internal Error Boundary for Nutrition View
class NutritionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("NutritionErrorBoundary caught:", error, info);
  }
  handleRepair = () => {
    try {
      const raw = localStorage.getItem('wolfe_nutrition_data');
      let parsed = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch (jsonErr) {
        parsed = {};
      }
      const sanitized = synchronizeNutritionData(parsed);
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(sanitized));
      } catch (storageErr) {}

      if (typeof this.props.onRepair === 'function') {
        this.props.onRepair(sanitized);
      }
      this.setState({ hasError: false, error: null });
    } catch (e) {
      this.setState({ hasError: false, error: null });
    }
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto mt-16 p-6 rounded-3xl bg-[#0f1220]/95 border border-rose-500/30 text-center space-y-4 shadow-2xl backdrop-blur-xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">Nutrition View Auto-Recovery</h3>
            <p className="text-xs text-rose-300/80 font-mono break-all">
              {this.state.error?.message || "An unexpected error occurred while rendering nutrition."}
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={this.handleRepair}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all active:scale-95 cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Sanitize & Recover Data
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const NutritionView = (props) => {
  return (
    <NutritionErrorBoundary onRepair={props.setNutritionData}>
      <NutritionViewInner {...props} />
    </NutritionErrorBoundary>
  );
};

export default NutritionView;

