import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  FileText, 
  X, 
  Loader2, 
  BookOpen,
  FolderSync,
  Sparkles
} from 'lucide-react';
import { searchVaultWithAI } from '../../utils/aiService';
import { playSound } from '../../utils/soundFX';

export const VaultSearchModal = ({ 
  isOpen, 
  onClose, 
  scannedFiles = [], 
  isConnected = false,
  onOpenVaultManager,
  soundEnabled = true 
}) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const hasConnectedFiles = isConnected || (scannedFiles && scannedFiles.length > 0);

  const handleSearch = async (e, customQuery = null) => {
    if (e) e.preventDefault();
    const targetQ = (customQuery || query).trim();
    if (!targetQ || isSearching || !hasConnectedFiles) return;

    if (customQuery) setQuery(customQuery);
    playSound('click', soundEnabled);
    setIsSearching(true);
    setError(null);
    setResult(null);

    try {
      const res = await searchVaultWithAI({
        query: targetQ,
        filesIndex: scannedFiles,
        sampleNotes: scannedFiles
      });
      setResult(res);
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Vault search error:", err);
      setError(err.message || "Failed to search notes.");
    } finally {
      setIsSearching(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
        {/* Frosted Backdrop */}
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
          className="relative w-full max-w-xl bg-[#0e0c18]/95 border border-purple-500/20 rounded-3xl p-4 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center bg-purple-500/10 border border-purple-500/30 text-purple-400 shrink-0">
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate flex items-center gap-2">
                  <span>Ask Course Notes</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold border border-purple-500/30">
                    Personal NotebookLM
                  </span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  {hasConnectedFiles 
                    ? `AI synthesis across ${scannedFiles.length} course documents` 
                    : "Connect school notes for instant AI study answers"}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onClose();
              }}
              className="p-1.5 sm:p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 1. NOT CONNECTED STATE */}
          {!hasConnectedFiles ? (
            <div className="py-8 px-4 text-center space-y-4 rounded-2xl bg-white/[0.02] border border-white/10">
              <div className="w-12 h-12 rounded-2xl bg-[#6d28d9]/20 border border-[#7c3aed]/30 flex items-center justify-center mx-auto text-[#a78bfa]">
                <FolderSync className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Course Notes Not Connected</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                  To ask questions and study concepts across your course outlines and notes, connect your school folder.
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    onClose();
                    if (onOpenVaultManager) onOpenVaultManager();
                  }}
                  className="px-5 py-2.5 rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <FolderSync className="w-4 h-4" />
                  <span>Connect School Folder</span>
                </button>
              </div>
            </div>
          ) : (
            /* 2. CONNECTED SEARCH CHAT STATE */
            <div className="space-y-4">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ask anything from your notes (e.g. explain WACC formula, binary trees)..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-white text-xs placeholder:text-slate-500 outline-none focus:border-purple-500/50"
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSearching || !query.trim()}
                  className="px-4 py-2.5 rounded-2xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
                >
                  {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Search</span>
                </button>
              </form>

              {/* Search Results Area */}
              {isSearching ? (
                <div className="min-h-[140px] rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  <div className="text-xs font-bold text-white">Searching your Obsidian notes with AI...</div>
                </div>
              ) : result ? (
                <div className="space-y-3 pt-1">
                  {/* Answer Box */}
                  <div className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 space-y-2">
                    <div className="text-[11px] font-bold font-mono text-purple-300 uppercase tracking-wide flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Answer:</span>
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
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                              <span className="text-white font-medium truncate">{mf.name}</span>
                            </div>
                            {mf.relevance && (
                              <span className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                {mf.relevance}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
