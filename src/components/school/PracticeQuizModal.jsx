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
  GraduationCap 
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { generatePracticeQuizWithAI } from '../../utils/aiService';
import { playSound } from '../../utils/soundFX';

export const PracticeQuizModal = ({ 
  isOpen, 
  onClose, 
  initialCourse = "FNCE 317",
  courseNotes = "",
  soundEnabled = true 
}) => {
  const [courseCode, setCourseCode] = useState(initialCourse);
  const [topic, setTopic] = useState("Exam Practice Questions");
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCourseCode(initialCourse);
      setIsFinished(false);
      setScore(0);
      setCurrentIndex(0);
      setSelectedOption(null);
      setIsAnswerSubmitted(false);
      setShowHint(false);
      handleGenerateQuiz(initialCourse, topic);
    }
  }, [isOpen, initialCourse]);

  const handleGenerateQuiz = async (cCode = courseCode, cTopic = topic) => {
    setIsGenerating(true);
    setIsFinished(false);
    setScore(0);
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setShowHint(false);
    playSound('click', soundEnabled);

    try {
      const quiz = await generatePracticeQuizWithAI({
        courseCode: cCode,
        topic: cTopic,
        notesText: courseNotes,
        count: 5
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

    const isCorrect = selectedOption === currentQuestion.correctIndex;
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
      if (score >= Math.ceil(questions.length * 0.7)) {
        try {
          confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
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
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
              >
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{courseCode} Practice Exam</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                    Active Recall
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Exam-style multiple choice simulation based on lecture notes</p>
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

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>Question {isFinished ? questions.length : currentIndex + 1} of {questions.length}</span>
              <span className="text-emerald-400 font-semibold">Score: {score}/{questions.length}</span>
            </div>
            <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-emerald-500 rounded-full"
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          {/* Body */}
          {isGenerating ? (
            <div className="min-h-[260px] rounded-3xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <div>
                <div className="text-xs font-bold text-white">Generating Realistic Exam Questions...</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Crafting multiple choice scenarios with detailed explanations</div>
              </div>
            </div>
          ) : isFinished ? (
            /* Results Screen */
            <div className="min-h-[260px] rounded-3xl bg-gradient-to-b from-emerald-950/20 to-transparent border border-emerald-500/20 p-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Award className="w-7 h-7" />
              </div>

              <div>
                <div className="text-2xl font-bold font-mono text-white">{scorePercent}%</div>
                <div className="text-xs font-bold text-emerald-300 mt-0.5">
                  {scorePercent >= 80 ? "Outstanding Mastery!" : scorePercent >= 60 ? "Solid Understanding" : "Review Recommended"}
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  You scored {score} out of {questions.length} correct. Test-taking active recall strengthens exam retention by up to 200%.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleGenerateQuiz()}
                  className="px-4 py-2 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Take Another Practice Quiz</span>
                </button>
              </div>
            </div>
          ) : currentQuestion ? (
            /* Question & Options */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10">
                <p className="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                  {currentQuestion.question}
                </p>
              </div>

              {/* Multiple Choice Options */}
              <div className="space-y-2">
                {currentQuestion.options.map((opt, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = idx === currentQuestion.correctIndex;
                  const isWrongSelected = isAnswerSubmitted && isSelected && !isCorrect;
                  const isRightSelected = isAnswerSubmitted && isCorrect;

                  let borderClass = 'border-white/10 hover:border-white/20 bg-white/[0.02]';
                  if (isRightSelected) {
                    borderClass = 'border-emerald-500 bg-emerald-500/10 text-emerald-100';
                  } else if (isWrongSelected) {
                    borderClass = 'border-rose-500 bg-rose-500/10 text-rose-100';
                  } else if (isSelected && !isAnswerSubmitted) {
                    borderClass = 'border-blue-400 bg-blue-500/10 text-white';
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
                      className={`w-full p-3 rounded-xl border text-xs text-left transition-all flex items-center justify-between gap-3 cursor-pointer disabled:cursor-default ${borderClass}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="w-5 h-5 rounded-lg bg-white/5 border border-white/10 font-mono text-[10px] font-bold text-slate-300 flex items-center justify-center shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <span>{opt}</span>
                      </div>

                      {isRightSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {isWrongSelected && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Hint Accordion */}
              {currentQuestion.hint && !isAnswerSubmitted && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowHint(prev => !prev)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{showHint ? "Hide Hint" : "Need a Hint?"}</span>
                  </button>
                  {showHint && (
                    <div className="mt-1.5 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200">
                      {currentQuestion.hint}
                    </div>
                  )}
                </div>
              )}

              {/* Explanation Banner (After Submit) */}
              {isAnswerSubmitted && (
                <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/15 space-y-1">
                  <div className="text-[11px] font-bold font-mono text-emerald-400 uppercase tracking-wide">
                    Explanation & Key Takeaway:
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    {currentQuestion.explanation}
                  </p>
                </div>
              )}

              {/* Bottom Buttons */}
              <div className="pt-2">
                {!isAnswerSubmitted ? (
                  <button
                    type="button"
                    onClick={handleSubmitAnswer}
                    disabled={selectedOption === null}
                    className="w-full py-2.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>{currentIndex + 1 < questions.length ? "Next Question" : "View Final Score"}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
