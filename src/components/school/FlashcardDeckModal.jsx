import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RotateCw, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  Download, 
  X, 
  Layers, 
  Loader2,
  BookOpen,
  Award,
  Sliders,
  Flame,
  Zap,
  BookmarkPlus,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateFlashcardsWithAI } from '../../utils/aiService';
import { saveDeckToLibrary, updateDeckCardRating } from '../../utils/studyStorage';
import { saveMarkdownToVault, getVaultHandle } from '../../utils/obsidianService';
import { playSound } from '../../utils/soundFX';

export const FlashcardDeckModal = ({ 
  isOpen, 
  onClose, 
  initialCourse = "",
  initialTopic = "Exam High-Yield Concepts",
  initialDeck = null,
  courseNotes = "",
  soundEnabled = true 
}) => {
  // Wizard / Setup state
  const [isConfiguring, setIsConfiguring] = useState(!initialDeck);
  const [courseCode, setCourseCode] = useState(initialCourse || "Course");
  const [topic, setTopic] = useState(initialTopic);
  const [chapterScope, setChapterScope] = useState("");
  const [cardCount, setCardCount] = useState(8);
  const [depthMode, setDepthMode] = useState("high-yield"); // 'high-yield' | 'deep-dive' | 'definitions'

  // Study state
  const [currentDeckId, setCurrentDeckId] = useState(initialDeck?.id || null);
  const [cards, setCards] = useState(initialDeck?.cards || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [savedToLibrary, setSavedToLibrary] = useState(false);
  const [savedToObsidian, setSavedToObsidian] = useState(false);
  const [studyStats, setStudyStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  useEffect(() => {
    if (isOpen) {
      if (initialDeck) {
        setCourseCode(initialDeck.courseCode || initialCourse);
        setTopic(initialDeck.topic || initialTopic);
        setCards(initialDeck.cards || []);
        setCurrentDeckId(initialDeck.id);
        setIsConfiguring(false);
      } else {
        setCourseCode(initialCourse || "");
        setIsConfiguring(true);
      }
      setIsCompleted(false);
      setIsFlipped(false);
      setCurrentIndex(0);
      setSavedToLibrary(false);
      setSavedToObsidian(false);
      setStudyStats({ again: 0, hard: 0, good: 0, easy: 0 });
    }
  }, [isOpen, initialCourse, initialDeck]);

  const handleStartGeneration = async (e) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setIsConfiguring(false);
    setIsFlipped(false);
    setCurrentIndex(0);
    setIsCompleted(false);
    playSound('click', soundEnabled);

    try {
      // Auto-fetch syllabus text from cache if not explicitly passed
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

      const deck = await generateFlashcardsWithAI({
        courseCode: courseCode.trim() || "Academics",
        topic: topic.trim() || "Core Concepts",
        chapterScope: chapterScope.trim(),
        notesText: notes,
        count: cardCount,
        depthMode
      });

      const newCards = deck.cards || [];
      setCards(newCards);

      // Auto-save to Wolfe OS Study Library
      const saved = saveDeckToLibrary({
        title: deck.title || `${courseCode}: ${topic}`,
        courseCode: courseCode.trim() || "General",
        topic: topic.trim(),
        chapterScope: chapterScope.trim(),
        depthMode,
        cards: newCards,
        masteryPercent: 0
      });
      setCurrentDeckId(saved.id);
      setSavedToLibrary(true);

      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Deck generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFlip = () => {
    playSound('click', soundEnabled);
    setIsFlipped(prev => !prev);
  };

  const handleRateCard = (rating) => {
    playSound('switch', soundEnabled);
    setStudyStats(prev => ({ ...prev, [rating]: prev[rating] + 1 }));

    if (currentDeckId) {
      updateDeckCardRating(currentDeckId, currentIndex, rating);
    }

    if (rating === 'again') {
      const currentCard = cards[currentIndex];
      setCards(prev => [...prev, { ...currentCard, id: `${currentCard.id}-retry` }]);
    }

    if (currentIndex + 1 < cards.length) {
      setIsFlipped(false);
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsCompleted(true);
      try {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      } catch (e) {}
      playSound('success', soundEnabled);
    }
  };

  const handleExportToObsidian = async () => {
    playSound('click', soundEnabled);
    try {
      const handle = await getVaultHandle();
      if (!handle) {
        alert("Please link your Obsidian Vault folder in the Vault Manager to save files.");
        return;
      }

      const markdownContent = `# ${courseCode} Flashcards - ${topic}\n*Generated by Wolfe OS on ${new Date().toLocaleDateString()}*\n\n` +
        cards.map((c, i) => `### Card ${i + 1}: ${c.concept || 'Concept'} [Yield: ${c.yieldRating || 'High'}]\n**Q**: ${c.front}\n\n**A**: ${c.back}\n\n*Why Exam-Essential*: ${c.yieldReason || 'Core concept'}\n\n---`).join('\n\n');

      const filename = `${courseCode} - Flashcards - ${topic.replace(/[^a-z0-9]/gi, '_')}.md`;
      await saveMarkdownToVault(handle, courseCode, filename, markdownContent);
      setSavedToObsidian(true);
      playSound('success', soundEnabled);
    } catch (err) {
      alert("Failed to export to Obsidian: " + err.message);
    }
  };

  if (!isOpen) return null;

  const currentCard = cards[currentIndex];
  const progressPercent = cards.length > 0 ? Math.round(((currentIndex + (isCompleted ? 1 : 0)) / cards.length) * 100) : 0;

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

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  {courseCode ? `${courseCode} Flashcards` : "Study Flashcards"}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">High-yield active recall with custom scope</p>
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

          {/* 1. CUSTOMIZATION & GENERATION SETUP WIZARD */}
          {isConfiguring ? (
            <form onSubmit={handleStartGeneration} className="space-y-4 pt-1">
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Customize Deck Generation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Course Code</label>
                    <input
                      type="text"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      placeholder="e.g. CPSC 331, MATH 211"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-blue-500/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Focus Topic / Chapter Scope</label>
                    <input
                      type="text"
                      value={chapterScope}
                      onChange={(e) => setChapterScope(e.target.value)}
                      placeholder="e.g. Chapters 3-4, Binary Search Trees"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-blue-500/40"
                    />
                  </div>
                </div>

                {/* Card Quantity Selector (Clean 2x2 on mobile, 1x4 on desktop) */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">Deck Size (Card Count)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { count: 5, label: "5 Cards", sub: "Quick" },
                      { count: 8, label: "8 Cards", sub: "Standard" },
                      { count: 12, label: "12 Cards", sub: "Deep" },
                      { count: 20, label: "20 Cards", sub: "Exam Drill" }
                    ].map(c => (
                      <button
                        key={c.count}
                        type="button"
                        onClick={() => setCardCount(c.count)}
                        className={`py-2 px-2 rounded-xl border transition-all text-center cursor-pointer ${
                          cardCount === c.count
                            ? 'bg-blue-500/25 border-blue-400 text-blue-200 shadow-sm'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold">{c.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{c.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Depth & Yield Mode (Responsive 1-col on mobile, 3-col on desktop) */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">Study Priority Mode</label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: 'high-yield', label: '🔥 High-Yield Exam', desc: 'Core theorems & test questions' },
                      { id: 'deep-dive', label: '🧠 Problem Solving', desc: 'Calculations & scenarios' },
                      { id: 'definitions', label: '⚡ Rapid Terms', desc: 'Formulas & definitions' }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDepthMode(m.id)}
                        className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                          depthMode === m.id
                            ? 'bg-blue-500/25 border-blue-400 text-blue-100 shadow-sm'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold truncate">{m.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Generate Active Recall Deck</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            /* 2. FLASHCARD DECK STUDY & REVIEW */
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Card {isCompleted ? cards.length : currentIndex + 1} of {cards.length}</span>
                  <span className="text-blue-400 font-semibold">{progressPercent}% Mastered</span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-blue-500 rounded-full"
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Generating Loader */}
              {isGenerating ? (
                <div className="min-h-[260px] rounded-3xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  <div>
                    <div className="text-xs font-bold text-white">Synthesizing Notes with Gemini AI...</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Extracting key formulas, decision rules & exam problems</div>
                  </div>
                </div>
              ) : isCompleted ? (
                /* Deck Completion Screen */
                <div className="min-h-[260px] rounded-3xl bg-gradient-to-b from-blue-950/20 to-transparent border border-blue-500/20 p-6 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">Deck Session Complete!</h4>
                    <p className="text-xs text-slate-300 mt-1 max-w-sm">
                      Great work! You reviewed {cards.length} cards. Concepts have been committed to active recall memory.
                    </p>
                  </div>

                  {/* Study Stats Breakdown */}
                  <div className="grid grid-cols-4 gap-2 w-full max-w-xs text-center font-mono text-xs">
                    <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                      <div className="text-base font-bold">{studyStats.again}</div>
                      <div className="text-[9px] uppercase">Again</div>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      <div className="text-base font-bold">{studyStats.hard}</div>
                      <div className="text-[9px] uppercase">Hard</div>
                    </div>
                    <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300">
                      <div className="text-base font-bold">{studyStats.good}</div>
                      <div className="text-[9px] uppercase">Good</div>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                      <div className="text-base font-bold">{studyStats.easy}</div>
                      <div className="text-[9px] uppercase">Easy</div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2 flex-wrap justify-center">
                    <button
                      type="button"
                      onClick={handleExportToObsidian}
                      disabled={savedToObsidian}
                      className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{savedToObsidian ? "Saved to Obsidian ✅" : "Save Deck to Obsidian"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsConfiguring(true)}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer"
                    >
                      Create Another Deck
                    </button>
                  </div>
                </div>
              ) : (
                /* Interactive 3D Flip Flashcard */
                <div className="space-y-4">
                  <div 
                    onClick={handleFlip}
                    className="relative min-h-[220px] rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/15 p-6 flex flex-col justify-between cursor-pointer transition-all hover:border-white/30 shadow-xl group"
                  >
                    {/* Top Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                          {currentCard?.concept || "Core Concept"}
                        </span>
                        {currentCard?.yieldRating === 'high' && (
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 flex items-center gap-1">
                            <Flame className="w-3 h-3 text-amber-400" /> High-Yield
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1 group-hover:text-white transition-colors">
                        <RotateCw className="w-3 h-3" />
                        <span>{isFlipped ? "Answer" : "Question (Click to Flip)"}</span>
                      </span>
                    </div>

                    {/* Card Body Text */}
                    <div className="my-auto py-3 text-center">
                      <p className="text-sm sm:text-base font-semibold text-slate-100 leading-relaxed">
                        {isFlipped ? currentCard?.back : currentCard?.front}
                      </p>
                      {isFlipped && currentCard?.yieldReason && (
                        <p className="text-[11px] text-amber-300/80 font-mono mt-2 italic">
                          💡 Exam Note: {currentCard.yieldReason}
                        </p>
                      )}
                    </div>

                    {/* Bottom Cue */}
                    <div className="text-center text-[10px] text-slate-500 font-mono">
                      {isFlipped ? "How well did you know this?" : "Tap anywhere to reveal explanation"}
                    </div>
                  </div>

                  {/* Anki Spaced Repetition Response Buttons */}
                  {isFlipped ? (
                    <div className="grid grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() => handleRateCard('again')}
                        className="p-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold active:scale-95 transition-all cursor-pointer text-center"
                      >
                        <div>Again</div>
                        <div className="text-[9px] font-mono text-rose-400/80 mt-0.5">Repeat</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRateCard('hard')}
                        className="p-2.5 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold active:scale-95 transition-all cursor-pointer text-center"
                      >
                        <div>Hard</div>
                        <div className="text-[9px] font-mono text-amber-400/80 mt-0.5">+1 review</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRateCard('good')}
                        className="p-2.5 rounded-2xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold active:scale-95 transition-all cursor-pointer text-center"
                      >
                        <div>Good</div>
                        <div className="text-[9px] font-mono text-blue-400/80 mt-0.5">Advance</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRateCard('easy')}
                        className="p-2.5 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold active:scale-95 transition-all cursor-pointer text-center"
                      >
                        <div>Easy</div>
                        <div className="text-[9px] font-mono text-emerald-400/80 mt-0.5">Mastered</div>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleFlip}
                      className="w-full py-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-bold active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                      <span>Reveal Answer</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
