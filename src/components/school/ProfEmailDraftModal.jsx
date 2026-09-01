import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Send, 
  Copy, 
  Check, 
  X, 
  Loader2, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { draftProfEmailWithAI } from '../../utils/aiService';
import { playSound } from '../../utils/soundFX';

export const ProfEmailDraftModal = ({ 
  isOpen, 
  onClose, 
  courseCode = "",
  instructorName = "",
  instructorEmail = "",
  sectionCode = "",
  syllabusContext = "",
  soundEnabled = true 
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [recipient, setRecipient] = useState(instructorEmail);
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRecipient(instructorEmail || 'instructor@university.edu');
      setCopied(false);
      setSubject('');
      setEmailBody('');
      setPromptInput('');
    }
  }, [isOpen, courseCode, instructorEmail]);

  const handleGenerateEmail = async (e) => {
    if (e) e.preventDefault();
    if (!promptInput.trim() || isGenerating) return;

    setIsGenerating(true);
    setCopied(false);
    playSound('click', soundEnabled);

    try {
      const draft = await draftProfEmailWithAI({
        courseCode: courseCode || "Course",
        instructorName: instructorName || "Professor",
        instructorEmail: recipient,
        sectionCode,
        reason: "Student Inquiry",
        details: promptInput.trim(),
        syllabusContext,
        studentName: "Zach Wolfe"
      });

      if (draft) {
        setSubject(draft.subject || `[${courseCode}] Inquiry - Zach Wolfe`);
        setEmailBody(draft.body ? `${draft.salutation || ''}\n\n${draft.body}` : '');
        if (draft.recipientEmail) setRecipient(draft.recipientEmail);
        playSound('success', soundEnabled);
      }
    } catch (err) {
      console.warn("Email draft generation error:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    playSound('click', soundEnabled);
    navigator.clipboard.writeText(`To: ${recipient}\nSubject: ${subject}\n\n${emailBody}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenMailClient = () => {
    playSound('click', soundEnabled);
    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(mailtoUrl, '_blank');
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
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-6 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl z-10 space-y-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Prof-Ready Email Drafter
                </h3>
                <p className="text-xs text-slate-400">Describe what you need and AI will draft a formal, polite email</p>
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
                  placeholder="e.g. Ask for clarification on problem set 3 question 2, or request office hours meeting..."
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
