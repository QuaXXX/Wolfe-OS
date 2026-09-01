import React from 'react';
import { 
  TrendingUp, 
  GraduationCap, 
  Dumbbell, 
  UtensilsCrossed, 
  CalendarDays, 
  ArrowUpRight, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  Circle,
  ListTodo,
  Bell
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { CompactVoiceWidget } from '../voice/CompactVoiceWidget';
import { playSound } from '../../utils/soundFX';
import { getTodayIso } from '../../utils/calendarUtils';

export const HomeView = ({ 
  user, 
  schoolData, 
  workoutData, 
  nutritionData, 
  tradingData, 
  calendarData = { items: [] },
  settings = { visibleModules: {}, aiConfig: {}, compactMode: false },
  setSettings,
  setNutritionData,
  setWorkoutData,
  setTradingData,
  setSchoolData,
  setCalendarData,
  onItemCreated,
  onClearCalendar,
  onClearDeadlines,
  onDeleteSpecificItem,
  onPurgeItems,
  onToggleTask,
  onOpenSettings,
  onNavigate,
  soundEnabled = true 
}) => {
  const nextAssignment = schoolData?.assignments?.find(a => !a.completed);
  const vm = settings.visibleModules || {};
  const isCompact = !!settings.compactMode;
  const todayIso = getTodayIso();

  const osData = {
    schoolData,
    workoutData,
    nutritionData,
    tradingData,
    calendarData,
    setSettings,
    setNutritionData,
    setWorkoutData,
    setTradingData,
    setSchoolData,
    setCalendarData,
    onClearDeadlines,
    onPurgeItems
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
    <div className={`max-w-6xl mx-auto select-none ${isCompact ? 'space-y-3 pb-16' : 'space-y-5 pb-24'}`}>
      
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

      {/* 2. TIMELINE & TASKS AT THE VERY TOP */}
      {vm.timeline !== false && (
        <GlassCard 
          onClick={() => {
            playSound('click', soundEnabled);
            onNavigate('calendar');
          }}
          className={`flex flex-col justify-between group cursor-pointer ${isCompact ? 'p-3.5' : 'p-5'}`}
        >
          <div>
            <div className={`flex items-center justify-between gap-2 ${isCompact ? 'mb-2' : 'mb-3'}`}>
              <div className="flex items-center gap-2">
                <div 
                  className={`rounded-lg flex items-center justify-center ${isCompact ? 'w-6 h-6' : 'w-7 h-7'}`}
                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                >
                  <CalendarDays className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Schedule & Tasks
                </h3>
              </div>
              <div className="flex items-center gap-2">
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
                      <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
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
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Circle className="w-3.5 h-3.5 text-slate-500" />
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
                <div className="flex items-center gap-2.5 text-slate-400">
                  <Clock className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                  <span>Timeline clear. Ask Wolfe AI or click to schedule.</span>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-white/[0.04] text-slate-300 border border-white/10 shrink-0">
                  + Add Item
                </span>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* 3. Upper Grid: Trading & School */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isCompact ? 'gap-3' : 'gap-5'}`}>
        
        {/* Day Trading */}
        {vm.trading !== false && (
          <GlassCard 
            onClick={() => {
              playSound('click', soundEnabled);
              onNavigate('trading');
            }}
            className={`flex flex-col justify-between group cursor-pointer ${isCompact ? 'p-3.5' : 'p-5'}`}
          >
            <div>
              <div className={`flex items-center justify-between gap-2 ${isCompact ? 'mb-1' : 'mb-2'}`}>
                <div className="flex items-center gap-2">
                  <div 
                    className={`rounded-lg flex items-center justify-center ${isCompact ? 'w-6 h-6' : 'w-7 h-7'}`}
                    style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                  >
                    <TrendingUp className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Day Trading
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {isCompact && (
                    <span className="text-xs font-mono font-bold text-white">
                      ${(tradingData.dayPnl || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  )}
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
                </div>
              </div>

              {!isCompact ? (
                <>
                  <div className="my-2 flex items-baseline justify-between">
                    <div>
                      <div className="text-2xl font-mono font-bold text-white">
                        ${(tradingData.dayPnl || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs font-mono mt-0.5" style={{ color: 'var(--accent-primary)' }}>
                        +{tradingData.dayPnlPercent || 0}% • {tradingData.todayTrades?.length || 0} Executed Trades
                      </div>
                    </div>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                      Win Rate: {tradingData.winRate || '—'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-2 border-t border-white/5">
                    {tradingData.watchlist?.length > 0 ? (
                      tradingData.watchlist.slice(0, 3).map(w => (
                        <span key={w.symbol}>{w.symbol} <strong className="font-normal" style={{ color: 'var(--accent-primary)' }}>{w.change}</strong></span>
                      ))
                    ) : (
                      <span>No active watchlist tickers</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mt-1 pt-1.5 border-t border-white/5">
                  <span style={{ color: 'var(--accent-primary)' }}>+{tradingData.dayPnlPercent || 0}% P&L</span>
                  <span>Win Rate: {tradingData.winRate || '—'}</span>
                </div>
              )}
            </div>
          </GlassCard>
        )}

        {/* School & Academics */}
        {vm.school !== false && (
          <GlassCard 
            onClick={() => {
              playSound('click', soundEnabled);
              onNavigate('school');
            }}
            className={`flex flex-col justify-between group cursor-pointer ${isCompact ? 'p-3.5' : 'p-5'}`}
          >
            <div>
              <div className={`flex items-center justify-between gap-2 ${isCompact ? 'mb-1' : 'mb-2'}`}>
                <div className="flex items-center gap-2">
                  <div 
                    className={`rounded-lg flex items-center justify-center ${isCompact ? 'w-6 h-6' : 'w-7 h-7'}`}
                    style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                  >
                    <GraduationCap className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    School & Academics
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {isCompact && (
                    <span className="text-xs font-mono font-bold text-white">
                      {schoolData.gpa} GPA
                    </span>
                  )}
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
                </div>
              </div>

              {!isCompact ? (
                <>
                  <div className="my-2 flex items-baseline justify-between">
                    <div>
                      <div className="text-2xl font-mono font-bold text-white">
                        {schoolData.gpa} <span className="text-xs font-normal text-slate-500">GPA</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {schoolData.term} • {schoolData.courses?.length || 0} Courses
                      </div>
                    </div>
                    {schoolData.gpa !== '—' && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                        Active Term
                      </span>
                    )}
                  </div>

                  {nextAssignment && (
                    <div className="flex items-center gap-2 text-xs bg-white/[0.03] border border-white/10 text-slate-300 p-2.5 rounded-xl truncate">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                      <span className="truncate">
                        <strong className="text-white">Upcoming:</strong> {nextAssignment.course} {nextAssignment.title}
                      </span>
                    </div>
                  )}
                </>
              ) : nextAssignment ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-300 mt-1 pt-1.5 border-t border-white/5 truncate">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-primary)' }} />
                  <span className="truncate">Due: {nextAssignment.course} {nextAssignment.title}</span>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 mt-1 pt-1.5 border-t border-white/5 font-mono">
                  {schoolData.courses.length} Active Courses
                </div>
              )}
            </div>
          </GlassCard>
        )}
      </div>

      {/* 4. Lower Grid: Workouts & Nutrition */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isCompact ? 'gap-3' : 'gap-5'}`}>
        
        {/* Workouts */}
        {vm.workouts !== false && (
          <GlassCard 
            onClick={() => {
              playSound('click', soundEnabled);
              onNavigate('workouts');
            }}
            className={`flex flex-col justify-between group cursor-pointer ${isCompact ? 'p-3.5' : 'p-5'}`}
          >
            <div>
              <div className={`flex items-center justify-between gap-2 ${isCompact ? 'mb-1' : 'mb-2'}`}>
                <div className="flex items-center gap-2">
                  <div 
                    className={`rounded-lg flex items-center justify-center ${isCompact ? 'w-6 h-6' : 'w-7 h-7'}`}
                    style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                  >
                    <Dumbbell className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Workouts
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {isCompact && (
                    <span className="text-xs font-semibold text-white">
                      {workoutData.todayWorkout || 'Rest Day'}
                    </span>
                  )}
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
                </div>
              </div>

              {!isCompact ? (
                <div className="my-2">
                  <div className="text-sm font-bold text-white">
                    {workoutData.todayWorkout || 'Rest Day'}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Target: {workoutData.completedDaysThisWeek || 0} of {workoutData.targetDaysThisWeek || 5} sessions complete
                  </div>
                  
                  <div className="w-full h-1 bg-white/10 rounded-full mt-2.5 overflow-hidden">
                    <div 
                      className="h-full rounded-full" 
                      style={{ 
                        width: `${((workoutData.completedDaysThisWeek || 0) / (workoutData.targetDaysThisWeek || 5)) * 100}%`,
                        backgroundColor: 'var(--accent-primary)'
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-slate-400 mt-1 pt-1.5 border-t border-white/5 font-mono">
                  <span>Week: {workoutData.completedDaysThisWeek || 0}/{workoutData.targetDaysThisWeek || 5} Complete</span>
                  <span>Vol: {workoutData.weeklyVolumeLbs || '0 lbs'}</span>
                </div>
              )}
            </div>
          </GlassCard>
        )}

        {/* Nutrition */}
        {vm.nutrition !== false && (
          <GlassCard 
            onClick={() => {
              playSound('click', soundEnabled);
              onNavigate('nutrition');
            }}
            className={`flex flex-col justify-between group cursor-pointer ${isCompact ? 'p-3.5' : 'p-5'}`}
          >
            <div>
              <div className={`flex items-center justify-between gap-2 ${isCompact ? 'mb-1' : 'mb-2'}`}>
                <div className="flex items-center gap-2">
                  <div 
                    className={`rounded-lg flex items-center justify-center ${isCompact ? 'w-6 h-6' : 'w-7 h-7'}`}
                    style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                  >
                    <UtensilsCrossed className={isCompact ? "w-3.5 h-3.5" : "w-4 h-4"} />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Nutrition
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {isCompact && (
                    <span className="text-xs font-mono font-bold text-white">
                      {nutritionData.consumedCalories} / {nutritionData.targetCalories} kcal
                    </span>
                  )}
                  <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-transform" />
                </div>
              </div>

              {!isCompact ? (
                <>
                  <div className="my-2">
                    <div className="text-2xl font-mono font-bold text-white">
                      {nutritionData.consumedCalories} <span className="text-xs font-normal text-slate-500">/ {nutritionData.targetCalories} kcal</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Protein: <span className="font-mono text-slate-200">{nutritionData.protein.current}g / {nutritionData.protein.target}g</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-white/5">
                    <span>Water: {nutritionData.waterGlasses}/{nutritionData.targetGlasses || 8} glasses</span>
                    <span style={{ color: 'var(--accent-primary)' }}>{Math.max(0, nutritionData.targetCalories - nutritionData.consumedCalories)} kcal left</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mt-1 pt-1.5 border-t border-white/5">
                  <span>Protein: {nutritionData.protein.current}g / {nutritionData.protein.target}g</span>
                  <span style={{ color: 'var(--accent-primary)' }}>{Math.max(0, nutritionData.targetCalories - nutritionData.consumedCalories)} kcal left</span>
                </div>
              )}
            </div>
          </GlassCard>
        )}
      </div>

    </div>
  );
};
