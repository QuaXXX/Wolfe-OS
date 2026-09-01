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
  AlertOctagon,
  BookOpen
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generatePracticeQuizWithAI } from '../../utils/aiService';
import { saveQuizResult } from '../../utils/studyStorage';
import { playSound } from '../../utils/soundFX';

export const PracticeQuizModal = ({ 
  isOpen, 
  onClose, 
  initialCourse = "",
  initialTopic = "Exam Practice Questions",
  initialQuestions = null,
  courseNotes = "",
  soundEnabled = true 
}) => {
  // Wizard / Setup State
  const [isConfiguring, setIsConfiguring] = useState(!initialQuestions);
  const [courseCode, setCourseCode] = useState(initialCourse || "Course");
  const [topic, setTopic] = useState(initialTopic);
  const [chapterScope, setChapterScope] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [depthMode, setDepthMode] = useState("high-yield");

  // Quiz State
  const [questions, setQuestions] = useState(initialQuestions || []);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [userAnswers, setUserAnswers] = useState([]);

  useEffect(() => {
    if (isOpen) {
      if (initialQuestions && initialQuestions.length > 0) {
        setQuestions(initialQuestions);
        setCourseCode(initialCourse || "Course");
        setIsConfiguring(false);
      } else {
        setCourseCode(initialCourse || "");
        setIsConfiguring(true);
      }
      setIsFinished(false);
      setScore(0);
      setCurrentIndex(0);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
      setShowHint(false);
      setUserAnswers([]);
    }
  }, [isOpen, initialCourse, initialQuestions]);

  const handleStartGeneration = async (e) => {
    if (e) e.preventDefault();
    setIsGenerating(true);
    setIsConfiguring(false);
    setIsFinished(false);
    setScore(0);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setShowHint(false);
    setUserAnswers([]);
    playSound('click', soundEnabled);

    try {
      const quiz = await generatePracticeQuizWithAI({
        courseCode: courseCode.trim() || "Academics",
        topic: topic.trim() || "Exam Prep",
        chapterScope: chapterScope.trim(),
        notesText: courseNotes,
        count: questionCount,
        depthMode
      });
      setQuestions(quiz.questions || []);
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Quiz generation notice:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitAnswer = () => {
    if (selectedOption === null) return;
    setIsAnswerSubmitted(true);

    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedOption === currentQuestion.correctIndex;
    
    setUserAnswers(prev => [...prev, selectedOption]);

    if (isCorrect) {
      playSound('success', soundEnabled);
      setScore(prev => prev + 1);
    } else {
      playSound('switch', soundEnabled);
    }
  };

  const handleNextQuestion = () => {
    playSound('click', soundEnabled);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
      setShowHint(false);
    } else {
      setIsFinished(true);
      
      // Auto-save quiz attempt and populate Weak-Spots
      saveQuizResult({
        courseCode: courseCode.trim() || "General",
        topic: topic.trim(),
        chapterScope: chapterScope.trim(),
        score: score + (selectedOption === questions[currentIndex]?.correctIndex ? 1 : 0),
        totalQuestions: questions.length,
        questions,
        userAnswers: [...userAnswers, selectedOption]
      });

      if (score >= Math.ceil(questions.length * 0.7)) {
        try {
          confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 } });
        } catch (e) {}
      }
      playSound('success', soundEnabled);
    }
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];
  const progressPercent = questions.length > 0 ? Math.round(((currentIndex + (isFinished ? 1 : 0)) / questions.length) * 100) : 0;
  const scorePercent = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;

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
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{courseCode ? `${courseCode} Practice Exam` : "Practice Quiz"}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    Exam Simulator
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Multi-choice problem sets with instant explanations & weak-spot tracking</p>
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

          {/* 1. QUIZ CUSTOMIZATION SETUP WIZARD */}
          {isConfiguring ? (
            <form onSubmit={handleStartGeneration} className="space-y-4 pt-1">
              <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Customize Quiz Generation</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Course Code</label>
                    <input
                      type="text"
                      value={courseCode}
                      onChange={(e) => setCourseCode(e.target.value)}
                      placeholder="e.g. CPSC 331, MATH 211"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-emerald-500/40"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Focus Chapter / Scope</label>
                    <input
                      type="text"
                      value={chapterScope}
                      onChange={(e) => setChapterScope(e.target.value)}
                      placeholder="e.g. Midterm 1, Chapters 1-4"
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs outline-none focus:border-emerald-500/40"
                    />
                  </div>
                </div>

                {/* Question Quantity Selector */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Quiz Length (Questions)</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { count: 5, label: "5 Questions (Quick)" },
                      { count: 10, label: "10 Questions (Standard)" },
                      { count: 15, label: "15 Questions (Intensive)" },
                      { count: 25, label: "25 Questions (Full Mock)" }
                    ].map(c => (
                      <button
                        key={c.count}
                        type="button"
                        onClick={() => setQuestionCount(c.count)}
                        className={`py-2 px-1 rounded-xl text-xs font-semibold border transition-all text-center cursor-pointer ${
                          questionCount === c.count
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-sm'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Depth & Priority Mode */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">Quiz Focus</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'high-yield', label: '🔥 High-Yield Exam', desc: 'Highest probability questions' },
                      { id: 'deep-dive', label: '🧠 Multi-Step Problems', desc: 'Calculations & scenarios' },
                      { id: 'definitions', label: '⚡ Rapid Fundamentals', desc: 'Classifications & concepts' }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDepthMode(m.id)}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          depthMode === m.id
                            ? 'bg-emerald-500/25 border-emerald-400 text-emerald-100 shadow-sm'
                            : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="text-xs font-bold">{m.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Start Practice Quiz</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            /* 2. QUIZ INTERACTION & PROGRESS */
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Question {isFinished ? questions.length : currentIndex + 1} of {questions.length}</span>
                  <span className="text-emerald-400 font-semibold">Score: {score}/{currentIndex + (isAnswerSubmitted ? 1 : 0)}</span>
                </div>
                <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-emerald-500 rounded-full"
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {/* Generating Loader */}
              {isGenerating ? (
                <div className="min-h-[260px] rounded-3xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                  <div>
                    <div className="text-xs font-bold text-white">Constructing Exam Questions with AI...</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Synthesizing realistic problem sets, scenarios & distractor options</div>
                  </div>
                </div>
              ) : isFinished ? (
                /* Quiz Results Summary Screen */
                <div className="min-h-[260px] rounded-3xl bg-gradient-to-b from-emerald-950/20 to-transparent border border-emerald-500/20 p-6 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Award className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">Quiz Completed!</h4>
                    <p className="text-xs text-slate-300 mt-1">
                      You scored <strong className="text-emerald-400 font-mono text-sm">{score} / {questions.length}</strong> ({scorePercent}%)
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Missed questions have been automatically logged into your <strong>Weak-Spot Bank</strong> for review.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsConfiguring(true)}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                    >
                      Take Another Quiz
                    </button>
                  </div>
                </div>
              ) : (
                /* Question & Multiple Choice Options */
                <div className="space-y-4">
                  <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                          {currentQuestion?.topic || "Exam Question"}
                        </span>
                        {currentQuestion?.yieldRating === 'high' && (
                          <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 flex items-center gap-1">
                            <Flame className="w-3 h-3 text-amber-400" /> High-Yield
                          </span>
                        )}
                      </div>

                      {currentQuestion?.hint && (
                        <button
                          type="button"
                          onClick={() => setShowHint(prev => !prev)}
                          className="text-[11px] font-medium text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Lightbulb className="w-3.5 h-3.5" />
                          <span>{showHint ? "Hide Hint" : "Hint"}</span>
                        </button>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm font-semibold text-slate-100 leading-relaxed">
                      {currentQuestion?.question}
                    </p>

                    {showHint && currentQuestion?.hint && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs font-sans"
                      >
                        💡 <strong>Hint</strong>: {currentQuestion.hint}
                      </motion.div>
                    )}
                  </div>

                  {/* Multiple Choice Options List */}
                  <div className="space-y-2">
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
                        btnStyle = "bg-emerald-500/20 border-emerald-400 text-emerald-100 shadow-sm";
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
                          className={`w-full p-3 rounded-xl text-xs text-left border transition-all flex items-start gap-3 cursor-pointer ${btnStyle}`}
                        >
                          <span className="w-5 h-5 rounded-lg bg-black/40 flex items-center justify-center font-mono text-[10px] shrink-0 font-bold">
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="leading-relaxed">{opt}</span>
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

                  {/* Explanation Box (Revealed after submit) */}
                  {isAnswerSubmitted && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5 font-sans"
                    >
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Explanation:</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {currentQuestion?.explanation}
                      </p>
                    </motion.div>
                  )}

                  {/* Action Buttons: Submit / Next */}
                  <div className="pt-2">
                    {!isAnswerSubmitted ? (
                      <button
                        type="button"
                        onClick={handleSubmitAnswer}
                        disabled={selectedOption === null}
                        className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md active:scale-98 transition-all disabled:opacity-40 cursor-pointer"
                      >
                        Submit Answer
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleNextQuestion}
                        className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer"
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
