import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  GraduationCap, 
  BookOpen, 
  Clock, 
  CheckCircle2, 
  Circle, 
  Play, 
  Pause,
  RotateCcw, 
  Layers, 
  HelpCircle, 
  Search, 
  FolderSync, 
  Trash2, 
  Send,
  Volume2,
  VolumeX,
  Maximize2,
  FileText,
  Loader2,
  Sparkles,
  Flame,
  MessageSquare
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GlassCard } from '../common/GlassCard';
import { FlashcardDeckModal } from '../school/FlashcardDeckModal';
import { PracticeQuizModal } from '../school/PracticeQuizModal';
import { DeepFocusModal } from '../school/DeepFocusModal';
import { 
  getVaultMetadata, 
  getVaultHandle, 
  scanVaultDirectory, 
  getCachedVaultFiles,
  connectObsidianVault,
  processUploadedFolderFiles,
  readVaultFileContent
} from '../../utils/obsidianService';
import { searchVaultWithAI } from '../../utils/aiService';
import { 
  getSavedDecks, 
  getSavedQuizzes, 
  getWeakSpots, 
  deleteDeckFromLibrary, 
  clearWeakSpot 
} from '../../utils/studyStorage';
import { playSound } from '../../utils/soundFX';

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
  const [isFlashcardsOpen, setIsFlashcardsOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isDeepFocusOpen, setIsDeepFocusOpen] = useState(false);

  // --- RIGHT COLUMN: POMODORO TIMER STATE ---
  const [focusDuration, setFocusDuration] = useState(25 * 60);
  const [focusTimeLeft, setFocusTimeLeft] = useState(25 * 60);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [focusMode, setFocusMode] = useState('pomodoro');
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [ambientAudio, setAmbientAudio] = useState('none');
  const audioCtxRef = useRef(null);
  const noiseNodeRef = useRef(null);

  // --- SMART COURSE AI CHAT STATE ---
  const [chatQuery, setChatQuery] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const folderInputRef = useRef(null);

  useEffect(() => {
    refreshStudyLibrary();
    loadVaultFiles();
  }, []);

  // Timer Tick
  useEffect(() => {
    let timer = null;
    if (isFocusActive && focusTimeLeft > 0) {
      timer = setInterval(() => {
        setFocusTimeLeft(prev => {
          if (prev <= 1) {
            handleCompleteFocusSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isFocusActive, focusTimeLeft]);

  const handleCompleteFocusSession = () => {
    setIsFocusActive(false);
    stopAmbientAudio();
    playSound('success', soundEnabled);
    setSessionsCompleted(prev => prev + 1);
    try {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
    } catch {}
  };

  const handleToggleFocus = () => {
    playSound('click', soundEnabled);
    if (!isFocusActive && ambientAudio !== 'none') {
      startAmbientAudio(ambientAudio);
    } else if (isFocusActive) {
      stopAmbientAudio();
    }
    setIsFocusActive(prev => !prev);
  };

  const handleResetFocus = () => {
    playSound('switch', soundEnabled);
    setIsFocusActive(false);
    setFocusTimeLeft(focusDuration);
    stopAmbientAudio();
  };

  const handleSelectFocusMode = (mode, secs) => {
    playSound('click', soundEnabled);
    setFocusMode(mode);
    setFocusDuration(secs);
    setFocusTimeLeft(secs);
    setIsFocusActive(false);
    stopAmbientAudio();
  };

  const startAmbientAudio = (type) => {
    stopAmbientAudio();
    if (type === 'none') return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      if (type === 'binaural') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const merger = ctx.createChannelMerger(2);
        const gain = ctx.createGain();

        osc1.frequency.value = 200;
        osc2.frequency.value = 240;
        gain.gain.value = 0.06;

        osc1.connect(merger, 0, 0);
        osc2.connect(merger, 0, 1);
        merger.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        noiseNodeRef.current = { stop: () => { osc1.stop(); osc2.stop(); } };
      } else if (type === 'rain') {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.035;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 750;

        const gain = ctx.createGain();
        gain.gain.value = 0.05;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
        noiseNodeRef.current = noise;
      }
    } catch (e) {
      console.warn("Audio synth notice:", e);
    }
  };

  const stopAmbientAudio = () => {
    if (noiseNodeRef.current) {
      try { noiseNodeRef.current.stop?.(); } catch {}
      noiseNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
  };

  const handleToggleAmbientAudio = (type) => {
    playSound('click', soundEnabled);
    if (ambientAudio === type) {
      setAmbientAudio('none');
      stopAmbientAudio();
    } else {
      setAmbientAudio(type);
      if (isFocusActive) startAmbientAudio(type);
    }
  };

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
      console.warn("Auto-load vault notice:", e);
    }
  };

  const refreshStudyLibrary = () => {
    setSavedDecks(getSavedDecks());
    setSavedQuizzes(getSavedQuizzes());
    setWeakSpots(getWeakSpots());
  };

  const activeCourse = courses.find(c => c.id === selectedCourse || c.code === selectedCourse) || courses[0];

  const activeCourseFiles = useMemo(() => {
    return scannedFiles.filter(f => {
      const c = (f.course || '').toUpperCase();
      const target = (activeCourse?.code || '').toUpperCase();
      return c.includes(target) || target.includes(c) || (f.path || '').toUpperCase().includes(target);
    });
  }, [scannedFiles, activeCourse]);

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

  const handleSendCourseChat = async (e, customPrompt = null) => {
    if (e) e.preventDefault();
    const q = (customPrompt || chatQuery).trim();
    if (!q || isAiSearching) return;

    playSound('click', soundEnabled);
    if (customPrompt) setChatQuery('');
    else setChatQuery('');

    const userMsg = { role: 'user', text: q, course: activeCourse.code, timestamp: new Date() };
    setChatMessages(prev => [...prev, userMsg]);
    setIsAiSearching(true);

    try {
      const enrichedFiles = await Promise.all((activeCourseFiles.length > 0 ? activeCourseFiles : scannedFiles).map(async (file) => {
        let text = file.cachedContent || '';
        if (!text) {
          try {
            text = await readVaultFileContent(file);
          } catch {}
        }
        return { ...file, content: text || '' };
      }));

      const res = await searchVaultWithAI({
        query: `[Course: ${activeCourse.code}] ${q}`,
        filesIndex: enrichedFiles,
        sampleNotes: enrichedFiles
      });

      const aiMsg = {
        role: 'assistant',
        text: res.answer || `Analyzed materials for ${activeCourse.code}.`,
        matchedFiles: res.matchedFiles || [],
        course: activeCourse.code,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, aiMsg]);
      playSound('success', soundEnabled);
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        text: `Unable to access ${activeCourse.code} notes. Ensure your notes folder is linked.`,
        course: activeCourse.code,
        timestamp: new Date()
      }]);
    } finally {
      setIsAiSearching(false);
    }
  };

  const handleSyncSchoolFolder = async () => {
    playSound('click', soundEnabled);
    if (typeof window !== 'undefined' && window.showDirectoryPicker) {
      try {
        const { handle, files, courses: detectedCourses } = await connectObsidianVault();
        setScannedFiles(files);
        setVaultMeta({
          connected: true,
          folderName: handle.name,
          totalNotes: files.length,
          courses: detectedCourses,
          lastScanned: new Date().toISOString()
        });
        playSound('success', soundEnabled);
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    if (folderInputRef.current) folderInputRef.current.click();
  };

  const handleFolderUploadFallback = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    try {
      const { files, courses: detectedCourses } = await processUploadedFolderFiles(fileList);
      setScannedFiles(files);
      setVaultMeta({
        connected: true,
        folderName: files[0]?.path.split('/')[0] || 'school',
        totalNotes: files.length,
        courses: detectedCourses,
        lastScanned: new Date().toISOString()
      });
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Upload fallback notice:", err);
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const formatMinutesSeconds = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-24">
      {/* Hidden Folder Upload Input */}
      <input 
        ref={folderInputRef}
        type="file"
        webkitdirectory="true"
        directory="true"
        multiple
        onChange={handleFolderUploadFallback}
        className="hidden"
      />

      {/* TOP HEADER */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.06]">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Academic Command • {schoolData.term || 'Fall 2026'}</span>
          </div>
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
            School & Courses
          </h1>
        </div>

        {/* Sync & Stats Pill */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncSchoolFolder}
            className="px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <FolderSync className="w-3.5 h-3.5 text-slate-400" />
            <span>{vaultMeta.connected ? `${scannedFiles.length} Notes` : "Link Notes"}</span>
            {vaultMeta.connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          </button>
        </div>
      </div>

      {/* WEAK-SPOT DRILL BANNER (Minimal) */}
      {weakSpots.length > 0 && (
        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Flame className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="text-xs text-slate-300 truncate">
              <span className="text-white font-semibold">{weakSpots.length} Weak Spots</span> flagged from recent quizzes.
            </div>
          </div>

          <button
            type="button"
            onClick={handleLaunchWeakSpotDrill}
            className="px-3 py-1 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-white text-xs font-semibold border border-white/10 transition-all shrink-0 cursor-pointer"
          >
            Review Missed ({weakSpots.length})
          </button>
        </div>
      )}

      {/* SAVED DECKS (Minimal Carousel) */}
      {savedDecks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <span>Saved Study Decks ({savedDecks.length})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {savedDecks.map(d => (
              <GlassCard
                key={d.id}
                onClick={() => handleLaunchSavedDeck(d)}
                className="p-3 cursor-pointer hover:border-white/20 transition-all group relative"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-white/[0.04] text-slate-300 border border-white/10">
                    {d.courseCode || 'Course'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-slate-400">{d.cards?.length || 0} cards</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteDeck(d.id, e)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <h3 className="text-xs font-bold text-white truncate group-hover:text-slate-200">
                  {d.title || d.topic}
                </h3>
              </GlassCard>
            ))}
          </div>
        </div>
      )}

      {/* MAIN TWO-COLUMN DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* LEFT COLUMN: Course Selector, Actions, Deliverables & AI Chat */}
        <div className="lg:col-span-2 space-y-4">
          {/* COURSE SWITCHER TABS (Clean Minimalist Design) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {courses.map((course) => {
              const isActive = activeCourse?.id === course.id || activeCourse?.code === course.code;
              return (
                <button
                  key={course.id || course.code}
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedCourse(course.id || course.code);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-white/[0.1] text-white border border-white/20 shadow-sm'
                      : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/[0.04]'
                  }`}
                  style={isActive ? { borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' } : {}}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>{course.code}</span>
                </button>
              );
            })}
          </div>

          {/* ACTIVE COURSE CARD */}
          <GlassCard hoverEffect={false} className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-white" style={{ color: 'var(--accent-primary)' }}>
                    {activeCourse.code}
                  </span>
                  <h2 className="text-sm font-bold text-white">{activeCourse.name}</h2>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">{activeCourse.instructor || 'Faculty'} • {activeCourse.credits || '3.0'} Credits</p>
              </div>

              {/* Instant Study Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedDeckForStudy({ courseCode: activeCourse.code });
                    setIsFlashcardsOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Flashcards</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedCourse(activeCourse.code);
                    setIsQuizOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Quiz</span>
                </button>
              </div>
            </div>

            {/* Deliverables Checklist */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-0.5">
                Course Deliverables
              </div>

              {assignments.filter(a => a.course === activeCourse.code).length > 0 ? (
                assignments.filter(a => a.course === activeCourse.code).map((a) => (
                  <div 
                    key={a.id}
                    onClick={() => toggleAssignment(a.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                      a.completed 
                        ? 'bg-white/[0.01] border-white/5 text-slate-500 line-through' 
                        : 'bg-white/[0.02] border-white/5 hover:border-white/15 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button className="shrink-0">
                        {a.completed ? (
                          <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                      <span className="text-xs font-medium text-white truncate">{a.title}</span>
                    </div>

                    {a.dueDate && (
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {a.dueDate}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-500">
                  No deliverables logged for {activeCourse.code}.
                </div>
              )}
            </div>
          </GlassCard>

          {/* SMART COURSE AI STUDY CHAT (Clean & Streamlined) */}
          <GlassCard hoverEffect={false} className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-primary)' }} />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Study Chat • {activeCourse.code}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Notes & Syllabus Grounded</span>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                `Grade breakdown for ${activeCourse.code}`,
                `High-yield exam topics`,
                `Key formulas & definitions`,
                `Missed lecture policy`
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => handleSendCourseChat(e, chip)}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white border border-white/5 text-[11px] font-medium transition-all cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Message Stream */}
            <div className="space-y-2.5 min-h-[140px] max-h-[260px] overflow-y-auto pr-1">
              {chatMessages.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Ask anything about {activeCourse.code} outlines, concepts, formulas, or grading policies.
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl text-xs space-y-1 ${
                      msg.role === 'user'
                        ? 'bg-white/[0.08] text-white ml-auto max-w-[85%] border border-white/10'
                        : 'bg-white/[0.02] text-slate-200 mr-auto max-w-[95%] border border-white/5'
                    }`}
                  >
                    <div className="text-[10px] font-mono text-slate-400">
                      {msg.role === 'user' ? 'You' : `AI (${msg.course || activeCourse.code})`}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-slate-200">
                      {msg.text}
                    </div>

                    {msg.matchedFiles && msg.matchedFiles.length > 0 && (
                      <div className="pt-1.5 border-t border-white/5 text-[10px] text-slate-400 flex items-center gap-1 truncate">
                        <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{msg.matchedFiles[0]?.name}</span>
                      </div>
                    )}
                  </div>
                ))
              )}

              {isAiSearching && (
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center gap-2 text-xs text-slate-300">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                  <span>Analyzing course materials...</span>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendCourseChat} className="flex gap-2">
              <input
                type="text"
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                placeholder={`Ask ${activeCourse.code} notes...`}
                className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none font-sans"
                style={{ borderColor: chatQuery.trim() ? 'var(--accent-primary)' : undefined }}
              />
              <button
                type="submit"
                disabled={isAiSearching || !chatQuery.trim()}
                className="px-3.5 py-2 rounded-xl text-white text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-30 shrink-0"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </button>
            </form>
          </GlassCard>
        </div>

        {/* RIGHT COLUMN: INTERACTIVE POMODORO TIMER */}
        <div className="space-y-4">
          <GlassCard hoverEffect={false} className="p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-300" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Focus Timer
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {sessionsCompleted} completed
              </span>
            </div>

            {/* Focus Modes */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-black/40 rounded-xl border border-white/5 text-xs">
              <button
                type="button"
                onClick={() => handleSelectFocusMode('pomodoro', 25 * 60)}
                className={`py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  focusMode === 'pomodoro'
                    ? 'bg-white/[0.1] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                25m
              </button>
              <button
                type="button"
                onClick={() => handleSelectFocusMode('deep', 45 * 60)}
                className={`py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  focusMode === 'deep'
                    ? 'bg-white/[0.1] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                45m
              </button>
              <button
                type="button"
                onClick={() => handleSelectFocusMode('break', 5 * 60)}
                className={`py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  focusMode === 'break'
                    ? 'bg-white/[0.1] text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                5m
              </button>
            </div>

            {/* Big Countdown */}
            <div className="text-center py-2 space-y-1">
              <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-wider">
                {formatMinutesSeconds(focusTimeLeft)}
              </div>
              <div className="text-[11px] text-slate-500">
                {isFocusActive ? activeCourse.code : "Ready"}
              </div>

              {/* Progress Line */}
              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                <div 
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ 
                    width: `${Math.round(((focusDuration - focusTimeLeft) / focusDuration) * 100)}%`,
                    backgroundColor: 'var(--accent-primary)'
                  }}
                />
              </div>
            </div>

            {/* Play / Reset Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleFocus}
                className="flex-1 py-2 rounded-xl font-semibold text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer text-white"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {isFocusActive ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Start</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetFocus}
                className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/10 transition-all cursor-pointer"
                title="Reset"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Ambient Sound */}
            <div className="pt-2 border-t border-white/10 space-y-1.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Background Sound
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => handleToggleAmbientAudio('binaural')}
                  className={`p-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    ambientAudio === 'binaural'
                      ? 'bg-white/[0.1] border-white/20 text-white'
                      : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Volume2 className="w-3 h-3" />
                  <span>40Hz Beat</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleAmbientAudio('rain')}
                  className={`p-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    ambientAudio === 'rain'
                      ? 'bg-white/[0.1] border-white/20 text-white'
                      : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Rain Noise</span>
                </button>
              </div>
            </div>

            {/* Fullscreen Shield Trigger */}
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setIsDeepFocusOpen(true);
              }}
              className="w-full py-1.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-slate-400 hover:text-slate-200 text-[11px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer"
            >
              <Maximize2 className="w-3 h-3 text-slate-400" />
              <span>Fullscreen Distraction Blocker</span>
            </button>
          </GlassCard>
        </div>
      </div>

      {/* ACTIVE STUDY MODALS */}
      {/* 1. Flashcards Modal */}
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

      {/* 2. Practice Quiz Modal */}
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

      {/* 3. Deep Focus Fullscreen Modal */}
      <DeepFocusModal
        isOpen={isDeepFocusOpen}
        onClose={() => setIsDeepFocusOpen(false)}
        courseCode={activeCourse?.code || "Deep Work"}
        soundEnabled={soundEnabled}
        onSessionCompleted={() => {
          setSessionsCompleted(prev => prev + 1);
        }}
      />
    </div>
  );
};
