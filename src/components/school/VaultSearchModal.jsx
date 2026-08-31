import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Sparkles, 
  FileText, 
  X, 
  Loader2, 
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { searchVaultWithAI } from '../../utils/aiService';
import { SAMPLE_OBSIDIAN_VAULT } from '../../utils/obsidianService';
import { playSound } from '../../utils/soundFX';

export const VaultSearchModal = ({ 
  isOpen, 
  onClose, 
  scannedFiles = [], 
  soundEnabled = true 
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;

    playSound('click', soundEnabled);
    setIsSearching(true);
    setResult(null);

    try {
      const res = await searchVaultWithAI({
        query: query.trim(),
        filesIndex: scannedFiles.length > 0 ? scannedFiles : SAMPLE_OBSIDIAN_VAULT,
        sampleNotes: SAMPLE_OBSIDIAN_VAULT
      });
      setResult(res);
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
        {/* Frosted Glass Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/50 backdrop-blur-xl transition-all"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-[#6d28d9]/15 border border-[#7c3aed]/30 text-[#a78bfa]"
              >
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Ask My Obsidian Vault</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#6d28d9]/25 text-[#c4b5fd] font-semibold border border-[#7c3aed]/30">
                    Semantic Search
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Ask any question across your class notes, summaries and outlines</p>
              </div>
            </div>

            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onClose();
              }}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Where is the formula for WACC? What are AVL tree balance rules?"
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#7c3aed]"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className="px-4 py-2.5 rounded-2xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
            >
              {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Search</span>
            </button>
          </form>

          {/* Preset Suggested Questions */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-mono text-slate-500">Try:</span>
            {[
              "When to use NPV vs IRR?",
              "What is the STP marketing formula?",
              "What are AVL tree rotation rules?"
            ].map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(q);
                  playSound('click', soundEnabled);
                }}
                className="px-2.5 py-1 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] border border-white/5 text-[11px] text-slate-300 transition-colors cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Search Results Area */}
          {isSearching ? (
            <div className="min-h-[160px] rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
              <div className="text-xs font-bold text-white">Searching Obsidian Vault...</div>
            </div>
          ) : result ? (
            <div className="space-y-3 pt-2">
              {/* Answer Box */}
              <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-2">
                <div className="text-[11px] font-bold font-mono text-purple-300 uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Synthesized Answer:</span>
                </div>
                <p className="text-xs text-slate-100 leading-relaxed font-sans whitespace-pre-wrap">
                  {result.answer}
                </p>
              </div>

              {/* Matched Files Citation */}
              {result.matchedFiles && result.matchedFiles.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-mono uppercase text-slate-400">
                    Sources in Your Vault ({result.matchedFiles.length}):
                  </div>
                  <div className="space-y-1.5">
                    {result.matchedFiles.map((mf, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="font-semibold text-white truncate">{mf.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {mf.relevance || mf.path}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
