import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getOrRotateActiveQuote } from '../../utils/quoteService';

/**
 * Minimalist Daily Quote
 * Unobtrusive, pure white/slate typography against the background,
 * like credits at the bottom of the page.
 */
export const DailyImpactQuote = ({ className = '' }) => {
  const [quote, setQuote] = useState(() => getOrRotateActiveQuote());

  // Check periodically for 3-hour window auto-rotation
  useEffect(() => {
    const interval = setInterval(() => {
      const active = getOrRotateActiveQuote();
      if (active && active.id !== quote?.id) {
        setQuote(active);
      }
    }, 30000); // Check every 30s

    return () => clearInterval(interval);
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
