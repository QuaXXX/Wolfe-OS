import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UtensilsCrossed, 
  X, 
  Plus, 
  Check, 
  Sparkles, 
  Flame, 
  Clock, 
  Layers,
  ChefHat,
  Trash2,
  BookmarkPlus
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { MEAL_SLOTS, calculateCaloriesFromMacros, createMealEntry } from '../../utils/nutritionEngine.js';

export const MealLogModal = ({
  isOpen,
  onClose,
  onLogMeal,
  onAddHouseholdStaple,
  onDeleteHouseholdStaple,
  householdPantry = [],
  soundEnabled = true
}) => {
  const [activeTab, setActiveTab] = useState('pantry'); // 'pantry' | 'manual' | 'add_staple'
  
  // Manual entry state
  const [mealSlot, setMealSlot] = useState('lunch');
  const [mealName, setMealName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fats, setFats] = useState('');
  const [itemsNote, setItemsNote] = useState('');

  // New staple state
  const [newStapleName, setNewStapleName] = useState('');
  const [newStaplePortion, setNewStaplePortion] = useState('');
  const [newStapleCals, setNewStapleCals] = useState('');
  const [newStapleP, setNewStapleP] = useState('');
  const [newStapleC, setNewStapleC] = useState('');
  const [newStapleF, setNewStapleF] = useState('');
  const [newStapleIcon, setNewStapleIcon] = useState('🥩');

  // Pantry multiplier state
  const [pantryMultiplier, setPantryMultiplier] = useState({});

  if (!isOpen) return null;

  // Auto-calculated calories if user only types macros
  const autoCals = calculateCaloriesFromMacros(protein, carbs, fats);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    const p = Math.max(0, parseInt(protein, 10) || 0);
    const c = Math.max(0, parseInt(carbs, 10) || 0);
    const f = Math.max(0, parseInt(fats, 10) || 0);
    const rawCal = parseInt(calories, 10) || 0;
    const finalCals = rawCal > 0 ? rawCal : calculateCaloriesFromMacros(p, c, f);

    if (finalCals <= 0 && p === 0 && c === 0 && f === 0) {
      return;
    }

    playSound('success', soundEnabled);
    const entry = createMealEntry({
      name: mealName.trim() || `${mealSlot.toUpperCase()} Meal`,
      slot: mealSlot,
      calories: finalCals,
      protein: p,
      carbs: c,
      fats: f,
      items: itemsNote ? itemsNote.split(',').map(s => s.trim()) : [mealName.trim() || 'Custom Meal']
    });

    onLogMeal(entry);
    onClose();
  };

  const handleLogPantryStaple = (staple) => {
    playSound('success', soundEnabled);
    const qty = pantryMultiplier[staple.id] || 1;
    const entry = createMealEntry({
      name: qty > 1 ? `${qty}x ${staple.name}` : staple.name,
      slot: mealSlot,
      calories: staple.calories * qty,
      protein: staple.protein * qty,
      carbs: staple.carbs * qty,
      fats: staple.fats * qty,
      items: [`${qty > 1 ? `${qty}x ` : ''}${staple.portion || staple.name}`]
    });

    onLogMeal(entry);
    onClose();
  };

  const handleCreateStaple = (e) => {
    e.preventDefault();
    if (!newStapleName.trim()) return;

    playSound('success', soundEnabled);
    const p = Math.max(0, parseInt(newStapleP, 10) || 0);
    const c = Math.max(0, parseInt(newStapleC, 10) || 0);
    const f = Math.max(0, parseInt(newStapleF, 10) || 0);
    const cals = parseInt(newStapleCals, 10) || calculateCaloriesFromMacros(p, c, f);

    const newStaple = {
      id: `custom-staple-${Date.now()}`,
      name: newStapleName.trim(),
      portion: newStaplePortion.trim() || '1 serving',
      calories: cals,
      protein: p,
      carbs: c,
      fats: f,
      icon: newStapleIcon || '🍴'
    };

    if (onAddHouseholdStaple) {
      onAddHouseholdStaple(newStaple);
    }
    setActiveTab('pantry');
  };

  const quickAddMacro = (macroType, amount) => {
    playSound('click', soundEnabled);
    if (macroType === 'protein') setProtein(prev => String((parseInt(prev, 10) || 0) + amount));
    if (macroType === 'carbs') setCarbs(prev => String((parseInt(prev, 10) || 0) + amount));
    if (macroType === 'fats') setFats(prev => String((parseInt(prev, 10) || 0) + amount));
    if (macroType === 'cals') setCalories(prev => String((parseInt(prev, 10) || 0) + amount));
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
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04]"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <UtensilsCrossed className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Log Food & Fuel</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    Daily Tracker
                  </span>
                </h3>
                <p className="text-xs text-slate-400">1-Tap household staples or custom manual entry</p>
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

          {/* Meal Slot Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Meal Slot
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {MEAL_SLOTS.map(slot => {
                const active = mealSlot === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setMealSlot(slot.id);
                    }}
                    className={`py-2 px-1 rounded-xl text-center flex flex-col items-center justify-center gap-1 border transition-all cursor-pointer ${
                      active
                        ? 'bg-white/10 border-white/30 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                    }`}
                  >
                    <span className="text-sm">{slot.icon}</span>
                    <span className="text-[10px] font-medium leading-tight truncate w-full px-0.5">{(slot.label || slot.name || slot.id || '').split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setActiveTab('pantry');
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'pantry'
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🏠 Kitchen Staples</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setActiveTab('manual');
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'manual'
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>⚡ Manual & Quick Add</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setActiveTab('add_staple');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                activeTab === 'add_staple'
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Add a custom staple food from your house"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Staple</span>
            </button>
          </div>

          {/* TAB 1: HOUSEHOLD PANTRY STAPLES */}
          {activeTab === 'pantry' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Tap any staple to log it instantly to your {MEAL_SLOTS.find(s => s.id === mealSlot)?.name}:</span>
                <span className="font-mono text-emerald-400">{householdPantry.length} items available</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                {householdPantry.map((staple) => {
                  const qty = pantryMultiplier[staple.id] || 1;
                  return (
                    <div
                      key={staple.id}
                      className="p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 transition-all flex flex-col justify-between space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{staple.icon || '🍴'}</span>
                          <div>
                            <div className="text-xs font-bold text-white leading-snug">{staple.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{staple.portion}</div>
                          </div>
                        </div>

                        {onDeleteHouseholdStaple && staple.id.startsWith('custom-') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playSound('click', soundEnabled);
                              onDeleteHouseholdStaple(staple.id);
                            }}
                            className="p-1 rounded text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete custom staple"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      {/* Macros */}
                      <div className="grid grid-cols-4 gap-1 text-center bg-black/40 py-1.5 px-2 rounded-xl border border-white/5 font-mono text-[10px]">
                        <div>
                          <div className="text-white font-bold">{staple.calories * qty}</div>
                          <div className="text-slate-500 text-[9px]">kcal</div>
                        </div>
                        <div>
                          <div className="text-indigo-300 font-semibold">{staple.protein * qty}g</div>
                          <div className="text-slate-500 text-[9px]">P</div>
                        </div>
                        <div>
                          <div className="text-sky-300 font-semibold">{staple.carbs * qty}g</div>
                          <div className="text-slate-500 text-[9px]">C</div>
                        </div>
                        <div>
                          <div className="text-amber-300 font-semibold">{staple.fats * qty}g</div>
                          <div className="text-slate-500 text-[9px]">F</div>
                        </div>
                      </div>

                      {/* Controls: Multiplier & Quick Log */}
                      <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                        <div className="flex items-center bg-black/50 rounded-lg border border-white/10 px-1 text-[11px] font-mono">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPantryMultiplier(prev => ({
                                ...prev,
                                [staple.id]: Math.max(1, (prev[staple.id] || 1) - 1)
                              }));
                            }}
                            className="px-1.5 text-slate-400 hover:text-white"
                          >
                            -
                          </button>
                          <span className="px-1 text-white font-bold">{qty}x</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPantryMultiplier(prev => ({
                                ...prev,
                                [staple.id]: (prev[staple.id] || 1) + 1
                              }));
                            }}
                            className="px-1.5 text-slate-400 hover:text-white"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleLogPantryStaple(staple)}
                          className="flex-1 py-1.5 px-2 rounded-lg text-white font-semibold text-[11px] shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer"
                          style={{ backgroundColor: 'var(--accent-primary)' }}
                        >
                          <Plus className="w-3 h-3" />
                          <span>Log {qty > 1 ? `(${qty}x)` : 'Now'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 2: MANUAL & QUICK ADD */}
          {activeTab === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-white">Meal / Food Description</label>
                <input
                  type="text"
                  value={mealName}
                  onChange={(e) => setMealName(e.target.value)}
                  placeholder="e.g. 8oz Ribeye Steak & Baked Potato"
                  className="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-600 outline-none focus:border-white/30 font-sans"
                />
              </div>

              {/* Macro Input Fields */}
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400 block truncate">Calories</label>
                  <input
                    type="number"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    placeholder={autoCals > 0 ? String(autoCals) : "kcal"}
                    className="w-full px-2.5 py-2 rounded-xl bg-black/50 border border-white/15 text-xs font-mono font-bold text-white placeholder:text-slate-600 outline-none focus:border-white/30 text-center"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-indigo-300 block truncate">Protein (g)</label>
                  <input
                    type="number"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    placeholder="0g"
                    className="w-full px-2.5 py-2 rounded-xl bg-black/50 border border-indigo-500/30 text-xs font-mono font-bold text-indigo-300 placeholder:text-slate-600 outline-none focus:border-indigo-500/50 text-center"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-sky-300 block truncate">Carbs (g)</label>
                  <input
                    type="number"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    placeholder="0g"
                    className="w-full px-2.5 py-2 rounded-xl bg-black/50 border border-sky-500/30 text-xs font-mono font-bold text-sky-300 placeholder:text-slate-600 outline-none focus:border-sky-500/50 text-center"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-amber-300 block truncate">Fats (g)</label>
                  <input
                    type="number"
                    value={fats}
                    onChange={(e) => setFats(e.target.value)}
                    placeholder="0g"
                    className="w-full px-2.5 py-2 rounded-xl bg-black/50 border border-amber-500/30 text-xs font-mono font-bold text-amber-300 placeholder:text-slate-600 outline-none focus:border-amber-500/50 text-center"
                  />
                </div>
              </div>

              {/* Quick Numpad Boosters */}
              <div className="p-2.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">⚡ Quick Macro Increments:</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => quickAddMacro('protein', 25)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono font-semibold active:scale-95"
                  >
                    +25g Protein
                  </button>
                  <button
                    type="button"
                    onClick={() => quickAddMacro('protein', 40)}
                    className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-mono font-semibold active:scale-95"
                  >
                    +40g Protein
                  </button>
                  <button
                    type="button"
                    onClick={() => quickAddMacro('carbs', 50)}
                    className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-mono font-semibold active:scale-95"
                  >
                    +50g Carbs
                  </button>
                  <button
                    type="button"
                    onClick={() => quickAddMacro('carbs', 100)}
                    className="px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 text-[11px] font-mono font-semibold active:scale-95"
                  >
                    +100g Carbs
                  </button>
                  <button
                    type="button"
                    onClick={() => quickAddMacro('cals', 300)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-[11px] font-mono font-semibold active:scale-95"
                  >
                    +300 kcal
                  </button>
                  <button
                    type="button"
                    onClick={() => quickAddMacro('cals', 500)}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-[11px] font-mono font-semibold active:scale-95"
                  >
                    +500 kcal
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-white font-semibold text-xs shadow-lg transition-all active:scale-[0.98] cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                Log Meal to Daily Tracker
              </button>
            </form>
          )}

          {/* TAB 3: CREATE CUSTOM HOUSEHOLD STAPLE */}
          {activeTab === 'add_staple' && (
            <form onSubmit={handleCreateStaple} className="space-y-3">
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Permanent Household Staple</span>
                </div>
                <p className="text-[11px] text-slate-300/90 leading-relaxed">
                  Add food items you keep stocked in your house (e.g. Fairlife Milk, specific protein bars, batch rice cooker portions) for 1-tap logging.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-white">Item Name</label>
                  <input
                    type="text"
                    required
                    value={newStapleName}
                    onChange={(e) => setNewStapleName(e.target.value)}
                    placeholder="e.g. Fairlife Chocolate Milk"
                    className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-600 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-white">Icon</label>
                  <input
                    type="text"
                    value={newStapleIcon}
                    onChange={(e) => setNewStapleIcon(e.target.value)}
                    placeholder="🥛"
                    className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-600 outline-none text-center"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-white">Portion / Serving Size</label>
                <input
                  type="text"
                  value={newStaplePortion}
                  onChange={(e) => setNewStaplePortion(e.target.value)}
                  placeholder="e.g. 1 cup (240ml), 2 scoops, 1 bar"
                  className="w-full px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder:text-slate-600 outline-none"
                />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">Calories</label>
                  <input
                    type="number"
                    value={newStapleCals}
                    onChange={(e) => setNewStapleCals(e.target.value)}
                    placeholder="kcal"
                    className="w-full px-2 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-mono font-bold text-white text-center"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-indigo-300">Protein</label>
                  <input
                    type="number"
                    value={newStapleP}
                    onChange={(e) => setNewStapleP(e.target.value)}
                    placeholder="g"
                    className="w-full px-2 py-1.5 rounded-xl bg-black/50 border border-indigo-500/30 text-xs font-mono font-bold text-indigo-300 text-center"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-sky-300">Carbs</label>
                  <input
                    type="number"
                    value={newStapleC}
                    onChange={(e) => setNewStapleC(e.target.value)}
                    placeholder="g"
                    className="w-full px-2 py-1.5 rounded-xl bg-black/50 border border-sky-500/30 text-xs font-mono font-bold text-sky-300 text-center"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-amber-300">Fats</label>
                  <input
                    type="number"
                    value={newStapleF}
                    onChange={(e) => setNewStapleF(e.target.value)}
                    placeholder="g"
                    className="w-full px-2 py-1.5 rounded-xl bg-black/50 border border-amber-500/30 text-xs font-mono font-bold text-amber-300 text-center"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 rounded-xl text-white font-semibold text-xs shadow-md transition-all active:scale-[0.98] cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                Save to Household Pantry
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
