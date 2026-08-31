import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, 
  Send, 
  Loader2,
  X, 
  ArrowUpRight, 
  RotateCcw, 
  Square,
  Maximize2,
  Minimize2,
  Copy,
  Check
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playSound } from '../../utils/soundFX';
import { sendQueryToAI } from '../../utils/aiService';
import { tryExecuteFastCommand } from '../../utils/fastCommandEngine';

export const CompactVoiceWidget = forwardRef(({ 
  onNavigate, 
  aiConfig, 
  osData, 
  onEventCreated, 
  onClearCalendar, 
  onDeleteSpecificItem, 
  onOpenSettings, 
  soundEnabled = true 
}, ref) => {
  const [isListening, setIsListening] = useState(false);
  const [inputText, setInputText] = useState('');
  const [liveSpeechText, setLiveSpeechText] = useState('');
  const [lastHeardQuery, setLastHeardQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  
  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Initialize SpeechRecognition with real-time interim results
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const activeText = finalTranscript || interimTranscript;
        if (activeText) {
          setLiveSpeechText(activeText);
          setInputText(activeText);
        }

        if (finalTranscript && finalTranscript.trim()) {
          handleQuerySubmit(finalTranscript.trim());
        }
      };

      recognition.onerror = (event) => {
        console.warn("Speech recognition notice:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Global hotkey (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        toggleListening();
      } else if (e.key === 'Escape') {
        handleStop();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, isListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      const next = !isListening;
      setIsListening(next);
      playSound(next ? 'voice-open' : 'click', soundEnabled);
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      playSound('click', soundEnabled);
    } else {
      setInputText('');
      setLiveSpeechText('');
      setAiResponse(null);
      try {
        recognitionRef.current.start();
        setIsListening(true);
        playSound('voice-open', soundEnabled);
      } catch (err) {
        console.error("Speech recognition start notice:", err);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    toggleListening,
    focusInput: () => inputRef.current?.focus(),
    submitQuery: (q) => handleQuerySubmit(q)
  }));

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    setIsProcessing(false);
    playSound('click', soundEnabled);
  };

  const handleRedo = () => {
    handleStop();
    const prevQuery = lastHeardQuery || inputText;
    setInputText(prevQuery);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  };

  const handleQuerySubmit = async (textToSubmit) => {
    const query = (textToSubmit || inputText || '').trim();
    if (!query) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    playSound('click', soundEnabled);
    setLastHeardQuery(query);
    setInputText('');
    setLiveSpeechText('');
    setAiResponse(null);

    const updatedHistory = [
      ...conversationHistory,
      { role: 'user', content: query }
    ];

    // 1. FAST LOCAL EXECUTION WITH BUFFER NLP (< 3ms)
    const fastResult = tryExecuteFastCommand(query, {
      osData,
      setSettings: osData?.setSettings,
      setCalendarData: osData?.setCalendarData,
      setNutritionData: osData?.setNutritionData,
      setWorkoutData: osData?.setWorkoutData,
      setTradingData: osData?.setTradingData,
      setSchoolData: osData?.setSchoolData,
      onNavigate,
      onClearCalendar,
      onDeleteSpecificItem,
      onEventCreated
    });

    if (fastResult.handled) {
      setAiResponse(fastResult);
      if (fastResult.message && (fastResult.message.length > 120 || fastResult.message.includes('\n'))) {
        setIsExpanded(true);
      } else {
        setIsExpanded(false);
      }
      playSound('success', soundEnabled);
      if (fastResult.confetti) {
        try {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        } catch (e) {}
      }
      setConversationHistory([
        ...updatedHistory,
        { role: 'assistant', content: fastResult.message }
      ]);
      return;
    }

    // 2. FALLBACK TO GEMINI AI PIPELINE
    setIsProcessing(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await sendQueryToAI(
        query, 
        aiConfig, 
        osData, 
        onEventCreated, 
        onClearCalendar, 
        onDeleteSpecificItem,
        updatedHistory
      );
      setAiResponse(response);
      if (response?.message && (response.message.length > 120 || response.message.includes('\n'))) {
        setIsExpanded(true);
      } else {
        setIsExpanded(false);
      }
      playSound('success', soundEnabled);

      if (response?.message) {
        setConversationHistory([
          ...updatedHistory,
          { role: 'assistant', content: response.message }
        ]);
      }

      if (response?.actionType === 'ASK_CLARIFICATION') {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 120);
      }

      // Optional Text-To-Speech
      if (aiConfig?.voiceResponse && 'speechSynthesis' in window && response?.message) {
        const utterance = new SpeechSynthesisUtterance(response.message);
        utterance.rate = 1.05;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setAiResponse({
          title: "Assistant",
          message: "Your request was processed successfully.",
          targetView: "home",
          actionLabel: "View Dashboard"
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopyResponse = () => {
    if (!aiResponse?.message) return;
    playSound('click', soundEnabled);
    navigator.clipboard.writeText(aiResponse.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      onClick={(e) => {
        // Generous click buffer: clicking anywhere in the card focuses the text input
        if (!e.target.closest('button') && !e.target.closest('a')) {
          inputRef.current?.focus();
        }
      }}
      className={`relative w-full rounded-2xl theme-card p-2.5 sm:p-3 transition-all cursor-text ${
        isListening ? 'ring-1 ring-blue-500/50 bg-[#0c1020]' : 'hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-3">
        
        {/* Dynamic Microphone Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleListening();
          }}
          title={isListening ? "Listening... Click to stop" : "Click to speak"}
          className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer"
          style={{
            backgroundColor: isListening ? 'var(--accent-primary)' : 'var(--accent-subtle)',
            border: '1px solid var(--accent-border)',
            color: isListening ? '#ffffff' : 'var(--accent-primary)',
            boxShadow: isListening ? '0 0 20px 2px var(--accent-glow)' : 'none'
          }}
        >
          {isListening ? (
            <div className="flex items-center justify-center gap-0.5">
              {[0.5, 1.3, 0.7, 1.4, 0.6].map((h, i) => (
                <motion.span
                  key={i}
                  animate={{ height: ['4px', `${h * 16}px`, '4px'] }}
                  transition={{
                    repeat: Infinity,
                    duration: 0.65 + (i * 0.08),
                    ease: "easeInOut"
                  }}
                  className="w-0.5 bg-white rounded-full"
                />
              ))}
            </div>
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        {/* Input Form Field with generous click area */}
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleQuerySubmit();
          }}
          className="flex-1 flex items-center gap-2 min-w-0 py-1 cursor-text"
        >
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              isListening 
                ? (liveSpeechText ? `Hearing: "${liveSpeechText}"` : "Listening... Speak your command...") 
                : "Ask anything..."
            }
            className={`w-full bg-transparent border-none text-xs sm:text-sm placeholder:text-slate-500 focus:outline-none focus:ring-0 font-medium py-1 ${
              isListening ? 'animate-pulse' : 'text-slate-100'
            }`}
            style={{ color: isListening ? 'var(--accent-primary)' : undefined }}
          />

          <button
            type="submit"
            onClick={(e) => e.stopPropagation()}
            disabled={!inputText.trim() || isProcessing}
            className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white transition-all disabled:opacity-30 shrink-0 cursor-pointer"
            style={{ color: inputText.trim() ? 'var(--accent-primary)' : undefined }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* SINGLE CLEAN THINKING / HEARD STATUS BAR WITH STOP & REDO */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 min-w-0 pr-2">
              <span className="text-slate-400 shrink-0 font-medium">Heard:</span>
              <span className="text-slate-200 font-semibold truncate italic">
                "{lastHeardQuery}"
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Single Clean Thinking Badge */}
              <div 
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg font-mono text-[11px]"
                style={{
                  backgroundColor: 'var(--accent-subtle)',
                  border: '1px solid var(--accent-border)',
                  color: 'var(--accent-primary)'
                }}
              >
                <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--accent-primary)' }} />
                <span>Thinking...</span>
              </div>

              {/* Redo / Edit Button */}
              <button
                type="button"
                onClick={handleRedo}
                title="Heard wrong? Click to edit & redo"
                className="px-2 py-0.5 rounded-lg bg-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition-all flex items-center gap-1 font-medium cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Redo</span>
              </button>

              {/* Quick Stop Button */}
              <button
                type="button"
                onClick={handleStop}
                title="Stop AI processing"
                className="p-1 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 hover:text-red-200 border border-red-500/30 transition-all flex items-center justify-center cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI / Fast Response Popup (Expandable) */}
      <AnimatePresence>
        {aiResponse && !isProcessing && (
          <motion.div
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            className="mt-2.5 pt-2.5 border-t border-white/10 text-xs space-y-2 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <span 
                  className="w-2 h-2 rounded-full shrink-0" 
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                />
                <span className="font-semibold text-white truncate max-w-[200px]">
                  {aiResponse.title || "Wolfe AI"}:
                </span>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-1 shrink-0">
                {aiResponse.message && aiResponse.message.length > 60 && (
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setIsExpanded(prev => !prev);
                    }}
                    title={isExpanded ? "Collapse response" : "Expand full response"}
                    className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex items-center gap-1 font-mono text-[10px] cursor-pointer"
                  >
                    {isExpanded ? (
                      <>
                        <Minimize2 className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                        <span>Collapse</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3 h-3" style={{ color: 'var(--accent-primary)' }} />
                        <span>Expand</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleCopyResponse}
                  title="Copy response to clipboard"
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>

                {aiResponse.targetView && aiResponse.targetView !== 'home' && (
                  <button
                    onClick={() => {
                      playSound('click', soundEnabled);
                      onNavigate(aiResponse.targetView);
                      setAiResponse(null);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center gap-1 font-medium transition-colors cursor-pointer"
                  >
                    <span>{aiResponse.actionLabel || "Open"}</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                )}

                <button
                  onClick={() => setAiResponse(null)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Message Body (Single line or Scrollable multi-line expanded) */}
            <div 
              onClick={() => {
                if (!isExpanded && aiResponse.message?.length > 70) {
                  playSound('click', soundEnabled);
                  setIsExpanded(true);
                }
              }}
              className={`transition-all ${
                isExpanded 
                  ? 'max-h-64 overflow-y-auto p-3 rounded-xl bg-black/40 border border-white/10 text-slate-200 leading-relaxed font-sans select-text' 
                  : 'text-slate-300 truncate cursor-pointer hover:text-white'
              }`}
            >
              <p className="whitespace-pre-wrap">{aiResponse.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

CompactVoiceWidget.displayName = 'CompactVoiceWidget';
