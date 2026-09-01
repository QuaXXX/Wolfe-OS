import React, { useState } from 'react';
import { 
  Dumbbell, 
  Trophy, 
  CheckCircle2, 
  Circle, 
  Play 
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';

export const WorkoutsView = ({ 
  workoutData, 
  onOpenComingSoon, 
  soundEnabled = true 
}) => {
  const [exercises, setExercises] = useState(workoutData.todayExercises || []);
  const [isSessionActive, setIsSessionActive] = useState(false);

  const toggleExercise = (id) => {
    playSound('click', soundEnabled);
    setExercises(prev => prev.map(ex => {
      if (ex.id === id) {
        const next = !ex.completed;
        if (next) playSound('success', soundEnabled);
        return { ...ex, completed: next };
      }
      return ex;
    }));
  };

  const completedCount = exercises.filter(e => e.completed).length;
  const prs = workoutData.prs || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <Dumbbell className="w-4 h-4" />
            <span>Athletic Training • {workoutData.split || 'Custom Routine'}</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            Workouts & Routine
          </h1>
        </div>

        <button
          onClick={() => {
            const next = !isSessionActive;
            setIsSessionActive(next);
            playSound(next ? 'voice-open' : 'click', soundEnabled);
          }}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white transition-all shadow-sm active:scale-95 cursor-pointer"
          style={{ backgroundColor: 'var(--accent-primary)' }}
        >
          <Play className="w-3 h-3 fill-white" />
          <span>{isSessionActive ? "Active Session" : "Start Workout"}</span>
        </button>
      </div>

      {/* 7-Day Split */}
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
          7-Day Split Routine
        </h2>

        <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { day: "Mon", label: "Rest", done: false, current: false },
            { day: "Tue", label: "Rest", done: false, current: false },
            { day: "Wed", label: "Rest", done: false, current: false },
            { day: "Thu", label: "Rest", done: false, current: false },
            { day: "Fri", label: "Rest", done: false, current: true },
            { day: "Sat", label: "Rest", done: false, current: false },
            { day: "Sun", label: "Rest", done: false, current: false },
          ].map((item, idx) => (
            <GlassCard
              key={idx}
              className={`p-2 sm:p-3 text-center transition-all ${
                item.current 
                  ? 'ring-1 bg-[#14182a]' 
                  : item.done 
                    ? 'bg-white/[0.02]' 
                    : 'opacity-60'
              }`}
              style={item.current ? { borderColor: 'var(--accent-primary)' } : {}}
            >
              <div className="text-[9px] sm:text-[10px] font-bold uppercase" style={{ color: 'var(--accent-primary)' }}>{item.day}</div>
              <div className="text-[11px] sm:text-xs font-semibold text-white my-0.5 sm:my-1 truncate">{item.label}</div>
              <div className="text-[9px] sm:text-[10px] text-slate-400 font-mono">
                {item.done ? "Done" : item.current ? "Today" : "—"}
              </div>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* Routine + PRs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Exercises */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard hoverEffect={false} className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div>
                <span className="text-xs font-mono font-semibold uppercase" style={{ color: 'var(--accent-primary)' }}>Today's Focus</span>
                <h3 className="text-sm font-bold text-white">{workoutData.todayWorkout || 'Rest Day'}</h3>
              </div>
              <span className="text-xs font-mono text-slate-300">
                {completedCount} / {exercises.length} Done
              </span>
            </div>

            {exercises.length > 0 ? (
              <div className="space-y-2 my-3">
                {exercises.map((ex, i) => (
                  <div
                    key={ex.id}
                    onClick={() => toggleExercise(ex.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      ex.completed 
                        ? 'bg-white/[0.01] border-white/5 text-slate-500' 
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button>
                        {ex.completed ? (
                          <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <div>
                        <div className={`text-xs font-bold ${ex.completed ? 'line-through text-slate-500' : 'text-white'}`}>
                          {i + 1}. {ex.name}
                        </div>
                        <div className="text-[11px] text-slate-400">{ex.sets}</div>
                      </div>
                    </div>

                    <span className="font-mono text-xs text-slate-200 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                      {ex.weight}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-400 my-3">
                No exercises scheduled for today. You can log exercises or set up a split routine anytime via Wolfe AI.
              </div>
            )}

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
              <span>Progressive Overload System</span>
              <span className="font-mono text-white">Vol: {workoutData.weeklyVolumeLbs || '0 lbs'}</span>
            </div>
          </GlassCard>
        </div>

        {/* PR Board */}
        <div className="space-y-4">
          <GlassCard hoverEffect={false} className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5" style={{ color: 'var(--accent-primary)' }} />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">Personal Records</h3>
              </div>
            </div>

            {prs.length > 0 ? (
              <div className="space-y-2">
                {prs.map((pr, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-white">{pr.exercise}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{pr.date} • {pr.reps} reps</div>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-200">
                      {pr.weight}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-400">
                No personal records logged yet.
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
};
