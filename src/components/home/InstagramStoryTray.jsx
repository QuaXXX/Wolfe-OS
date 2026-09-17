import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Flame, 
  TrendingUp, 
  CalendarDays, 
  Droplets, 
  Scale, 
  Zap, 
  Check, 
  Sparkles,
  ArrowUpRight,
  X
} from 'lucide-react';
import { WolfLogo } from '../common/WolfLogo';
import { playSound } from '../../utils/soundFX';
import { triggerImmediateCloudPush } from '../../utils/cloudSyncEngine';

export const InstagramStoryTray = ({
  user,
  nutritionData = {},
  tradingData = {},
  calendarData = { items: [] },
  setNutritionData,
  onNavigate,
  soundEnabled = true,
  todayIso
}) => {
  const [activeStoryModal, setActiveStoryModal] = useState(null);
  const [waterToast, setWaterToast] = useState(false);

  // Compute metrics for story highlights
  const consumedCals = nutritionData?.consumedCalories || 0;
  const targetCals = nutritionData?.targetCalories || 3250;
  const calPercent = Math.min(100, Math.round((consumedCals / (targetCals || 1)) * 100));

  const dayPnl = tradingData?.dayPnl || 0;
  const dayPnlPct = tradingData?.dayPnlPercent || 0;
  const isPnlPositive = dayPnl >= 0;

  const items = calendarData?.items || [];
  const todayItems = items.filter(it => it.date === todayIso);
  const todayDeadlines = todayItems.filter(it => it.type === 'deadline');
  const todayEvents = todayItems.filter(it => it.type === 'event');

  const waterCount = nutritionData?.waterGlasses || 0;

  const latestWeight = nutritionData?.weightHistory?.length > 0
    ? nutritionData.weightHistory[nutritionData.weightHistory.length - 1]?.weightLbs
    : null;
  const firstWeight = nutritionData?.weightHistory?.length > 1
    ? nutritionData.weightHistory[0]?.weightLbs
    : null;
  const weightDiff = (latestWeight && firstWeight) ? (latestWeight - firstWeight).toFixed(1) : null;

  // 1-Tap Quick Water Increment
  const handleQuickWater = (e) => {
    e.stopPropagation();
    playSound('switch', soundEnabled);
    if (setNutritionData) {
      setNutritionData(prev => ({
        ...prev,
        waterGlasses: Math.min(20, (prev?.waterGlasses || 0) + 1)
      }));
      triggerImmediateCloudPush(80);
    }
    setWaterToast(true);
    setTimeout(() => setWaterToast(false), 2000);
  };

  const stories = [
    {
      id: 'status',
      title: 'Daily Mode',
      subtitle: 'In The Zone',
      badge: '● Live',
      badgeColor: 'bg-emerald-500 text-black font-black',
      ringGradient: 'from-[#f09433] via-[#dc2743] to-[#bc1888]',
      icon: (
        <div className="w-full h-full bg-[#0d0f18] flex items-center justify-center text-amber-400">
          <WolfLogo className="w-5 h-5" />
        </div>
      ),
      onClick: () => {
        playSound('click', soundEnabled);
        setActiveStoryModal('status');
      }
    },
    {
      id: 'calories',
      title: 'Calories',
      subtitle: `${consumedCals} kcal`,
      badge: `${calPercent}%`,
      badgeColor: 'bg-amber-500 text-black font-black',
      ringGradient: 'from-amber-400 via-orange-500 to-rose-600',
      icon: (
        <div className="w-full h-full bg-[#110c14] flex items-center justify-center text-orange-400">
          <Flame className="w-5 h-5 fill-current" />
        </div>
      ),
      onClick: () => {
        playSound('click', soundEnabled);
        if (onNavigate) onNavigate('nutrition');
      }
    },
    {
      id: 'trading',
      title: 'War Room',
      subtitle: `${isPnlPositive ? '+' : ''}$${Math.abs(dayPnl).toFixed(0)}`,
      badge: `${isPnlPositive ? '+' : ''}${dayPnlPct}%`,
      badgeColor: isPnlPositive ? 'bg-emerald-500 text-black font-black' : 'bg-rose-500 text-white font-black',
      ringGradient: isPnlPositive 
        ? 'from-emerald-400 via-teal-500 to-cyan-600'
        : 'from-rose-500 via-pink-600 to-red-700',
      icon: (
        <div className="w-full h-full bg-[#0a1215] flex items-center justify-center text-emerald-400">
          <TrendingUp className="w-5 h-5" />
        </div>
      ),
      onClick: () => {
        playSound('click', soundEnabled);
        if (onNavigate) onNavigate('trading');
      }
    },
    {
      id: 'timeline',
      title: 'Agenda',
      subtitle: `${todayEvents.length} Events`,
      badge: todayDeadlines.length > 0 ? `🚨 ${todayDeadlines.length}` : `${todayItems.length}`,
      badgeColor: todayDeadlines.length > 0 ? 'bg-rose-500 text-white font-bold' : 'bg-purple-500 text-white font-bold',
      ringGradient: 'from-purple-500 via-indigo-500 to-pink-500',
      icon: (
        <div className="w-full h-full bg-[#0f0e1c] flex items-center justify-center text-purple-400">
          <CalendarDays className="w-5 h-5" />
        </div>
      ),
      onClick: () => {
        playSound('click', soundEnabled);
        if (onNavigate) onNavigate('calendar');
      }
    },
    {
      id: 'water',
      title: 'Hydrate',
      subtitle: `${waterCount}/8 Cups`,
      badge: '+1 Tap',
      badgeColor: 'bg-sky-400 text-black font-black',
      ringGradient: 'from-cyan-400 via-sky-500 to-blue-600',
      icon: (
        <div className="w-full h-full bg-[#08121d] flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
          <Droplets className="w-5 h-5 fill-current" />
        </div>
      ),
      onClick: handleQuickWater
    },
    {
      id: 'weight',
      title: 'Weight',
      subtitle: latestWeight ? `${latestWeight} lbs` : 'Log Wt',
      badge: weightDiff ? `${weightDiff > 0 ? '+' : ''}${weightDiff}` : '⚖️',
      badgeColor: 'bg-indigo-500 text-white font-bold',
      ringGradient: 'from-fuchsia-500 via-purple-600 to-indigo-700',
      icon: (
        <div className="w-full h-full bg-[#120e1c] flex items-center justify-center text-indigo-400">
          <Scale className="w-5 h-5" />
        </div>
      ),
      onClick: () => {
        playSound('click', soundEnabled);
        if (onNavigate) onNavigate('nutrition');
      }
    }
  ];

  return (
    <div className="relative select-none">
      {/* Horizontal Story Tray with Instagram Aesthetics */}
      <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto py-2 px-1 scrollbar-none snap-x touch-pan-x">
        {stories.map((story) => (
          <div
            key={story.id}
            onClick={story.onClick}
            className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group snap-start"
            style={{ width: '68px' }}
          >
            {/* Story Ring Container */}
            <div className="relative">
              <div 
                className={`w-[58px] h-[58px] sm:w-[62px] sm:h-[62px] rounded-full p-[2px] bg-gradient-to-tr ${story.ringGradient} transition-transform duration-200 group-hover:scale-105 active:scale-95 flex items-center justify-center shadow-lg shadow-black/40`}
              >
                {/* 1px Gap to mimic Instagram's ring inset */}
                <div className="w-full h-full p-[2px] rounded-full bg-[#06070d] flex items-center justify-center">
                  <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center relative">
                    {story.icon}
                  </div>
                </div>
              </div>

              {/* Story Mini Status Pill / Badge */}
              {story.badge && (
                <div className={`absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono leading-tight tracking-tight shadow-md border border-black/40 ${story.badgeColor}`}>
                  {story.badge}
                </div>
              )}
            </div>

            {/* Title and Subtitle */}
            <div className="flex flex-col items-center text-center leading-tight">
              <span className="text-[11px] font-semibold text-slate-200 truncate w-full group-hover:text-white transition-colors">
                {story.title}
              </span>
              <span className="text-[9px] font-mono text-slate-400 font-medium truncate w-full">
                {story.subtitle}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Floating Water Toast */}
      <AnimatePresence>
        {waterToast && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 px-3 py-1.5 rounded-full bg-sky-500/90 text-black text-xs font-bold font-mono flex items-center gap-1.5 shadow-xl backdrop-blur-md pointer-events-none"
          >
            <Droplets className="w-3.5 h-3.5 fill-current" />
            <span>+1 Glass Logged ({waterCount + 1}/8)</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instagram Story Preview Modal (for Status / Focus) */}
      <AnimatePresence>
        {activeStoryModal === 'status' && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none"
            onClick={() => setActiveStoryModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-3xl theme-card border border-white/15 p-5 shadow-2xl space-y-4 overflow-hidden"
              style={{
                background: 'radial-gradient(circle at top right, rgba(240, 148, 51, 0.15), rgba(10, 12, 20, 0.95) 70%)'
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full p-[2px] bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]">
                    <div className="w-full h-full rounded-full bg-[#06070d] flex items-center justify-center text-amber-400">
                      <WolfLogo className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Zach Wolfe</span>
                      <span className="w-3.5 h-3.5 rounded-full bg-sky-500 text-black text-[9px] flex items-center justify-center font-black">✓</span>
                    </h3>
                    <p className="text-[10px] font-mono text-slate-400">@wolfe.os • Executive State</p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveStoryModal(null)}
                  className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Status Story Card */}
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400 uppercase text-[10px]">Active Focus Mode</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                      ● HIGH OUTPUT
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 font-medium">
                    "Execute daily target surplus, monitor high-conviction market setups, and maintain unbroken focus on schedule milestones."
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[9px] text-slate-500 uppercase block">Daily Surplus</span>
                    <span className="font-bold text-white">{consumedCals} / {targetCals} kcal</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                    <span className="text-[9px] text-slate-500 uppercase block">Market Session</span>
                    <span className={`font-bold ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPnlPositive ? '+' : ''}${dayPnl} ({dayPnlPct}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>Wolfe OS • Build 2.4</span>
                <span className="text-emerald-400">● 100% Synced</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
