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
  ListTodo
} from 'lucide-react';
import { GlassCard } from '../common/GlassCard';
import { playSound } from '../../utils/soundFX';
import { ObsidianVaultManagerModal } from '../school/ObsidianVaultManagerModal';
import { FlashcardDeckModal } from '../school/FlashcardDeckModal';
import { PracticeQuizModal } from '../school/PracticeQuizModal';
import { ProfEmailDraftModal } from '../school/ProfEmailDraftModal';
import { VaultSearchModal } from '../school/VaultSearchModal';
import { DeepFocusModal } from '../school/DeepFocusModal';
import { getVaultMetadata } from '../../utils/obsidianService';
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
  const [assignments, setAssignments] = useState(schoolData.assignments || []);
  const [selectedCourse, setSelectedCourse] = useState(schoolData.courses?.[0]?.id || null);
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
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isDeepFocusOpen, setIsDeepFocusOpen] = useState(false);

  useEffect(() => {
    refreshStudyLibrary();
  }, []);

  const refreshStudyLibrary = () => {
    setSavedDecks(getSavedDecks());
    setSavedQuizzes(getSavedQuizzes());
    setWeakSpots(getWeakSpots());
  };

  const courses = schoolData.courses || [];
  const activeCourse = courses.find(c => c.id === selectedCourse) || courses[0];

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
    else if (tool === 'email') setIsEmailModalOpen(true);
    else if (tool === 'search') setIsSearchModalOpen(true);
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
    <div className="space-y-6 max-w-6xl mx-auto pb-24 select-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <GraduationCap className="w-4 h-4" />
            <span>Academic Command • {schoolData.term || 'Fall 2026'}</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
            School & Academics
          </h1>
        </div>

        {/* Action Controls & Stats */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Obsidian Vault Status Pill */}
          {!vaultMeta.connected ? (
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setIsVaultModalOpen(true);
              }}
              className="px-3.5 py-2 rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white border border-[#7c3aed]/40 text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95"
            >
              <FolderSync className="w-3.5 h-3.5" />
              <span>Connect Obsidian</span>
            </button>
          ) : (
            <div className="px-3.5 py-2 rounded-xl bg-[#6d28d9]/15 border border-[#7c3aed]/30 text-[#c4b5fd] text-xs font-semibold flex items-center gap-2">
              <FolderSync className="w-3.5 h-3.5 text-[#a78bfa]" />
              <span>Obsidian: {vaultMeta.totalNotes || 0} Notes</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          )}

          <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Mastery</div>
            <div className="text-sm font-mono font-bold text-emerald-400">
              {savedDecks.length > 0 
                ? `${Math.round(savedDecks.reduce((a, b) => a + (b.masteryPercent || 0), 0) / savedDecks.length)}%` 
                : '—'}
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Decks / Quizzes</div>
            <div className="text-sm font-mono font-bold text-white">{savedDecks.length + savedQuizzes.length}</div>
          </div>
        </div>
      </div>

      {/* WEAK-SPOT ALERT BANNER (If missed questions exist) */}
      {weakSpots.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>Weak-Spot Bank: {weakSpots.length} Concept{weakSpots.length > 1 ? 's' : ''} to Strengthen</span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">High Exam Priority</span>
              </div>
              <div className="text-[11px] text-amber-200/80 mt-0.5">
                Missed from recent quizzes. Practice targeted drill to achieve 100% exam readiness.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLaunchWeakSpotDrill}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-md active:scale-95 transition-all shrink-0 cursor-pointer flex items-center gap-1.5 justify-center"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Drill Weak Spots ({weakSpots.length})</span>
          </button>
        </div>
      )}

      {/* AI Academic Tools (Sleek 4-Pillar Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Flashcards */}
        <div
          onClick={() => handleOpenStudyTool('flashcards')}
          className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
              Anki SRS
            </span>
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
            Active Recall Flashcards
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Customizable count, chapters & high-yield tags.
          </p>
        </div>

        {/* Practice Quiz */}
        <div
          onClick={() => handleOpenStudyTool('quiz')}
          className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
              Quiz
            </span>
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
            Practice Exam Simulator
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Multi-choice test questions & instant explanations.
          </p>
        </div>

        {/* Prof Email Drafter */}
        <div
          onClick={() => handleOpenStudyTool('email')}
          className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
              Email
            </span>
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-rose-300 transition-colors">
            Prof-Ready Email Drafter
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Syllabus-compliant email drafts with 1-click send.
          </p>
        </div>

        {/* Ask My Vault */}
        <div
          onClick={() => handleOpenStudyTool('search')}
          className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-[#6d28d9]/20 text-[#a78bfa] border border-[#7c3aed]/30 flex items-center justify-center">
              <Search className="w-4 h-4" />
            </div>
            <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-white/5 text-slate-400 border border-white/10">
              Search
            </span>
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-[#c4b5fd] transition-colors">
            Ask My Obsidian Vault
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            Semantic query across all notes & summaries.
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
              className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
            >
              + Create New Deck
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
        {/* Left: Active Course Deliverables or Obsidian Link */}
        <div className="lg:col-span-2 space-y-4">
          {courses.length > 0 && activeCourse ? (
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
                    onClick={() => handleOpenStudyTool('flashcards')}
                    className="px-2.5 py-1 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                    <span>Flashcards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenStudyTool('quiz')}
                    className="px-2.5 py-1 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <HelpCircle className="w-3 h-3" />
                    <span>Quiz</span>
                  </button>
                </div>
              </div>

              {/* Assignments */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Course Deliverables
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
          ) : (
            <GlassCard hoverEffect={false} className="p-6 text-center space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-[#6d28d9]/15 border border-[#7c3aed]/30 flex items-center justify-center mx-auto text-[#a78bfa]">
                <FolderSync className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white">Connect Obsidian or Import Syllabus</h3>
                <p className="text-[11px] text-slate-400 max-w-sm mx-auto mt-1">
                  Upload your syllabus in Calendar or link your Obsidian Vault to populate courses automatically.
                </p>
              </div>
            </GlassCard>
          )}
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
              <span className="text-[10px] font-mono text-[#a78bfa]">Anti-Distraction</span>
            </div>

            <div className="text-center py-4 space-y-3">
              <div className="text-3xl font-mono font-bold text-white mb-1">
                25:00
              </div>
              <div className="text-xs text-slate-400 max-w-xs mx-auto">
                Distraction blocker shield with YouTube study music & binaural 40Hz audio.
              </div>

              <button
                onClick={() => {
                  playSound('click', soundEnabled);
                  setIsDeepFocusOpen(true);
                }}
                className="mt-2 px-6 py-2.5 rounded-xl text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Launch Deep Focus Shield</span>
              </button>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* ALL STUDY MODALS */}
      {/* 1. Obsidian Vault Manager Modal */}
      <ObsidianVaultManagerModal
        isOpen={isVaultModalOpen}
        onClose={() => setIsVaultModalOpen(false)}
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

      {/* 4. Prof Email Draft Modal */}
      <ProfEmailDraftModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        courseCode={activeCourse?.code || "Course"}
        instructorName={activeCourse?.instructor || "Professor"}
        instructorEmail={activeCourse?.instructorEmail || "instructor@university.edu"}
        soundEnabled={soundEnabled}
      />

      {/* 5. Vault Semantic Search Modal */}
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
