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
  Edit3,
  Check
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
  const currentTargetCals = Number(nutritionData?.targetCalories) || 3000;
  const currentProtein = Number(nutritionData?.protein?.target) || 180;
  const currentCarbs = Number(nutritionData?.carbs?.target) || 350;
  const currentFats = Number(nutritionData?.fats?.target) || 70;

  const [customCalories, setCustomCalories] = useState(currentTargetCals);
  const [customProtein, setCustomProtein] = useState(currentProtein);
  const [customCarbs, setCustomCarbs] = useState(currentCarbs);
  const [customFats, setCustomFats] = useState(currentFats);
  const [isEditing, setIsEditing] = useState(false);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCustomCalories(Number(nutritionData?.targetCalories) || 3000);
      setCustomProtein(Number(nutritionData?.protein?.target) || 180);
      setCustomCarbs(Number(nutritionData?.carbs?.target) || 350);
      setCustomFats(Number(nutritionData?.fats?.target) || 70);
      setIsEditing(false);
    }
  }, [isOpen, nutritionData]);

  if (!isOpen) return null;

  const currentHue = settings?.accentHue || 222;
  const isSoundOn = settings?.soundEnabled !== false;
  const isCompactOn = !!settings?.compactMode;

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
    setIsEditing(false);
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const toggleEditMode = () => {
    playSound('click', soundEnabled);
    if (isEditing) {
      // Save targets when toggling out of edit mode
      if (onUpdateTargets) {
        onUpdateTargets({
          targetCalories: parseInt(customCalories, 10) || 3000,
          protein: parseInt(customProtein, 10) || 180,
          carbs: parseInt(customCarbs, 10) || 350,
          fats: parseInt(customFats, 10) || 70
        });
      }
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
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
                  <Settings className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
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

            {/* UNIFIED DAILY TARGETS CARD (Calories & Macros all in one card) */}
            <div className="p-4 sm:p-5 rounded-3xl bg-white/[0.025] hover:bg-white/[0.035] border border-white/10 space-y-4 shadow-sm transition-colors">
              {/* Card Header with Edit Button in Right Corner */}
              <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Daily Targets
                  </span>
                </div>

                <button
                  type="button"
                  onClick={toggleEditMode}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer border ${
                    isEditing
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 shadow-sm'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-200 hover:text-white'
                  }`}
                >
                  {isEditing ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Done</span>
                    </>
                  ) : (
                    <>
                      <Edit3 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                      <span>Edit</span>
                    </>
                  )}
                </button>
              </div>

              {/* 4 Targets Grid: Calories, Protein, Carbs, Fats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {/* Calories */}
                <div className="p-3 rounded-2xl bg-black/30 border border-white/5 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-slate-400 font-semibold flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-400" />
                    Calories
                  </span>
                  {isEditing ? (
                    <div className="mt-2 flex items-baseline gap-1">
                      <input
                        type="number"
                        min="1000"
                        max="7000"
                        step="25"
                        value={customCalories}
                        onChange={(e) => setCustomCalories(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full bg-black/60 border border-amber-500/40 text-amber-300 font-mono font-bold text-sm sm:text-base px-2 py-1 rounded-xl outline-none"
                      />
                      <span className="text-[10px] text-slate-500 font-mono">kcal</span>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <span className="text-base sm:text-lg font-bold font-mono text-white">
                        {customCalories.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono ml-1">kcal</span>
                    </div>
                  )}
                </div>

                {/* Protein */}
                <div className="p-3 rounded-2xl bg-black/30 border border-indigo-500/20 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-indigo-300 font-semibold flex items-center gap-1">
                    <Dumbbell className="w-3 h-3 text-indigo-400" />
                    Protein
                  </span>
                  {isEditing ? (
                    <div className="mt-2 flex items-baseline gap-1">
                      <input
                        type="number"
                        min="20"
                        max="500"
                        value={customProtein}
                        onChange={(e) => setCustomProtein(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full bg-black/60 border border-indigo-500/40 text-indigo-200 font-mono font-bold text-sm sm:text-base px-2 py-1 rounded-xl outline-none"
                      />
                      <span className="text-[10px] text-slate-500 font-mono">g</span>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <span className="text-base sm:text-lg font-bold font-mono text-indigo-300">
                        {customProtein}g
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {customProtein * 4} kcal
                      </span>
                    </div>
                  )}
                </div>

                {/* Carbs */}
                <div className="p-3 rounded-2xl bg-black/30 border border-sky-500/20 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-sky-300 font-semibold flex items-center gap-1">
                    <Wheat className="w-3 h-3 text-sky-400" />
                    Carbs
                  </span>
                  {isEditing ? (
                    <div className="mt-2 flex items-baseline gap-1">
                      <input
                        type="number"
                        min="10"
                        max="900"
                        value={customCarbs}
                        onChange={(e) => setCustomCarbs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full bg-black/60 border border-sky-500/40 text-sky-200 font-mono font-bold text-sm sm:text-base px-2 py-1 rounded-xl outline-none"
                      />
                      <span className="text-[10px] text-slate-500 font-mono">g</span>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <span className="text-base sm:text-lg font-bold font-mono text-sky-300">
                        {customCarbs}g
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {customCarbs * 4} kcal
                      </span>
                    </div>
                  )}
                </div>

                {/* Fats */}
                <div className="p-3 rounded-2xl bg-black/30 border border-amber-500/20 flex flex-col justify-between">
                  <span className="text-[10px] font-mono uppercase text-amber-300 font-semibold flex items-center gap-1">
                    <Droplet className="w-3 h-3 text-amber-400" />
                    Fats
                  </span>
                  {isEditing ? (
                    <div className="mt-2 flex items-baseline gap-1">
                      <input
                        type="number"
                        min="10"
                        max="300"
                        value={customFats}
                        onChange={(e) => setCustomFats(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-full bg-black/60 border border-amber-500/40 text-amber-200 font-mono font-bold text-sm sm:text-base px-2 py-1 rounded-xl outline-none"
                      />
                      <span className="text-[10px] text-slate-500 font-mono">g</span>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <span className="text-base sm:text-lg font-bold font-mono text-amber-300">
                        {customFats}g
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {customFats * 9} kcal
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* THEME COLOR & PREFERENCES */}
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
