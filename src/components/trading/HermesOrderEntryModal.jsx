import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  Target, 
  X, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight, 
  ShieldAlert, 
  Hourglass,
  Layers
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';

export const HermesOrderEntryModal = ({
  isOpen,
  onClose,
  play,
  livePrice,
  onConfirmOrder,
  soundEnabled = true
}) => {
  if (!isOpen || !play) return null;

  const ticker = (play.ticker || 'BTC').toUpperCase();
  const isLong = !play.bias || String(play.bias).toUpperCase().includes('LONG') || String(play.bias).toUpperCase().includes('BUY');

  const extractNum = (val) => {
    if (!val) return null;
    const match = String(val).match(/[\$]?([0-9]+(?:\.[0-9]+)?)/);
    return match ? parseFloat(match[1]) : null;
  };

  // Parse planned limit entry price accurately
  const currentPrice = livePrice ? Number(livePrice) : (play.entryNumeric || 100);
  const plannedLimitPrice = play.entryNumeric 
    || extractNum(play.entryTrigger) 
    || extractNum(play.riskManagement) 
    || currentPrice;

  // Calculate distance
  const diffPct = plannedLimitPrice > 0 
    ? (((currentPrice - plannedLimitPrice) / plannedLimitPrice) * 100).toFixed(2)
    : '0.00';

  const isPriceDifferent = Math.abs(Number(diffPct)) > 0.05;

  const handleSelectExecution = (mode) => {
    playSound('click', soundEnabled);
    if (onConfirmOrder) {
      onConfirmOrder(play, mode);
    }
    onClose();
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[110] flex items-center justify-center p-3 sm:p-4 select-none font-sans">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/70 backdrop-blur-xl transition-all"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg theme-card rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-2xl z-10 space-y-4 font-sans"
          style={{ 
            border: '1px solid var(--accent-border)',
            boxShadow: '0 25px 60px -15px rgba(0,0,0,0.8), 0 0 35px -5px var(--accent-glow)'
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--accent-border)' }}>
            <div className="flex items-center gap-2.5">
              <div 
                className="w-9 h-9 rounded-2xl border flex items-center justify-center font-bold text-sm"
                style={{ 
                  backgroundColor: 'var(--accent-subtle)',
                  borderColor: 'var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                {ticker}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">Execute Forward-Test</h3>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border flex items-center gap-0.5 ${
                    isLong ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                  }`}>
                    {isLong ? <ArrowUpRight className="w-3 h-3 text-emerald-400" /> : <ArrowDownRight className="w-3 h-3 text-rose-400" />}
                    {isLong ? 'LONG 5x' : 'SHORT 5x'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-300 font-semibold">Grade: <strong className="text-white">{play.convictionGrade}</strong></span>
                </div>
                <div className="text-[11px] text-slate-400">Choose real-market order execution type</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                onClose();
              }}
              className="p-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Price Delta Comparison Banner */}
          <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-1.5 font-mono text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-[11px] font-sans text-slate-400">Planned Limit Trigger:</span>
              <span className="font-bold text-white">${plannedLimitPrice}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="text-[11px] font-sans text-slate-400">Current Live Market Price:</span>
              <span className="font-bold text-slate-200">${currentPrice}</span>
            </div>
            {isPriceDifferent && (
              <div className="text-[10px] font-sans pt-1 border-t border-white/5 flex items-center justify-between text-slate-400">
                <span>Live price is {Math.abs(Number(diffPct))}% {Number(diffPct) > 0 ? 'above' : 'below'} planned limit level</span>
                <span>5x Leverage</span>
              </div>
            )}
          </div>

          {/* 2 Execution Options */}
          <div className="space-y-2.5 pt-1">
            {/* Option 1: Market Order */}
            <button
              type="button"
              onClick={() => handleSelectExecution('MARKET')}
              className="w-full text-left p-3.5 rounded-2xl border transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 space-y-1.5"
              style={{ 
                backgroundColor: 'var(--accent-subtle)',
                borderColor: 'var(--accent-border)'
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-white shadow-sm" style={{ backgroundColor: 'var(--accent-primary)' }}>
                    <Zap className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white">Buy at Live Market Price (${currentPrice})</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-300 border border-white/10 font-semibold">
                  Instant Fill
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug pl-8 font-sans">
                Fills immediately at current price (${currentPrice}). Re-anchors your Stop Loss and 2R Target to live entry and starts calculating real-time PnL right away.
              </p>
            </button>

            {/* Option 2: Resting Limit Order */}
            <button
              type="button"
              onClick={() => handleSelectExecution('LIMIT')}
              className="w-full text-left p-3.5 rounded-2xl border bg-black/40 border-white/10 hover:border-white/20 transition-all cursor-pointer group hover:scale-[1.01] active:scale-95 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center font-bold text-slate-300 bg-white/[0.05] border border-white/10">
                    <Hourglass className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-white">Wait for Planned Entry Trigger (${plannedLimitPrice})</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.05] text-slate-300 border border-white/10 font-semibold">
                  Resting Limit
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug pl-8 font-sans">
                Places a real limit order resting on the book. Stays <strong>UNFILLED ($0.00 PnL)</strong> until live price touches ${plannedLimitPrice} in the live market.
              </p>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
