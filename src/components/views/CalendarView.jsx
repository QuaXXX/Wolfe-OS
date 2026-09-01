import React, { useState, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Trash2, 
  Clock, 
  AlertOctagon, 
  CheckCircle2, 
  Circle, 
  ListTodo, 
  X,
  FileText
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';
import { 
  getTodayIso, 
  formatDateTitle, 
  addDays, 
  getMonthGrid,
  GOOGLE_COLOR_MAP
} from '../../utils/calendarUtils';
import { SyllabusIngestionModal } from '../school/SyllabusIngestionModal';
import { isGoogleCalendarConnected } from '../../utils/googleCalendarService';

export const CalendarView = ({ 
  calendarData, 
  onAddItem,
  onBatchAddItems,
  onClearDeadlines,
  onDeleteItem,
  onToggleTask,
  onOpenGoogleCalendar,
  soundEnabled = true 
}) => {
  const todayIso = getTodayIso();
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [viewMode, setViewMode] = useState('day'); // 'day' or 'month'
  
  // Month grid navigation state
  const [currentMonthDate, setCurrentMonthDate] = useState(todayIso);
  
  // Quick Add Item Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSyllabusModalOpen, setIsSyllabusModalOpen] = useState(false);
  const [itemType, setItemType] = useState('event'); // 'event', 'deadline', 'task', 'reminder'
  const [itemTitle, setItemTitle] = useState('');
  const [itemDate, setItemDate] = useState(todayIso);
  const [itemCategory, setItemCategory] = useState('School');
  const [itemStartTime, setItemStartTime] = useState('02:00 PM');
  const [itemEndTime, setItemEndTime] = useState('03:00 PM');
  const [itemIsAllDay, setItemIsAllDay] = useState(false);

  const items = calendarData?.items || [];
  const selectedDayItems = items.filter(it => it.date === selectedDate);
  const selectedDayDeadlines = selectedDayItems.filter(it => it.type === 'deadline');
  const selectedDayTimedEvents = selectedDayItems.filter(it => it.type === 'event');
  
  // Incomplete tasks flow to the top; completed tasks flow to the bottom
  const selectedDayTasks = selectedDayItems
    .filter(it => it.type === 'task' || it.type === 'reminder')
    .sort((a, b) => {
      if (a.completed === b.completed) return 0;
      return a.completed ? 1 : -1;
    });

  const monthGrid = useMemo(() => {
    return getMonthGrid(currentMonthDate);
  }, [currentMonthDate]);

  const monthTitle = useMemo(() => {
    const [y, m] = currentMonthDate.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [currentMonthDate]);

  const handlePrevMonth = () => {
    playSound('switch', soundEnabled);
    const [y, m] = currentMonthDate.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setCurrentMonthDate(prev.toISOString().split('T')[0]);
  };

  const handleNextMonth = () => {
    playSound('switch', soundEnabled);
    const [y, m] = currentMonthDate.split('-').map(Number);
    const next = new Date(y, m, 1);
    setCurrentMonthDate(next.toISOString().split('T')[0]);
  };

  const handlePrevDay = () => {
    playSound('switch', soundEnabled);
    setSelectedDate(prev => addDays(prev, -1));
  };

  const handleNextDay = () => {
    playSound('switch', soundEnabled);
    setSelectedDate(prev => addDays(prev, 1));
  };

  const handleTodayJump = () => {
    playSound('click', soundEnabled);
    setSelectedDate(todayIso);
    setCurrentMonthDate(todayIso);
  };

  const handleOpenAddModal = (type = 'event', defaultDate = selectedDate) => {
    playSound('click', soundEnabled);
    setItemType(type);
    setItemDate(defaultDate || selectedDate);
    setItemTitle('');
    setItemCategory(type === 'deadline' ? 'School' : 'General');
    setItemIsAllDay(type === 'deadline' || type === 'task');
    setIsAddModalOpen(true);
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!itemTitle.trim()) return;

    playSound('success', soundEnabled);
    const isDeadline = itemType === 'deadline';
    const isAllDay = itemIsAllDay || isDeadline || itemType === 'task';

    const newItem = {
      type: itemType,
      title: itemTitle.trim(),
      date: itemDate || selectedDate,
      time: isAllDay ? 'All Day' : `${itemStartTime} - ${itemEndTime}`,
      isAllDay,
      category: itemCategory,
      priority: isDeadline ? 'urgent' : 'normal',
      completed: false,
    };

    if (onAddItem) {
      onAddItem(newItem);
    }

    setIsAddModalOpen(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 select-none">
      
      {/* 1. TOP HEADER & NAVIGATION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Schedule & Timeline
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full academic timetable, hard deadlines, tasks & calendar
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Day / Month Toggle Switch */}
          <div className="flex p-1 rounded-xl bg-white/[0.04] border border-white/10">
            <button
              onClick={() => {
                playSound('switch', soundEnabled);
                setViewMode('day');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'day' 
                  ? 'bg-white/10 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Day View
            </button>
            <button
              onClick={() => {
                playSound('switch', soundEnabled);
                setViewMode('month');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'month' 
                  ? 'bg-white/10 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Month View
            </button>
          </div>

          {/* Connect Google Calendar OR Import Syllabus based on connection state */}
          {!isGoogleCalendarConnected() ? (
            <button
              onClick={() => {
                playSound('click', soundEnabled);
                if (onOpenGoogleCalendar) onOpenGoogleCalendar();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 hover:text-white text-xs font-semibold border border-white/10 transition-all shrink-0 cursor-pointer"
            >
              <CalendarIcon className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              <span>Connect Google Calendar</span>
            </button>
          ) : (
            <button
              onClick={() => {
                playSound('click', soundEnabled);
                setIsSyllabusModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 hover:text-white text-xs font-semibold border border-white/10 transition-all shrink-0 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
              <span>Import Syllabus</span>
            </button>
          )}

          <button
            onClick={() => handleOpenAddModal('event')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold shadow-md active:scale-95 transition-all shrink-0 cursor-pointer"
            style={{ backgroundColor: 'var(--accent-primary)' }}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Event</span>
          </button>
        </div>
      </div>

      {/* 2. DAY VIEW MODE */}
      {viewMode === 'day' && (
        <div className="space-y-5">
          {/* Date Selector Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0f1220] border border-white/10 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevDay}
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextDay}
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-white pl-2">
                {formatDateTitle(selectedDate)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {selectedDate !== todayIso && (
                <button
                  onClick={handleTodayJump}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>

          {/* Day Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            
            {/* Left 2 Cols: Deadlines (Only if present) & Timed Schedule Blocks */}
            <div className="lg:col-span-2 space-y-4">
              
              {/* --- DEADLINES CONTAINER --- */}
              {selectedDayDeadlines.length > 0 && (
                <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-b from-rose-950/20 via-[#140b12] to-[#0e101d] backdrop-blur-xl p-4 shadow-lg overflow-hidden space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-rose-500/20 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded bg-rose-500/20 text-rose-400">
                        <AlertOctagon className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                        Deadlines & Due Dates
                      </h3>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {selectedDayDeadlines.map((dl) => (
                      <div
                        key={dl.id}
                        className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-200 text-xs shadow-sm hover:border-rose-500/45 transition-all group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                          <span className="font-semibold text-rose-100 truncate">{dl.title}</span>
                          {dl.category && (
                            <span className="text-[10px] text-rose-300/80 font-mono px-1.5 py-0.5 rounded bg-black/30 shrink-0">
                              {dl.category}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            playSound('click', soundEnabled);
                            if (onDeleteItem) onDeleteItem(dl.id);
                          }}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-100 hover:bg-rose-500/20 opacity-80 group-hover:opacity-100 transition-all ml-2 shrink-0 cursor-pointer"
                          title="Delete Deadline"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* --- TIMED SCHEDULE BLOCKS --- */}
              <GlassCard hoverEffect={false} className="p-5">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Timed Schedule & Events
                    </h3>
                  </div>
                  <button
                    onClick={() => handleOpenAddModal('event')}
                    className="text-[11px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Event</span>
                  </button>
                </div>

                {selectedDayTimedEvents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No scheduled events for this day. Click "+ Event" or ask Wolfe AI.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedDayTimedEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-all text-xs group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono text-slate-400 w-36 shrink-0 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                            {evt.time}
                          </span>
                          <span className="font-medium text-slate-100 truncate">{evt.title}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] uppercase font-mono text-slate-300 border border-white/10">
                            {evt.category}
                          </span>
                          <button
                            onClick={() => {
                              playSound('click', soundEnabled);
                              if (onDeleteItem) onDeleteItem(evt.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 opacity-70 group-hover:opacity-100 transition-all shrink-0"
                            title="Delete Event"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>

            {/* Right Col: Tasks & Reminders (Sorted: Incomplete at top, completed at bottom) */}
            <div className="space-y-4">
              <GlassCard hoverEffect={false} className="p-5 flex flex-col h-full">
                <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
                  <div className="flex items-center gap-2">
                    <ListTodo className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Tasks & Reminders
                    </h3>
                  </div>
                  <button
                    onClick={() => handleOpenAddModal('task')}
                    className="text-[11px] font-semibold text-slate-300 hover:text-white flex items-center gap-1"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Task</span>
                  </button>
                </div>

                {selectedDayTasks.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No active tasks or reminders for this date.
                  </div>
                ) : (
                  <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[380px] pr-1">
                    {selectedDayTasks.map((t) => (
                      <div
                        key={t.id}
                        className={`flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-all group ${
                          t.completed 
                            ? 'bg-white/[0.01] border-white/5 text-slate-600' 
                            : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-slate-200'
                        }`}
                      >
                        <div 
                          onClick={() => {
                            playSound('click', soundEnabled);
                            if (onToggleTask) onToggleTask(t.id);
                          }}
                          className="flex items-start gap-2.5 flex-1 min-w-0 cursor-pointer"
                        >
                          <button className="mt-0.5 shrink-0">
                            {t.completed ? (
                              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-slate-500" />
                            )}
                          </button>

                          <div className="min-w-0">
                            <div className={`text-xs font-medium leading-snug ${t.completed ? 'line-through text-slate-600' : 'text-white'}`}>
                              {t.title}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
                              <span>{t.type === 'reminder' ? '🔔 Reminder' : 'Task'}</span>
                              <span>• {t.category}</span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            playSound('click', soundEnabled);
                            if (onDeleteItem) onDeleteItem(t.id);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-white/10 opacity-70 group-hover:opacity-100 transition-all shrink-0"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            </div>

          </div>
        </div>
      )}

      {/* 3. FULL MONTH VIEW MODE (With rich item display on specific days) */}
      {viewMode === 'month' && (
        <div className="space-y-4">
          {/* Month Header Navigation */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0f1220] border border-white/10 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-bold text-white pl-2">
                {monthTitle}
              </span>
            </div>

            <button
              onClick={handleTodayJump}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/10 transition-colors"
            >
              Today
            </button>
          </div>

          {/* 7x5 Interactive Calendar Grid */}
          <GlassCard hoverEffect={false} className="p-4 overflow-hidden">
            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 mb-2 text-center text-[11px] font-bold uppercase text-slate-400 font-mono">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>

            {/* Day Cells with Rich Event and Task Pills */}
            <div className="grid grid-cols-7 gap-1.5">
              {monthGrid.map((cell, idx) => {
                const dayItems = items.filter(it => it.date === cell.dateIso);
                const dayDeadlines = dayItems.filter(it => it.type === 'deadline');
                const dayTimedEvents = dayItems.filter(it => it.type === 'event');
                const dayTasks = dayItems.filter(it => it.type === 'task' || it.type === 'reminder');
                const isSelected = cell.dateIso === selectedDate;

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setSelectedDate(cell.dateIso);
                      setViewMode('day'); // Open Day view on click
                    }}
                    className={`min-h-[105px] p-2 rounded-xl border flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-white bg-white/[0.08] shadow-md'
                        : cell.isCurrentMonth
                        ? 'bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.04]'
                        : 'bg-black/30 border-white/[0.02] opacity-40 hover:opacity-70'
                    }`}
                  >
                    {/* Top: Day Number & Red Deadline Pulse */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold ${
                        cell.isToday 
                          ? 'px-1.5 py-0.5 rounded-full text-white' 
                          : 'text-slate-300'
                      }`}
                      style={cell.isToday ? { backgroundColor: 'var(--accent-primary)' } : {}}
                      >
                        {cell.dayNumber}
                      </span>

                      {/* Red Deadline Indicator */}
                      {dayDeadlines.length > 0 && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/80 animate-pulse" title={`${dayDeadlines.length} Deadline(s)`} />
                      )}
                    </div>

                    {/* Middle: Rich Item Pills on Specific Days */}
                    <div className="space-y-1 my-1 overflow-hidden flex-1">
                      {/* Red Deadlines */}
                      {dayDeadlines.slice(0, 1).map(dl => (
                        <div key={dl.id} className="px-1.5 py-0.5 rounded bg-rose-500/25 border border-rose-500/40 text-[9px] text-rose-200 font-semibold truncate flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                          <span className="truncate">{dl.title}</span>
                        </div>
                      ))}

                      {/* Timed Events (With Start Time and Title) */}
                      {dayTimedEvents.slice(0, 2).map(evt => (
                        <div key={evt.id} className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-[9px] text-slate-200 font-medium truncate flex items-center gap-1">
                          <span className="text-slate-400 font-mono text-[8px] shrink-0">{evt.time.split(' - ')[0]}</span>
                          <span className="truncate">{evt.title}</span>
                        </div>
                      ))}

                      {/* Tasks */}
                      {dayTasks.slice(0, 1).map(t => (
                        <div key={t.id} className={`px-1.5 py-0.5 rounded border text-[9px] font-medium truncate ${
                          t.completed 
                            ? 'bg-white/[0.02] border-white/5 text-slate-500 line-through' 
                            : 'bg-blue-500/10 border-blue-500/20 text-blue-200'
                        }`}>
                          {t.title}
                        </div>
                      ))}

                      {/* Overspill Badge */}
                      {dayItems.length > 3 && (
                        <div className="text-[8px] text-slate-400 font-mono pl-1">
                          +{dayItems.length - 3} more
                        </div>
                      )}
                    </div>

                    {/* Bottom: Count */}
                    <div className="text-[9px] text-slate-500 text-right font-mono">
                      {dayItems.length > 0 ? `${dayItems.length} item${dayItems.length > 1 ? 's' : ''}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        </div>
      )}

      {/* 4. CLEAN ADD ITEM MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setIsAddModalOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          <div className="relative w-full max-w-md bg-[#0e111d] border border-white/10 rounded-3xl p-6 shadow-2xl z-10 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div 
                  className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                >
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white tracking-tight">Add New Calendar Item</h3>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              {/* Type selector */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Item Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'event', label: 'Event', color: 'border-blue-500/40 text-blue-300' },
                    { id: 'deadline', label: 'Deadline', color: 'border-rose-500/40 text-rose-300' },
                    { id: 'task', label: 'Task', color: 'border-slate-500/40 text-slate-300' },
                    { id: 'reminder', label: 'Reminder', color: 'border-amber-500/40 text-amber-300' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setItemType(t.id)}
                      className={`py-2 px-1 rounded-xl text-xs font-semibold border transition-all text-center ${
                        itemType === t.id 
                          ? `${t.color} bg-white/[0.08] shadow-sm` 
                          : 'border-white/5 bg-white/[0.02] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Title / Subject</label>
                <input 
                  type="text"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  placeholder="e.g. Finish Calculus Chapter 4"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs placeholder:text-slate-600 outline-none focus:border-white/30"
                  autoFocus
                />
              </div>

              {/* Date & Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Date</label>
                  <input 
                    type="date"
                    value={itemDate}
                    onChange={(e) => setItemDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Category</label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30"
                  >
                    <option value="School">School / Academics</option>
                    <option value="Trading">Trading</option>
                    <option value="Fitness">Workouts / Fitness</option>
                    <option value="Nutrition">Nutrition</option>
                    <option value="General">General / Personal</option>
                  </select>
                </div>
              </div>

              {itemType === 'event' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">Start Time</label>
                    <input 
                      type="text"
                      value={itemStartTime}
                      onChange={(e) => setItemStartTime(e.target.value)}
                      placeholder="02:00 PM"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1.5">End Time</label>
                    <input 
                      type="text"
                      value={itemEndTime}
                      onChange={(e) => setItemEndTime(e.target.value)}
                      placeholder="03:00 PM"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all border border-white/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!itemTitle.trim()}
                  className="px-5 py-2 rounded-xl text-white text-xs font-semibold shadow-md active:scale-95 transition-all disabled:opacity-40"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Create Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. SYLLABUS INGESTION MODAL */}
      <SyllabusIngestionModal 
        isOpen={isSyllabusModalOpen}
        onClose={() => setIsSyllabusModalOpen(false)}
        onImportItems={onBatchAddItems || onAddItem}
        soundEnabled={soundEnabled}
      />

    </div>
  );
};
