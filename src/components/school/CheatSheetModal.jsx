import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Zap, 
  X, 
  Loader2, 
  Sliders, 
  ArrowRight, 
  Search, 
  Download, 
  Copy, 
  Check, 
  BookmarkPlus, 
  Edit3, 
  FolderSync, 
  BookOpen, 
  HelpCircle,
  AlertTriangle,
  FileText
} from 'lucide-react';
import { generateCheatSheetWithAI } from '../../utils/aiService';
import { saveCheatSheetToLibrary } from '../../utils/studyStorage';
import { getCachedVaultFiles, saveCheatSheetToObsidian } from '../../utils/obsidianService';
import { playSound } from '../../utils/soundFX';

export const CheatSheetModal = ({ 
  isOpen, 
  onClose, 
  initialCourse = "", 
  initialSheet = null, 
  courseNotes = "", 
  soundEnabled = true 
}) => {
  // Wizard Setup state
  const [isConfiguring, setIsConfiguring] = useState(!initialSheet);
  const [courseCode, setCourseCode] = useState(initialSheet?.courseCode || initialCourse || "Course");
  const [sheetTitle, setSheetTitle] = useState(initialSheet?.title || `${initialCourse || 'Course'} Formula & Cheat Sheet`);
  const [chapterScope, setChapterScope] = useState(initialSheet?.chapterScope || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedModules, setSelectedModules] = useState(['formulas', 'rules', 'definitions', 'traps']);

  // Viewer state
  const [sheetData, setSheetData] = useState(initialSheet || null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedToObsidian, setSavedToObsidian] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialSheet) {
        setSheetData(initialSheet);
        setCourseCode(initialSheet.courseCode || initialCourse);
        setSheetTitle(initialSheet.title || `${initialSheet.courseCode || 'Course'} Cheat Sheet`);
        setChapterScope(initialSheet.chapterScope || "");
        setIsConfiguring(false);
      } else {
        setCourseCode(initialCourse || "");
        setSheetTitle(`${initialCourse || 'Course'} Formula & Cheat Sheet`);
        setSheetData(null);
        setIsConfiguring(true);
      }
      setSearchFilter("");
      setCopied(false);
      setSavedToObsidian(false);
      setIsEditingTitle(false);
    }
  }, [isOpen, initialCourse, initialSheet]);

  const toggleModule = (id) => {
    playSound('click', soundEnabled);
    setSelectedModules(prev => 
      prev.includes(id) ? (prev.length > 1 ? prev.filter(m => m !== id) : prev) : [...prev, id]
    );
  };

  const handleGenerateSheet = async (e) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setIsConfiguring(false);
    setSavedToObsidian(false);
    playSound('click', soundEnabled);

    try {
      let notes = courseNotes || '';
      if (!notes) {
        const cached = getCachedVaultFiles();
        if (cached && cached.files) {
          const matched = cached.files.find(f => 
            (f.course || '').toUpperCase().includes(courseCode.toUpperCase()) || 
            (f.path || '').toUpperCase().includes(courseCode.toUpperCase())
          );
          if (matched) {
            notes = matched.cachedContent || '';
          }
        }
      }

      const generatedTitle = sheetTitle.trim() || `${courseCode.trim()} ${chapterScope.trim() || 'Core'} Formula Sheet`;

      const result = await generateCheatSheetWithAI({
        courseCode: courseCode.trim() || "Academics",
        title: generatedTitle,
        chapterScope: chapterScope.trim() || "All Chapters & Outlines",
        modules: selectedModules,
        notesText: notes
      });

      setSheetData(result);
      setSheetTitle(result.title || generatedTitle);

      // Auto-save to study storage and Obsidian vault
      const saved = saveCheatSheetToLibrary(result);
      saveCheatSheetToObsidian(saved).then(ok => {
        if (ok) setSavedToObsidian(true);
      });

      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Cheat sheet generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyClipboard = () => {
    if (!sheetData) return;
    playSound('click', soundEnabled);

    let mdText = `# ${sheetData.title}\nCourse: ${sheetData.courseCode}\nScope: ${sheetData.chapterScope}\n\n`;
    (sheetData.sections || []).forEach(sec => {
      mdText += `## ${sec.category}\n\n`;
      (sec.items || []).forEach(item => {
        if (item.formula) {
          mdText += `### ${item.name}\n${item.formula}\nVariables: ${item.variables || ''}\nNote: ${item.notes || ''}\n\n`;
        } else if (item.rule) {
          mdText += `### ${item.name || 'Rule'}\n${item.rule}\nNote: ${item.notes || ''}\n\n`;
        } else if (item.term) {
          mdText += `### ${item.term}\n${item.definition}\n\n`;
        } else if (item.trap) {
          mdText += `### Trap: ${item.trap}\nFix: ${item.correction}\n\n`;
        }
      });
    });

    navigator.clipboard.writeText(mdText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleManualSaveObsidian = async () => {
    if (!sheetData) return;
    playSound('click', soundEnabled);
    const ok = await saveCheatSheetToObsidian({ ...sheetData, title: sheetTitle });
    if (ok) setSavedToObsidian(true);
  };

  if (!isOpen) return null;

  // Filter sections by search query
  const filteredSections = (sheetData?.sections || []).map(sec => {
    if (!searchFilter.trim()) return sec;
    const q = searchFilter.toLowerCase();
    const matchingItems = (sec.items || []).filter(it => 
      (it.name || '').toLowerCase().includes(q) ||
      (it.formula || '').toLowerCase().includes(q) ||
      (it.variables || '').toLowerCase().includes(q) ||
      (it.rule || '').toLowerCase().includes(q) ||
      (it.term || '').toLowerCase().includes(q) ||
      (it.definition || '').toLowerCase().includes(q) ||
      (it.trap || '').toLowerCase().includes(q) ||
      (it.notes || '').toLowerCase().includes(q)
    );
    return { ...sec, items: matchingItems };
  }).filter(sec => sec.items && sec.items.length > 0);

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
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/55 backdrop-blur-xl transition-all"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] flex flex-col"
        >
          {/* Header with Title Editing */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white/[0.04] text-amber-300 border border-amber-500/20 flex items-center gap-1 shrink-0">
                <Zap className="w-3 h-3 text-amber-400" />
                <span>{courseCode || "Sheet"}</span>
              </span>

              {isEditingTitle ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={sheetTitle}
                    onChange={(e) => setSheetTitle(e.target.value)}
                    autoFocus
                    onBlur={() => setIsEditingTitle(false)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
                    className="flex-1 px-2 py-1 rounded-lg bg-black/60 border border-white/20 text-xs text-white outline-none font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(false)}
                    className="p-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-emerald-400 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 
                    onClick={() => setIsEditingTitle(true)}
                    className="text-sm font-bold text-white tracking-tight truncate cursor-pointer hover:text-slate-200"
                    title="Click to rename cheat sheet"
                  >
                    {sheetTitle || "Formula & Cheat Sheet"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                    title="Rename Sheet"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isConfiguring && !isGenerating && sheetData && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyClipboard}
                    className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                    title="Copy markdown to clipboard"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleManualSaveObsidian}
                    className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                    title="Save to Obsidian Vault"
                  >
                    <FolderSync className="w-3.5 h-3.5 text-slate-400" />
                    <span>{savedToObsidian ? "Saved" : "Save"}</span>
                  </button>
                </>
              )}

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
          </div>

          {/* 1. CUSTOMIZATION SETUP WIZARD */}
          {isConfiguring ? (
            <form onSubmit={handleGenerateSheet} className="space-y-4 pt-1 flex-1 overflow-y-auto">
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Sheet Title</label>
                  <input
                    type="text"
                    value={sheetTitle}
                    onChange={(e) => setSheetTitle(e.target.value)}
                    placeholder="e.g. Midterm 1 Formula & Theorem Reference"
                    className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-sans"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Course Code</label>
                    <input
                      type="text"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      placeholder="e.g. FNCE 317, OPMA 317"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-sans"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Focus Chapter / Topic Scope</label>
                    <input
                      type="text"
                      value={chapterScope}
                      onChange={(e) => setChapterScope(e.target.value)}
                      placeholder="e.g. Chapters 1-4, WACC, Bonds, Valuation"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-sans"
                    />
                  </div>
                </div>

                {/* Modules Checklist */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">Include Modules</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'formulas', label: '📐 Key Formulas & Variables' },
                      { id: 'rules', label: '⚖️ Decision Rules & Criteria' },
                      { id: 'definitions', label: '📖 Core Definitions & Terms' },
                      { id: 'traps', label: '⚠️ Exam Traps & Pitfalls' }
                    ].map(mod => {
                      const isSelected = selectedModules.includes(mod.id);
                      return (
                        <button
                          key={mod.id}
                          type="button"
                          onClick={() => toggleModule(mod.id)}
                          className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-white/[0.08] border-white/20 text-white shadow-sm'
                              : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          <span className="truncate">{mod.label}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>Generate Cheat Sheet with AI</span>
              </button>
            </form>
          ) : isGenerating ? (
            <div className="flex-1 min-h-[260px] rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
              <div className="text-xs font-bold text-white">Synthesizing {courseCode} Formulas & Decision Rules...</div>
              <div className="text-[11px] text-slate-400">Extracting variables, calculations, and exam traps from notes</div>
            </div>
          ) : (
            /* 2. CHEAT SHEET INTERACTIVE VIEWER */
            <div className="flex-1 flex flex-col min-h-0 space-y-3">
              {/* Search Filter Bar */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search formula, variable, or term..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none focus:border-white/30 font-sans"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setIsConfiguring(true)}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-all shrink-0 cursor-pointer"
                >
                  New Scope
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-3.5">
                {filteredSections.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No formulas or definitions match "{searchFilter}".
                  </div>
                ) : (
                  filteredSections.map((sec, secIdx) => (
                    <div key={secIdx} className="space-y-2">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-bold border-b border-white/5 pb-1">
                        {sec.category}
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {sec.items.map((item, itemIdx) => (
                          <div 
                            key={itemIdx}
                            className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1.5 font-sans"
                          >
                            {/* 1. Formula Item */}
                            {item.formula && (
                              <>
                                <div className="text-xs font-bold text-white flex items-center justify-between">
                                  <span>{item.name}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-xs text-amber-200 tracking-wide break-all">
                                  {item.formula}
                                </div>
                                {item.variables && (
                                  <div className="text-[11px] text-slate-300 leading-relaxed">
                                    <strong className="text-slate-400">Variables:</strong> {item.variables}
                                  </div>
                                )}
                                {item.notes && (
                                  <div className="text-[10px] text-slate-400 italic">
                                    💡 {item.notes}
                                  </div>
                                )}
                              </>
                            )}

                            {/* 2. Decision Rule */}
                            {item.rule && (
                              <>
                                <div className="text-xs font-bold text-white">{item.name || "Decision Rule"}</div>
                                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200">
                                  {item.rule}
                                </div>
                                {item.notes && (
                                  <div className="text-[11px] text-slate-300 mt-1">
                                    {item.notes}
                                  </div>
                                )}
                              </>
                            )}

                            {/* 3. Definition */}
                            {item.term && (
                              <>
                                <div className="text-xs font-bold text-white">{item.term}</div>
                                <div className="text-xs text-slate-300 leading-relaxed">
                                  {item.definition}
                                </div>
                              </>
                            )}

                            {/* 4. Exam Trap */}
                            {item.trap && (
                              <>
                                <div className="text-xs font-bold text-rose-300 flex items-center gap-1">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                  <span>Trap: {item.trap}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-200">
                                  <strong>How to avoid:</strong> {item.correction}
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
