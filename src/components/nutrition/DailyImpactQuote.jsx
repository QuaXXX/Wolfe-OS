import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote, Dices, Copy, Check, Heart, Clock, Sparkles } from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import {
  getOrRotateActiveQuote,
  rollNextQuoteManual,
  getFavoriteQuoteIds,
  toggleFavoriteQuote,
  getRemainingMsInWindow
} from '../../utils/quoteService';

export const DailyImpactQuote = ({ soundEnabled = true, className = 'w-full max-w-4xl mx-auto' }) => {
  const [quote, setQuote] = useState(() => getOrRotateActiveQuote());
  const [copied, setCopied] = useState(false);
  const [isFavorite, setIsFavorite] = useState(() => {
    const q = getOrRotateActiveQuote();
    return getFavoriteQuoteIds().includes(q?.id);
  });
  const [isRolling, setIsRolling] = useState(false);
  const [timeUntilNext, setTimeUntilNext] = useState('');

  // Update time until next rotation
  const updateRemainingTime = useCallback(() => {
    const remainingMs = getRemainingMsInWindow();
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) {
      setTimeUntilNext(`${hours}h ${mins}m`);
    } else {
      setTimeUntilNext(`${mins}m`);
    }
  }, []);

  // Periodic check to auto-rotate every 3 hours and update remaining countdown
  useEffect(() => {
    updateRemainingTime();

    const interval = setInterval(() => {
      const active = getOrRotateActiveQuote();
      if (active && active.id !== quote.id) {
        setQuote(active);
        setIsFavorite(getFavoriteQuoteIds().includes(active.id));
      }
      updateRemainingTime();
    }, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, [quote.id, updateRemainingTime]);

  // Roll new quote manually on user demand
  const handleShuffle = () => {
    setIsRolling(true);
    playSound('switch', soundEnabled);
    
    // Slight tactile delay for animation
    setTimeout(() => {
      const nextQ = rollNextQuoteManual();
      setQuote(nextQ);
      setIsFavorite(getFavoriteQuoteIds().includes(nextQ.id));
      setIsRolling(false);
    }, 180);
  };

  // Toggle favorite
  const handleToggleFavorite = () => {
    playSound('click', soundEnabled);
    if (!quote?.id) return;
    const nowFav = toggleFavoriteQuote(quote.id);
    setIsFavorite(nowFav);
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!quote) return;
    playSound('click', soundEnabled);
    
    const textToCopy = `"${quote.text}" — ${quote.author}${quote.source ? ` (${quote.source})` : ''}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy quote:', e);
    }
  };

  if (!quote) return null;

  return (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0c0f1d]/90 via-[#0d1022]/85 to-[#080a13]/95 border border-white/10 p-4 sm:p-5 shadow-[0_18px_40px_-15px_rgba(0,0,0,0.7)] backdrop-blur-2xl transition-all ${className}`}>
      {/* Subtle dynamic background glow */}
      <div 
        className="absolute top-0 right-0 w-72 h-36 opacity-10 blur-3xl pointer-events-none rounded-full"
        style={{ backgroundColor: 'var(--accent-primary)' }}
      />
      <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-amber-500/[0.04] blur-3xl pointer-events-none rounded-full" />

      {/* Header bar */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/[0.06] relative z-10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div 
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0 shadow-inner"
            style={{ color: 'var(--accent-primary)' }}
          >
            <Quote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <div className="min-w-0 flex items-center gap-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-200">
              Daily Impact
            </span>
            {quote.category && (
              <span className="hidden xs:inline-flex px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold bg-white/[0.04] border border-white/10 text-slate-400 truncate">
                {quote.category}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Favorite */}
          <button
            type="button"
            onClick={handleToggleFavorite}
            className={`p-1.5 sm:p-2 rounded-xl transition-all active:scale-95 cursor-pointer border ${
              isFavorite 
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
                : 'bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 hover:text-white border-white/5'
            }`}
            title={isFavorite ? 'Favorited' : 'Save to favorites'}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>

          {/* Copy */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 sm:p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] text-slate-400 hover:text-white border border-white/5 transition-all active:scale-95 cursor-pointer"
            title="Copy quote"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Manual Draw / Shuffle */}
          <button
            type="button"
            onClick={handleShuffle}
            disabled={isRolling}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer shadow-sm disabled:opacity-50"
            title="Draw another card of wisdom"
          >
            <Dices 
              className={`w-3.5 h-3.5 text-amber-400 transition-transform ${isRolling ? 'rotate-180 duration-200' : ''}`} 
            />
            <span className="hidden sm:inline text-[11px] font-bold">New Card</span>
          </button>
        </div>
      </div>

      {/* Quote Content with Smooth Transition */}
      <div className="pt-3.5 pb-1 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={quote.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-2.5"
          >
            <blockquote className="text-sm sm:text-base font-serif italic text-slate-100 leading-relaxed tracking-wide select-text">
              “{quote.text}”
            </blockquote>

            <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-white/[0.04]">
              <div className="flex items-center gap-2">
                <span className="w-3 sm:w-4 h-[1px] bg-white/20" />
                <span className="text-xs sm:text-sm font-bold text-slate-200 tracking-tight">
                  {quote.author}
                </span>
                {quote.source && (
                  <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                    • {quote.source}
                  </span>
                )}
              </div>

              {/* Status and countdown info */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Next in {timeUntilNext || '3h'}</span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DailyImpactQuote;
