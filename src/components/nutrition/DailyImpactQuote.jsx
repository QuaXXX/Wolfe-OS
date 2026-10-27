import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getOrRotateActiveQuote, getRemainingMsInWindow } from '../../utils/quoteService';

/**
 * Minimalist Daily Quote
 * Unobtrusive, pure white/slate typography against the background,
 * like credits at the bottom of the page.
 */
export const DailyImpactQuote = ({ className = '' }) => {
  const [quote, setQuote] = useState(() => getOrRotateActiveQuote());

  // Schedule exact timer for the next 3-hour rotation window instead of 30s polling
  useEffect(() => {
    let timerId = null;

    const scheduleNextRotation = () => {
      const delayMs = Math.max(5000, getRemainingMsInWindow() + 250);
      timerId = setTimeout(() => {
        const active = getOrRotateActiveQuote();
        if (active) setQuote(active);
        scheduleNextRotation();
      }, delayMs);
    };

    scheduleNextRotation();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const active = getOrRotateActiveQuote();
        if (active && active.id !== quote?.id) {
          setQuote(active);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (timerId) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [quote?.id]);

  if (!quote) return null;

  return (
    <div className={`w-full max-w-2xl mx-auto px-4 pt-4 pb-2 text-center select-text ${className}`}>
      <AnimatePresence mode="wait">
        <motion.div
          key={quote.id}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="space-y-1.5"
        >
          <p className="text-xs sm:text-sm font-serif italic text-white/85 leading-relaxed tracking-wide">
            “{quote.text}”
          </p>
          <p className="text-[10px] sm:text-[11px] font-mono tracking-widest uppercase text-slate-500">
            — {quote.author}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default DailyImpactQuote;
