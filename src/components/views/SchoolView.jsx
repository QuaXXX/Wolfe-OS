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
  Shield, 
  Flame, 
  Trash2, 
  Sparkles,
  Send,
  Volume2,
  VolumeX,
  Maximize2,
  FileText,
  Loader2,
  Zap,
  Percent,
  Calendar,
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

  // --- RIGHT COLUMN: INTERACTIVE POMODORO TIMER STATE ---
  const [focusDuration, setFocusDuration] = useState(25 * 60);
  const [focusTimeLeft, setFocusTimeLeft] = useState(25 * 60);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [focusMode, setFocusMode] = useState('pomodoro'); // 'pomodoro' | 'deep' | 'break'
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [ambientAudio, setAmbientAudio] = useState('none'); // 'none' | 'binaural' | 'rain'
  const audioCtxRef = useRef(null);
  const noiseNodeRef = useRef(null);

  // --- SMART COURSE AI STUDY CHAT STATE ---
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
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
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

  // Web Audio Synth for Ambient Sound
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
        osc2.frequency.value = 240; // 40Hz Gamma frequency beat
        gain.gain.value = 0.07;

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
          data[i] = (Math.random() * 2 - 1) * 0.04;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        const gain = ctx.createGain();
        gain.gain.value = 0.06;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
        noiseNodeRef.current = noise;
      }
    } catch (e) {
      console.warn("Ambient sound error:", e);
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
      console.warn("Auto-load vault files notice:", e);
    }
  };

  const refreshStudyLibrary = () => {
    setSavedDecks(getSavedDecks());
    setSavedQuizzes(getSavedQuizzes());
    setWeakSpots(getWeakSpots());
  };

  const activeCourse = courses.find(c => c.id === selectedCourse || c.code === selectedCourse) || courses[0];

  // Current files for active course
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

  // --- SMART COURSE AI CHAT HANDLER ---
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
      // Ensure all course files are read
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
        text: res.answer || `Analyzed course outline for ${activeCourse.code}.`,
        matchedFiles: res.matchedFiles || [],
        course: activeCourse.code,
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, aiMsg]);
      playSound('success', soundEnabled);
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        text: `I had trouble connecting to your ${activeCourse.code} notes. Please ensure your folder is synced.`,
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
    <div className="space-y-6 max-w-6xl mx-auto pb-24">
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
          {/* School Folder Sync Status Pill */}
          <button
            type="button"
            onClick={handleSyncSchoolFolder}
            className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Sync School Folder"
          >
            <FolderSync className="w-3.5 h-3.5 text-purple-400" />
            <span>{vaultMeta.connected ? `${scannedFiles.length} Notes Synced` : "Sync School Folder"}</span>
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

      {/* AI ACADEMIC TOOLS (2-PILLAR FLASHCARDS & QUIZZES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Flashcards */}
        <div
          onClick={() => {
            playSound('click', soundEnabled);
            setSelectedDeckForStudy({ courseCode: activeCourse.code });
            setIsFlashcardsOpen(true);
          }}
          className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-blue-500/40 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-blue-300 font-bold px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20">
              Active Recall
            </span>
          </div>
          <h3 className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
            Flashcards Studio
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Generate custom decks from your syllabus & drill with spaced repetition.
          </p>
        </div>

        {/* Practice Quiz */}
        <div
          onClick={() => {
            playSound('click', soundEnabled);
            setSelectedCourse(activeCourse.code);
            setIsQuizOpen(true);
          }}
          className="p-4 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer shadow-sm group"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <HelpCircle className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-emerald-300 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              Exam Simulator
            </span>
          </div>
          <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
            Practice Exam Simulator
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Timed MCQ drills, instant grading & step-by-step explanations.
          </p>
        </div>
      </div>

      {/* SAVED DECKS LIBRARY */}
      {savedDecks.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-blue-400" />
              <span>Saved Flashcard Decks ({savedDecks.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setSelectedDeckForStudy({ courseCode: activeCourse.code });
                setIsFlashcardsOpen(true);
              }}
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
                      className="text-slate-500 hover:text-rose-400 p-0.5 transition-colors cursor-pointer"
                      title="Delete Deck"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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

      {/* MAIN TWO-COLUMN VIEWPORT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* LEFT COLUMN: 6 Course Tabs, Deliverables, and Smart AI Study Chat */}
        <div className="lg:col-span-2 space-y-4">
          {/* 6 UNIVERSITY COURSE TABS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {courses.map((course) => {
              const isActive = activeCourse?.id === course.id || activeCourse?.code === course.code;
              const hasOutline = scannedFiles.some(f => (f.course || '').toUpperCase().includes(course.code.toUpperCase()) || (f.path || '').toUpperCase().includes(course.code.toUpperCase()));
              return (
                <button
                  key={course.id || course.code}
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedCourse(course.id || course.code);
                  }}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-2 ${
                    isActive
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 border border-purple-400/50 scale-[1.02]'
                      : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/[0.06]'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>{course.code}</span>
                  {hasOutline && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Outline indexed" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ACTIVE COURSE OVERVIEW CARD */}
          <GlassCard hoverEffect={false} className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-mono text-xs font-bold text-white" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}>
                    {activeCourse.code}
                  </span>
                  <h2 className="text-sm font-bold text-white">{activeCourse.name}</h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">{activeCourse.credits || '3.0'} Credits • {activeCourse.instructor || 'Department Faculty'}</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedDeckForStudy({ courseCode: activeCourse.code });
                    setIsFlashcardsOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>+ Flashcards</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedCourse(activeCourse.code);
                    setIsQuizOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>+ Quiz</span>
                </button>
              </div>
            </div>

            {/* Course Deliverables List */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Course Deliverables ({activeCourse.code})</span>
                <span className="text-[10px] font-mono text-slate-500 font-normal">Check off when complete</span>
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
                <div className="p-3.5 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-400">
                  No upcoming deliverables logged for {activeCourse.code}.
                </div>
              )}
            </div>
          </GlassCard>

          {/* SMART COURSE AI STUDY CHAT */}
          <GlassCard hoverEffect={false} className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <span>AI Course Study Assistant</span>
                    <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-purple-500/20 text-purple-300 font-bold">
                      {activeCourse.code}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Reads through your course outlines & notes to answer questions with deep intelligence.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Suggested Prompt Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                `Summarize grade weights for ${activeCourse.code}`,
                `What are the highest-yield exam topics in ${activeCourse.code}?`,
                `Explain key formulas and definitions`,
                `What is the policy on missed midterms or labs?`
              ].map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => handleSendCourseChat(e, chip)}
                  className="px-2.5 py-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 text-[11px] font-medium transition-all cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Message Stream */}
            <div className="space-y-3 min-h-[160px] max-h-[280px] overflow-y-auto pr-1">
              {chatMessages.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400 space-y-1">
                  <MessageSquare className="w-5 h-5 text-purple-400/50 mx-auto mb-1" />
                  <div>Ask any question about {activeCourse.code} notes, formulas, policies, or topics.</div>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-2xl text-xs space-y-1.5 ${
                      msg.role === 'user'
                        ? 'bg-purple-600/20 border border-purple-500/30 text-white ml-auto max-w-[85%]'
                        : 'bg-white/[0.03] border border-white/10 text-slate-100 mr-auto max-w-[95%]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>{msg.role === 'user' ? 'Zach Wolfe' : `AI Assistant (${msg.course || activeCourse.code})`}</span>
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed font-sans">
                      {msg.text}
                    </div>

                    {msg.matchedFiles && msg.matchedFiles.length > 0 && (
                      <div className="pt-2 border-t border-white/5 space-y-0.5">
                        <div className="text-[9px] uppercase font-mono text-purple-300 font-bold">Source Documents:</div>
                        {msg.matchedFiles.map((f, i) => (
                          <div key={i} className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                            <FileText className="w-3 h-3 text-purple-400 shrink-0" />
                            <span>{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {isAiSearching && (
                <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2 text-xs text-purple-300">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Analyzing {activeCourse.code} course notes with Gemini...</span>
                </div>
              )}
            </div>

            {/* Chat Input Form */}
            <form onSubmit={handleSendCourseChat} className="flex gap-2">
              <input
                type="text"
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                placeholder={`Ask anything about ${activeCourse.code} (e.g. explain formulas, exam breakdown)...`}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 font-sans"
              />
              <button
                type="submit"
                disabled={isAiSearching || !chatQuery.trim()}
                className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </button>
            </form>
          </GlassCard>
        </div>

        {/* RIGHT COLUMN: FULL-FEATURED INTERACTIVE POMODORO TIMER */}
        <div className="space-y-4">
          <GlassCard hoverEffect={false} className="p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Deep Focus Pomodoro
                </h3>
              </div>
              <div className="text-[11px] font-mono text-purple-300 font-bold px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-500/20">
                {sessionsCompleted} Session{sessionsCompleted !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Timer Preset Switcher */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/40 rounded-xl border border-white/5 text-xs">
              <button
                type="button"
                onClick={() => handleSelectFocusMode('pomodoro', 25 * 60)}
                className={`py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  focusMode === 'pomodoro'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                25m Focus
              </button>
              <button
                type="button"
                onClick={() => handleSelectFocusMode('deep', 45 * 60)}
                className={`py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  focusMode === 'deep'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                45m Deep
              </button>
              <button
                type="button"
                onClick={() => handleSelectFocusMode('break', 5 * 60)}
                className={`py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
                  focusMode === 'break'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                5m Break
              </button>
            </div>

            {/* Big Countdown Timer Display */}
            <div className="text-center py-4 space-y-2">
              <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-wider">
                {formatMinutesSeconds(focusTimeLeft)}
              </div>
              <div className="text-xs text-slate-400 font-sans">
                {isFocusActive ? `Active session for ${activeCourse.code}` : "Ready to lock in"}
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-3">
                <div 
                  className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                  style={{ width: `${Math.round(((focusDuration - focusTimeLeft) / focusDuration) * 100)}%` }}
                />
              </div>
            </div>

            {/* Timer Play / Pause / Reset Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleFocus}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer ${
                  isFocusActive
                    ? 'bg-amber-500 hover:bg-amber-400 text-black'
                    : 'bg-purple-600 hover:bg-purple-500 text-white'
                }`}
              >
                {isFocusActive ? (
                  <>
                    <Pause className="w-4 h-4 fill-current" />
                    <span>Pause Session</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Timer</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetFocus}
                className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/10 transition-all cursor-pointer"
                title="Reset Timer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Ambient Sound Synthesizer */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Ambient Study Sound</span>
                <span className="text-[10px] font-mono text-purple-300">
                  {ambientAudio !== 'none' ? `${ambientAudio.toUpperCase()} ON` : 'OFF'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => handleToggleAmbientAudio('binaural')}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    ambientAudio === 'binaural'
                      ? 'bg-purple-600/30 border-purple-500/50 text-white'
                      : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                  <span>40Hz Binaural</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleAmbientAudio('rain')}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    ambientAudio === 'rain'
                      ? 'bg-purple-600/30 border-purple-500/50 text-white'
                      : 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Rain Noise</span>
                </button>
              </div>
            </div>

            {/* Fullscreen Shield Mode Launcher */}
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setIsDeepFocusOpen(true);
              }}
              className="w-full py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Fullscreen Distraction Shield</span>
            </button>
          </GlassCard>
        </div>
      </div>

      {/* ALL ACTIVE STUDY MODALS */}
      {/* 1. Flashcards Deck Modal */}
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

      {/* 3. Deep Focus Fullscreen Shield Modal */}
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
