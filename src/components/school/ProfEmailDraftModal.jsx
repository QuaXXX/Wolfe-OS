import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Send, 
  Copy, 
  Check, 
  X, 
  Loader2
} from 'lucide-react';
import { draftProfEmailWithAI } from '../../utils/aiService';
import { findCourseOutlineContent, extractInstructorFromOutline } from '../../utils/obsidianService';
import { playSound } from '../../utils/soundFX';

export const ProfEmailDraftModal = ({ 
  isOpen, 
  onClose, 
  courseCode = "",
  instructorName = "",
  instructorEmail = "",
  sectionCode = "",
  syllabusContext = "",
  scannedFiles = [],
  courses = [],
  vaultMeta = {},
  soundEnabled = true 
}) => {
  const [selectedCourse, setSelectedCourse] = useState(courseCode || "AUTO");
  const [promptInput, setPromptInput] = useState('');
  const [recipient, setRecipient] = useState(instructorEmail || '');
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detectedProfInfo, setDetectedProfInfo] = useState(null);

  // Stabilize available courses list to prevent infinite re-render loops
  const availableCourses = useMemo(() => {
    return Array.from(new Set([
      ...(courses.map(c => c.code || c.id || c.name)),
      ...(vaultMeta?.courses || []),
      ...(scannedFiles.map(f => f.course).filter(Boolean))
    ])).filter(Boolean);
  }, [courses, vaultMeta?.courses, scannedFiles]);

  useEffect(() => {
    if (isOpen) {
      setRecipient(instructorEmail || '');
      setCopied(false);
      setSubject('');
      setEmailBody('');
      setPromptInput('');
      setDetectedProfInfo(null);
      setSelectedCourse(courseCode && courseCode !== "Course" ? courseCode : "AUTO");
    }
  }, [isOpen, courseCode, instructorEmail]);

  // Debounced live course & instructor detection (prevents freeze/crash on paste)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      const trimmed = promptInput.trim();
      if (!trimmed) {
        if (selectedCourse === 'AUTO') {
          setDetectedProfInfo(null);
        }
        return;
      }

      let targetCourse = selectedCourse !== 'AUTO' ? selectedCourse : '';
      if (!targetCourse) {
        // Detect mentioned course in prompt (e.g. FNCE, BTMA, OPMA, MGST, MKTG, CPSC, MATH)
        const match = trimmed.match(/\b([A-Z]{2,6}\s*\d{0,4})\b/i);
        if (match) {
          const query = match[1].trim().toUpperCase();
          targetCourse = availableCourses.find(c => c.toUpperCase().includes(query) || query.includes(c.toUpperCase())) || query;
        }
      }

      if (targetCourse && targetCourse !== 'AUTO') {
        findCourseOutlineContent(scannedFiles, targetCourse).then(res => {
          if (res && res.info) {
            setDetectedProfInfo(prev => {
              if (prev?.course === targetCourse && prev?.email === res.info.email && prev?.name === res.info.name) {
                return prev;
              }
              return {
                course: res.info.course || targetCourse,
                name: res.info.name,
                email: res.info.email,
                section: res.info.section || 'L01',
                fileName: res.file?.name,
                content: res.content
              };
            });
            if (res.info.email) {
              setRecipient(prev => prev || res.info.email);
            }
          } else {
            setDetectedProfInfo(prev => {
              if (prev?.course === targetCourse && !prev?.name) return prev;
              return {
                course: targetCourse,
                name: instructorName || '',
                email: instructorEmail || '',
                section: sectionCode || 'L01',
                content: ''
              };
            });
          }
        }).catch(() => {});
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [promptInput, selectedCourse, scannedFiles, availableCourses, isOpen, instructorName, instructorEmail, sectionCode]);

  const handleGenerateEmail = async (e) => {
    if (e) e.preventDefault();
    if (!promptInput.trim() || isGenerating) return;

    setIsGenerating(true);
    setCopied(false);
    playSound('click', soundEnabled);

    try {
      // 1. Resolve Target Course
      let activeTargetCourse = selectedCourse !== 'AUTO' ? selectedCourse : (detectedProfInfo?.course || '');
      if (!activeTargetCourse) {
        const match = promptInput.match(/\b([A-Z]{2,6}\s*\d{0,4})\b/i);
        activeTargetCourse = match ? match[1].toUpperCase() : (availableCourses[0] || "Course");
      }

      // 2. Fetch or Use Outline Context
      let outlineContext = syllabusContext || '';
      let profName = instructorName;
      let profEmail = recipient || instructorEmail;
      let sec = sectionCode || 'L01';

      if (detectedProfInfo) {
        if (detectedProfInfo.name) profName = detectedProfInfo.name;
        if (detectedProfInfo.email) profEmail = detectedProfInfo.email;
        if (detectedProfInfo.section) sec = detectedProfInfo.section;
        if (detectedProfInfo.content) outlineContext = detectedProfInfo.content;
      } else if (scannedFiles.length > 0) {
        const found = await findCourseOutlineContent(scannedFiles, activeTargetCourse);
        if (found) {
          if (found.info.name) profName = found.info.name;
          if (found.info.email) profEmail = found.info.email;
          if (found.info.section) sec = found.info.section;
          outlineContext = found.content;
        }
      }

      const draft = await draftProfEmailWithAI({
        courseCode: activeTargetCourse,
        instructorName: profName || "Professor",
        instructorEmail: profEmail || recipient,
        sectionCode: sec,
        reason: "Student Inquiry",
        details: promptInput.trim(),
        syllabusContext: outlineContext,
        studentName: "Zach Wolfe",
        studentId: "30100000"
      });

      if (draft) {
        setSubject(draft.subject || `[${activeTargetCourse}] Inquiry - Zach Wolfe`);
        setEmailBody(draft.body || '');
        if (draft.recipientEmail) setRecipient(draft.recipientEmail);
        else if (profEmail) setRecipient(profEmail);
        playSound('success', soundEnabled);
      }
    } catch (err) {
      console.warn("Email draft generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    playSound('click', soundEnabled);
    const textToCopy = `To: ${recipient || ''}\nSubject: ${subject || ''}\n\n${emailBody || ''}`;
    
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        return;
      }
    } catch (err) {
      console.warn("Clipboard API copy failed, using fallback:", err);
    }

    // Rock-solid DOM fallback for all browsers/environments
    try {
      const textArea = document.createElement("textarea");
      textArea.value = textToCopy;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error("Copy failed:", e);
    }
  };

  const handleOpenMailClient = () => {
    playSound('click', soundEnabled);
    try {
      const mailtoUrl = `mailto:${encodeURIComponent(recipient || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(emailBody || '')}`;
      window.open(mailtoUrl, '_blank');
    } catch (e) {
      console.warn("Could not launch mailto client:", e);
    }
  };

  if (!isOpen) return null;

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
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center bg-rose-500/10 border border-rose-500/30 text-rose-400 shrink-0">
                <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Prof-Ready Email Drafter
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 truncate">Formal, polite email drafts with 1-click send</p>
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

          {/* Clean Prompt Chat Input */}
          <form onSubmit={handleGenerateEmail} className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300">
                What do you want to email your professor about?
              </label>
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="e.g. For FNCE, I'm away working in Banff this week, won't make lectures, taking care of D2L slides..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 resize-none font-sans"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isGenerating || !promptInput.trim()}
                  className="px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 shrink-0"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Draft</span>
                </button>
              </div>
            </div>
          </form>

          {/* Loading Indicator */}
          {isGenerating && (
            <div className="min-h-[140px] rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
              <div className="text-xs font-bold text-white">Drafting formal syllabus-compliant email...</div>
            </div>
          )}

          {/* Generated Email Form */}
          {!isGenerating && emailBody && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 pt-2 border-t border-white/10"
            >
              {/* Recipient & Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-slate-400">To:</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-rose-400 font-mono"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-mono text-slate-400">Subject:</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white focus:outline-none focus:border-rose-400 font-mono"
                  />
                </div>
              </div>

              {/* Body Area */}
              <div>
                <label className="text-[10px] font-mono text-slate-400">Email Body:</label>
                <textarea
                  rows={6}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="w-full p-3.5 rounded-2xl bg-black/40 border border-white/10 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-rose-400 font-sans resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "Copied to Clipboard!" : "Copy Email"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenMailClient}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Open Mail Client (mailto:)</span>
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
