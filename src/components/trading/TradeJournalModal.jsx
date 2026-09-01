import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BookOpen, 
  X, 
  Check, 
  Sparkles, 
  Star, 
  AlertCircle, 
  TrendingUp, 
  TrendingDown,
  Loader2
} from 'lucide-react';
import { logCompletedTrade } from '../../utils/tradingStorage';
import { callGemini, DEFAULT_AI_CONFIG } from '../../utils/aiService';
import { playSound } from '../../utils/soundFX';

export const TradeJournalModal = ({ 
  isOpen, 
  onClose, 
  initialTrade = null, 
  onTradeSaved, 
  soundEnabled = true 
}) => {
  const [ticker, setTicker] = useState(initialTrade?.ticker || 'BTC');
  const [side, setSide] = useState(initialTrade?.side || 'LONG');
  const [entryPrice, setEntryPrice] = useState(initialTrade?.entryPrice || 92000);
  const [exitPrice, setExitPrice] = useState(initialTrade?.exitPrice || 94500);
  const [size, setSize] = useState(initialTrade?.size || 0.5);
  const [strategy, setStrategy] = useState(initialTrade?.strategy || '4H Trend Breakout');
  const [notes, setNotes] = useState(initialTrade?.notes || '');
  const [selectedTags, setSelectedTags] = useState(initialTrade?.tags || ['Followed Plan']);
  const [aiAnalysis, setAiAnalysis] = useState(initialTrade?.aiPostMortem || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const isLong = side === 'LONG';
  const pnlUSD = Number(((exitPrice - entryPrice) * size * (isLong ? 1 : -1)).toFixed(2));
  const returnPct = Number((((exitPrice - entryPrice) / entryPrice) * 100 * (isLong ? 1 : -1)).toFixed(2));

  const availableTags = [
    'Followed Plan',
    'A+ Setup',
    'Chased Entry',
    'Moved Stop Early',
    'Revenge Trade',
    'Perfect Exit',
    'Over-Leveraged',
    'Patience Paid Off'
  ];

  const toggleTag = (tag) => {
    playSound('click', soundEnabled);
    setSelectedTags(prev => 
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleGenerateAiPostMortem = async () => {
    setIsAnalyzing(true);
    playSound('click', soundEnabled);

    const prompt = `You are a legendary hedge fund performance coach reviewing a trader's executed trade.
Trade Details:
- Asset: ${ticker} (${side})
- Entry: $${entryPrice} ➔ Exit: $${exitPrice}
- P&L: $${pnlUSD} (${returnPct}%)
- Strategy: ${strategy}
- Trader Tags: ${selectedTags.join(', ')}
- Trader Notes: "${notes || 'None'}"

Provide a concise, razor-sharp 2-3 sentence psychological & technical post-mortem:
1. Validate what went right or diagnose what error occurred.
2. Give one actionable rule for the trader's next execution.`;

    try {
      const res = await callGemini(prompt, "You are a master trading psychologist and performance analyst. Be concise, sharp, and constructive.", DEFAULT_AI_CONFIG, 15000);
      const feedback = typeof res === 'string' ? res : (res.message || res.analysis || 'Great adherence to risk rules.');
      setAiAnalysis(feedback);
      playSound('success', soundEnabled);
    } catch (err) {
      setAiAnalysis(pnlUSD >= 0 
        ? "Solid execution and discipline. Ensure you continue taking partial profits at predetermined R:R targets."
        : "Loss was kept within expected risk boundaries. Review if entry was chased or aligned with higher timeframe support.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveTrade = (e) => {
    if (e) e.preventDefault();
    playSound('click', soundEnabled);

    const saved = logCompletedTrade({
      id: initialTrade?.id,
      ticker,
      side,
      entryPrice,
      exitPrice,
      size,
      pnlUSD,
      strategy,
      tags: selectedTags,
      notes,
      aiPostMortem: aiAnalysis
    });

    if (onTradeSaved) onTradeSaved(saved);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-3 sm:p-4 select-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/60 backdrop-blur-xl transition-all"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Trade Journal & AI Post-Mortem</h3>
                <div className="text-[11px] text-slate-400">Track Performance, Psychology & Mistakes</div>
              </div>
            </div>

            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onClose();
              }}
              className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSaveTrade} className="flex-1 overflow-y-auto pr-1 space-y-4 font-sans text-xs">
            {/* Live PnL Pill */}
            <div className={`p-3 rounded-2xl border flex items-center justify-between ${
              pnlUSD >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
            }`}>
              <div className="flex items-center gap-2">
                {pnlUSD >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
                <span className="font-bold text-white">{ticker} {side} Result:</span>
              </div>
              <div className="font-mono text-sm font-bold">
                {pnlUSD >= 0 ? `+$${pnlUSD.toFixed(2)}` : `-$${Math.abs(pnlUSD).toFixed(2)}`} ({returnPct}%)
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Ticker</label>
                <input
                  type="text"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Direction</label>
                <select
                  value={side}
                  onChange={(e) => setSide(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs"
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Entry Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Exit Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white font-mono text-xs"
                />
              </div>
            </div>

            {/* Strategy & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Strategy Used</label>
                <input
                  type="text"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  placeholder="e.g. 4H Range Breakout, Liquidity Sweep"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Trade Notes / Context</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Entered on high volume, took profit at 2R"
                  className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs"
                />
              </div>
            </div>

            {/* Discipline & Execution Tags */}
            <div>
              <label className="text-[10px] text-slate-400 block mb-1.5">Execution & Discipline Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map(tag => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white/[0.1] border-white/25 text-white'
                          : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AI Post-Mortem Review */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI Performance Review</span>
                </span>
                <button
                  type="button"
                  onClick={handleGenerateAiPostMortem}
                  disabled={isAnalyzing}
                  className="text-amber-400 hover:text-amber-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>{isAnalyzing ? 'Analyzing...' : 'Generate Review'}</span>
                </button>
              </div>

              {aiAnalysis ? (
                <p className="text-xs text-slate-300 leading-relaxed italic bg-black/30 p-2.5 rounded-xl border border-white/5">
                  "{aiAnalysis}"
                </p>
              ) : (
                <div className="text-[11px] text-slate-500">
                  Click "Generate Review" to have the AI evaluate your execution psychology and risk management.
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              <Check className="w-4 h-4" />
              <span>Save to Trade Journal</span>
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
