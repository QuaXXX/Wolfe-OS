import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  ArrowRight, 
  RotateCw, 
  Award, 
  X, 
  Loader2, 
  Lightbulb, 
  GraduationCap, 
  Sliders, 
  Flame, 
  BookmarkPlus, 
  BookOpen, 
  FolderSync, 
  Edit3,
  Check,
  Play,
  Save
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generatePracticeQuizWithAI } from '../../utils/aiService';
import { saveQuizResult, saveActiveQuizProgress } from '../../utils/studyStorage';
import { getCachedVaultFiles, saveQuizToObsidian } from '../../utils/obsidianService';
import { playSound } from '../../utils/soundFX';

export const PracticeQuizModal = ({ 
  isOpen, 
  onClose, 
  initialCourse = "", 
  initialTopic = "Exam Practice Questions", 
  initialQuestions = null, 
  initialQuiz = null, 
  courseNotes = "", 
  soundEnabled = true 
}) => {
  // Wizard / Setup State
  const [isConfiguring, setIsConfiguring] = useState(!initialQuestions && !initialQuiz);
  const [isReadyPreview, setIsReadyPreview] = useState(false);
  const [quizId, setQuizId] = useState(initialQuiz?.id || null);
  const [courseCode, setCourseCode] = useState(initialQuiz?.courseCode || initialCourse || "Course");
  const [topic, setTopic] = useState(initialQuiz?.topic || initialTopic);
  const [quizTitle, setQuizTitle] = useState(initialQuiz?.title || initialQuiz?.topic || `${initialCourse || 'Course'} Practice Quiz`);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [chapterScope, setChapterScope] = useState(initialQuiz?.chapterScope || "");
  const [questionCount, setQuestionCount] = useState(initialQuiz?.questions?.length || 5);
  const [depthMode, setDepthMode] = useState(initialQuiz?.depthMode || "high-yield");

  // Quiz State
  const [questions, setQuestions] = useState(initialQuiz?.questions || initialQuestions || []);
  const [currentIndex, setCurrentIndex] = useState(initialQuiz?.currentIndex || 0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFinished, setIsFinished] = useState(initialQuiz ? (!initialQuiz.isInProgress && !!initialQuiz.completedAt) : false);
  const [score, setScore] = useState(initialQuiz?.score || 0);
  const [showHint, setShowHint] = useState(false);
  const [userAnswers, setUserAnswers] = useState(initialQuiz?.userAnswers || []);
  const [savedToObsidianSuccess, setSavedToObsidianSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialQuiz) {
        setQuizId(initialQuiz.id);
        setCourseCode(initialQuiz.courseCode || initialCourse);
        setTopic(initialQuiz.topic || initialTopic);
        setQuizTitle(initialQuiz.title || initialQuiz.topic || `${initialQuiz.courseCode || 'Course'} Practice Quiz`);
        setQuestions(initialQuiz.questions || []);
        setUserAnswers(initialQuiz.userAnswers || []);
        setScore(initialQuiz.score || 0);
        setCurrentIndex(initialQuiz.currentIndex || 0);
        setIsFinished(!initialQuiz.isInProgress && !!initialQuiz.completedAt);
        setIsConfiguring(false);
        setIsReadyPreview(false);
      } else if (initialQuestions && initialQuestions.length > 0) {
        setQuizId(null);
        setQuestions(initialQuestions);
        setCourseCode(initialCourse || "Course");
        setQuizTitle(`${initialCourse || 'Course'} Weak-Spot Quiz`);
        setUserAnswers([]);
        setScore(0);
        setCurrentIndex(0);
        setIsFinished(false);
        setIsConfiguring(false);
        setIsReadyPreview(true);
      } else {
        setQuizId(null);
        setCourseCode(initialCourse || "");
        setQuizTitle(`${initialCourse || 'Course'} Practice Quiz`);
        setIsConfiguring(true);
        setIsReadyPreview(false);
        setIsFinished(false);
        setScore(0);
        setCurrentIndex(0);
        setUserAnswers([]);
      }
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
      setShowHint(false);
      setSavedToObsidianSuccess(false);
      setIsEditingTitle(false);
    }
  }, [isOpen, initialCourse, initialQuestions, initialQuiz]);

  const handleStartGeneration = async (e) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setIsConfiguring(false);
    setIsReadyPreview(false);
    setIsFinished(false);
    setScore(0);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setShowHint(false);
    setUserAnswers([]);
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

      const generatedTitle = quizTitle.trim() || `${courseCode.trim()} ${chapterScope.trim() || topic.trim()} Quiz`;

      const quiz = await generatePracticeQuizWithAI({
        courseCode: courseCode.trim() || "Academics",
        topic: chapterScope.trim() || topic.trim() || "Exam Prep",
        chapterScope: chapterScope.trim(),
        notesText: notes,
        count: questionCount,
        depthMode
      });

      const newQuestions = quiz.questions || [];
      setQuestions(newQuestions);
      setQuizTitle(generatedTitle);

      // Initialize in study storage
      const activeEntry = saveActiveQuizProgress({
        courseCode: courseCode.trim() || "General",
        title: generatedTitle,
        topic: chapterScope.trim() || topic.trim(),
        chapterScope: chapterScope.trim(),
        depthMode,
        score: 0,
        totalQuestions: newQuestions.length,
        questions: newQuestions,
        userAnswers: [],
        currentIndex: 0
      });
      setQuizId(activeEntry.id);

      // Show preview screen so user can confirm title or save for later
      setIsReadyPreview(true);
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Quiz generation notice:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStartQuizNow = () => {
    playSound('click', soundEnabled);
    setIsReadyPreview(false);
  };

  const handleSaveForLater = async () => {
    playSound('click', soundEnabled);
    const activeQuiz = {
      id: quizId,
      courseCode: courseCode.trim() || "General",
      title: quizTitle.trim() || `${courseCode} Quiz`,
      topic: chapterScope.trim() || topic.trim(),
      chapterScope: chapterScope.trim(),
      depthMode,
      score: 0,
      totalQuestions: questions.length,
      questions,
      userAnswers: [],
      currentIndex: 0
    };

    saveActiveQuizProgress(activeQuiz);
    await saveQuizToObsidian(activeQuiz);
    onClose();
  };

  const handleSubmitAnswer = () => {
    if (selectedOption === null) return;
    setIsAnswerSubmitted(true);

    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedOption === currentQuestion.correctIndex;
    const nextAnswers = [...userAnswers, selectedOption];
    setUserAnswers(nextAnswers);

    const nextScore = isCorrect ? score + 1 : score;
    if (isCorrect) {
      playSound('success', soundEnabled);
      setScore(nextScore);
    } else {
      playSound('switch', soundEnabled);
    }

    saveActiveQuizProgress({
      id: quizId,
      courseCode: courseCode.trim() || "General",
      title: quizTitle.trim(),
      topic: topic.trim(),
      chapterScope: chapterScope.trim(),
      depthMode,
      score: nextScore,
      totalQuestions: questions.length,
      questions,
      userAnswers: nextAnswers,
      currentIndex
    });
  };

  const handleNextQuestion = () => {
    playSound('click', soundEnabled);
    if (currentIndex + 1 < questions.length) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
      setShowHint(false);

      saveActiveQuizProgress({
        id: quizId,
        courseCode: courseCode.trim() || "General",
        title: quizTitle.trim(),
        topic: topic.trim(),
        chapterScope: chapterScope.trim(),
        depthMode,
        score,
        totalQuestions: questions.length,
        questions,
        userAnswers,
        currentIndex: nextIdx
      });
    } else {
      setIsFinished(true);
      
      const finishedQuiz = {
        id: quizId,
        courseCode: courseCode.trim() || "General",
        title: quizTitle.trim(),
        topic: topic.trim(),
        chapterScope: chapterScope.trim(),
        depthMode,
        score,
        totalQuestions: questions.length,
        questions,
        userAnswers
      };

      saveQuizResult(finishedQuiz);
      saveQuizToObsidian(finishedQuiz).then(ok => {
        if (ok) setSavedToObsidianSuccess(true);
      });

      if (score >= Math.ceil(questions.length * 0.7)) {
        try {
          confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
        } catch (e) {}
      }
      playSound('success', soundEnabled);
    }
  };

  const handleSaveAndExit = async () => {
    playSound('click', soundEnabled);
    const activeQuiz = {
      id: quizId,
      courseCode: courseCode.trim() || "General",
      title: quizTitle.trim(),
      topic: topic.trim(),
      chapterScope: chapterScope.trim(),
      depthMode,
      score,
      totalQuestions: questions.length,
      questions,
      userAnswers,
      currentIndex
    };

    saveActiveQuizProgress(activeQuiz);
    await saveQuizToObsidian(activeQuiz);
    onClose();
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];
  const progressPercent = questions.length > 0 ? Math.round(((currentIndex + (isFinished ? 1 : 0)) / questions.length) * 100) : 0;
  const scorePercent = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

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
                {courseCode || "Quiz"}
              </span>

              {isEditingTitle ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
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
                    title="Click to rename quiz"
                  >
                    {quizTitle || topic || "Practice Exam"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsEditingTitle(true)}
                    className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                    title="Rename Quiz"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isConfiguring && !isReadyPreview && !isFinished && questions.length > 0 && (
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

          {/* 1. QUIZ CUSTOMIZATION SETUP WIZARD */}
          {isConfiguring ? (
            <form onSubmit={handleStartGeneration} className="space-y-4 pt-1">
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                {/* Quiz Name Field */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Quiz Name / Title</label>
                  <input
                    type="text"
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    placeholder="e.g. Midterm 1 Formula Practice, Chapter 4 Quiz"
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
                      placeholder="e.g. Chapters 1-3, CAPM, WACC"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-white/30 font-sans"
                    />
                  </div>
                </div>

                {/* Question Count Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">Question Count</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 15, 20].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setQuestionCount(c)}
                        className={`py-1.5 rounded-xl border text-center text-xs font-semibold transition-all cursor-pointer ${
                          questionCount === c
                            ? 'bg-white/[0.1] border-white/20 text-white shadow-sm'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c} Qs
                      </button>
                    ))}
                  </div>
                </div>

                {/* Depth Mode */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">Focus Mode</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'high-yield', label: 'High-Yield Exam' },
                      { id: 'deep-dive', label: 'Calculations' },
                      { id: 'definitions', label: 'Fundamentals' }
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
                <span>Generate Questions</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : isReadyPreview ? (
            /* 2. QUIZ READY PREVIEW SCREEN (Start Now vs Save for Later) */
            <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-4 text-center">
              <div className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto text-white">
                <GraduationCap className="w-5 h-5" />
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-slate-400 uppercase font-mono tracking-wider">Quiz Ready</div>
                <div className="flex items-center justify-center gap-2">
                  <h3 className="text-base font-bold text-white">{quizTitle}</h3>
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
                    {questions.length} Questions
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                    {depthMode}
                  </span>
                </div>
              </div>

              {/* Start Now vs Save for Later Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleStartQuizNow}
                  className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Start Quiz Now</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveForLater}
                  className="w-full py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white border border-white/10 text-xs font-semibold active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save for Later</span>
                </button>
              </div>
            </div>
          ) : (
            /* 3. QUIZ QUESTION INTERACTION & PROGRESS */
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Question {isFinished ? questions.length : currentIndex + 1} of {questions.length}</span>
                  <span className="text-white font-semibold">Score: {score}/{currentIndex + (isAnswerSubmitted ? 1 : 0)}</span>
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
                  <div className="text-xs font-bold text-white">Generating {courseCode} Questions from Notes...</div>
                </div>
              ) : isFinished ? (
                /* Results Screen */
                <div className="min-h-[220px] rounded-2xl bg-white/[0.02] border border-white/10 p-6 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-white">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-white">Quiz Completed</h4>
                    <p className="text-xs text-slate-300 mt-1">
                      Final Score: <strong className="text-white font-mono text-sm">{score} / {questions.length}</strong> ({scorePercent}%)
                    </p>
                    <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 mt-2">
                      <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Saved & Synced to Obsidian (`{courseCode}/Quizzes/`)</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsConfiguring(true)}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      New Quiz
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
                /* Active Question & Options */
                <div className="space-y-3">
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.04] text-slate-300 font-semibold border border-white/10">
                        {currentQuestion?.topic || "Question"}
                      </span>

                      {currentQuestion?.hint && (
                        <button
                          type="button"
                          onClick={() => setShowHint(prev => !prev)}
                          className="text-[11px] font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Lightbulb className="w-3 h-3" />
                          <span>{showHint ? "Hide Hint" : "Hint"}</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm font-semibold text-slate-100 leading-relaxed font-sans">
                      {currentQuestion?.question}
                    </p>

                    {showHint && currentQuestion?.hint && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs font-sans"
                      >
                        💡 {currentQuestion.hint}
                      </motion.div>
                    )}
                  </div>

                  {/* Options List */}
                  <div className="space-y-1.5">
                    {currentQuestion?.options?.map((opt, idx) => {
                      const isSelected = selectedOption === idx;
                      const isCorrect = idx === currentQuestion.correctIndex;
                      
                      let btnStyle = "bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.05] hover:border-white/15";
                      if (isAnswerSubmitted) {
                        if (isCorrect) {
                          btnStyle = "bg-emerald-500/20 border-emerald-500/50 text-emerald-200 font-semibold";
                        } else if (isSelected && !isCorrect) {
                          btnStyle = "bg-rose-500/20 border-rose-500/50 text-rose-200";
                        } else {
                          btnStyle = "bg-white/[0.01] border-white/5 text-slate-500 opacity-50";
                        }
                      } else if (isSelected) {
                        btnStyle = "bg-white/[0.1] border-white/20 text-white shadow-sm";
                      }

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isAnswerSubmitted}
                          onClick={() => {
                            playSound('click', soundEnabled);
                            setSelectedOption(idx);
                          }}
                          className={`w-full p-2.5 rounded-xl text-xs text-left border transition-all flex items-start gap-2.5 cursor-pointer ${btnStyle}`}
                        >
                          <span className="w-4 h-4 rounded bg-black/40 flex items-center justify-center font-mono text-[10px] shrink-0 font-bold">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="leading-relaxed font-sans">{opt}</span>
                          {isAnswerSubmitted && isCorrect && (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto shrink-0 mt-0.5" />
                          )}
                          {isAnswerSubmitted && isSelected && !isCorrect && (
                            <XCircle className="w-4 h-4 text-rose-400 ml-auto shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Explanation Box */}
                  {isAnswerSubmitted && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1 font-sans"
                    >
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                        <span>Explanation</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {currentQuestion?.explanation}
                      </p>
                    </motion.div>
                  )}

                  {/* Next / Submit */}
                  <div className="pt-1">
                    {!isAnswerSubmitted ? (
                      <button
                        type="button"
                        onClick={handleSubmitAnswer}
                        disabled={selectedOption === null}
                        className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-sm active:scale-98 transition-all disabled:opacity-40 cursor-pointer"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        Submit Answer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>{currentIndex + 1 < questions.length ? "Next Question" : "View Final Results"}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
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
