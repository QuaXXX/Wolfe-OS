import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mail, 
  Send, 
  Copy, 
  Check, 
  Sparkles, 
  X, 
  Loader2, 
  AlertCircle, 
  BookOpen,
  UserCheck
} from 'lucide-react';
import { draftProfEmailWithAI } from '../../utils/aiService';
import { playSound } from '../../utils/soundFX';

const EMAIL_REASONS = [
  { id: 'Regrade Request', label: '📝 Regrade / Remark Request', defaultDetails: 'Requesting a regrade on Quiz 2 question 4 regarding cash flow discounting.' },
  { id: 'Office Hours', label: '⏰ Office Hours Meeting', defaultDetails: 'Requesting a 10-minute meeting during office hours to discuss midterm preparation.' },
  { id: 'Assignment Clarification', label: '❓ Assignment Question Clarification', defaultDetails: 'Seeking clarification on problem set 3 question 2 requirements.' },
  { id: 'Absence Notification', label: '🤒 Absence / Illness Notification', defaultDetails: 'Notifying about absence from lecture due to illness and requesting slides.' },
  { id: 'Extension Request', label: '⏳ Deadline Extension Request', defaultDetails: 'Respectfully requesting a 24-hour extension on the group project deliverable.' }
];

export const ProfEmailDraftModal = ({ 
  isOpen, 
  onClose, 
  courseCode = "FNCE 317",
  instructorName = "Dr. Marcus Vance",
  instructorEmail = "mvance@university.edu",
  sectionCode = "L04",
  syllabusContext = "",
  soundEnabled = true 
}) => {
  const [selectedReason, setSelectedReason] = useState(EMAIL_REASONS[0].id);
  const [customDetails, setCustomDetails] = useState(EMAIL_REASONS[0].defaultDetails);
  const [recipient, setRecipient] = useState(instructorEmail);
  const [subject, setSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [policyNote, setPolicyNote] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRecipient(instructorEmail || 'instructor@university.edu');
      setCopied(false);
      handleGenerateEmail(selectedReason, customDetails);
    }
  }, [isOpen, courseCode]);

  const handleReasonChange = (reasonId) => {
    playSound('click', soundEnabled);
    setSelectedReason(reasonId);
    const found = EMAIL_REASONS.find(r => r.id === reasonId);
    const newDetails = found?.defaultDetails || '';
    setCustomDetails(newDetails);
    handleGenerateEmail(reasonId, newDetails);
  };

  const handleGenerateEmail = async (reason = selectedReason, details = customDetails) => {
    setIsGenerating(true);
    setCopied(false);
    playSound('click', soundEnabled);

    try {
      const draft = await draftProfEmailWithAI({
        courseCode,
        instructorName,
        instructorEmail: recipient,
        sectionCode,
        reason,
        details,
        syllabusContext,
        studentName: "Zach Wolfe"
      });

      if (draft) {
        setSubject(draft.subject || `[${courseCode}-${sectionCode}] ${reason} - Zach Wolfe`);
        setEmailBody(draft.body ? `${draft.salutation || ''}\n\n${draft.body}` : '');
        setPolicyNote(draft.syllabusPolicyNote || '');
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
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-rose-500/10 border border-rose-500/30 text-rose-400"
              >
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Syllabus-Compliant Email Drafter</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">
                    Prof Ready
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Auto-formats subject line, etiquette & syllabus policies for {courseCode}</p>
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

          {/* Reason Selector Chips */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Select Email Purpose:
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {EMAIL_REASONS.map(r => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleReasonChange(r.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    selectedReason === r.id
                      ? 'bg-rose-500/20 border-rose-400 text-rose-200 shadow-sm'
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] text-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Situation Context Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Specific Situation / Notes (Optional):
            </label>
            <input
              type="text"
              value={customDetails}
              onChange={(e) => setCustomDetails(e.target.value)}
              placeholder="e.g. Asking for clarification on Question 4 regarding WACC..."
              className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400"
            />
          </div>

          {/* Policy Banner */}
          {policyNote && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-xs text-amber-200">
              <UserCheck className="w-4 h-4 shrink-0 text-amber-400" />
              <span>{policyNote}</span>
            </div>
          )}

          {/* Generated Email Form */}
          {isGenerating ? (
            <div className="min-h-[160px] rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
              <div className="text-xs font-bold text-white">Drafting Formal Email with Gemini...</div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
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
                  <label className="text-[10px] font-mono text-slate-400">Subject (Syllabus Formatted):</label>
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
                  <span>Open in Mail App (mailto:)</span>
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
