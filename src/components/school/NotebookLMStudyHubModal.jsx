import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  BookOpen, 
  FolderSync, 
  Layers, 
  HelpCircle, 
  FileText, 
  Search, 
  Calendar, 
  Percent, 
  Award, 
  Zap, 
  ChevronRight, 
  X, 
  RefreshCw, 
  Loader2, 
  AlertCircle, 
  Send,
  GraduationCap
} from 'lucide-react';
import { 
  getVaultMetadata, 
  getCachedVaultFiles, 
  connectObsidianVault, 
  processUploadedFolderFiles, 
  readVaultFileContent,
  clearVaultHandle
} from '../../utils/obsidianService';
import { 
  generateCourseBriefingWithAI, 
  searchVaultWithAI 
} from '../../utils/aiService';
import { playSound } from '../../utils/soundFX';

export const NotebookLMStudyHubModal = ({ 
  isOpen, 
  onClose, 
  onLaunchFlashcards,
  onLaunchQuiz,
  onVaultUpdated,
  soundEnabled = true 
}) => {
  const [vaultMeta, setVaultMeta] = useState(getVaultMetadata());
  const [scannedFiles, setScannedFiles] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('FNCE 317');
  const [activeTab, setActiveTab] = useState('briefing'); // 'briefing' | 'cheatsheet' | 'chat' | 'documents'
  
  // AI Course Briefing State
  const [briefings, setBriefings] = useState({});
  const [isLoadingBriefing, setIsLoadingBriefing] = useState(false);
  
  // Interactive Chat State
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isChatSearching, setIsChatSearching] = useState(false);

  // Document Viewer State
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedDocText, setSelectedDocText] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const folderInputRef = useRef(null);

  // 1. Load cached files on mount
  useEffect(() => {
    if (isOpen) {
      setError(null);
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
        if (cached.courses && cached.courses.length > 0) {
          setSelectedCourse(cached.courses[0]);
        }
      }
    }
  }, [isOpen]);

  // Detected courses list (combining all university classes including PSYC 203)
  const availableCourses = useMemo(() => {
    const detected = Array.from(new Set([
      ...(vaultMeta?.courses || []),
      ...(scannedFiles.map(f => f.course).filter(Boolean))
    ])).filter(c => c && c !== 'school' && c !== 'General');
    const defaultList = ['FNCE 317', 'BTMA 317', 'OPMA 317', 'MGST 391', 'MKTG 317', 'PSYC 203'];
    return detected.length > 0 ? detected : defaultList;
  }, [vaultMeta?.courses, scannedFiles]);

  // Current active course files
  const currentCourseFiles = useMemo(() => {
    if (selectedCourse === 'ALL') return scannedFiles;
    return scannedFiles.filter(f => {
      const c = (f.course || '').toUpperCase();
      const target = selectedCourse.toUpperCase();
      return c.includes(target) || target.includes(c) || (f.path || '').toUpperCase().includes(target);
    });
  }, [scannedFiles, selectedCourse]);

  // Fetch or generate course briefing when course changes
  useEffect(() => {
    if (!isOpen || selectedCourse === 'ALL') return;

    if (!briefings[selectedCourse]) {
      loadCourseBriefing(selectedCourse);
    }
  }, [selectedCourse, isOpen]);

  const loadCourseBriefing = async (course) => {
    setIsLoadingBriefing(true);
    try {
      // Find relevant syllabus text
      const filesForCourse = scannedFiles.filter(f => {
        const c = (f.course || '').toUpperCase();
        const target = course.toUpperCase();
        return c.includes(target) || target.includes(c) || (f.path || '').toUpperCase().includes(target);
      });

      let combinedText = '';
      for (const file of filesForCourse) {
        let text = file.cachedContent || '';
        if (!text) {
          try {
            text = await readVaultFileContent(file);
          } catch {}
        }
        if (text) combinedText += `\n\n--- Document: ${file.name} ---\n` + text;
      }

      const briefing = await generateCourseBriefingWithAI({
        courseCode: course,
        syllabusText: combinedText || `Course Outline for ${course}`
      });

      if (briefing) {
        setBriefings(prev => ({
          ...prev,
          [course]: briefing
        }));
      }
    } catch (e) {
      console.warn("Could not generate briefing:", e);
    } finally {
      setIsLoadingBriefing(false);
    }
  };

  const handleConnectFolder = async () => {
    playSound('click', soundEnabled);
    setIsLoading(true);
    setError(null);

    if (typeof window !== 'undefined' && window.showDirectoryPicker) {
      try {
        const { handle, files, courses } = await connectObsidianVault();
        setScannedFiles(files);
        const newMeta = {
          connected: true,
          folderName: handle.name,
          totalNotes: files.length,
          courses,
          lastScanned: new Date().toISOString()
        };
        setVaultMeta(newMeta);
        if (courses.length > 0) setSelectedCourse(courses[0]);
        playSound('success', soundEnabled);
        if (onVaultUpdated) onVaultUpdated(newMeta, files);
        setIsLoading(false);
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          setIsLoading(false);
          return;
        }
      }
    }

    setIsLoading(false);
    if (folderInputRef.current) folderInputRef.current.click();
  };

  const handleFolderUploadChange = async (e) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const { files, courses } = await processUploadedFolderFiles(fileList);
      setScannedFiles(files);
      const newMeta = {
        connected: true,
        folderName: files[0]?.path.split('/')[0] || 'school',
        totalNotes: files.length,
        courses,
        lastScanned: new Date().toISOString()
      };
      setVaultMeta(newMeta);
      if (courses.length > 0) setSelectedCourse(courses[0]);
      playSound('success', soundEnabled);
      if (onVaultUpdated) onVaultUpdated(newMeta, files);
    } catch (err) {
      setError(err.message || "Failed to index folder.");
    } finally {
      setIsLoading(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleSendChat = async (e, customQuery = null) => {
    if (e) e.preventDefault();
    const q = (customQuery || chatQuery).trim();
    if (!q || isChatSearching) return;

    playSound('click', soundEnabled);
    if (customQuery) setChatQuery('');
    else setChatQuery('');

    const userMsg = { role: 'user', text: q, timestamp: new Date() };
    setChatHistory(prev => [...prev, userMsg]);
    setIsChatSearching(true);

    try {
      const enrichedFiles = await Promise.all(currentCourseFiles.map(async (file) => {
        let text = file.cachedContent || '';
        if (!text) {
          try {
            text = await readVaultFileContent(file);
          } catch {}
        }
        return { ...file, content: text || '' };
      }));

      const res = await searchVaultWithAI({
        query: `${selectedCourse !== 'ALL' ? `[Course: ${selectedCourse}] ` : ''}${q}`,
        filesIndex: enrichedFiles,
        sampleNotes: enrichedFiles
      });

      const botMsg = {
        role: 'assistant',
        text: res.answer || "Answer synthesized from your course notes.",
        matchedFiles: res.matchedFiles || [],
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, botMsg]);
      playSound('success', soundEnabled);
    } catch (err) {
      setChatHistory(prev => [...prev, {
        role: 'assistant',
        text: "Could not complete query. Please ensure your notes are connected.",
        timestamp: new Date()
      }]);
    } finally {
      setIsChatSearching(false);
    }
  };

  const handleSelectDoc = async (file) => {
    playSound('click', soundEnabled);
    setSelectedDoc(file);
    if (file.cachedContent) {
      setSelectedDocText(file.cachedContent);
      return;
    }
    const text = await readVaultFileContent(file);
    setSelectedDocText(text || "No text could be extracted from this document.");
  };

  const currentBriefing = briefings[selectedCourse] || null;

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-3 sm:p-5">
        {/* Frosted Glass Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/70 backdrop-blur-xl z-0 cursor-pointer"
        />

        {/* Main Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl bg-[#0a0c16] border border-purple-500/30 rounded-3xl shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)] backdrop-blur-3xl z-10 flex flex-col max-h-[92vh] overflow-hidden"
        >
          {/* TOP BAR: Brand Header & Course Tabs */}
          <div className="p-4 sm:p-5 border-b border-white/10 space-y-3 shrink-0 bg-white/[0.01]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-br from-purple-600/30 to-indigo-600/20 border border-purple-500/40 text-purple-300 shadow-md">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                    <span>Study Brain</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                      NotebookLM
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {scannedFiles.length} course documents indexed across your classes
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnectFolder}
                  disabled={isLoading}
                  className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <FolderSync className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden sm:inline">Sync School Folder</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    onClose();
                  }}
                  className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Hidden Native / Webkit Folder Upload Input */}
            <input 
              ref={folderInputRef}
              type="file"
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleFolderUploadChange}
              className="hidden"
            />

            {/* COURSE SWITCHER TABS */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
              {availableCourses.map((course, idx) => {
                const isActive = selectedCourse === course;
                const count = scannedFiles.filter(f => (f.course || '').toUpperCase().includes(course.toUpperCase()) || (f.path || '').toUpperCase().includes(course.toUpperCase())).length;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setSelectedCourse(course);
                      setSelectedDoc(null);
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30 border border-purple-400/50 scale-[1.02]'
                        : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 border border-white/5 hover:bg-white/[0.06]'
                    }`}
                  >
                    <GraduationCap className="w-3.5 h-3.5" />
                    <span>{course}</span>
                    {count > 0 && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-slate-400'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SECONDARY NAVIGATION: Module Tabs */}
          <div className="flex items-center justify-between px-5 py-2.5 bg-black/40 border-b border-white/5 text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setActiveTab('briefing');
                }}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'briefing'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span>Grade Breakdown & Dates</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setActiveTab('cheatsheet');
                }}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'cheatsheet'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Exam Cheatsheet & Formulas</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setActiveTab('chat');
                }}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'chat'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Search className="w-3.5 h-3.5" />
                <span>Study Chat</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  setActiveTab('documents');
                }}
                className={`px-3 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'documents'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Raw Documents ({currentCourseFiles.length})</span>
              </button>
            </div>

            {/* 1-CLICK STUDY LAUNCHERS IN HEADER */}
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                  if (onLaunchFlashcards) onLaunchFlashcards(selectedCourse);
                }}
                className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              >
                <Layers className="w-3 h-3" />
                <span>+ Deck</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                  if (onLaunchQuiz) onLaunchQuiz(selectedCourse);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              >
                <HelpCircle className="w-3 h-3" />
                <span>+ Quiz</span>
              </button>
            </div>
          </div>

          {/* MAIN BODY AREA */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* TAB 1: EXECUTIVE BRIEFING & GRADE WEIGHTS */}
            {activeTab === 'briefing' && (
              <div className="space-y-4">
                {isLoadingBriefing ? (
                  <div className="py-16 text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400 mx-auto" />
                    <div className="text-xs font-bold text-white">Synthesizing {selectedCourse} syllabus with NotebookLM AI...</div>
                    <div className="text-[11px] text-slate-400">Extracting grade weights, midterm schedules, and instructor details</div>
                  </div>
                ) : currentBriefing ? (
                  <div className="space-y-4">
                    {/* Course Overview Card */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/20 to-indigo-950/20 border border-purple-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="text-xs font-bold font-mono text-purple-300 uppercase tracking-wide flex items-center gap-1.5">
                          <GraduationCap className="w-4 h-4" />
                          <span>{selectedCourse} Executive Overview</span>
                        </div>
                        <p className="text-xs text-slate-200 leading-relaxed font-sans">
                          {currentBriefing.overview}
                        </p>
                      </div>

                      {/* Instructor Info Chip */}
                      {currentBriefing.instructor && (
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 shrink-0 text-xs space-y-0.5">
                          <div className="text-[10px] font-mono uppercase text-slate-400">Instructor</div>
                          <div className="text-white font-bold">{currentBriefing.instructor.name || "Professor"}</div>
                          {currentBriefing.instructor.email && (
                            <div className="text-[11px] text-purple-300 font-mono">{currentBriefing.instructor.email}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Grade Weights Visual Grid */}
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Percent className="w-3.5 h-3.5 text-purple-400" />
                        <span>Grading Architecture & Weights</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                        {(currentBriefing.gradeBreakdown || []).map((grade, idx) => (
                          <div key={idx} className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 space-y-1 hover:border-purple-500/30 transition-all">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-white truncate">{grade.item}</span>
                              <span className="text-xs font-mono font-bold text-emerald-400 px-1.5 py-0.2 rounded bg-emerald-500/10">
                                {grade.weight}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-relaxed">{grade.details}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Key Dates & Exam Timeline */}
                    {currentBriefing.keyDates && currentBriefing.keyDates.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-purple-400" />
                          <span>Key Exam Dates & Milestone Timeline</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                          {currentBriefing.keyDates.map((date, idx) => (
                            <div key={idx} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{date.title}</div>
                                <div className="text-[10px] text-purple-300 font-mono">{date.date}</div>
                              </div>
                              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 uppercase font-bold shrink-0">
                                {date.type || 'Exam'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Select a course above to generate an executive NotebookLM briefing.
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: HIGH-YIELD EXAM CHEATSHEET & FORMULAS */}
            {activeTab === 'cheatsheet' && (
              <div className="space-y-4">
                {currentBriefing?.highYieldConcepts ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                        <span>Core High-Yield Concepts & Formulas ({selectedCourse})</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentBriefing.highYieldConcepts.map((concept, idx) => (
                        <div key={idx} className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2 hover:border-amber-500/30 transition-all">
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span>{concept.topic}</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed font-sans">{concept.summary}</p>
                          {concept.formula && (
                            <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 text-amber-300 font-mono text-xs overflow-x-auto">
                              {concept.formula}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Exam Traps & Warnings */}
                    {currentBriefing.examTraps && currentBriefing.examTraps.length > 0 && (
                      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                        <div className="text-xs font-bold text-amber-300 uppercase tracking-wide flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Exam Traps & Syllabus Policy Watchouts</span>
                        </div>
                        <ul className="text-xs text-amber-100/90 space-y-1 list-disc list-inside">
                          {currentBriefing.examTraps.map((trap, i) => (
                            <li key={i}>{trap}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Generating cheatsheet... Click a course above to synthesize formulas.
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: INTERACTIVE NOTEBOOKLM STUDY CHAT */}
            {activeTab === 'chat' && (
              <div className="space-y-4">
                {/* Chat History Messages */}
                <div className="space-y-3 min-h-[220px] max-h-[360px] overflow-y-auto pr-1">
                  {chatHistory.length === 0 ? (
                    <div className="py-8 px-4 text-center space-y-3 rounded-2xl bg-white/[0.02] border border-white/5">
                      <div className="w-10 h-10 rounded-2xl bg-purple-500/20 text-purple-300 flex items-center justify-center mx-auto">
                        <Search className="w-5 h-5" />
                      </div>
                      <div className="text-xs font-bold text-white">Ask your {selectedCourse} Notes with AI</div>
                      <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                        Query formulas, grade breakdowns, exam schedules, or ask the AI to explain complex topics directly from your uploaded course outline.
                      </p>

                      {/* Quick Prompt Chips */}
                      <div className="flex items-center justify-center gap-1.5 flex-wrap pt-2">
                        {[
                          `Summarize grade weights for ${selectedCourse}`,
                          `What are the most important exam topics in ${selectedCourse}?`,
                          `Explain key formulas and definitions`,
                          `What is the policy on missed lectures or midterms?`
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={(e) => handleSendChat(e, chip)}
                            className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/5 text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    chatHistory.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`p-3.5 rounded-2xl text-xs space-y-1.5 ${
                          msg.role === 'user'
                            ? 'bg-purple-600/20 border border-purple-500/30 text-white ml-auto max-w-[85%]'
                            : 'bg-white/[0.03] border border-white/10 text-slate-100 mr-auto max-w-[95%]'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                          <span>{msg.role === 'user' ? 'Zach Wolfe' : `NotebookLM (${selectedCourse})`}</span>
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed font-sans">
                          {msg.text}
                        </div>

                        {msg.matchedFiles && msg.matchedFiles.length > 0 && (
                          <div className="pt-2 border-t border-white/5 space-y-1">
                            <div className="text-[9px] uppercase font-mono text-purple-300 font-bold">Cited Sources:</div>
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

                  {isChatSearching && (
                    <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2 text-xs text-purple-300">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                      <span>NotebookLM analyzing {selectedCourse} course notes...</span>
                    </div>
                  )}
                </div>

                {/* Query Input Box */}
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    value={chatQuery}
                    onChange={(e) => setChatQuery(e.target.value)}
                    placeholder={`Ask anything about ${selectedCourse} (e.g. explain WACC, grade weights)...`}
                    className="flex-1 px-4 py-2.5 rounded-2xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500/60 font-sans"
                  />
                  <button
                    type="submit"
                    disabled={isChatSearching || !chatQuery.trim()}
                    className="px-4 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Ask</span>
                  </button>
                </form>
              </div>
            )}

            {/* TAB 4: RAW DOCUMENTS & OUTLINE PREVIEW */}
            {activeTab === 'documents' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-h-[260px]">
                {/* Documents List */}
                <div className="space-y-1.5 overflow-y-auto max-h-[300px] pr-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 pb-1">
                    Documents for {selectedCourse} ({currentCourseFiles.length})
                  </div>
                  {currentCourseFiles.map((file, idx) => {
                    const isSelected = selectedDoc?.path === file.path;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectDoc(file)}
                        className={`w-full text-left p-2.5 rounded-xl text-xs border transition-all flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-purple-600/20 border-purple-500/40 text-white shadow-sm'
                            : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileText className="w-4 h-4 text-purple-400 shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-purple-300 shrink-0">
                          {file.extension?.toUpperCase() || 'DOC'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Document Preview Box */}
                <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 overflow-y-auto max-h-[300px] font-mono text-[11px] text-slate-300">
                  {selectedDoc ? (
                    <div className="space-y-2">
                      <div className="text-xs font-bold font-sans text-white border-b border-white/10 pb-1 flex items-center justify-between">
                        <span className="truncate">{selectedDoc.name}</span>
                        <span className="text-[10px] text-purple-300 font-mono">{selectedDoc.course || 'Document'}</span>
                      </div>
                      <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed">
                        {selectedDocText || "Loading text content..."}
                      </pre>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-500">
                      <BookOpen className="w-6 h-6 mb-2 opacity-50 text-purple-400" />
                      <p className="text-xs">Click any course outline above to preview its raw text.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* FOOTER: Action Bar */}
          <div className="p-3 sm:p-4 border-t border-white/10 bg-white/[0.01] flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{selectedCourse} Active in NotebookLM</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                  if (onLaunchFlashcards) onLaunchFlashcards(selectedCourse);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Generate Flashcards</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  playSound('click', soundEnabled);
                  onClose();
                  if (onLaunchQuiz) onLaunchQuiz(selectedCourse);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Launch Practice Exam</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
