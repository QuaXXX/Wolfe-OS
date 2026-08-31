import React, { useState } from 'react';
import { 
  GraduationCap, 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  Circle, 
  Play, 
  ChevronRight,
  Sparkles,
  Layers,
  HelpCircle,
  Mail,
  Search,
  FolderSync,
  Shield,
  Lock
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

export const SchoolView = ({ 
  schoolData, 
  onAddItem, 
  soundEnabled = true 
}) => {
  const [assignments, setAssignments] = useState(schoolData.assignments || []);
  const [selectedCourse, setSelectedCourse] = useState(schoolData.courses?.[0]?.id || null);
  const [vaultMeta, setVaultMeta] = useState(getVaultMetadata());
  const [scannedFiles, setScannedFiles] = useState([]);

  // Modals state
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isFlashcardsOpen, setIsFlashcardsOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isDeepFocusOpen, setIsDeepFocusOpen] = useState(false);

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
    if (tool === 'flashcards') setIsFlashcardsOpen(true);
    else if (tool === 'quiz') setIsQuizOpen(true);
    else if (tool === 'email') setIsEmailModalOpen(true);
    else if (tool === 'search') setIsSearchModalOpen(true);
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
            <div className="text-[9px] uppercase font-semibold text-slate-400">GPA</div>
            <div className="text-sm font-mono font-bold text-white">{schoolData.gpa || '—'}</div>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-center">
            <div className="text-[9px] uppercase font-semibold text-slate-400">Study Time</div>
            <div className="text-sm font-mono font-bold text-white">{schoolData.studyHoursThisWeek || 0}h</div>
          </div>
        </div>
      </div>

      {/* AI Academic Tools (Sleek Minimal Grid) */}
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
              Anki
            </span>
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-blue-300 transition-colors">
            Active Recall Flashcards
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            3D flip-cards with spaced repetition rating.
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
              Exam
            </span>
          </div>
          <h3 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
            Practice Exam Simulator
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            AI-generated test questions with instant scoring.
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
            Syllabus-compliant email templates with 1-click mailto:.
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
            Natural language search across all notes & outlines.
          </p>
        </div>
      </div>

      {/* Courses Area */}
      {courses.length > 0 ? (
        <div className="space-y-4">
          <div className="space-y-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Enrolled Courses ({courses.length})
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {courses.map((c) => {
                const isSelected = c.id === selectedCourse;
                return (
                  <GlassCard
                    key={c.id}
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setSelectedCourse(c.id);
                    }}
                    className={`p-4 transition-all cursor-pointer ${
                      isSelected 
                        ? 'ring-1 bg-[#14182a]' 
                        : 'opacity-85 hover:opacity-100'
                    }`}
                    style={isSelected ? { borderColor: 'var(--accent-primary)' } : {}}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="px-1.5 py-0.2 rounded bg-white/5 font-mono text-[11px] font-semibold" style={{ color: 'var(--accent-primary)' }}>
                        {c.code}
                      </span>
                      <span className="text-xs font-mono font-semibold text-slate-200">
                        {c.grade || '—'}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold text-white truncate mb-0.5">
                      {c.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 mb-2 truncate">{c.instructor || 'Instructor'}</p>

                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full"
                        style={{ width: `${c.progress || 0}%`, backgroundColor: 'var(--accent-primary)' }}
                      />
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>

          {/* Active Course Details & Focus Timer */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left: Active Course Deliverables */}
            <div className="lg:col-span-2 space-y-4">
              {activeCourse && (
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
                        onClick={() => handleOpenStudyTool('email')}
                        className="px-2.5 py-1 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Mail className="w-3 h-3" />
                        <span>Email Prof</span>
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
                    Full distraction blocker shield with YouTube/socials lock & binaural 40Hz focus audio.
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
        </div>
      ) : (
        /* Minimalist Blank State Card when no courses exist */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            {!vaultMeta.connected ? (
              <GlassCard hoverEffect={false} className="p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#6d28d9]/15 border border-[#7c3aed]/30 flex items-center justify-center mx-auto text-[#a78bfa]">
                  <FolderSync className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Connect Your Obsidian Vault</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    Link your Obsidian school folder to sync notes, course outlines, and active recall study decks directly into Wolfe OS.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsVaultModalOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-[#6d28d9] hover:bg-[#5b21b6] text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 mx-auto cursor-pointer"
                  >
                    <FolderSync className="w-3.5 h-3.5" />
                    <span>Connect Obsidian Vault</span>
                  </button>
                </div>
              </GlassCard>
            ) : (
              <GlassCard hoverEffect={false} className="p-8 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">Obsidian Vault Connected</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                    {vaultMeta.totalNotes || 0} notes indexed from "{vaultMeta.folderName}". Use the AI tools above to generate active recall flashcards, practice quizzes, or search your notes.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsFlashcardsOpen(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md cursor-pointer"
                  >
                    Study Flashcards
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQuizOpen(true)}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md cursor-pointer"
                  >
                    Practice Quiz
                  </button>
                </div>
              </GlassCard>
            )}
          </div>

          {/* Right: Deep Focus Timer */}
          <div>
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
                  Distraction blocker shield with YouTube/socials lock & binaural 40Hz audio.
                </div>

                <button
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setIsDeepFocusOpen(true);
                  }}
                  className="mt-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 mx-auto cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Launch Deep Focus Shield</span>
                </button>
              </div>
            </GlassCard>
          </div>
        </div>
      )}

      {/* ALL MODALS */}
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
        onClose={() => setIsFlashcardsOpen(false)}
        initialCourse={activeCourse?.code || "School"}
        soundEnabled={soundEnabled}
      />

      {/* 3. Practice Quiz Modal */}
      <PracticeQuizModal
        isOpen={isQuizOpen}
        onClose={() => setIsQuizOpen(false)}
        initialCourse={activeCourse?.code || "School"}
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
