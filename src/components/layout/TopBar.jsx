import React, { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { WolfLogo } from '../common/WolfLogo';
import { playSound } from '../../utils/soundFX';

export const TopBar = ({ 
  soundEnabled, 
  onOpenSettings
}) => {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
      setDateStr(
        now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') updateTime();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <header 
      className="sticky top-0 z-30 w-full px-4 sm:px-8 bg-[#08090d]/95 backdrop-blur-xl border-b border-white/[0.06] transition-colors select-none pb-2.5 sm:pb-3"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 14px)'
      }}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        
        {/* Left: Brand Identity with Dynamic Wolf Logo */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {/* Dynamic Wolf Logo Badge synced with color slider */}
            <div 
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.04] transition-all shadow-sm"
              style={{
                border: '1px solid var(--accent-border)',
                color: 'var(--accent-primary)',
                boxShadow: '0 0 15px -3px var(--accent-glow)'
              }}
            >
              <WolfLogo className="w-4 h-4" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight text-white leading-tight">
              Wolfe OS
            </span>
          </div>
        </div>

        {/* Right: Clock & Settings */}
        <div className="flex items-center gap-2 sm:gap-2.5 text-xs">
          <div className="hidden sm:flex items-center gap-2 bg-white/[0.03] px-3 py-1.5 rounded-xl border border-white/5 text-slate-300">
            <span className="font-mono font-semibold text-white">{timeStr}</span>
            <span className="text-slate-600">•</span>
            <span className="text-slate-400 font-sans">{dateStr}</span>
          </div>

          {/* Settings Gear Button (Opens Macro & Calorie Targets) */}
          <button 
            onClick={() => {
              playSound('click', soundEnabled);
              onOpenSettings();
            }}
            title="Macro Targets & Settings"
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white transition-all shadow-sm active:scale-95 cursor-pointer"
            style={{ border: '1px solid var(--accent-border)' }}
          >
            <Settings className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
          </button>
        </div>
      </div>
    </header>
  );
};
