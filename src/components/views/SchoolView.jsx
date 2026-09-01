import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  GraduationCap, 
  Clock, 
  Play, 
  Pause,
  RotateCcw, 
  Layers, 
  HelpCircle, 
  FolderSync, 
  Trash2, 
  Send, 
  Volume2, 
  Maximize2, 
  FileText, 
  Loader2, 
  Sparkles
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
import { streamSearchVaultWithAI } from '../../utils/aiService';
import { 
  getSavedDecks, 
  getSavedQuizzes,
  getWeakSpots, 
  deleteDeckFromLibrary,
  deleteQuizFromLibrary
} from '../../utils/studyStorage';
import { playSound } from '../../utils/soundFX';

export const SchoolView = ({ 
  schoolData, 
  onAddItem, 
  soundEnabled = true 
}) => {
  // 5 Active Courses
  const defaultUniversityCourses = [
    { id: 'fnce317', code: 'FNCE 317', name: 'Financial Management', instructor: 'Holloway Perrot' },
    { id: 'btma317', code: 'BTMA 317', name: 'Information Technology', instructor: 'Michael Saar' },
    { id: 'opma317', code: 'OPMA 317', name: 'Operations Management', instructor: 'Alireza Sabouri' },
    { id: 'mktg317', code: 'MKTG 317', name: 'Marketing Management', instructor: 'Jack Kulchitsky' },
    { id: 'psyc203', code: 'PSYC 203', name: 'Psychology Principles', instructor: 'Rona Sari Kertesz' }
  ];

  const courses = (schoolData.courses && schoolData.courses.length > 0)
    ? schoolData.courses.filter(c => !c.code?.includes('391') && !c.id?.includes('391'))
    : defaultUniversityCourses;

  const [selectedCourse, setSelectedCourse] = useState(courses[0]?.id || 'fnce317');
  const [vaultMeta, setVaultMeta] = useState(getVaultMetadata());
  const [scannedFiles, setScannedFiles] = useState([]);

  // Study Storage data
  const [savedDecks, setSavedDecks] = useState([]);
  const [savedQuizzes, setSavedQuizzes] = useState([]);
  const [weakSpots, setWeakSpots] = useState([]);
  const [studyTab, setStudyTab] = useState('quizzes'); // 'quizzes' | 'decks'
  const [selectedDeckForStudy, setSelectedDeckForStudy] = useState(null);
  const [selectedQuizForStudy, setSelectedQuizForStudy] = useState(null);
  const [selectedQuizQuestions, setSelectedQuizQuestions] = useState(null);

  // Modals state
  const [isFlashcardsOpen, setIsFlashcardsOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isDeepFocusOpen, setIsDeepFocusOpen] = useState(false);

  // --- POMODORO TIMER STATE ---
  const [focusDuration, setFocusDuration] = useState(25 * 60);
  const [focusTimeLeft, setFocusTimeLeft] = useState(25 * 60);
  const [isFocusActive, setIsFocusActive] = useState(false);
  const [focusMode, setFocusMode] = useState('pomodoro');
  const [ambientAudio, setAmbientAudio] = useState('none');
  const audioCtxRef = useRef(null);
  const noiseNodeRef = useRef(null);

  // --- SMART COURSE AI CHAT STATE ---
  const [chatQuery, setChatQuery] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const folderInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    refreshStudyLibrary();
    loadVaultFiles();
  }, []);

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

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isAiSearching]);

  const handleCompleteFocusSession = () => {
    setIsFocusActive(false);
    stopAmbientAudio();
    playSound('success', soundEnabled);
    try {
      confetti({ particleCount: 75, spread: 60, origin: { y: 0.6 } });
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
        gain.gain.value = 0.05;

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
          data[i] = (Math.random() * 2 - 1) * 0.03;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 700;

        const gain = ctx.createGain();
        gain.gain.value = 0.04;

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
      console.warn("Vault notice:", e);
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

  // Filter saved materials for active course
  const activeCourseQuizzes = useMemo(() => {
    return savedQuizzes.filter(q => {
      const code = (q.courseCode || '').toUpperCase();
      const target = (activeCourse?.code || '').toUpperCase();
      return code.includes(target) || target.includes(code);
    });
  }, [savedQuizzes, activeCourse]);

  const activeCourseDecks = useMemo(() => {
    return savedDecks.filter(d => {
      const code = (d.courseCode || '').toUpperCase();
      const target = (activeCourse?.code || '').toUpperCase();
      return code.includes(target) || target.includes(code);
    });
  }, [savedDecks, activeCourse]);

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

  const handleLaunchSavedQuiz = (quiz) => {
    playSound('click', soundEnabled);
    setSelectedQuizForStudy(quiz);
    setSelectedQuizQuestions(null);
    setIsQuizOpen(true);
  };

  const handleDeleteQuiz = (quizId, e) => {
    e.stopPropagation();
    playSound('click', soundEnabled);
    deleteQuizFromLibrary(quizId);
    refreshStudyLibrary();
  };

  // Instant Streaming AI Chat
  const handleSendCourseChat = async (e, customPrompt = null) => {
    if (e) e.preventDefault();
    const q = (customPrompt || chatQuery).trim();
    if (!q || isAiSearching) return;

    playSound('click', soundEnabled);
    setChatQuery('');

    const userMsg = { role: 'user', text: q, course: activeCourse.code };
    const assistantMsgIndex = chatMessages.length + 1;

    setChatMessages(prev => [
      ...prev, 
      userMsg, 
      { role: 'assistant', text: '', course: activeCourse.code, isStreaming: true }
    ]);
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

      const res = await streamSearchVaultWithAI({
        query: `[Course: ${activeCourse.code}] ${q}`,
        filesIndex: enrichedFiles,
        sampleNotes: enrichedFiles,
        onChunk: (streamedText) => {
          setChatMessages(prev => {
            const updated = [...prev];
            if (updated[assistantMsgIndex]) {
              updated[assistantMsgIndex] = {
                ...updated[assistantMsgIndex],
                text: streamedText,
                isStreaming: true
              };
            }
            return updated;
          });
        }
      });

      setChatMessages(prev => {
        const updated = [...prev];
        if (updated[assistantMsgIndex]) {
          updated[assistantMsgIndex] = {
            role: 'assistant',
            text: res.answer || updated[assistantMsgIndex].text || 'Done.',
            matchedFiles: res.matchedFiles || [],
            course: activeCourse.code,
            isStreaming: false
          };
        }
        return updated;
      });
      playSound('success', soundEnabled);
    } catch (err) {
      setChatMessages(prev => {
        const updated = [...prev];
        if (updated[assistantMsgIndex]) {
          updated[assistantMsgIndex] = {
            role: 'assistant',
            text: `Unable to query ${activeCourse.code} notes. Please ensure notes folder is synced.`,
            course: activeCourse.code,
            isStreaming: false
          };
        }
        return updated;
      });
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
      console.warn("Upload notice:", err);
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
    <div className="space-y-4 max-w-6xl mx-auto pb-24">
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

      {/* MINIMAL HEADER */}
      <div className="flex items-center justify-between gap-3 pb-1 border-b border-white/[0.06]">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
            School & Courses
          </h1>
        </div>

        <button
          type="button"
          onClick={handleSyncSchoolFolder}
          className="px-3 py-1 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <FolderSync className="w-3.5 h-3.5 text-slate-400" />
          <span>{vaultMeta.connected ? `${scannedFiles.length} Notes` : "Link Notes"}</span>
          {vaultMeta.connected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
        </button>
      </div>

      {/* MAIN TWO-COLUMN DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* LEFT COLUMN: 5 Course Tabs + Integrated Chat Bubble with Flashcards & Quiz */}
        <div className="lg:col-span-2 space-y-3">
          {/* 5 UNIVERSITY COURSE TABS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
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
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
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

          {/* MAIN COURSE CHAT CARD (With Flashcards and Quiz at top right) */}
          <GlassCard hoverEffect={false} className="p-4 space-y-3">
            {/* Action Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/10 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-white" style={{ color: 'var(--accent-primary)' }}>
                  {activeCourse.code}
                </span>
                <h2 className="text-xs font-bold text-white">{activeCourse.name}</h2>
                <span className="text-[11px] text-slate-400">• {activeCourse.instructor}</span>
              </div>

              {/* Flashcards and Quiz at Top-Right of Main Chat Bubble (No '+' sign) */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedDeckForStudy({ courseCode: activeCourse.code });
                    setIsFlashcardsOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                >
                  <Layers className="w-3 h-3" />
                  <span>Flashcards</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setSelectedQuizForStudy(null);
                    setSelectedQuizQuestions(null);
                    setSelectedCourse(activeCourse.code);
                    setIsQuizOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                >
                  <HelpCircle className="w-3 h-3" />
                  <span>Quiz</span>
                </button>
              </div>
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

            {/* Chat Stream */}
            <div className="space-y-2.5 min-h-[160px] max-h-[300px] overflow-y-auto pr-1">
              {chatMessages.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
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
                    <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between">
                      <span>{msg.role === 'user' ? 'You' : `AI (${msg.course || activeCourse.code})`}</span>
                      {msg.isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-slate-200">
                      {msg.text || (msg.isStreaming ? 'Thinking...' : '')}
                    </div>

                    {msg.matchedFiles && msg.matchedFiles.length > 0 && (
                      <div className="pt-1 border-t border-white/5 text-[10px] text-slate-400 flex items-center gap-1 truncate">
                        <FileText className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{msg.matchedFiles[0]?.name}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSendCourseChat} className="flex gap-2 pt-1">
              <input
                type="text"
                value={chatQuery}
                onChange={(e) => setChatQuery(e.target.value)}
                placeholder={`Ask ${activeCourse.code} notes...`}
                className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none font-sans"
                style={{ borderColor: chatQuery.trim() ? 'var(--accent-primary)' : undefined }}
              />
              <button
                type="submit"
                disabled={isAiSearching || !chatQuery.trim()}
                className="px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer disabled:opacity-30 shrink-0"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Ask</span>
              </button>
            </form>
          </GlassCard>

          {/* SAVED STUDY MATERIALS: QUIZZES & FLASHCARD DECKS (Clean Switcher) */}
          {(savedQuizzes.length > 0 || savedDecks.length > 0) && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStudyTab('quizzes')}
                    className={`text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      studyTab === 'quizzes'
                        ? 'text-white border-b-2 border-white pb-0.5'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Saved Quizzes ({activeCourseQuizzes.length})
                  </button>
                  <span className="text-slate-600">•</span>
                  <button
                    type="button"
                    onClick={() => setStudyTab('decks')}
                    className={`text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                      studyTab === 'decks'
                        ? 'text-white border-b-2 border-white pb-0.5'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Flashcard Decks ({activeCourseDecks.length})
                  </button>
                </div>
              </div>

              {/* Quizzes List */}
              {studyTab === 'quizzes' ? (
                activeCourseQuizzes.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeCourseQuizzes.map(q => (
                      <div
                        key={q.id}
                        onClick={() => handleLaunchSavedQuiz(q)}
                        className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/15 transition-all cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                            <span>{q.title || q.topic || 'Practice Quiz'}</span>
                            {q.isInProgress && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                In Progress
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {q.isInProgress 
                              ? `${q.userAnswers?.length || 0}/${q.questions?.length || 0} answered` 
                              : `Score: ${q.score || 0}/${q.questions?.length || 0} (${Math.round(((q.score || 0) / (q.questions?.length || 1)) * 100)}%)`}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteQuiz(q.id, e)}
                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                            title="Delete Quiz"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-500">
                    No quizzes saved for {activeCourse.code} yet. Click <strong className="text-slate-300">Quiz</strong> to start!
                  </div>
                )
              ) : (
                /* Decks List */
                activeCourseDecks.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeCourseDecks.map(d => (
                      <div
                        key={d.id}
                        onClick={() => handleLaunchSavedDeck(d)}
                        className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 hover:border-white/15 transition-all cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{d.title || d.topic}</div>
                          <div className="text-[10px] font-mono text-slate-400">{d.courseCode} • {d.cards?.length || 0} cards</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteDeck(d.id, e)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white/[0.01] border border-white/5 text-center text-xs text-slate-500">
                    No flashcard decks created for {activeCourse.code} yet. Click <strong className="text-slate-300">Flashcards</strong> above!
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: FOCUS TIMER (Clean Header without '0 completed') */}
        <div className="space-y-3">
          <GlassCard hoverEffect={false} className="p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-300" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Focus Timer
                </h3>
              </div>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-3 gap-1 p-0.5 bg-black/40 rounded-xl border border-white/5 text-xs">
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
            <div className="text-center py-2 space-y-0.5">
              <div className="text-4xl sm:text-5xl font-mono font-bold text-white tracking-wider">
                {formatMinutesSeconds(focusTimeLeft)}
              </div>
              <div className="text-[11px] text-slate-500">
                {isFocusActive ? activeCourse.code : "Ready"}
              </div>

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

            {/* Start / Reset */}
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
            <div className="pt-2 border-t border-white/10 space-y-1">
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

            {/* Distraction Shield */}
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

      {/* ACTIVE MODALS */}
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

      <PracticeQuizModal
        isOpen={isQuizOpen}
        onClose={() => {
          setIsQuizOpen(false);
          refreshStudyLibrary();
        }}
        initialCourse={selectedQuizForStudy?.courseCode || activeCourse?.code || "School"}
        initialTopic={selectedQuizForStudy?.topic || "Exam Practice Questions"}
        initialQuiz={selectedQuizForStudy}
        initialQuestions={selectedQuizQuestions}
        soundEnabled={soundEnabled}
      />

      <DeepFocusModal
        isOpen={isDeepFocusOpen}
        onClose={() => setIsDeepFocusOpen(false)}
        courseCode={activeCourse?.code || "Deep Work"}
        soundEnabled={soundEnabled}
      />
    </div>
  );
};
