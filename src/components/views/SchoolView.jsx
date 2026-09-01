import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  Circle, 
  Play, 
  ChevronRight, 
  Layers, 
  HelpCircle, 
  Mail, 
  Search, 
  FolderSync, 
  Shield, 
  Lock,
  Flame,
  AlertTriangle,
  RotateCcw,
  Award,
  Trash2,
  ListTodo,
  Sparkles
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { NotebookLMStudyHubModal } from '../school/NotebookLMStudyHubModal';
import { FlashcardDeckModal } from '../school/FlashcardDeckModal';
import { PracticeQuizModal } from '../school/PracticeQuizModal';
import { VaultSearchModal } from '../school/VaultSearchModal';
import { DeepFocusModal } from '../school/DeepFocusModal';
import { getVaultMetadata, getVaultHandle, scanVaultDirectory, getCachedVaultFiles } from '../../utils/obsidianService';
import { 
  getSavedDecks, 
  getSavedQuizzes, 
  getWeakSpots, 
  deleteDeckFromLibrary, 
  clearWeakSpot 
} from '../../utils/studyStorage';

export const SchoolView = ({ 
  schoolData, 
  onAddItem, 
  soundEnabled = true 
}) => {
  const defaultUniversityCourses = [
    { id: 'fnce317', code: 'FNCE 317', name: 'Financial Management', credits: '3.0', instructor: 'Finance Dept' },
    { id: 'btma317', code: 'BTMA 317', name: 'Information Technology', credits: '3.0', instructor: 'Business Tech' },
    { id: 'opma317', code: 'OPMA 317', name: 'Operations Management', credits: '3.0', instructor: 'Operations Dept' },
    { id: 'mgst391', code: 'MGST 391', name: 'Management Analytics', credits: '3.0', instructor: 'Management Science' },
    { id: 'mktg317', code: 'MKTG 317', name: 'Marketing Management', credits: '3.0', instructor: 'Marketing Dept' },
    { id: 'psyc203', code: 'PSYC 203', name: 'Psychology Principles', credits: '3.0', instructor: 'Psychology Dept' }
  ];

  const courses = (schoolData.courses && schoolData.courses.length > 0)
    ? schoolData.courses
    : defaultUniversityCourses;

  const [selectedCourse, setSelectedCourse] = useState(courses[0]?.id || 'fnce317');
  const [assignments, setAssignments] = useState(schoolData.assignments || []);
  const [vaultMeta, setVaultMeta] = useState(getVaultMetadata());
  const [scannedFiles, setScannedFiles] = useState([]);

  // Study Storage data
  const [savedDecks, setSavedDecks] = useState([]);
  const [savedQuizzes, setSavedQuizzes] = useState([]);
  const [weakSpots, setWeakSpots] = useState([]);
  const [selectedDeckForStudy, setSelectedDeckForStudy] = useState(null);
  const [selectedQuizQuestions, setSelectedQuizQuestions] = useState(null);

  // Modals state
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isFlashcardsOpen, setIsFlashcardsOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isDeepFocusOpen, setIsDeepFocusOpen] = useState(false);

  useEffect(() => {
    refreshStudyLibrary();
    loadVaultFiles();
  }, []);

  const loadVaultFiles = async () => {
    try {
      const cached = getCachedVaultFiles();
      if (cached && cached.files && cached.files.length > 0) {
        setScannedFiles(cached.files);
        setVaultMeta(prev => ({
          ...prev,
          connected: true,
          folderName: cached.folderName || prev.folderName || 'school',
          totalNotes: cached.files.length,
          courses: cached.courses || prev.courses || []
        }));
      }

      const handle = await getVaultHandle();
      if (handle) {
        const scanned = await scanVaultDirectory(handle);
        if (scanned && scanned.files.length > 0) {
          setScannedFiles(scanned.files);
          setVaultMeta({
            connected: true,
            folderName: handle.name,
            totalNotes: scanned.files.length,
            courses: scanned.courses,
            lastScanned: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      console.warn("Auto-load vault files notice:", e);
    }
  };

  const refreshStudyLibrary = () => {
    setSavedDecks(getSavedDecks());
    setSavedQuizzes(getSavedQuizzes());
    setWeakSpots(getWeakSpots());
  };

  const activeCourse = courses.find(c => c.id === selectedCourse || c.code === selectedCourse) || courses[0];

  const toggleAssignment = (id) => {
    playSound('click', soundEnabled);
    setAssignments(prev => prev.map(a => {
      if (a.id === id) {
        const next = !a.completed;
        if (next) playSound('success', soundEnabled);
        return { ...a, completed: next };
      }
      return a;
    }));
  };

  const handleOpenStudyTool = (tool) => {
    playSound('click', soundEnabled);
    setSelectedDeckForStudy(null);
    setSelectedQuizQuestions(null);
    if (tool === 'flashcards') setIsFlashcardsOpen(true);
    else if (tool === 'quiz') setIsQuizOpen(true);
    else if (tool === 'search') {
      if (!vaultMeta.connected) {
        setIsVaultModalOpen(true);
      } else {
        setIsSearchModalOpen(true);
      }
    }
  };

  const handleLaunchSavedDeck = (deck) => {
    playSound('click', soundEnabled);
    setSelectedDeckForStudy(deck);
    setIsFlashcardsOpen(true);
  };

  const handleDeleteDeck = (deckId, e) => {
    e.stopPropagation();
    playSound('click', soundEnabled);
    deleteDeckFromLibrary(deckId);
    refreshStudyLibrary();
  };

  const handleLaunchWeakSpotDrill = () => {
    playSound('click', soundEnabled);
    if (weakSpots.length === 0) return;

    // Convert weak spots into a custom quiz
    const drillQuestions = weakSpots.map((ws, i) => ({
      id: `drill-${i}`,
      question: ws.question,
      options: ws.options,
      correctIndex: ws.correctIndex,
      explanation: ws.explanation,
      yieldRating: 'high',
      topic: `Weak-Spot Review (${ws.courseCode || 'Academics'})`
    }));

    setSelectedQuizQuestions(drillQuestions);
    setIsQuizOpen(true);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <GraduationCap className="w-4 h-4" />
            <span>Academic Command • {schoolData.term || 'Fall 2026'}</span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
            School & Academics
          </h1>
        </div>

        {/* Action Controls & Stats */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              // playSound('click', soundEnabled);
              setIsVaultModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-[#6d28d9]/20 hover:bg-[#6d28d9]/30 text-[#c4b5fd] border border-[#7c3aed]/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-md active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#a78bfa]" />
            <span>{vaultMeta.connected ? `NotebookLM (${scannedFiles.length} Docs)` : "Connect School Folder"}</span>
            {vaultMeta.connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          </button>

          <div className="px-2.5 sm:px-3 py-1 rounded-xl bg-white/[0.03] border border-white/10 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Mastery</div>
            <div className="text-xs sm:text-sm font-mono font-bold text-emerald-400">
              {savedDecks.length > 0 
                ? `${Math.round(savedDecks.reduce((a, b) => a + (b.masteryPercent || 0), 0) / savedDecks.length)}%` 
                : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* WEAK-SPOT DRILL BANNER */}
      {weakSpots.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <span>Active Weak Spots Detected</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-200">
                  {weakSpots.length} Questions
                </span>
              </div>
              <p className="text-[11px] text-amber-200/70 truncate">
                Targeted practice based on past quiz errors to maximize exam mastery.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLaunchWeakSpotDrill}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-md active:scale-95 transition-all shrink-0 cursor-pointer flex items-center gap-1.5 justify-center"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Drill Weak Spots</span>
          </button>
        </div>
      )}

      {/* AI Academic Tools (Sleek 3-Pillar Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Flashcards */}
        <div
          onClick={() => handleOpenStudyTool('flashcards')}
          className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-sm group"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center mb-2">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
            Active Recall Flashcards
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            Custom decks & high-yield exam tags.
          </p>
        </div>

        {/* Practice Quiz */}
        <div
          onClick={() => handleOpenStudyTool('quiz')}
          className="p-3.5 sm:p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-sm group"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-2">
            <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
            Practice Exam Simulator
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            MCQ test drills & instant explanations.
          </p>
        </div>

        {/* NotebookLM Study Brain */}
        <div
          onClick={() => {
            // playSound('click', soundEnabled);
            setIsVaultModalOpen(true);
          }}
          className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-purple-950/20 to-indigo-950/20 hover:from-purple-950/35 hover:to-indigo-950/35 border border-purple-500/25 hover:border-purple-500/45 transition-all cursor-pointer shadow-sm group"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#6d28d9]/25 text-[#c4b5fd] border border-[#7c3aed]/40 flex items-center justify-center mb-2">
            <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#a78bfa]" />
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-[#c4b5fd] transition-colors flex items-center gap-1.5">
            <span>Study Brain (NotebookLM)</span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200 uppercase font-bold">AI</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
            Grade weights, exam cheatsheets & AI notes chat for all 6 classes.
          </p>
        </div>
      </div>

      {/* SAVED DECKS & QUIZ LIBRARY */}
      {savedDecks.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Saved Flashcard Decks ({savedDecks.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => handleOpenStudyTool('flashcards')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
            >
              + New Deck
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedDecks.map(d => (
              <GlassCard
                key={d.id}
                onClick={() => handleLaunchSavedDeck(d)}
                className="p-4 cursor-pointer hover:border-blue-500/40 transition-all group relative"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {d.courseCode || 'Course'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-semibold text-emerald-400">
                      {d.masteryPercent || 0}% Mastered
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteDeck(d.id, e)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors"
                      title="Delete Deck"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <h3 className="text-xs font-bold text-white truncate mb-1 group-hover:text-blue-200 transition-colors">
                  {d.title || d.topic}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {d.cards?.length || 0} Cards • Mode: {d.depthMode || 'Standard'}
                </p>

                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden mt-3">
                  <div 
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${d.masteryPercent || 0}%` }}
                  />
                </div>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* Courses Area & Focus Timer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Active Course Deliverables & Selector */}
        <div className="lg:col-span-2 space-y-3">
          {/* 6 UNIVERSITY COURSE TABS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {courses.map((course) => {
              const isActive = activeCourse?.id === course.id || activeCourse?.code === course.code;
              return (
                <button
                  key={course.id || course.code}
                  type="button"
                  onClick={() => {
                    // playSound('click', soundEnabled);
                    setSelectedCourse(course.id || course.code);
                  }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-md border border-purple-400/50 scale-[1.02]'
                      : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/[0.06]'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>{course.code}</span>
                </button>
              );
            })}
          </div>

          <GlassCard hoverEffect={false} className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-mono text-xs font-bold text-white" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}>
                    {activeCourse.code}
                  </span>
                  <h2 className="text-sm font-bold text-white">{activeCourse.name}</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">{activeCourse.credits || '3.0'} Credits • {activeCourse.instructor || ''}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedDeckForStudy({ courseCode: activeCourse.code });
                    setIsFlashcardsOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Layers className="w-3 h-3" />
                  <span>Flashcards</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedCourse(activeCourse.code);
                    setIsQuizOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>Quiz</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsVaultModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>NotebookLM</span>
                </button>
              </div>
            </div>

            {/* Assignments & Deliverables */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Course Deliverables ({activeCourse.code})
              </div>

              {assignments.filter(a => a.course === activeCourse.code).length > 0 ? (
                assignments.filter(a => a.course === activeCourse.code).map((a) => (
                  <div 
                    key={a.id}
                    onClick={() => toggleAssignment(a.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                      a.completed 
                        ? 'bg-white/[0.01] border-white/5 text-slate-500 line-through' 
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button className="shrink-0">
                        {a.completed ? (
                          <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                      <div className="truncate">
                        <div className="text-xs font-semibold text-white">{a.title}</div>
                        {a.weight && <div className="text-[10px] text-slate-400 font-mono">Weight: {a.weight}</div>}
                      </div>
                    </div>

                    {a.dueDate && (
                      <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-black/30 border border-white/5 shrink-0">
                        Due: {a.dueDate}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-4 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-400">
                  No upcoming deliverables logged for {activeCourse.code}.
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        {/* Right: Deep Focus Study Shield */}
        <div className="space-y-4">
          <GlassCard hoverEffect={false} className="p-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#a78bfa]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Deep Focus Shield
                </h3>
              </div>
            </div>

            <div className="text-center py-3 sm:py-4 space-y-2.5 sm:space-y-3">
              <div className="text-2xl sm:text-3xl font-mono font-bold text-white mb-0.5">
                25:00
              </div>
              <div className="text-[11px] sm:text-xs text-slate-400 max-w-xs mx-auto">
                Distraction blocker with YouTube study audio & binaural 40Hz beats.
              </div>

              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  setIsDeepFocusOpen(true);
                }}
                className="mt-1.5 px-5 sm:px-6 py-2 sm:py-2.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Deep Focus</span>
              </button>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ALL STUDY MODALS */}
      {/* 1. NotebookLM Study Hub Modal */}
      <NotebookLMStudyHubModal
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
        onLaunchFlashcards={(course) => {
          setSelectedDeckForStudy({ courseCode: course });
          setIsFlashcardsOpen(true);
        }}
        onLaunchQuiz={(course) => {
          setSelectedCourse(course);
          setIsQuizOpen(true);
        }}
        onVaultUpdated={(meta, files) => {
          setVaultMeta(meta);
          setScannedFiles(files);
        }}
        soundEnabled={soundEnabled}
      />

      {/* 2. Flashcards Deck Modal */}
      <FlashcardDeckModal
        isOpen={isFlashcardsOpen}
        onClose={() => {
          setIsFlashcardsOpen(false);
          refreshStudyLibrary();
        }}
        initialCourse={selectedDeckForStudy?.courseCode || activeCourse?.code || "School"}
        initialTopic={selectedDeckForStudy?.topic || "Exam High-Yield Concepts"}
        initialDeck={selectedDeckForStudy}
        soundEnabled={soundEnabled}
      />

      {/* 3. Practice Quiz Modal */}
      <PracticeQuizModal
        isOpen={isQuizOpen}
        onClose={() => {
          setIsQuizOpen(false);
          refreshStudyLibrary();
        }}
        initialCourse={activeCourse?.code || "School"}
        initialQuestions={selectedQuizQuestions}
        soundEnabled={soundEnabled}
      />

      {/* 4. Vault Semantic Search Modal */}
      <VaultSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        scannedFiles={scannedFiles}
        isConnected={vaultMeta.connected}
        onOpenVaultManager={() => setIsVaultModalOpen(true)}
        soundEnabled={soundEnabled}
      />

      {/* 6. Deep Focus Distraction Blocker Shield */}
      <DeepFocusModal
        isOpen={isDeepFocusOpen}
        onClose={() => setIsDeepFocusOpen(false)}
        courseCode={activeCourse?.code || "Deep Work"}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};
