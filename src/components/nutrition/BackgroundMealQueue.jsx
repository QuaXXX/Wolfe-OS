import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Check, 
  X, 
  Flame, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  Scale, 
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { createMealEntry } from '../../utils/nutritionEngine.js';
import { analyzeMealWithAI, scanNutritionLabelWithAI } from '../../utils/aiService.js';

/**
 * Hook to manage background meal intelligence queue.
 * Guarantees strict data isolation per task so concurrent AI analyses
 * NEVER overlap, collide, or mix up food data.
 */
export function useBackgroundMealQueue({
  onLogMeal,
  aiConfig = {},
  kitchenCalibration = null,
  householdPantry = null,
  soundEnabled = true
}) {
  const [tasks, setTasks] = useState([]);
  const tasksRef = useRef([]);
  tasksRef.current = tasks;

  // Add and start an isolated background analysis task
  const queueMeal = useCallback(({
    description = '',
    imageBase64 = null,
    mimeType = 'image/jpeg',
    selectedDate = null
  }) => {
    const cleanDesc = (description || '').trim();
    if (!cleanDesc && !imageBase64) return null;

    const taskId = `bg-meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const taskTitle = cleanDesc || (imageBase64 ? 'Scanned Meal Photo' : 'Logged Meal');

    const newTask = {
      id: taskId,
      title: taskTitle,
      description: cleanDesc,
      imageBase64,
      mimeType,
      selectedDate,
      status: 'thinking', // 'thinking' | 'ready' | 'error'
      createdAt: Date.now(),
      result: null,
      error: null,
      portionScale: 1.0,
      isEditing: false,
      editedName: taskTitle,
      editedCalories: '',
      editedProtein: '',
      editedCarbs: '',
      editedFats: ''
    };

    setTasks(prev => [newTask, ...prev]);
    playSound('click', soundEnabled);

    // Run AI analysis detached in background with strict parameter isolation
    (async () => {
      try {
        const result = await analyzeMealWithAI({
          imageBase64,
          mimeType,
          description: cleanDesc,
          aiConfig,
          kitchenCalibration,
          householdPantry
        });

        if (result && result.hasFood !== false && result.calories > 0) {
          const finalTitle = result.name || taskTitle;
          setTasks(prev => prev.map(t => {
            if (t.id !== taskId) return t;
            return {
              ...t,
              status: 'ready',
              title: finalTitle,
              result: { ...result, _originalItems: result.items },
              editedName: finalTitle,
              editedCalories: String(result.calories),
              editedProtein: String(result.protein),
              editedCarbs: String(result.carbs),
              editedFats: String(result.fats)
            };
          }));
          playSound('success', soundEnabled);
          return;
        }

        // Image nutrition label fallback
        if (imageBase64) {
          const labelResult = await scanNutritionLabelWithAI({
            imageBase64,
            mimeType,
            aiConfig
          });

          if (labelResult.hasLabel) {
            const labelTitle = labelResult.productName || "Scanned Food Item";
            const labelItems = [
              {
                name: labelTitle,
                portion: labelResult.servingSize || "1 serving",
                estimatedGrams: 0,
                calories: labelResult.calories || 0,
                protein: labelResult.protein || 0,
                carbs: labelResult.carbs || 0,
                fats: labelResult.fats || 0
              }
            ];
            const labelMeal = {
              name: labelTitle,
              items: labelItems,
              _originalItems: labelItems,
              calories: labelResult.calories || 0,
              protein: labelResult.protein || 0,
              carbs: labelResult.carbs || 0,
              fats: labelResult.fats || 0,
              notes: "Nutrition Facts label scanned accurately"
            };

            setTasks(prev => prev.map(t => {
              if (t.id !== taskId) return t;
              return {
                ...t,
                status: 'ready',
                title: labelTitle,
                result: labelMeal,
                editedName: labelTitle,
                editedCalories: String(labelMeal.calories),
                editedProtein: String(labelMeal.protein),
                editedCarbs: String(labelMeal.carbs),
                editedFats: String(labelMeal.fats)
              };
            }));
            playSound('success', soundEnabled);
            return;
          }
        }

        setTasks(prev => prev.map(t => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            status: 'error',
            error: result?.errorMessage || "No food or nutrition label was detected."
          };
        }));
        playSound('alert', soundEnabled);
      } catch (err) {
        setTasks(prev => prev.map(t => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            status: 'error',
            error: "Meal analysis failed. Please try again."
          };
        }));
        playSound('alert', soundEnabled);
      }
    })();

    return taskId;
  }, [aiConfig, kitchenCalibration, householdPantry, soundEnabled]);

  // Cancel / Dismiss a task
  const cancelTask = useCallback((taskId) => {
    playSound('click', soundEnabled);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, [soundEnabled]);

  // Confirm and log a ready task
  const confirmTask = useCallback((taskId) => {
    const task = tasksRef.current.find(t => t.id === taskId);
    if (!task || task.status !== 'ready' || !task.result) return;

    playSound('success', soundEnabled);

    // Apply any user edits if edited
    const mealName = (task.editedName || task.result.name || task.title || "Logged Meal").trim();
    const finalCals = task.editedCalories !== '' && !isNaN(Number(task.editedCalories))
      ? Math.round(Number(task.editedCalories))
      : task.result.calories;
    const finalP = task.editedProtein !== '' && !isNaN(Number(task.editedProtein))
      ? Math.round(Number(task.editedProtein) * 10) / 10
      : task.result.protein;
    const finalC = task.editedCarbs !== '' && !isNaN(Number(task.editedCarbs))
      ? Math.round(Number(task.editedCarbs) * 10) / 10
      : task.result.carbs;
    const finalF = task.editedFats !== '' && !isNaN(Number(task.editedFats))
      ? Math.round(Number(task.editedFats) * 10) / 10
      : task.result.fats;

    const rawItems = Array.isArray(task.result.items) ? task.result.items : [];
    const mealItems = rawItems.map(it => typeof it === 'object' && it ? {
      name: it.name || 'Item',
      portion: it.portion || '1 serving',
      calories: Number(it.calories) || 0,
      protein: Number(it.protein) || 0,
      carbs: Number(it.carbs) || 0,
      fats: Number(it.fats) || 0
    } : it);

    const meal = createMealEntry({
      date: task.selectedDate,
      name: mealName,
      calories: finalCals,
      protein: finalP,
      carbs: finalC,
      fats: finalF,
      items: mealItems
    });

    if (onLogMeal) {
      onLogMeal(meal);
    }

    // Remove from queue
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, [onLogMeal, soundEnabled]);

  // Scale portion of a ready task
  const scaleTaskPortion = useCallback((taskId, multiplier) => {
    playSound('click', soundEnabled);
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId || !t.result) return t;
      const baseItems = t.result._originalItems || t.result.items || [];
      const scaledItems = baseItems.map(it => {
        const origCal = Number(it.calories) || 0;
        const origP = Number(it.protein) || 0;
        const origC = Number(it.carbs) || 0;
        const origF = Number(it.fats) || 0;
        const origG = Number(it.estimatedGrams) || 0;
        return {
          ...it,
          estimatedGrams: origG > 0 ? Math.round(origG * multiplier) : undefined,
          calories: Math.round(origCal * multiplier),
          protein: Math.round(origP * multiplier * 10) / 10,
          carbs: Math.round(origC * multiplier * 10) / 10,
          fats: Math.round(origF * multiplier * 10) / 10,
        };
      });

      const nextCals = Math.round(scaledItems.reduce((acc, it) => acc + (it.calories || 0), 0));
      const nextP = Math.round(scaledItems.reduce((acc, it) => acc + (it.protein || 0), 0) * 10) / 10;
      const nextC = Math.round(scaledItems.reduce((acc, it) => acc + (it.carbs || 0), 0) * 10) / 10;
      const nextF = Math.round(scaledItems.reduce((acc, it) => acc + (it.fats || 0), 0) * 10) / 10;

      return {
        ...t,
        portionScale: multiplier,
        result: {
          ...t.result,
          items: scaledItems,
          calories: nextCals,
          protein: nextP,
          carbs: nextC,
          fats: nextF
        },
        editedCalories: String(nextCals),
        editedProtein: String(nextP),
        editedCarbs: String(nextC),
        editedFats: String(nextF)
      };
    }));
  }, [soundEnabled]);

  // Remove single item from ready task
  const removeTaskItem = useCallback((taskId, itemIndex) => {
    playSound('click', soundEnabled);
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId || !t.result || !Array.isArray(t.result.items)) return t;
      const nextItems = t.result.items.filter((_, i) => i !== itemIndex);
      const nextOriginal = (t.result._originalItems || []).filter((_, i) => i !== itemIndex);
      const nextCals = Math.round(nextItems.reduce((acc, it) => acc + (Number(it.calories) || 0), 0));
      const nextP = Math.round(nextItems.reduce((acc, it) => acc + (Number(it.protein) || 0), 0) * 10) / 10;
      const nextC = Math.round(nextItems.reduce((acc, it) => acc + (Number(it.carbs) || 0), 0) * 10) / 10;
      const nextF = Math.round(nextItems.reduce((acc, it) => acc + (Number(it.fats) || 0), 0) * 10) / 10;

      return {
        ...t,
        result: {
          ...t.result,
          _originalItems: nextOriginal,
          items: nextItems,
          calories: nextCals,
          protein: nextP,
          carbs: nextC,
          fats: nextF
        },
        editedCalories: String(nextCals),
        editedProtein: String(nextP),
        editedCarbs: String(nextC),
        editedFats: String(nextF)
      };
    }));
  }, [soundEnabled]);

  // Update inline edit fields of a task
  const updateTaskEdits = useCallback((taskId, fields) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return { ...t, ...fields };
    }));
  }, []);

  return {
    tasks,
    queueMeal,
    cancelTask,
    confirmTask,
    scaleTaskPortion,
    removeTaskItem,
    updateTaskEdits
  };
}

/**
 * Floating notification UI for background tasks.
 * Renders ready meals as interactive cards with immediate Add, Cancel, and Edit actions.
 * Also shows background "Thinking" status indicator.
 */
export const BackgroundMealNotifications = ({
  tasks = [],
  onConfirmTask,
  onCancelTask,
  onScalePortion,
  onRemoveItem,
  onUpdateEdits,
  soundEnabled = true
}) => {
  if (typeof document === 'undefined') return null;

  const thinkingTasks = tasks.filter(t => t.status === 'thinking');
  const readyTasks = tasks.filter(t => t.status === 'ready');
  const errorTasks = tasks.filter(t => t.status === 'error');

  if (tasks.length === 0) return null;

  const content = (
    <div 
      className="fixed bottom-4 sm:bottom-6 right-3 sm:right-6 z-[200] flex flex-col items-end gap-3 pointer-events-none max-w-sm sm:max-w-md w-full px-2 sm:px-0"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)'
      }}
    >
      {/* 1. Background "Thinking" Indicator Pill */}
      <AnimatePresence>
        {thinkingTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-[#0c101c]/95 border border-white/15 shadow-[0_10px_35px_-5px_rgba(0,0,0,0.8)] backdrop-blur-xl select-none"
          >
            <div className="relative w-7 h-7 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div className="min-w-0 pr-1">
              <div className="text-xs font-bold text-white flex items-center gap-1.5 truncate">
                <span>AI Thinking</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-white/10 text-slate-300">
                  {thinkingTasks.length} {thinkingTasks.length === 1 ? 'meal' : 'meals'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[240px]">
                Calculating macros in background • will notify when ready
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Ready Meal Notification Cards */}
      <AnimatePresence>
        {readyTasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 20, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className="pointer-events-auto w-full rounded-3xl bg-[#0d121f]/95 border border-white/15 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.9)] backdrop-blur-2xl overflow-hidden select-none p-4 space-y-3.5"
            style={{
              boxShadow: '0 10px 40px -10px var(--accent-glow, rgba(99,102,241,0.25))'
            }}
          >
            {/* Header: Title, Ready Badge, Close Button */}
            <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center border border-white/10 shadow-inner shrink-0"
                  style={{ backgroundColor: 'var(--accent-subtle)' }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono uppercase font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Ready to Log
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white truncate max-w-[240px]">
                    {task.editedName || task.result?.name || task.title}
                  </h4>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onUpdateEdits(task.id, { isEditing: !task.isEditing })}
                  className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                    task.isEditing 
                      ? 'bg-white/15 text-white border-white/20' 
                      : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border-white/5'
                  }`}
                  title={task.isEditing ? "Done editing" : "Edit meal details"}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onCancelTask(task.id)}
                  className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
                  title="Cancel & dismiss meal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Editable Form (Toggled via Edit button) */}
            {task.isEditing ? (
              <div className="space-y-2 p-3 rounded-2xl bg-black/40 border border-white/10">
                <div>
                  <label className="text-[10px] font-mono uppercase text-slate-400 block mb-1">Meal Title</label>
                  <input
                    type="text"
                    value={task.editedName}
                    onChange={(e) => onUpdateEdits(task.id, { editedName: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-xl bg-white/[0.05] border border-white/10 text-white text-xs focus:outline-none focus:border-white/30"
                  />
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <div>
                    <label className="text-[9px] font-mono uppercase text-slate-400 block">Calories</label>
                    <input
                      type="number"
                      value={task.editedCalories}
                      onChange={(e) => onUpdateEdits(task.id, { editedCalories: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white font-mono text-xs text-center focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-mono uppercase text-slate-400 block">Protein</label>
                    <input
                      type="number"
                      step="0.1"
                      value={task.editedProtein}
                      onChange={(e) => onUpdateEdits(task.id, { editedProtein: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white font-mono text-xs text-center focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-mono uppercase text-slate-400 block">Carbs</label>
                    <input
                      type="number"
                      step="0.1"
                      value={task.editedCarbs}
                      onChange={(e) => onUpdateEdits(task.id, { editedCarbs: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white font-mono text-xs text-center focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-mono uppercase text-slate-400 block">Fats</label>
                    <input
                      type="number"
                      step="0.1"
                      value={task.editedFats}
                      onChange={(e) => onUpdateEdits(task.id, { editedFats: e.target.value })}
                      className="w-full px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white font-mono text-xs text-center focus:outline-none focus:border-white/30"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Macro Breakdown Grid */
              <div className="grid grid-cols-4 gap-2 text-center p-2.5 rounded-2xl bg-black/40 border border-white/5">
                <div>
                  <div className="text-[9px] uppercase font-mono text-slate-400">Calories</div>
                  <div className="text-sm font-bold text-white font-mono flex items-center justify-center gap-0.5">
                    <Flame className="w-3 h-3 text-amber-400" />
                    <span>{task.editedCalories || task.result?.calories}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-mono text-slate-400">Protein</div>
                  <div className="text-sm font-bold font-mono" style={{ color: 'var(--accent-primary)' }}>
                    {task.editedProtein || task.result?.protein}g
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-mono text-slate-400">Carbs</div>
                  <div className="text-sm font-bold text-white font-mono">
                    {task.editedCarbs || task.result?.carbs}g
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase font-mono text-slate-400">Fats</div>
                  <div className="text-sm font-bold text-white font-mono">
                    {task.editedFats || task.result?.fats}g
                  </div>
                </div>
              </div>
            )}

            {/* Quick Portion Multiplier (0.5x, 0.75x, 1x, 1.25x, 1.5x) */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-slate-400 font-mono">Portion:</span>
              <div className="flex items-center gap-1">
                {[0.5, 0.75, 1.0, 1.25, 1.5].map((mult) => (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => onScalePortion(task.id, mult)}
                    className={`px-1.5 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                      task.portionScale === mult
                        ? 'text-white shadow-sm'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/5'
                    }`}
                    style={task.portionScale === mult ? { backgroundColor: 'var(--accent-primary)' } : {}}
                  >
                    {mult}x
                  </button>
                ))}
              </div>
            </div>

            {/* Itemized Components Preview */}
            {task.result?.items && task.result.items.length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                {task.result.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded-xl bg-white/[0.02] border border-white/5 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0 pr-1">
                      <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--accent-primary)' }} />
                      <span className="font-medium text-slate-200 truncate">{item.name}</span>
                      {item.portion && (
                        <span className="text-[10px] font-mono text-slate-400 truncate">
                          ({item.portion})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-slate-300 text-[10px]">{item.calories} cal</span>
                      <button
                        type="button"
                        onClick={() => onRemoveItem(task.id, idx)}
                        className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                        title="Remove component"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions: Add / Cancel */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onCancelTask(task.id)}
                className="flex-1 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-semibold text-xs border border-white/10 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirmTask(task.id)}
                className="flex-1 py-2 rounded-xl text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Check className="w-4 h-4" />
                <span>Add to Log</span>
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* 3. Error Notification Cards */}
      <AnimatePresence>
        {errorTasks.map((task) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 15, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="pointer-events-auto w-full p-3.5 rounded-2xl bg-red-950/80 border border-red-500/30 shadow-2xl backdrop-blur-xl select-none space-y-2 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="font-bold text-white truncate max-w-[220px]">
                  {task.title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onCancelTask(task.id)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[11px] text-red-200">
              {task.error || "No food detected in this entry."}
            </p>
            <button
              type="button"
              onClick={() => onCancelTask(task.id)}
              className="w-full py-1.5 rounded-xl bg-white/10 text-white font-semibold text-xs hover:bg-white/15 transition-all cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  return createPortal(content, document.body);
};
