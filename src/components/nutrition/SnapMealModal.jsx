import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  X, 
  Sparkles, 
  UploadCloud, 
  Check, 
  UtensilsCrossed, 
  Flame, 
  Plus, 
  RefreshCw 
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { createMealEntry } from '../../utils/nutritionEngine.js';

const SAMPLE_BULK_PLATES = [
  {
    name: "Ribeye Steak, Jasmine Rice & Avocado",
    portion: "250g steak, 1.5 cups rice, 1/2 avocado",
    calories: 890,
    protein: 68,
    carbs: 72,
    fats: 38,
    slot: "dinner",
    items: ["250g Grass-Fed Ribeye", "1.5 Cups Jasmine Rice", "1/2 Fresh Avocado"]
  },
  {
    name: "Grilled Chicken, Sweet Potato & Olive Oil",
    portion: "220g chicken breast, 300g sweet potato, 1 tbsp oil",
    calories: 710,
    protein: 65,
    carbs: 68,
    fats: 19,
    slot: "lunch",
    items: ["220g Grilled Chicken Breast", "300g Roasted Sweet Potato", "Steamed Broccoli", "1 tbsp Olive Oil"]
  },
  {
    name: "Power Oatmeal Bowl with Whey & Peanut Butter",
    portion: "1.5 cups oats, 1 scoop whey, 2 tbsp peanut butter, 1 banana",
    calories: 780,
    protein: 48,
    carbs: 104,
    fats: 22,
    slot: "breakfast",
    items: ["1.5 Cups Rolled Oats", "1 Scoop Whey Isolate", "2 tbsp Natural Peanut Butter", "1 Sliced Banana"]
  },
  {
    name: "Ground Beef Smash Bowls with White Rice",
    portion: "200g beef (90/10), 2 cups white rice, 2 eggs",
    calories: 920,
    protein: 70,
    carbs: 90,
    fats: 32,
    slot: "post_workout",
    items: ["200g Lean Ground Beef (90/10)", "2 Cups Steamed Jasmine Rice", "2 Sunny-Side Eggs"]
  }
];

export const SnapMealModal = ({
  isOpen,
  onClose,
  onLogMeal,
  soundEnabled = true
}) => {
  const [scanning, setScanning] = useState(false);
  const [selectedPlate, setSelectedPlate] = useState(SAMPLE_BULK_PLATES[0]);
  const [analyzedResult, setAnalyzedResult] = useState(null);

  if (!isOpen) return null;

  const handleSimulateScan = (plate = selectedPlate) => {
    playSound('click', soundEnabled);
    setScanning(true);
    setAnalyzedResult(null);

    setTimeout(() => {
      setScanning(false);
      setAnalyzedResult(plate);
      playSound('success', soundEnabled);
    }, 1200);
  };

  const handleLogAnalyzedMeal = () => {
    if (!analyzedResult) return;
    playSound('success', soundEnabled);

    const meal = createMealEntry({
      name: analyzedResult.name,
      slot: analyzedResult.slot || "lunch",
      calories: analyzedResult.calories,
      protein: analyzedResult.protein,
      carbs: analyzedResult.carbs,
      fats: analyzedResult.fats,
      items: analyzedResult.items
    });

    onLogMeal(meal);
    onClose();
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
                <Camera className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>AI Meal Vision Scanner</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Vision AI
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Snap or select your plate to auto-calculate bulking macros</p>
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

          {/* Scanner Viewport */}
          <div className="relative rounded-2xl bg-black/50 border border-white/10 p-6 text-center space-y-3 overflow-hidden">
            <div className="relative z-10 space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-300">
                {scanning ? (
                  <RefreshCw className="w-7 h-7 animate-spin text-purple-400" />
                ) : (
                  <Camera className="w-7 h-7" style={{ color: 'var(--accent-primary)' }} />
                )}
              </div>

              <div>
                <div className="text-sm font-bold text-white">
                  {scanning ? "Analyzing Ingredients & Portions..." : "Upload or Choose a Bulking Plate"}
                </div>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  AI scans macro distribution, caloric density, and estimated portion weights.
                </p>
              </div>
            </div>

            {/* Scan animation line */}
            {scanning && (
              <motion.div
                initial={{ top: '0%' }}
                animate={{ top: '100%' }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent shadow-[0_0_15px_rgba(168,85,247,0.8)]"
              />
            )}
          </div>

          {/* Preset Bulking Plates */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-300 block">Select a Bulking Plate to Scan:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SAMPLE_BULK_PLATES.map((plate, i) => {
                const active = selectedPlate.name === plate.name;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedPlate(plate);
                      handleSimulateScan(plate);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-white/10 border-white/30 text-white shadow-md'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="text-xs font-bold text-white leading-tight">{plate.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{plate.portion}</div>
                    <div className="text-[10px] font-mono font-semibold text-emerald-400 mt-1">
                      {plate.calories} kcal • {plate.protein}g P • {plate.carbs}g C • {plate.fats}g F
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Analyzed Result Card */}
          {analyzedResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/25 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-purple-200">Vision Analysis Complete</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                  98% Confidence
                </span>
              </div>

              <div>
                <div className="text-sm font-bold text-white">{analyzedResult.name}</div>
                <div className="text-xs text-slate-300 mt-0.5 font-mono">
                  {analyzedResult.items.join(' • ')}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center bg-black/40 p-2 rounded-xl border border-white/5 font-mono text-xs">
                <div>
                  <div className="text-white font-bold text-sm">{analyzedResult.calories}</div>
                  <div className="text-slate-500 text-[9px] uppercase">Calories</div>
                </div>
                <div>
                  <div className="text-indigo-300 font-bold text-sm">{analyzedResult.protein}g</div>
                  <div className="text-slate-500 text-[9px] uppercase">Protein</div>
                </div>
                <div>
                  <div className="text-sky-300 font-bold text-sm">{analyzedResult.carbs}g</div>
                  <div className="text-slate-500 text-[9px] uppercase">Carbs</div>
                </div>
                <div>
                  <div className="text-amber-300 font-bold text-sm">{analyzedResult.fats}g</div>
                  <div className="text-slate-500 text-[9px] uppercase">Fats</div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogAnalyzedMeal}
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log Analyzed Meal to Daily Tracker</span>
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
