import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, 
  Upload, 
  CheckCircle2, 
  Circle, 
  AlertOctagon, 
  X, 
  ArrowRight,
  GraduationCap,
  Loader2,
  Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { processSyllabusDocument } from '../../utils/documentParser';
import { expandSectionLectures } from '../../utils/aiService';
import { playSound } from '../../utils/soundFX';

export const SyllabusIngestionModal = ({ 
  isOpen = false, 
  onClose, 
  onImportItems, 
  soundEnabled = true 
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [selectedSection, setSelectedSection] = useState(null);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const applySectionLectures = (data, section) => {
    if (!data || !section) return data?.items || [];
    
    // Separate deliverables (exams, assignments, quizzes, reports, presentations)
    const deliverables = data.rawDeliverables || data.items.filter(it => 
      it.type === 'deadline' || it.weight || 
      it.title.toLowerCase().includes('exam') || it.title.toLowerCase().includes('due') || 
      it.title.toLowerCase().includes('quiz') || it.title.toLowerCase().includes('report') || 
      it.title.toLowerCase().includes('presentation')
    );

    // Extract lecture topics
    const topics = data.lectureTopics || data.items
      .filter(it => it.type === 'event')
      .map(it => it.title.replace(/^[^:]+:\s*(?:Lecture\s*[-–—:]\s*)?/i, '').trim())
      .filter(Boolean);

    const expanded = expandSectionLectures({
      courseCode: data.courseCode,
      section: section,
      term: data.term,
      topics: topics.length > 0 ? topics : ['Course Concepts & Analysis'],
      currentYear: new Date().getFullYear()
    });

    return {
      deliverables,
      topics,
      allItems: [...deliverables, ...expanded].sort((a, b) => a.date.localeCompare(b.date))
    };
  };

  const handleProcessFile = async (file) => {
    setIsProcessing(true);
    setError(null);
    playSound('click', soundEnabled);

    try {
      const result = await processSyllabusDocument(file);
      if (!result.items || result.items.length === 0) {
        throw new Error("No dates or deadlines found in this document. Please check the document or paste text directly.");
      }

      if (result.sections && result.sections.length > 0) {
        const initialSection = result.sections[0];
        setSelectedSection(initialSection);
        const { deliverables, topics, allItems } = applySectionLectures(result, initialSection);
        setParsedData({
          ...result,
          rawDeliverables: deliverables,
          lectureTopics: topics,
          items: allItems
        });
        setSelectedItemIds(new Set(allItems.map((_, idx) => idx)));
      } else {
        setSelectedSection(null);
        setParsedData(result);
        setSelectedItemIds(new Set(result.items.map((_, idx) => idx)));
      }

      playSound('success', soundEnabled);
    } catch (err) {
      setError(err.message || "Failed to process syllabus document.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessText = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setError(null);
    playSound('click', soundEnabled);

    try {
      const result = await processSyllabusDocument(rawText);
      if (!result.items || result.items.length === 0) {
        throw new Error("No dates or deadlines could be detected from this text.");
      }

      if (result.sections && result.sections.length > 0) {
        const initialSection = result.sections[0];
        setSelectedSection(initialSection);
        const { deliverables, topics, allItems } = applySectionLectures(result, initialSection);
        setParsedData({
          ...result,
          rawDeliverables: deliverables,
          lectureTopics: topics,
          items: allItems
        });
        setSelectedItemIds(new Set(allItems.map((_, idx) => idx)));
      } else {
        setSelectedSection(null);
        setParsedData(result);
        setSelectedItemIds(new Set(result.items.map((_, idx) => idx)));
      }

      playSound('success', soundEnabled);
    } catch (err) {
      setError(err.message || "Failed to process text.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSelectSection = (section) => {
    playSound('click', soundEnabled);
    setSelectedSection(section);

    if (parsedData && section) {
      const { deliverables, topics, allItems } = applySectionLectures(parsedData, section);
      setParsedData(prev => ({
        ...prev,
        rawDeliverables: deliverables,
        lectureTopics: topics,
        items: allItems
      }));
      setSelectedItemIds(new Set(allItems.map((_, idx) => idx)));
    }
  };

  const toggleItemSelection = (index) => {
    playSound('click', soundEnabled);
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    playSound('click', soundEnabled);
    if (selectedItemIds.size === parsedData.items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(parsedData.items.map((_, idx) => idx)));
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedData || selectedItemIds.size === 0) return;

    playSound('success', soundEnabled);
    try {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.6 }
      });
    } catch (e) {}

    const coursePrefix = parsedData.courseCode ? `${parsedData.courseCode}: ` : '';

    const selectedItems = parsedData.items
      .filter((_, idx) => selectedItemIds.has(idx))
      .map(it => {
        let title = it.title || "Academic Deadline";
        // Ensure course code prefix
        if (parsedData.courseCode && !title.toLowerCase().startsWith(parsedData.courseCode.toLowerCase())) {
          title = `${coursePrefix}${title}`;
        }

        const isLecture = it.type === 'event' || it.title?.toLowerCase().includes('lecture');
        const activeTime = (isLecture && selectedSection?.time) ? selectedSection.time : (it.time || 'All Day');
        const activeLocation = selectedSection?.location ? ` • ${selectedSection.location}` : '';
        const activeInstructor = selectedSection?.instructor ? ` • ${selectedSection.instructor}` : '';

        return {
          id: `syllabus-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          type: it.type || 'deadline',
          title: title,
          date: it.date,
          time: activeTime,
          isAllDay: it.isAllDay !== false && !isLecture,
          category: 'School',
          weight: it.weight,
          priority: it.type === 'deadline' ? 'urgent' : 'normal',
          completed: false,
          description: `${it.description || ''}${isLecture ? `${activeLocation}${activeInstructor}` : ''}`.trim()
        };
      });

    onClose();
    setParsedData(null);
    setRawText('');
    setSelectedSection(null);

    if (onImportItems && Array.isArray(selectedItems)) {
      onImportItems(selectedItems);
    }
  };

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4">
        {/* Frosted Glass Backdrop — Blurs 100% of entire viewport */}
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

        {/* Focused Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-2xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
              <div 
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center bg-white/[0.04] shrink-0"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate flex items-center gap-2">
                  <span>Import Syllabus</span>
                  <span className="hidden sm:inline text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/[0.06] text-slate-300 font-semibold border border-white/10">
                    Syllabus Parser
                  </span>
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                  Decyphers course code, exams, homework & grading weights
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                playSound('click', soundEnabled);
                onClose();
              }}
              className="p-1.5 sm:p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-all border border-white/5 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* STEP 1: UPLOAD / PASTE FORM (If not parsed yet) */}
          {!parsedData && (
            <div className="space-y-4">
              {/* Drag and Drop Zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2.5 ${
                  dragActive 
                    ? 'border-blue-400 bg-blue-500/10' 
                    : 'border-white/10 hover:border-white/20 bg-white/[0.01] hover:bg-white/[0.03]'
                }`}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".pdf,.txt,.md,.docx,.csv" 
                  onChange={handleFileChange}
                  className="hidden" 
                />

                <div 
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                >
                  <Upload className="w-6 h-6" />
                </div>

                <div>
                  <div className="text-xs font-bold text-white">
                    Drop your Course Syllabus PDF or Outline here
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Supports full multi-page PDFs (e.g. PSYC 203, CPSC 331, MATH 211), Word documents, TXT
                  </div>
                </div>

                <button
                  type="button"
                  className="mt-1 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white text-xs font-semibold border border-white/10 transition-all cursor-pointer"
                >
                  Browse Files
                </button>
              </div>

              {/* Or Direct Paste Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
                  <span>Or paste syllabus text directly:</span>
                  <span className="text-[10px] font-mono text-slate-500">Assessment table, schedule, due dates</span>
                </div>

                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="e.g. PSYC 203 Psychology for Everyday Life Fall 2026&#10;Online Exam 1 (D2L): Oct 6 (30%)&#10;Assignment 1: Oct 1 (2%)&#10;Online Exam 2: Nov 3 (30%)"
                  rows={4}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs placeholder:text-slate-600 outline-none focus:border-white/30 font-mono resize-none"
                />

                <button
                  type="button"
                  onClick={handleProcessText}
                  disabled={!rawText.trim() || isProcessing}
                  className="w-full py-2.5 rounded-xl text-white text-xs font-semibold shadow-md active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analyzing Course Syllabus...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-4 h-4" />
                      <span>Parse Syllabus</span>
                    </>
                  )}
                </button>
              </div>

              {isProcessing && (
                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200 flex items-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">Extracting Academic Milestones...</div>
                    <div className="text-[11px] text-blue-300/80">Scanning grading scheme, assessment tables, lecture dates, and exam periods.</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: REVIEW & CONFIRM SCREEN */}
          {parsedData && (
            <div className="space-y-4">
              {/* Course Header Banner */}
              <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span 
                    className="px-2.5 py-1 rounded-xl text-xs font-bold font-mono shrink-0"
                    style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-primary)', border: '1px solid var(--accent-border)' }}
                  >
                    {parsedData.courseCode || "COURSE"}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {parsedData.courseName || `${parsedData.courseCode || 'Course'} Syllabus`}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-3 flex-wrap mt-0.5 font-mono">
                      {parsedData.term && <span>📅 {parsedData.term}</span>}
                      {selectedSection?.instructor ? (
                        <span>👨‍🏫 {selectedSection.instructor}</span>
                      ) : (
                        parsedData.instructor && <span>👨‍🏫 {parsedData.instructor}</span>
                      )}
                      {selectedSection?.time ? (
                        <span>⏰ {selectedSection.days} {selectedSection.time}</span>
                      ) : (
                        parsedData.lectureTime && <span>⏰ {parsedData.lectureTime}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={toggleSelectAll}
                  className="text-xs font-semibold text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 shrink-0 cursor-pointer"
                >
                  {selectedItemIds.size === parsedData.items.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              {/* LECTURE SECTION & TIMETABLE SELECTOR (If multi-section course) */}
              {parsedData.sections && parsedData.sections.length > 0 && (
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Select Your Class Section / Timetable:</span>
                    </span>
                    {selectedSection && (
                      <span className="text-[10px] font-mono text-slate-300 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                        {selectedSection.days} • {selectedSection.time}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {parsedData.sections.map((sec) => {
                      const isCurrent = selectedSection?.sectionId === sec.sectionId;
                      return (
                        <button
                          key={sec.sectionId}
                          type="button"
                          onClick={() => handleSelectSection(sec)}
                          className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-white/[0.08] border-white/30 text-white shadow-md'
                              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold font-mono text-white">{sec.sectionId}</span>
                            <span className="text-[10px] font-semibold text-slate-400">{sec.days}</span>
                          </div>
                          <div className="text-xs font-semibold text-slate-100 truncate mt-0.5 font-mono">
                            {sec.time}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {sec.location || sec.type || ''} {sec.instructor ? `• ${sec.instructor}` : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {parsedData.items.map((item, idx) => {
                  const isSelected = selectedItemIds.has(idx);
                  const isDeadline = item.type === 'deadline';

                  return (
                    <div
                      key={idx}
                      onClick={() => toggleItemSelection(idx)}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        isSelected
                          ? isDeadline
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-100'
                            : 'bg-white/[0.04] border-white/20 text-white'
                          : 'bg-white/[0.01] border-white/5 text-slate-500 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <button className="shrink-0">
                          {isSelected ? (
                            <CheckCircle2 className={`w-4 h-4 ${isDeadline ? 'text-rose-400' : 'text-emerald-400'}`} />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-600" />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${isDeadline ? 'bg-rose-500' : 'bg-slate-400'}`} />

                            <span className="font-semibold text-xs text-slate-100 truncate">
                              {item.title}
                            </span>

                            {item.weight && (
                              <span className="text-[10px] font-mono text-emerald-400 font-semibold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                                {item.weight}
                              </span>
                            )}
                          </div>

                          {item.description && (
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-mono font-semibold text-slate-200">
                          {item.date}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {(item.type === 'event' && selectedSection?.time) ? selectedSection.time : (item.time || 'All Day')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setParsedData(null)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all border border-white/5 cursor-pointer"
                >
                  Back / Upload Another
                </button>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={selectedItemIds.size === 0}
                  className="px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg active:scale-95 transition-all disabled:opacity-40 flex items-center gap-2 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <span>Import {selectedItemIds.size} Items to Calendar</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              {error}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
