import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Settings, 
  Palette, 
  RotateCcw, 
  Flame, 
  Dumbbell, 
  Wheat, 
  Droplet,
  Volume2,
  VolumeX,
  Minimize2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Scale
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';

const COLOR_PRESETS = [
  { name: 'Emerald', hue: 150 },
  { name: 'Cyber Blue', hue: 222 },
  { name: 'Twilight Indigo', hue: 250 },
  { name: 'Royal Purple', hue: 280 },
];

export const SettingsModal = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  nutritionData,
  onUpdateTargets,
  soundEnabled = true
}) => {
  // Initialize targets from current nutritionData or fallbacks
  const currentTargetCals = Number(nutritionData?.targetCalories) || 3000;
  const currentProtein = Number(nutritionData?.protein?.target) || 180;
  const currentCarbs = Number(nutritionData?.carbs?.target) || 350;
  const currentFats = Number(nutritionData?.fats?.target) || 70;

  const [customCalories, setCustomCalories] = useState(currentTargetCals);
  const [customProtein, setCustomProtein] = useState(currentProtein);
  const [customCarbs, setCustomCarbs] = useState(currentCarbs);
  const [customFats, setCustomFats] = useState(currentFats);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomCalories(Number(nutritionData?.targetCalories) || 3000);
      setCustomProtein(Number(nutritionData?.protein?.target) || 180);
      setCustomCarbs(Number(nutritionData?.carbs?.target) || 350);
      setCustomFats(Number(nutritionData?.fats?.target) || 70);
      setSavedFeedback(false);
    }
  }, [isOpen, nutritionData]);

  if (!isOpen) return null;

  const currentHue = settings?.accentHue || 222;
  const isSoundOn = settings?.soundEnabled !== false;
  const isCompactOn = !!settings?.compactMode;

  // Macro calorie math
  const pCals = (customProtein || 0) * 4;
  const cCals = (customCarbs || 0) * 4;
  const fCals = (customFats || 0) * 9;
  const totalMacroCals = pCals + cCals + fCals;
  const calsDiff = totalMacroCals - (customCalories || 0);

  const pPct = totalMacroCals > 0 ? Math.round((pCals / totalMacroCals) * 100) : 0;
  const cPct = totalMacroCals > 0 ? Math.round((cCals / totalMacroCals) * 100) : 0;
  const fPct = totalMacroCals > 0 ? Math.round((fCals / totalMacroCals) * 100) : 0;

  const handleAdjustCalories = (delta) => {
    playSound('click', soundEnabled);
    setCustomCalories(prev => Math.max(1200, Math.min(6000, (parseInt(prev, 10) || 3000) + delta)));
  };

  const handleAdjustMacro = (macroKey, delta) => {
    playSound('click', soundEnabled);
    if (macroKey === 'protein') {
      setCustomProtein(prev => Math.max(40, Math.min(450, (parseInt(prev, 10) || 180) + delta)));
    } else if (macroKey === 'carbs') {
      setCustomCarbs(prev => Math.max(20, Math.min(800, (parseInt(prev, 10) || 350) + delta)));
    } else if (macroKey === 'fats') {
      setCustomFats(prev => Math.max(15, Math.min(250, (parseInt(prev, 10) || 70) + delta)));
    }
  };

  const handleAutoBalanceMacros = () => {
    playSound('success', soundEnabled);
    const cals = parseInt(customCalories, 10) || 3000;
    // Standard high-performance split: 180g protein base, 22% fats, remainder carbs
    const p = Math.max(120, Math.min(240, Math.round((cals * 0.25) / 4)));
    const fCalsAmount = Math.round(cals * 0.22);
    const f = Math.round(fCalsAmount / 9);
    const remainingCals = Math.max(0, cals - (p * 4) - (f * 9));
    const c = Math.round(remainingCals / 4);

    setCustomProtein(p);
    setCustomFats(f);
    setCustomCarbs(c);
  };

  const handleHueChange = (newHue) => {
    onUpdateSettings({
      ...settings,
      accentHue: Number(newHue)
    });
  };

  const toggleSound = () => {
    const nextSound = !isSoundOn;
    playSound('switch', nextSound);
    onUpdateSettings({
      ...settings,
      soundEnabled: nextSound
    });
  };

  const toggleCompact = () => {
    playSound('switch', soundEnabled);
    onUpdateSettings({
      ...settings,
      compactMode: !isCompactOn
    });
  };

  const handleResetDefaults = () => {
    playSound('click', soundEnabled);
    setCustomCalories(3000);
    setCustomProtein(180);
    setCustomCarbs(350);
    setCustomFats(70);
  };

  const handleSaveAll = () => {
    playSound('success', soundEnabled);
    if (onUpdateTargets) {
      onUpdateTargets({
        targetCalories: parseInt(customCalories, 10) || 3000,
        protein: parseInt(customProtein, 10) || 180,
        carbs: parseInt(customCarbs, 10) || 350,
        fats: parseInt(customFats, 10) || 70
      });
    }
    setSavedFeedback(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-end select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/75 backdrop-blur-md"
        />

        {/* Slide-out Drawer */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="relative w-full max-w-lg h-full bg-[#08090d]/98 backdrop-blur-2xl border-l border-white/10 px-5 sm:px-6 shadow-2xl flex flex-col justify-between overflow-y-auto z-10"
          style={{
            paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)'
          }}
        >
          {/* Main Scrollable Content */}
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div 
                  className="p-2.5 rounded-2xl bg-white/[0.04] text-white"
                  style={{ border: '1px solid var(--accent-border)' }}
                >
                  <Flame className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Macro & Calorie Goals</h3>
                  <p className="text-xs text-slate-400">Configure daily targets & preferences</p>
                </div>
              </div>

              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                }}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SECTION 1: DAILY CALORIE TARGET */}
            <div className="p-4 rounded-3xl bg-white/[0.025] hover:bg-white/[0.035] border border-white/10 space-y-3.5 shadow-sm transition-colors">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Daily Calorie Target
                  </span>
                </div>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-black/40 text-amber-300 border border-amber-500/20">
                  {customCalories.toLocaleString()} kcal
                </span>
              </div>

              {/* Big Calorie Display & Direct Input */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2">
                  <input
                    type="number"
                    min="1200"
                    max="6500"
                    step="25"
                    value={customCalories}
                    onChange={(e) => setCustomCalories(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-28 text-2xl sm:text-3xl font-bold font-mono text-white bg-black/40 border border-white/10 px-3 py-1.5 rounded-2xl outline-none focus:border-white/30"
                  />
                  <span className="text-xs text-slate-400 font-mono uppercase font-semibold">kcal / day</span>
                </div>

                {/* Quick Adjustment Steppers */}
                <div className="flex items-center gap-1">
                  {[-100, -50, 50, 100].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      onClick={() => handleAdjustCalories(delta)}
                      className="px-2 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] active:scale-95 border border-white/10 text-[11px] font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>
              </div>

              {/* Continuous Calorie Slider */}
              <div className="pt-1">
                <div className="flex justify-between text-[10px] text-slate-500 mb-1 font-mono">
                  <span>1,500</span>
                  <span>3,000</span>
                  <span>4,500</span>
                  <span>6,000</span>
                </div>
                <input
                  type="range"
                  min="1500"
                  max="6000"
                  step="25"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(parseInt(e.target.value, 10))}
                  className="w-full h-2 rounded-lg cursor-pointer appearance-none outline-none"
                  style={{
                    background: 'linear-gradient(to right, #38bdf8 0%, var(--accent-primary) 50%, #f59e0b 100%)'
                  }}
                />
              </div>
            </div>

            {/* SECTION 2: MACRO TARGETS (PROTEIN, CARBS, FATS) */}
            <div className="p-4 rounded-3xl bg-white/[0.025] hover:bg-white/[0.035] border border-white/10 space-y-3.5 shadow-sm transition-colors">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Macro Targets (Grams)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAutoBalanceMacros}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xl text-[10px] font-semibold transition-all cursor-pointer active:scale-95 border"
                  style={{
                    backgroundColor: 'var(--accent-subtle)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--accent-primary)'
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Auto-Balance</span>
                </button>
              </div>

              {/* Visual Macro Proportion Bar */}
              <div className="space-y-1.5">
                <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-black/40 border border-white/10">
                  <div 
                    style={{ width: `${pPct}%`, backgroundColor: '#6366f1' }} 
                    title={`Protein: ${pPct}%`} 
                    className="h-full transition-all duration-300"
                  />
                  <div 
                    style={{ width: `${cPct}%`, backgroundColor: '#38bdf8' }} 
                    title={`Carbs: ${cPct}%`} 
                    className="h-full transition-all duration-300"
                  />
                  <div 
                    style={{ width: `${fPct}%`, backgroundColor: '#f59e0b' }} 
                    title={`Fats: ${fPct}%`} 
                    className="h-full transition-all duration-300"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] font-mono px-0.5">
                  <span className="text-indigo-400">P: {pPct}% ({pCals} kcal)</span>
                  <span className="text-sky-400">C: {cPct}% ({cCals} kcal)</span>
                  <span className="text-amber-400">F: {fPct}% ({fCals} kcal)</span>
                </div>
              </div>

              {/* 3 Macro Cards */}
              <div className="space-y-2.5 pt-1">
                {/* Protein Card */}
                <div className="p-3 rounded-2xl bg-black/30 border border-indigo-500/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0">
                      <Dumbbell className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Protein</div>
                      <div className="text-[10px] text-indigo-300/80 font-mono">{pCals} kcal</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('protein', -10)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        -10
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('protein', -5)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        -5
                      </button>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <input
                        type="number"
                        min="40"
                        max="450"
                        value={customProtein}
                        onChange={(e) => setCustomProtein(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-14 text-center font-bold font-mono text-sm text-indigo-200 bg-black/50 border border-indigo-500/30 py-1 rounded-xl outline-none"
                      />
                      <span className="text-[10px] font-mono text-slate-400">g</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('protein', 5)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('protein', 10)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                </div>

                {/* Carbohydrates Card */}
                <div className="p-3 rounded-2xl bg-black/30 border border-sky-500/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                      <Wheat className="w-4 h-4 text-sky-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Carbohydrates</div>
                      <div className="text-[10px] text-sky-300/80 font-mono">{cCals} kcal</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('carbs', -20)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        -20
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('carbs', -10)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        -10
                      </button>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <input
                        type="number"
                        min="20"
                        max="800"
                        value={customCarbs}
                        onChange={(e) => setCustomCarbs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-14 text-center font-bold font-mono text-sm text-sky-200 bg-black/50 border border-sky-500/30 py-1 rounded-xl outline-none"
                      />
                      <span className="text-[10px] font-mono text-slate-400">g</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('carbs', 10)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        +10
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('carbs', 20)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        +20
                      </button>
                    </div>
                  </div>
                </div>

                {/* Fats Card */}
                <div className="p-3 rounded-2xl bg-black/30 border border-amber-500/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <Droplet className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Fats</div>
                      <div className="text-[10px] text-amber-300/80 font-mono">{fCals} kcal</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('fats', -10)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        -10
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('fats', -5)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        -5
                      </button>
                    </div>

                    <div className="flex items-baseline gap-1">
                      <input
                        type="number"
                        min="15"
                        max="250"
                        value={customFats}
                        onChange={(e) => setCustomFats(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-14 text-center font-bold font-mono text-sm text-amber-200 bg-black/50 border border-amber-500/30 py-1 rounded-xl outline-none"
                      />
                      <span className="text-[10px] font-mono text-slate-400">g</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('fats', 5)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdjustMacro('fats', 10)}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
                      >
                        +10
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Macro Reconciliation vs Calorie Goal */}
              <div className="p-2.5 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">Macro Sum:</span>
                  <span className="font-mono font-bold text-white">{totalMacroCals.toLocaleString()} kcal</span>
                </div>

                <div>
                  {Math.abs(calsDiff) <= 15 ? (
                    <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Balanced
                    </span>
                  ) : (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 ${
                      calsDiff > 0 
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' 
                        : 'text-sky-400 bg-sky-500/10 border-sky-500/20'
                    }`}>
                      <AlertCircle className="w-3 h-3" />
                      {calsDiff > 0 ? `+${calsDiff} kcal` : `${calsDiff} kcal`}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION 3: THEME COLOR & PREFERENCES */}
            <div className="p-4 rounded-3xl bg-white/[0.025] hover:bg-white/[0.035] border border-white/10 space-y-3.5 shadow-sm transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Theme Color
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/40 border border-white/10">
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                    style={{ 
                      backgroundColor: 'var(--accent-primary)',
                      boxShadow: '0 0 8px var(--accent-glow)'
                    }}
                  />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {currentHue}° Hue
                  </span>
                </div>
              </div>

              {/* Color Gradient Slider */}
              <div>
                <div className="flex justify-between text-[11px] text-slate-400 mb-1.5 font-medium">
                  <span>Emerald (150°)</span>
                  <span>Blue (222°)</span>
                  <span>Purple (280°)</span>
                </div>
                <input
                  type="range"
                  min="140"
                  max="280"
                  step="1"
                  value={currentHue}
                  onChange={(e) => handleHueChange(e.target.value)}
                  className="w-full h-2.5 rounded-lg cursor-pointer appearance-none outline-none"
                  style={{
                    background: 'linear-gradient(to right, #10b981 0%, #06b6d4 25%, #2563eb 55%, #4f46e5 80%, #7c3aed 100%)'
                  }}
                />
              </div>

              {/* Presets */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-white/5">
                {COLOR_PRESETS.map((preset) => {
                  const isSelected = Math.abs(currentHue - preset.hue) <= 8;
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => {
                        playSound('click', soundEnabled);
                        handleHueChange(preset.hue);
                      }}
                      className={`p-2.5 rounded-2xl text-xs font-medium border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        isSelected 
                          ? 'text-white font-bold shadow-md' 
                          : 'bg-white/[0.03] border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.08]'
                      }`}
                      style={isSelected ? {
                        backgroundColor: 'var(--accent-subtle)',
                        borderColor: 'var(--accent-primary)',
                        boxShadow: '0 0 12px var(--accent-glow)'
                      } : {}}
                    >
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ 
                          background: `hsl(${preset.hue}, 95%, 58%)`,
                          boxShadow: isSelected ? `0 0 8px hsl(${preset.hue}, 95%, 58%)` : 'none'
                        }}
                      />
                      <span className="truncate text-[11px]">{preset.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Toggles: Sound & Compact View */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`p-3 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${
                    isSoundOn 
                      ? 'bg-white/[0.04] border-white/15 text-white' 
                      : 'bg-black/20 border-white/5 text-slate-500'
                  }`}
                  style={isSoundOn ? { borderColor: 'var(--accent-border)' } : {}}
                >
                  <div className="flex items-center gap-2">
                    {isSoundOn ? <Volume2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} /> : <VolumeX className="w-4 h-4" />}
                    <span className="text-xs font-semibold">Sound FX</span>
                  </div>
                  <div 
                    className="w-8 h-4 rounded-full p-0.5 transition-colors"
                    style={{ backgroundColor: isSoundOn ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)' }}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isSoundOn ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={toggleCompact}
                  className={`p-3 rounded-2xl border flex items-center justify-between transition-all cursor-pointer ${
                    isCompactOn 
                      ? 'bg-white/[0.04] border-white/15 text-white' 
                      : 'bg-black/20 border-white/5 text-slate-500'
                  }`}
                  style={isCompactOn ? { borderColor: 'var(--accent-border)' } : {}}
                >
                  <div className="flex items-center gap-2">
                    <Minimize2 className="w-4 h-4" style={isCompactOn ? { color: 'var(--accent-primary)' } : {}} />
                    <span className="text-xs font-semibold">Compact</span>
                  </div>
                  <div 
                    className="w-8 h-4 rounded-full p-0.5 transition-colors"
                    style={{ backgroundColor: isCompactOn ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)' }}
                  >
                    <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isCompactOn ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Footer: Reset & Save Targets */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3 mt-4">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-400 hover:text-white transition-all border border-white/10 cursor-pointer active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              className="px-6 py-2.5 rounded-2xl font-bold text-xs transition-all active:scale-95 shadow-md cursor-pointer text-white"
              style={{
                backgroundColor: 'var(--accent-primary)',
                boxShadow: '0 2px 14px var(--accent-glow)'
              }}
            >
              Save Targets
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
