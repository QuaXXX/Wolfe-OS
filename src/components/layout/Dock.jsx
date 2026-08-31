import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Home, 
  GraduationCap, 
  Dumbbell, 
  UtensilsCrossed, 
  TrendingUp, 
  CalendarDays
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';

export const NAV_ITEMS = [
  { id: 'home', label: 'Home Hub', icon: Home },
  { id: 'school', label: 'School', icon: GraduationCap },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell },
  { id: 'nutrition', label: 'Nutrition', icon: UtensilsCrossed },
  { id: 'trading', label: 'Trading', icon: TrendingUp },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

export const Dock = ({ activeView, onViewChange, soundEnabled = true }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  return (
    <nav className="fixed bottom-5 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 select-none">
      {/* Outer Dock Container with Dynamic Theme Border & Glow */}
      <div 
        className="flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-2xl theme-dock"
      >
        {NAV_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          const isHovered = hoveredIndex === idx;

          return (
            <div 
              key={item.id} 
              className="relative flex flex-col items-center"
              onMouseEnter={() => {
                setHoveredIndex(idx);
                playSound('tick', soundEnabled);
              }}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Tooltip */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: -36 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.1 }}
                    className="absolute -top-1 px-2.5 py-0.5 rounded-lg bg-[#111424] text-[11px] font-semibold text-white whitespace-nowrap pointer-events-none z-50 shadow-xl"
                    style={{ border: '1px solid var(--accent-border)' }}
                  >
                    <span>{item.label}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Dynamic Dock Item Button (No dot underneath) */}
              <button
                onClick={() => {
                  playSound('switch', soundEnabled);
                  onViewChange(item.id);
                }}
                className={`
                  p-2.5 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer
                  ${isActive 
                    ? 'scale-105 font-bold' 
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                  }
                `}
                style={
                  isActive 
                    ? {
                        backgroundColor: 'var(--accent-primary)',
                        color: '#ffffff',
                        boxShadow: '0 0 20px -2px var(--accent-glow)'
                      } 
                    : isHovered 
                      ? { color: 'var(--accent-primary)' }
                      : {}
                }
              >
                <Icon className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
};
