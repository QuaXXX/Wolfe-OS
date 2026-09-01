import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RotateCw, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  X, 
  Layers, 
  Loader2,
  BookOpen,
  Award,
  Sliders,
  Flame,
  BookmarkPlus,
  ArrowRight,
  Edit3,
  Check,
  Play,
  Save,
  FolderSync
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateFlashcardsWithAI } from '../../utils/aiService';
import { saveDeckToLibrary, updateDeckCardRating } from '../../utils/studyStorage';
import { getCachedVaultFiles, saveDeckToObsidian } from '../../utils/obsidianService';
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
  const hasExistingCards = Boolean(initialDeck && Array.isArray(initialDeck.cards) && initialDeck.cards.length > 0);
  const [isConfiguring, setIsConfiguring] = useState(!hasExistingCards);
  const [isReadyPreview, setIsReadyPreview] = useState(false);
  const [currentDeckId, setCurrentDeckId] = useState(initialDeck?.id || null);
  const [courseCode, setCourseCode] = useState(initialDeck?.courseCode || initialCourse || "Course");
  const [topic, setTopic] = useState(initialDeck?.topic || initialTopic);
  const [deckTitle, setDeckTitle] = useState(initialDeck?.title || `${initialDeck?.courseCode || initialCourse || 'Course'} Flashcards`);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [chapterScope, setChapterScope] = useState(initialDeck?.chapterScope || "");
  const [cardCount, setCardCount] = useState(initialDeck?.cards?.length || 8);
  const [depthMode, setDepthMode] = useState(initialDeck?.depthMode || "high-yield");

  // Study state
  const [cards, setCards] = useState(hasExistingCards ? initialDeck.cards : []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [studyStats, setStudyStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });

  useEffect(() => {
    if (isOpen) {
      const hasCards = Boolean(initialDeck && Array.isArray(initialDeck.cards) && initialDeck.cards.length > 0);
      if (hasCards) {
        setCourseCode(initialDeck.courseCode || initialCourse);
        setTopic(initialDeck.topic || initialTopic);
        setDeckTitle(initialDeck.title || `${initialDeck.courseCode || 'Course'} Flashcards`);
        setCards(initialDeck.cards);
        setCurrentDeckId(initialDeck.id);
        setIsConfiguring(false);
        setIsReadyPreview(false);
      } else {
        setCourseCode(initialDeck?.courseCode || initialCourse || "");
        setDeckTitle(`${initialDeck?.courseCode || initialCourse || 'Course'} Flashcards`);
        setCurrentDeckId(null);
        setCards([]);
        setIsConfiguring(true);
        setIsReadyPreview(false);
      }
      setIsCompleted(false);
      setIsFlipped(false);
      setCurrentIndex(0);
      setStudyStats({ again: 0, hard: 0, good: 0, easy: 0 });
      setIsEditingTitle(false);
    }
  }, [isOpen, initialCourse, initialDeck]);

  const handleStartGeneration = async (e) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setIsConfiguring(false);
    setIsReadyPreview(false);
    setIsFlipped(false);
    setCurrentIndex(0);
    setIsCompleted(false);
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

      const generatedTitle = deckTitle.trim() || `${courseCode.trim()} ${chapterScope.trim() || topic.trim()} Flashcards`;

      const deck = await generateFlashcardsWithAI({
        courseCode: courseCode.trim() || "Academics",
        topic: chapterScope.trim() || topic.trim() || "Core Concepts",
        chapterScope: chapterScope.trim(),
        notesText: notes,
        count: cardCount,
        depthMode
      });

      const newCards = deck.cards || [];
      setCards(newCards);
      setDeckTitle(generatedTitle);

      const saved = saveDeckToLibrary({
        title: generatedTitle,
        courseCode: courseCode.trim() || "General",
        topic: chapterScope.trim() || topic.trim(),
        chapterScope: chapterScope.trim(),
        depthMode,
        cards: newCards,
        masteryPercent: 0
      });
      setCurrentDeckId(saved.id);

      setIsReadyPreview(true);
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Deck generation notice:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartStudyNow = () => {
    playSound('click', soundEnabled);
    setIsReadyPreview(false);
    setIsFlipped(false);
    setCurrentIndex(0);
  };

  const handleSaveDeckForLater = async () => {
    playSound('click', soundEnabled);
    const activeDeck = {
      id: currentDeckId,
      title: deckTitle.trim(),
      courseCode: courseCode.trim() || "General",
      topic: chapterScope.trim() || topic.trim(),
      chapterScope: chapterScope.trim(),
      depthMode,
      cards,
      masteryPercent: 0
    };

    saveDeckToLibrary(activeDeck);
    await saveDeckToObsidian(activeDeck);
    onClose();
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

    setIsFlipped(false);
    if (currentIndex + 1 < cards.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsCompleted(true);
      
      const finishedDeck = {
        id: currentDeckId,
        title: deckTitle.trim(),
        courseCode: courseCode.trim() || "General",
        topic: topic.trim(),
        chapterScope: chapterScope.trim(),
        depthMode,
        cards,
        masteryPercent: 100
      };
      saveDeckToObsidian(finishedDeck);

      try {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
      } catch {}
      playSound('success', soundEnabled);
    }
  };

  const handleSaveAndExit = async () => {
    playSound('click', soundEnabled);
    const activeDeck = {
      id: currentDeckId,
      title: deckTitle.trim(),
      courseCode: courseCode.trim() || "General",
      topic: topic.trim(),
      chapterScope: chapterScope.trim(),
      depthMode,
      cards,
      masteryPercent: Math.round(((currentIndex + 1) / (cards.length || 1)) * 100)
    };

    saveDeckToLibrary(activeDeck);
    await saveDeckToObsidian(activeDeck);
    onClose();
  };

  if (!isOpen) return null;

  const currentCard = cards[currentIndex];
  const progressPercent = cards.length > 0 ? Math.round(((currentIndex + (isCompleted ? 1 : 0)) / cards.length) * 100) : 0;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
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

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header with Inline Title Editing */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0 pr-2 flex-1">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white/[0.04] text-white border border-white/10 shrink-0">
                {courseCode || "Deck"}
              </span>

              {isEditingTitle ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
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
                    title="Click to rename deck"
                  >
                    {deckTitle || topic || "Flashcards"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                    title="Rename Deck"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isConfiguring && !isReadyPreview && !isCompleted && cards.length > 0 && (
                <button
                  type="button"
                  onClick={handleSaveAndExit}
                  className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
                  title="Save progress and resume later"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>Save & Exit</span>
                </button>
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

          {/* 1. DECK CUSTOMIZATION SETUP WIZARD */}
          {isConfiguring ? (
            <form onSubmit={handleStartGeneration} className="space-y-4 pt-1">
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                {/* Deck Title Field */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Deck Name / Title</label>
                  <input
                    type="text"
                    value={deckTitle}
                    onChange={(e) => setDeckTitle(e.target.value)}
                    placeholder="e.g. Chapter 3 Formula Drill, Exam High-Yield Concepts"
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
                      placeholder="e.g. Time Value of Money, WACC, CAPM"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-sans"
                    />
                  </div>
                </div>

                {/* Card Quantity Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">Card Count</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 8, 12, 20].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCardCount(c)}
                        className={`py-1.5 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer ${
                          cardCount === c
                            ? 'bg-white/[0.1] border-white/20 text-white shadow-sm'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c} Cards
                      </button>
                    ))}
                  </div>
                </div>

                {/* Depth & Priority Mode */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">Study Focus Mode</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'high-yield', label: 'High-Yield Exam' },
                      { id: 'deep-dive', label: 'Problem Solving' },
                      { id: 'definitions', label: 'Definitions & Terms' }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDepthMode(m.id)}
                        className={`py-2 px-1.5 rounded-xl text-center border text-xs font-semibold transition-all cursor-pointer truncate ${
                          depthMode === m.id
                            ? 'bg-white/[0.1] border-white/20 text-white shadow-sm'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <span>Generate Flashcard Deck</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : isReadyPreview ? (
            /* 2. DECK READY PREVIEW SCREEN (Study Now vs Save for Later) */
            <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 text-center">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto text-white">
                <Layers className="w-5 h-5" />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-slate-400 uppercase font-mono tracking-wider">Deck Ready</div>
                <div className="flex items-center justify-center gap-2">
                  <h3 className="text-base font-bold text-white">{deckTitle}</h3>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="p-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white cursor-pointer"
                    title="Edit Name"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-center gap-1.5 pt-1 flex-wrap">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                    {courseCode}
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                    {cards.length} Cards
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                    {depthMode}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleStartStudyNow}
                  className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Study Deck Now</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveDeckForLater}
                  className="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white border border-white/10 text-xs font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save for Later</span>
                </button>
              </div>
            </div>
          ) : (
            /* 3. INTERACTIVE 3D FLIP FLASHCARD DRILL */
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Card {isCompleted ? cards.length : currentIndex + 1} of {cards.length}</span>
                  <span className="text-white font-semibold">{progressPercent}% Reviewed</span>
                </div>
                <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full rounded-full"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {isGenerating ? (
                <div className="min-h-[220px] rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                  <div className="text-xs font-bold text-white">Extracting {courseCode} Flashcards from Notes...</div>
                </div>
              ) : isCompleted ? (
                /* Deck Session Complete Screen */
                <div className="min-h-[220px] rounded-2xl bg-white/[0.02] border border-white/10 p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">Deck Session Complete</h4>
                    <p className="text-xs text-slate-300 mt-1">
                      You reviewed {cards.length} active recall cards.
                    </p>
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 mt-2">
                      <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Saved to Obsidian (`{courseCode}/Flashcards/`)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsConfiguring(true)}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      New Deck
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white text-xs font-semibold border border-white/10 transition-all cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              ) : (
                /* Interactive Flip Flashcard */
                <div className="space-y-3">
                  <div 
                    onClick={handleFlip}
                    className="relative min-h-[200px] rounded-2xl bg-gradient-to-br from-white/[0.05] to-white/[0.02] border border-white/10 p-5 flex flex-col justify-between cursor-pointer transition-all hover:border-white/20 shadow-lg group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 font-semibold border border-white/10">
                        {currentCard?.concept || "Concept"}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1 group-hover:text-white transition-colors">
                        <RotateCw className="w-3 h-3" />
                        <span>{isFlipped ? "Answer" : "Click to Flip"}</span>
                      </span>
                    </div>

                    <div className="my-auto py-4 text-center">
                      <p className="text-xs sm:text-sm font-semibold text-slate-100 leading-relaxed font-sans">
                        {isFlipped ? currentCard?.back : currentCard?.front}
                      </p>
                      {isFlipped && currentCard?.yieldReason && (
                        <p className="text-[11px] text-slate-400 font-mono mt-2 italic">
                          💡 Exam Note: {currentCard.yieldReason}
                        </p>
                      )}
                    </div>

                    <div className="text-[10px] text-center text-slate-500 font-mono">
                      {isFlipped ? "Rate your recall difficulty below" : "Space / Click to reveal answer"}
                    </div>
                  </div>

                  {/* Rating Buttons */}
                  {isFlipped && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-4 gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleRateCard('again')}
                        className="p-2 rounded-xl bg-white/[0.02] hover:bg-rose-500/20 border border-white/5 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-all cursor-pointer text-center"
                      >
                        <div>Again</div>
                        <div className="text-[9px] text-slate-500">1m</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRateCard('hard')}
                        className="p-2 rounded-xl bg-white/[0.02] hover:bg-amber-500/20 border border-white/5 hover:border-amber-500/40 text-slate-300 hover:text-amber-300 text-xs font-semibold transition-all cursor-pointer text-center"
                      >
                        <div>Hard</div>
                        <div className="text-[9px] text-slate-500">10m</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRateCard('good')}
                        className="p-2 rounded-xl bg-white/[0.02] hover:bg-blue-500/20 border border-white/5 hover:border-blue-500/40 text-slate-300 hover:text-blue-300 text-xs font-semibold transition-all cursor-pointer text-center"
                      >
                        <div>Good</div>
                        <div className="text-[9px] text-slate-500">1d</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRateCard('easy')}
                        className="p-2 rounded-xl bg-white/[0.02] hover:bg-emerald-500/20 border border-white/5 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-300 text-xs font-semibold transition-all cursor-pointer text-center"
                      >
                        <div>Easy</div>
                        <div className="text-[9px] text-slate-500">4d</div>
                      </button>
                    </motion.div>
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
