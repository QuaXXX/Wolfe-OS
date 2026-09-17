import React from 'react';
import { 
  TrendingUp, 
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
  Flame,
  Droplets,
  Scale,
  Sparkles,
  Plus,
  ChevronRight,
  Activity,
  Zap,
  Tag
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { CompactVoiceWidget } from '../voice/CompactVoiceWidget';
import { InstagramStoryTray } from '../home/InstagramStoryTray';
import { playSound } from '../../utils/soundFX';
import { getTodayIso } from '../../utils/calendarUtils';
import { triggerImmediateCloudPush } from '../../utils/cloudSyncEngine';

export const HomeView = ({ 
  user, 
  nutritionData, 
  tradingData, 
  calendarData = { items: [] },
  settings = { visibleModules: {}, aiConfig: {}, compactMode: false },
  setSettings,
  setNutritionData,
  setTradingData,
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
  soundEnabled = true 
}) => {
  const vm = settings.visibleModules || {};
  const isCompact = !!settings.compactMode;
  const todayIso = getTodayIso();

  // --- NUTRITION DERIVATIONS ---
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
  const todayTargetFats = (typeof rawTodayTarget === 'object' && rawTodayTarget !== null ? rawTodayTarget.fats : null) || nutritionData?.fats?.target || 80;

  const consumedCals = nutritionData?.consumedCalories || 0;
  const consumedProtein = nutritionData?.protein?.current || 0;
  const consumedCarbs = nutritionData?.carbs?.current || 0;
  const consumedFats = nutritionData?.fats?.current || 0;
  const waterCount = nutritionData?.waterGlasses || 0;

  // Macro calorie ratios for segmented bar
  const proteinCals = consumedProtein * 4;
  const carbsCals = consumedCarbs * 4;
  const fatsCals = consumedFats * 9;
  const totalMacroCals = Math.max(1, proteinCals + carbsCals + fatsCals);
  const proteinPct = Math.min(100, Math.round((proteinCals / totalMacroCals) * 100));
  const carbsPct = Math.min(100, Math.round((carbsCals / totalMacroCals) * 100));
  const fatsPct = Math.min(100, Math.round((fatsCals / totalMacroCals) * 100));

  // Today's logged meals
  const todayMeals = (nutritionData?.meals || []).filter(m => m.date === todayIso);

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
  };

  // --- TRADING DERIVATIONS ---
  const dayPnl = tradingData?.dayPnl || 0;
  const dayPnlPct = tradingData?.dayPnlPercent || 0;
  const isPnlPositive = dayPnl >= 0;

  // Default market ticker tape items
  const defaultTickers = [
    { symbol: 'SPY', price: '512.40', change: '+0.82%', isPositive: true },
    { symbol: 'QQQ', price: '442.10', change: '+1.14%', isPositive: true },
    { symbol: 'NVDA', price: '128.50', change: '-0.45%', isPositive: false },
    { symbol: 'TSLA', price: '214.20', change: '+2.30%', isPositive: true },
  ];
  const marketTickers = tradingData?.watchlist?.length > 0
    ? tradingData.watchlist.map(w => ({
        symbol: w.symbol,
        price: w.price || '—',
        change: w.change || '+0.0%',
        isPositive: w.isPositive ?? !String(w.change).includes('-')
      }))
    : defaultTickers;

  const osData = {
    nutritionData,
    tradingData,
    calendarData,
    setSettings,
    setNutritionData,
    setTradingData,
    setCalendarData,
    onClearDeadlines,
    onPurgeItems
  };

  // --- CALENDAR & TIMELINE DERIVATIONS ---
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
  const completedTasksCount = todayTasks.filter(t => t.completed).length;

  const hasTimelineContent = todayDeadlines.length > 0 || todayEvents.length > 0 || todayTasks.length > 0 || todayReminders.length > 0;

  // Next up item
  const nextUpItem = todayDeadlines[0] || todayEvents[0] || todayTasks.find(t => !t.completed);

  return (
    <div className={`max-w-6xl mx-auto select-none ${isCompact ? 'space-y-3.5 pb-16' : 'space-y-4 pb-24'}`}>
      
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
      />

      {/* 2. INSTAGRAM STORY HIGHLIGHTS TRAY */}
      <InstagramStoryTray
        user={user}
        nutritionData={nutritionData}
        tradingData={tradingData}
        calendarData={calendarData}
        setNutritionData={setNutritionData}
        onNavigate={onNavigate}
        soundEnabled={soundEnabled}
        todayIso={todayIso}
      />

      {/* 3. HIGH-FREQUENCY QUICK ACTION CHIPS */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-0.5">
        <button
          type="button"
          onClick={handleQuickWater}
          className="micro-pill shrink-0 active:scale-95 cursor-pointer bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/25"
          title="Add 1 cup / 250ml water"
        >
          <Droplets className="w-3 h-3 text-sky-400" />
          <span>+1 Water ({waterCount}/8)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            playSound('click', soundEnabled);
            onNavigate('nutrition');
          }}
          className="micro-pill shrink-0 active:scale-95 cursor-pointer bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/25"
        >
          <Flame className="w-3 h-3 text-amber-400" />
          <span>+ Log Meal</span>
        </button>

        <button
          type="button"
          onClick={() => {
            playSound('click', soundEnabled);
            onNavigate('calendar');
          }}
          className="micro-pill shrink-0 active:scale-95 cursor-pointer bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/25"
        >
          <CalendarDays className="w-3 h-3 text-purple-400" />
          <span>+ Event</span>
        </button>

        <button
          type="button"
          onClick={() => {
            playSound('click', soundEnabled);
            onNavigate('calendar');
          }}
          className="micro-pill shrink-0 active:scale-95 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/25"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>+ Task</span>
        </button>

        <button
          type="button"
          onClick={() => {
            playSound('click', soundEnabled);
            onNavigate('trading');
          }}
          className="micro-pill shrink-0 active:scale-95 cursor-pointer bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/25"
        >
          <TrendingUp className="w-3 h-3 text-emerald-400" />
          <span>War Room Desk</span>
        </button>

        <span className="text-[10px] font-mono text-slate-500 shrink-0 ml-auto hidden sm:inline-block">
          ● Synced to Cloud
        </span>
      </div>

      {/* 4. TIMELINE & TASKS (INSTAGRAM EDITORIAL POST STYLE) */}
      {vm.timeline !== false && (
        <GlassCard 
          onClick={(e) => {
            playSound('click', soundEnabled);
            onNavigate('calendar');
          }}
          className={`relative z-10 isolate overflow-hidden flex flex-col justify-between group cursor-pointer touch-manipulation ${isCompact ? 'p-3.5' : 'p-4 sm:p-5'}`}
        >
          <div>
            {/* INSTAGRAM POST HEADER */}
            <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Mini Story Gradient Ring Avatar */}
                <div className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-purple-500 via-pink-500 to-indigo-500 shrink-0">
                  <div className="w-full h-full rounded-full bg-[#0d0f18] flex items-center justify-center text-purple-400">
                    <CalendarDays className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white tracking-tight truncate">
                      @zach.agenda
                    </span>
                    {/* Blue Verified Badge */}
                    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[9px] font-black shrink-0 shadow-sm" title="Verified Agenda">
                      ✓
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      • Today
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 truncate">
                    {todayItems.length} active items • {todayDeadlines.length > 0 ? `${todayDeadlines.length} due today` : 'on schedule'}
                  </span>
                </div>
              </div>

              {/* Header Right: Google Sync Pill & Arrow */}
              <div className="flex items-center gap-2 shrink-0">
                {(isSyncingGoogle || syncStatus === 'syncing') ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1.5 bg-white/[0.04] text-slate-300 border border-white/10">
                    <RotateCw className="w-3 h-3 animate-spin text-slate-400" />
                    <span className="hidden sm:inline">Syncing...</span>
                  </span>
                ) : syncStatus === 'synced' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Google Calendar & Tasks are synced. Tap to refresh."
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="hidden sm:inline">Synced</span>
                  </button>
                ) : (syncStatus === 'failed' || syncStatus === 'error') ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                    title="Sync failed. Tap to reconnect."
                  >
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                    <span className="hidden sm:inline">Failed</span>
                  </button>
                ) : isGoogleConnected ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium text-slate-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3 text-slate-400" />
                    <span className="hidden sm:inline">Sync</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSound('click', soundEnabled);
                      if (onSyncGoogleCalendar) onSyncGoogleCalendar();
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium text-slate-400 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                  >
                    <CalendarDays className="w-3 h-3 text-slate-400" />
                    <span>Connect</span>
                  </button>
                )}

                <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
              </div>
            </div>

            {/* LIVE "NEXT UP" RIBBON (IF ACTIVE ITEMS EXIST) */}
            {nextUpItem && (
              <div className="mb-3 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                  <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-rose-300 shrink-0">
                    NEXT UP
                  </span>
                  <span className="text-slate-200 font-semibold truncate">
                    {nextUpItem.time ? `${nextUpItem.time} • ` : ''}{nextUpItem.title}
                  </span>
                </div>
                {nextUpItem.category && (
                  <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40 text-slate-400 shrink-0 border border-white/5">
                    {nextUpItem.category}
                  </span>
                )}
              </div>
            )}

            {/* A. DEADLINES (SLEEK GLOWING CRIMSON ROWS) */}
            {todayDeadlines.length > 0 && (
              <div className={`${isCompact ? 'mb-2.5 space-y-1.5' : 'mb-3.5 space-y-2'}`}>
                {todayDeadlines.map(dl => (
                  <div 
                    key={dl.id}
                    className={`rounded-xl bg-[#180e12]/80 border-l-2 border-l-rose-500 border-t border-r border-b border-rose-500/20 text-xs flex items-center justify-between transition-all hover:border-rose-500/40 shadow-sm ${
                      isCompact ? 'p-2' : 'p-2.5'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                      <span className="font-bold text-rose-100 truncate">{dl.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-mono font-black tracking-wider text-rose-400 uppercase px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/30">
                        🚨 DUE TODAY
                      </span>
                      {dl.category && (
                        <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-black/40 border border-white/5">
                          {dl.category}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* B. TIMED EVENTS STREAM */}
            {todayEvents.length > 0 && (
              <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 ${isCompact ? 'mb-2.5' : 'mb-3'}`}>
                {todayEvents.slice(0, isCompact ? 3 : 4).map((evt) => (
                  <div 
                    key={evt.id} 
                    className="rounded-xl bg-white/[0.02] border border-white/[0.07] hover:border-white/20 p-2.5 flex flex-col justify-between transition-colors"
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-mono text-[10px] text-purple-300 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-purple-400" /> {evt.time || 'All Day'}
                      </span>
                      {evt.category && (
                        <span className="text-[9px] font-mono uppercase text-slate-400 px-1 py-0.2 rounded bg-black/30">
                          {evt.category}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-slate-100 text-xs truncate">{evt.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* C. ACTIVE TASKS & REMINDERS STRIP (THREADS CHECKLIST STYLE) */}
            {(todayTasks.length > 0 || todayReminders.length > 0) && (
              <div className={`${isCompact ? 'pt-1' : 'pt-1.5'} space-y-2`}>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-slate-400 font-semibold px-0.5">
                  <div className="flex items-center gap-1.5">
                    <ListTodo className="w-3 h-3 text-emerald-400" />
                    <span>Tasks & Action Items</span>
                  </div>
                  <span>{completedTasksCount}/{todayTasks.length} Done</span>
                </div>

                <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${isCompact ? 'gap-1.5' : 'gap-2'}`}>
                  {todayTasks.slice(0, isCompact ? 4 : 6).map((t) => (
                    <div 
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        playSound(t.completed ? 'switch' : 'success', soundEnabled);
                        if (onToggleTask) onToggleTask(t.id);
                      }}
                      className={`rounded-xl border flex items-center gap-2.5 text-xs cursor-pointer transition-all p-2.5 ${
                        t.completed
                          ? 'bg-white/[0.01] border-white/5 text-slate-500 line-through'
                          : 'bg-white/[0.03] border-white/[0.08] hover:border-white/20 text-slate-200'
                      }`}
                    >
                      <button type="button" className="shrink-0 cursor-pointer">
                        {t.completed ? (
                          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/60 flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-slate-600 bg-black/40 hover:border-slate-400 transition-colors" />
                        )}
                      </button>
                      <span className="truncate font-medium flex-1">{t.title}</span>
                      {t.priority === 'high' && (
                        <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded border border-amber-500/20 shrink-0">
                          HIGH
                        </span>
                      )}
                    </div>
                  ))}

                  {todayReminders.slice(0, isCompact ? 1 : 2).map((r) => (
                    <div 
                      key={r.id}
                      className="rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2 p-2.5"
                    >
                      <Bell className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="truncate font-medium flex-1">{r.title}</span>
                      <span className="text-[9px] font-mono text-amber-300/80 bg-black/30 px-1.5 py-0.5 rounded shrink-0">
                        Reminder
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* D. EMPTY STATE */}
            {!hasTimelineContent && (
              <div 
                className={`rounded-2xl bg-white/[0.01] border border-dashed border-white/10 flex items-center justify-between gap-3 text-xs my-1 cursor-pointer hover:border-white/20 transition-all ${
                  isCompact ? 'py-3 px-3' : 'py-4 px-4'
                }`}
              >
                <div className="flex items-center gap-2.5 text-slate-400 min-w-0">
                  <Clock className="w-4 h-4 shrink-0 text-slate-500" />
                  <span className="truncate">Timeline clear for today. Tap to add tasks or events.</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-white/[0.04] text-slate-300 border border-white/10 shrink-0">
                  + Add
                </span>
              </div>
            )}

            {/* MICRO METRIC BOTTOM STRIP */}
            <div className="mt-3 pt-2.5 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono text-slate-500">
              <div className="flex items-center gap-3">
                <span>📌 {todayTasks.filter(t => !t.completed).length} Pending</span>
                <span>⚡ {completedTasksCount} Completed</span>
                <span>🗓️ {todayEvents.length} Events</span>
              </div>
              <span className="text-slate-400 hover:text-white transition-colors flex items-center gap-0.5">
                Open Calendar <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </GlassCard>
      )}

      {/* 5. CORE COMMAND: NUTRITION & DAY TRADING (INSTAGRAM POST STYLE) */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isCompact ? 'gap-3 mt-2' : 'gap-4 mt-3'}`}>
        
        {/* NUTRITION CARD (@daily.fuel) */}
        {vm.nutrition !== false && (
          <GlassCard 
            onClick={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              playSound('click', soundEnabled);
              onNavigate('nutrition');
            }}
            className={`relative z-20 isolate touch-manipulation flex flex-col justify-between group cursor-pointer ${isCompact ? 'p-3.5' : 'p-4 sm:p-5'}`}
          >
            <div>
              {/* INSTAGRAM POST HEADER */}
              <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-amber-400 via-orange-500 to-rose-600 shrink-0">
                    <div className="w-full h-full rounded-full bg-[#110c14] flex items-center justify-center text-orange-400">
                      <Flame className="w-3.5 h-3.5 fill-current" />
                    </div>
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white tracking-tight truncate">
                        @daily.fuel
                      </span>
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[9px] font-black shrink-0 shadow-sm" title="Verified Fuel">
                        ✓
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        • Surplus
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 truncate">
                      Hypertrophy Calorie Surplus Target
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/25">
                    + Log
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
                </div>
              </div>

              {/* CALORIE & WEIGHT HERO ROW */}
              <div className="my-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-mono font-extrabold text-white tracking-tight">
                      {consumedCals.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      / {todayTargetCals.toLocaleString()} kcal
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {latestWeight && (
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        ⚖️ {latestWeight} lbs {weightChangeStr ? `(${weightChangeStr})` : ''}
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-300 border border-sky-500/20">
                      💧 {waterCount}/8
                    </span>
                  </div>
                </div>

                {/* SEGMENTED 3-COLOR MACRO BREAKDOWN BAR */}
                <div className="w-full mt-2.5">
                  <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden flex gap-[2px]">
                    <div 
                      style={{ width: `${Math.max(4, proteinPct)}%` }}
                      className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-l-full transition-all duration-300"
                      title={`Protein: ${consumedProtein}g (${proteinPct}%)`}
                    />
                    <div 
                      style={{ width: `${Math.max(4, carbsPct)}%` }}
                      className="h-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-300"
                      title={`Carbs: ${consumedCarbs}g (${carbsPct}%)`}
                    />
                    <div 
                      style={{ width: `${Math.max(4, fatsPct)}%` }}
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-r-full transition-all duration-300"
                      title={`Fats: ${consumedFats}g (${fatsPct}%)`}
                    />
                  </div>

                  {/* Micro Macro Targets Grid */}
                  <div className="grid grid-cols-3 gap-1.5 mt-2.5">
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 text-center">
                      <div className="text-[9px] font-mono uppercase text-violet-400 font-bold">Protein</div>
                      <div className="text-xs font-mono font-bold text-white mt-0.5">
                        {consumedProtein}<span className="text-[10px] text-slate-500 font-normal">/{todayTargetProtein}g</span>
                      </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 text-center">
                      <div className="text-[9px] font-mono uppercase text-sky-400 font-bold">Carbs</div>
                      <div className="text-xs font-mono font-bold text-white mt-0.5">
                        {consumedCarbs}<span className="text-[10px] text-slate-500 font-normal">/{todayTargetCarbs}g</span>
                      </div>
                    </div>
                    <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 text-center">
                      <div className="text-[9px] font-mono uppercase text-amber-400 font-bold">Fats</div>
                      <div className="text-xs font-mono font-bold text-white mt-0.5">
                        {consumedFats}<span className="text-[10px] text-slate-500 font-normal">/{todayTargetFats}g</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RECENT FUEL CHIPS FEED */}
                <div className="mt-3 pt-2 border-t border-white/[0.04]">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1.5">
                    <span>Recent Fuel Logged Today</span>
                    <span>{todayMeals.length} Meals</span>
                  </div>

                  {todayMeals.length > 0 ? (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                      {todayMeals.slice(-3).reverse().map((meal, idx) => (
                        <span 
                          key={meal.id || idx} 
                          className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-slate-300 shrink-0 truncate max-w-[140px]"
                        >
                          {meal.name || 'Meal'} ({meal.calories || 0} kcal)
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-slate-500 italic">
                      No meals logged yet today. Tap to log or snap photo.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </GlassCard>
        )}

        {/* DAY TRADING CARD (@warroom.alpha) */}
        {vm.trading !== false && (
          <GlassCard 
            onClick={(e) => {
              if (e && e.stopPropagation) e.stopPropagation();
              playSound('click', soundEnabled);
              onNavigate('trading');
            }}
            className={`relative z-10 isolate touch-manipulation flex flex-col justify-between group cursor-pointer ${isCompact ? 'p-3.5' : 'p-4 sm:p-5'}`}
          >
            <div>
              {/* INSTAGRAM POST HEADER */}
              <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full p-[1.5px] bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-600 shrink-0">
                    <div className="w-full h-full rounded-full bg-[#0a1215] flex items-center justify-center text-emerald-400">
                      <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white tracking-tight truncate">
                        @market.desk
                      </span>
                      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[9px] font-black shrink-0 shadow-sm" title="Verified Desk">
                        ✓
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">
                        • NYC Desk
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 truncate">
                      War Room Trading & Setups
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
                </div>
              </div>

              {/* TICKER TAPE STRIP */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-1 bg-black/30 rounded-lg border border-white/[0.05] mb-2.5">
                {marketTickers.map(t => (
                  <div key={t.symbol} className="flex items-center gap-1 text-[10px] font-mono shrink-0 px-1">
                    <span className="font-bold text-slate-300">{t.symbol}</span>
                    <span className="text-slate-400">${t.price}</span>
                    <span className={t.isPositive ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                      {t.change}
                    </span>
                  </div>
                ))}
              </div>

              {/* P&L HERO & STATS */}
              <div className="my-2">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <div className={`text-2xl sm:text-3xl font-mono font-extrabold tracking-tight ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPnlPositive ? '+' : ''}${Math.abs(dayPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono flex items-center gap-2">
                      <span className={isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}>
                        {isPnlPositive ? '+' : ''}{dayPnlPct}% P&L
                      </span>
                      <span>•</span>
                      <span>{tradingData.todayTrades?.length || 0} Trades Executed</span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono font-semibold px-2 py-1 rounded-lg bg-white/[0.03] text-slate-300 border border-white/[0.08] text-right">
                    Win: <strong className="text-emerald-400">{tradingData.winRate || '—'}</strong>
                  </span>
                </div>

                {/* DESK STATS & PLAY SPOTLIGHT */}
                <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2.5 border-t border-white/[0.04]">
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 text-center">
                    <div className="text-[9px] font-mono uppercase text-slate-400">Risk Profile</div>
                    <div className="text-xs font-mono font-bold text-slate-200 mt-0.5">1.0R / Play</div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 text-center">
                    <div className="text-[9px] font-mono uppercase text-emerald-400 font-bold">Chronos</div>
                    <div className="text-xs font-mono font-bold text-emerald-300 mt-0.5">Bullish Bias</div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg p-1.5 text-center">
                    <div className="text-[9px] font-mono uppercase text-slate-400">Watchlist</div>
                    <div className="text-xs font-mono font-bold text-slate-200 mt-0.5">
                      {tradingData.watchlist?.length || 4} Setups
                    </div>
                  </div>
                </div>

                {/* FOOTER ACTION */}
                <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-slate-500">
                  <span>Strategy: Breakout & Mean Reversion</span>
                  <span className="text-slate-400 hover:text-white transition-colors flex items-center gap-0.5">
                    Launch Desk <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            </div>
          </GlassCard>
        )}
      </div>

    </div>
  );
};
