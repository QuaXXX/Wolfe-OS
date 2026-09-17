import React, { useState } from 'react';
import { 
  UtensilsCrossed, 
  CalendarDays, 
  ArrowUpRight, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  Circle,
  Check,
  ListTodo,
  Bell,
  RotateCw,
  Plus,
  Flame,
  Sparkles
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { CompactVoiceWidget } from '../voice/CompactVoiceWidget';
import { MealLogModal } from '../nutrition/MealLogModal';
import { playSound } from '../../utils/soundFX';
import { getTodayIso } from '../../utils/calendarUtils';

export const HomeView = ({ 
  user, 
  nutritionData, 
  calendarData = { items: [] },
  settings = { visibleModules: {}, aiConfig: {}, compactMode: false },
  setSettings,
  setNutritionData,
  setCalendarData,
  onItemCreated,
  onClearCalendar,
  onClearDeadlines,
  onDeleteSpecificItem,
  onPurgeItems,
  onToggleTask,
  onOpenSettings,
  onNavigate,
  isSyncingGoogle = false,
  isGoogleConnected = false,
  onSyncGoogleCalendar,
  syncStatus = 'synced',
  lastSyncTimestamp = 0,
  soundEnabled = true,
  onLogMeal = null
}) => {
  const [isMealModalOpen, setIsMealModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState('quick_text');

  const handleOpenMealModal = (initialTab = 'quick_text') => {
    playSound('click', soundEnabled);
    setModalInitialTab(initialTab);
    setIsMealModalOpen(true);
  };
  const vm = settings.visibleModules || {};
  const isCompact = !!settings.compactMode;
  const todayIso = getTodayIso();

  const latestWeight = nutritionData?.weightHistory?.length > 0
    ? nutritionData.weightHistory[nutritionData.weightHistory.length - 1]?.weightLbs
    : null;
  const firstWeight = nutritionData?.weightHistory?.length > 1
    ? nutritionData.weightHistory[0]?.weightLbs
    : null;
  const weightDiff = (latestWeight && firstWeight) ? (latestWeight - firstWeight).toFixed(1) : null;
  const weightChangeStr = weightDiff !== null
    ? (Number(weightDiff) >= 0 ? `+${weightDiff}` : `${weightDiff}`)
    : null;

  const rawTodayTarget = nutritionData?.dailyTargets?.[todayIso];
  const todayTargetCals = (typeof rawTodayTarget === 'number' ? rawTodayTarget : rawTodayTarget?.calories) || nutritionData?.targetCalories || 3250;
  const todayTargetProtein = (typeof rawTodayTarget === 'object' && rawTodayTarget !== null ? rawTodayTarget.protein : null) || nutritionData?.protein?.target || 180;
  const todayTargetCarbs = (typeof rawTodayTarget === 'object' && rawTodayTarget !== null ? rawTodayTarget.carbs : null) || nutritionData?.carbs?.target || 450;

  const osData = {
    nutritionData,
    calendarData,
    setSettings,
    setNutritionData,
    setCalendarData,
    onClearDeadlines,
    onPurgeItems,
    onLogMeal
  };

  const items = calendarData?.items || [];
  const todayItems = items.filter(it => it.date === todayIso);
  const todayDeadlines = todayItems.filter(it => it.type === 'deadline');
  const todayEvents = todayItems.filter(it => it.type === 'event');
  const todayTasks = todayItems
    .filter(it => it.type === 'task')
    .sort((a, b) => {
      if (!a.completed && b.completed) return -1;
      if (a.completed && !b.completed) return 1;
      return 0;
    });
  const todayReminders = todayItems.filter(it => it.type === 'reminder');

  const hasTimelineContent = todayDeadlines.length > 0 || todayEvents.length > 0 || todayTasks.length > 0 || todayReminders.length > 0;

  return (
    <div className={`max-w-6xl mx-auto select-none ${isCompact ? 'space-y-4 pb-16' : 'space-y-5 pb-24'}`}>
      
      {/* 1. TOP COMPACT AI COMMAND & VOICE WIDGET */}
      <CompactVoiceWidget 
        onNavigate={onNavigate}
        aiConfig={settings?.aiConfig}
        osData={osData}
        onEventCreated={onItemCreated}
        onClearCalendar={onClearCalendar}
        onDeleteSpecificItem={onDeleteSpecificItem}
        onPurgeItems={onPurgeItems}
        onOpenSettings={onOpenSettings}
        soundEnabled={soundEnabled}
        onLogMeal={onLogMeal}
        onOpenMealLog={({ initialTab } = {}) => handleOpenMealModal(initialTab || 'upload_image')}
      />

      {/* 2. TIMELINE & TASKS AT THE VERY TOP */}
      {vm.timeline !== false && (
        <GlassCard 
          onClick={(e) => {
            playSound('click', soundEnabled);
            onNavigate('calendar');
          }}
          className={`relative z-10 isolate overflow-hidden flex flex-col justify-between group cursor-pointer touch-manipulation ${isCompact ? 'p-3.5' : 'p-5'}`}
        >
          <div>
            <div className={`flex items-center justify-between gap-2 ${isCompact ? 'mb-2' : 'mb-3'}`}>
              <div className="flex items-center gap-2.5">
                <div 
                  className={`rounded-lg flex items-center justify-center bg-white/[0.03] text-slate-300 border border-white/[0.06] ${isCompact ? 'w-6 h-6' : 'w-7 h-7'}`}
                >
                  <CalendarDays className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Schedule & Tasks
                </h3>
              </div>

              {/* Sync Status & Action Button */}
              <div className="flex items-center gap-2">
                {(isSyncingGoogle || syncStatus === 'syncing') ? (
                  <span 
                    className="text-[10px] font-mono px-2 py-0.5 rounded-xl flex items-center gap-1.5 bg-white/[0.03] text-slate-300 border border-white/10"
                  >
                    <RotateCw className="w-3 h-3 animate-spin text-slate-400" />
                    <span>Syncing...</span>
                  </span>
                ) : syncStatus === 'synced' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Google Calendar & Tasks are synced. Tap to refresh."
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Synced</span>
                  </button>
                ) : (syncStatus === 'failed' || syncStatus === 'error') ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Sync failed or session expired. Tap to reconnect."
                  >
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                    <span>Sync Failed</span>
                  </button>
                ) : (syncStatus === 'out_of_sync' && isGoogleConnected) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Out of sync. Tap to sync now."
                  >
                    <RotateCw className="w-3 h-3 text-amber-400" />
                    <span>Out of Sync</span>
                  </button>
                ) : isGoogleConnected ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-medium text-slate-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Connected. Tap to sync."
                  >
                    <RotateCw className="w-3 h-3 text-slate-400" />
                    <span>Sync Now</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium text-slate-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Google Calendar is disconnected. Tap to connect."
                  >
                    <CalendarDays className="w-3 h-3 text-slate-400" />
                    <span>Disconnected</span>
                  </button>
                )}

                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
              </div>
            </div>

            {/* A. DEADLINES (RED ALL-DAY MILESTONES) */}
            {todayDeadlines.length > 0 && (
              <div className={`${isCompact ? 'mb-2 space-y-1' : 'mb-3 space-y-1.5'}`}>
                {todayDeadlines.map(dl => (
                  <div 
                    key={dl.id}
                    className={`rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center justify-between shadow-sm ${
                      isCompact ? 'p-2' : 'p-2.5'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-sm bg-rose-500 shrink-0" />
                      <span className="font-bold text-rose-100 truncate">{dl.title}</span>
                    </div>
                    {dl.category && (
                      <span className="text-[10px] font-mono text-rose-300/80 px-1.5 py-0.5 rounded bg-black/30 shrink-0">
                        {dl.category}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* B. TIMED EVENTS STREAM */}
            {todayEvents.length > 0 && (
              <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 ${isCompact ? 'mb-2' : 'mb-3'}`}>
                {todayEvents.slice(0, isCompact ? 3 : 4).map((evt) => (
                  <div 
                    key={evt.id} 
                    className={`rounded-xl bg-white/[0.02] border border-white/5 text-xs flex flex-col justify-between hover:border-white/15 transition-colors ${
                      isCompact ? 'p-2' : 'p-3'
                    }`}
                  >
                    <span className="font-mono text-[10px] text-slate-400 flex items-center gap-1 mb-0.5">
                      <Clock className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} /> {evt.time}
                    </span>
                    <span className="font-semibold text-slate-200 truncate">{evt.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* C. ACTIVE TASKS & REMINDERS STRIP */}
            {(todayTasks.length > 0 || todayReminders.length > 0) && (
              <div className={`${isCompact ? 'pt-1' : 'pt-2 pb-1'} space-y-1.5`}>
                {!isCompact && (
                  <div className="text-[10px] font-mono uppercase text-slate-400 font-semibold flex items-center gap-1.5">
                    <ListTodo className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                    <span>Today's Tasks & Reminders</span>
                  </div>
                )}

                <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
                  {todayTasks.slice(0, isCompact ? 3 : 6).map((t) => (
                    <div 
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleTask) onToggleTask(t.id);
                      }}
                      className={`rounded-xl border flex items-center gap-2 text-xs cursor-pointer transition-all ${
                        isCompact ? 'p-2' : 'p-2.5 gap-2.5'
                      } ${
                        t.completed
                          ? 'bg-white/[0.01] border-white/5 text-slate-600 line-through'
                          : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-slate-200'
                      }`}
                    >
                      <button className="shrink-0">
                        {t.completed ? (
                          <div className="w-3.5 h-3.5 rounded-md bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-md border border-slate-600 bg-black/20 hover:border-slate-400 transition-colors" />
                        )}
                      </button>
                      <span className="truncate font-medium">{t.title}</span>
                    </div>
                  ))}

                  {todayReminders.slice(0, isCompact ? 1 : 3).map((r) => (
                    <div 
                      key={r.id}
                      className={`rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2 ${
                        isCompact ? 'p-2' : 'p-2.5'
                      }`}
                    >
                      <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate font-medium">{r.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* D. CLEAN EMPTY STATE */}
            {!hasTimelineContent && (
              <div 
                className={`rounded-2xl bg-white/[0.01] border border-dashed border-white/10 flex items-center justify-between gap-3 text-xs my-1 cursor-pointer hover:border-white/20 transition-all ${
                  isCompact ? 'py-3 px-3' : 'py-5 px-4'
                }`}
              >
                <div className="flex items-center gap-2.5 text-slate-400 min-w-0">
                  <Clock className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  <span className="truncate">Timeline clear for today.</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-white/[0.04] text-slate-300 border border-white/10 shrink-0">
                  + Add
                </span>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* 3. Core Command: Nutrition with Google-Style Calorie Circle & Homescreen Food Logging */}
      {vm.nutrition !== false && (() => {
        const consumedCals = Number(nutritionData?.consumedCalories) || 0;
        const targetCals = Number(todayTargetCals) || 3250;
        const calsPercent = Math.min(100, Math.max(0, Math.round((consumedCals / (targetCals || 1)) * 100)));
        const remainingCals = targetCals - consumedCals;
        const isSurplus = remainingCals < 0;

        const circleRadius = 44;
        const circumference = 2 * Math.PI * circleRadius;
        const strokeDashoffset = circumference - (calsPercent / 100) * circumference;

        const currentProtein = Number(nutritionData?.protein?.current) || 0;
        const targetProt = Number(todayTargetProtein) || 180;
        const proteinPercent = Math.min(100, Math.round((currentProtein / (targetProt || 1)) * 100));

        const currentCarbs = Number(nutritionData?.carbs?.current) || 0;
        const targetCarb = Number(todayTargetCarbs) || 450;
        const carbsPercent = Math.min(100, Math.round((currentCarbs / (targetCarb || 1)) * 100));

        const currentFats = Number(nutritionData?.fats?.current) || 0;
        const targetFat = Number(nutritionData?.fats?.target) || 80;
        const fatsPercent = Math.min(100, Math.round((currentFats / (targetFat || 1)) * 100));

        const todayMeals = (Array.isArray(nutritionData?.meals) ? nutritionData.meals : []).filter(m => m && m.date === todayIso);

        return (
          <div className={isCompact ? 'mt-2' : 'mt-3'}>
            <GlassCard 
              onClick={() => {
                playSound('click', soundEnabled);
                onNavigate('nutrition');
              }}
              className={`relative z-20 isolate touch-manipulation flex flex-col justify-between group transition-all cursor-pointer ${isCompact ? 'p-3.5' : 'p-5'}`}
            >
              {/* Header: Title & Quick Navigate */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div 
                  className="flex items-center gap-2.5 group/nav"
                >
                  <div 
                    className={`rounded-xl flex items-center justify-center bg-white/[0.04] text-slate-300 border border-white/[0.08] group-hover:border-white/20 group-hover:text-white transition-all ${isCompact ? 'w-7 h-7' : 'w-8 h-8'}`}
                  >
                    <UtensilsCrossed className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} style={{ color: 'var(--accent-primary)' }} />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 group-hover:text-white transition-colors">
                      Daily Nutrition
                    </h3>
                    <p className="text-[10px] text-slate-500 font-sans">Macro & fuel breakdown</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {latestWeight && (
                    <span className="hidden sm:inline-flex text-[11px] font-mono font-semibold px-2 py-0.5 rounded-lg bg-white/[0.03] text-slate-300 border border-white/5">
                      ⚖️ {latestWeight} lbs {weightChangeStr ? `(${weightChangeStr})` : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      handleOpenMealModal('quick_text');
                    }}
                    className="flex items-center justify-center w-7 h-7 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white border border-white/10 hover:border-white/20 shadow-sm transition-all active:scale-90 cursor-pointer"
                    title="Log food"
                  >
                    <Plus className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  </button>
                </div>
              </div>

              {/* Core Visualizer: Calorie Circle & Google-Style Macro Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center my-1">
                
                {/* Left: Calorie Circle Ring Visualizer */}
                <div className="md:col-span-5 flex items-center justify-center sm:justify-start gap-4">
                  <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 108 108">
                      {/* Background Track Ring */}
                      <circle
                        cx="54"
                        cy="54"
                        r={circleRadius}
                        className="fill-none stroke-white/[0.06]"
                        strokeWidth="8"
                      />
                      {/* Dynamic Progress Ring */}
                      <circle
                        cx="54"
                        cy="54"
                        r={circleRadius}
                        className="fill-none transition-all duration-700 ease-out"
                        stroke="var(--accent-primary)"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        style={{
                          filter: 'drop-shadow(0 0 8px var(--accent-glow))'
                        }}
                      />
                    </svg>
                    
                    {/* Text Inside Circle */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                      <span className="text-xl sm:text-2xl font-black font-mono text-white tracking-tight leading-none">
                        {consumedCals.toLocaleString()}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                        kcal
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {calsPercent}%
                      </span>
                    </div>
                  </div>

                  {/* Calorie Stats Next to Circle */}
                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isSurplus ? (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          +{Math.abs(remainingCals).toLocaleString()} kcal over
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          {remainingCals.toLocaleString()} kcal left
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400">
                      Target: <span className="font-mono font-bold text-white">{targetCals.toLocaleString()}</span> kcal
                    </div>
                    <div className="text-[11px] text-slate-500 font-sans">
                      {todayMeals.length} meal{todayMeals.length === 1 ? '' : 's'} logged today
                    </div>
                  </div>
                </div>

                {/* Right: Google-Style Macro Progress Bars */}
                <div className="md:col-span-7 flex flex-col justify-center space-y-2">
                  {/* Protein Bar */}
                  <div className="bg-white/[0.02] p-2 rounded-xl border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }} />
                        Protein
                      </span>
                      <span className="text-slate-400">
                        <strong className="text-white font-bold">{currentProtein}g</strong> / {targetProt}g
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-500"
                        style={{ 
                          width: `${proteinPercent}%`,
                          backgroundColor: 'var(--accent-primary)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Carbs Bar */}
                  <div className="bg-white/[0.02] p-2 rounded-xl border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Carbs
                      </span>
                      <span className="text-slate-400">
                        <strong className="text-white font-bold">{currentCarbs}g</strong> / {targetCarb}g
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${carbsPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Fats Bar */}
                  <div className="bg-white/[0.02] p-2 rounded-xl border border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Fats
                      </span>
                      <span className="text-slate-400">
                        <strong className="text-white font-bold">{currentFats}g</strong> / {targetFat}g
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full bg-amber-400 transition-all duration-500"
                        style={{ width: `${fatsPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

              </div>

            </GlassCard>
          </div>
        );
      })()}

      {/* Homescreen Meal Log Modal */}
      {isMealModalOpen && (
        <MealLogModal
          isOpen={isMealModalOpen}
          onClose={() => setIsMealModalOpen(false)}
          onLogMeal={(meal) => {
            if (onLogMeal) {
              onLogMeal(meal);
            } else if (setNutritionData) {
              setNutritionData(prev => ({
                ...prev,
                meals: [meal, ...(prev?.meals || [])]
              }));
            }
            setIsMealModalOpen(false);
          }}
          selectedDate={todayIso}
          householdPantry={nutritionData?.householdPantry || []}
          aiConfig={settings?.aiConfig}
          kitchenCalibration={nutritionData?.kitchenCalibration}
          soundEnabled={soundEnabled}
          initialTab={modalInitialTab}
        />
      )}

    </div>
  );
};
