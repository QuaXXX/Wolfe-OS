import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  X, 
  Sparkles, 
  UploadCloud, 
  Check, 
  UtensilsCrossed, 
  Flame, 
  Plus, 
  Trash2, 
  RefreshCw,
  AlertCircle,
  Mic,
  MicOff,
  Edit3
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { createMealEntry } from '../../utils/nutritionEngine.js';
import { analyzeMealWithAI } from '../../utils/aiService.js';

export const SnapMealModal = ({
  isOpen,
  onClose,
  onLogMeal,
  aiConfig = {},
  soundEnabled = true
}) => {
  const [description, setDescription] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [analyzedMeal, setAnalyzedMeal] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState('lunch');
  const [isListening, setIsListening] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // Stop camera on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      resetState();
    }
  }, [isOpen]);

  const resetState = () => {
    setDescription('');
    setImageBase64(null);
    setIsCameraActive(false);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setAnalyzedMeal(null);
    setIsListening(false);
  };

  const handleTriggerCamera = async () => {
    playSound('click', soundEnabled);
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext) {
      try {
        await startCamera();
        return;
      } catch (err) {
        console.warn("Direct webcam failed, falling back to native camera capture:", err);
      }
    }
    // Mobile or fallback: trigger native device camera
    cameraInputRef.current?.click();
  };

  const startCamera = async () => {
    playSound('click', soundEnabled);
    try {
      setIsCameraActive(true);
      setAnalysisError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn("Camera access failed:", err);
      setIsCameraActive(false);
      cameraInputRef.current?.click();
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const handleSnapPhoto = () => {
    if (!videoRef.current) return;
    playSound('click', soundEnabled);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setImageBase64(dataUrl);
      setImageMimeType('image/jpeg');
      stopCamera();
      playSound('success', soundEnabled);
    } catch (err) {
      console.warn("Snap photo error:", err);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    playSound('click', soundEnabled);

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageBase64(event.target.result);
      setImageMimeType(file.type || 'image/jpeg');
      stopCamera();
      setAnalysisError(null);
      playSound('success', soundEnabled);
    };
    reader.readAsDataURL(file);
  };

  // Speech to Text support
  const toggleListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setAnalysisError("Voice dictation is not supported in this browser. Please type what you are eating.");
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        playSound('click', soundEnabled);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setDescription(prev => (prev ? `${prev}, ${transcript}` : transcript));
        setIsListening(false);
        playSound('success', soundEnabled);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  // Main Analysis Handler
  const handleAnalyzeMeal = async () => {
    if (!description.trim() && !imageBase64) {
      setAnalysisError("Please provide a photo or describe what you are eating (e.g. '200g chicken breast, 1.5 cups white rice').");
      return;
    }

    playSound('click', soundEnabled);
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalyzedMeal(null);

    try {
      const result = await analyzeMealWithAI({
        imageBase64,
        mimeType: imageMimeType,
        description: description.trim(),
        aiConfig
      });

      if (!result.hasFood) {
        setAnalysisError(result.errorMessage || "No food detected. Please take a clear picture of your plate or describe what you are eating.");
        playSound('click', soundEnabled);
      } else {
        setAnalyzedMeal({
          name: result.name || "Analyzed Meal",
          items: result.items || [],
          calories: result.calories || 0,
          protein: result.protein || 0,
          carbs: result.carbs || 0,
          fats: result.fats || 0,
          notes: result.notes || ""
        });
        playSound('success', soundEnabled);
      }
    } catch (err) {
      setAnalysisError("Analysis encountered an error. Please describe the items directly.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Itemized Editing Handlers
  const handleItemChange = (index, field, value) => {
    if (!analyzedMeal) return;
    const nextItems = [...analyzedMeal.items];
    const item = { ...nextItems[index] };

    if (field === 'name' || field === 'portion') {
      item[field] = value;
    } else {
      item[field] = Math.max(0, parseInt(value, 10) || 0);
    }

    nextItems[index] = item;

    // Recalculate totals
    const totCal = nextItems.reduce((acc, it) => acc + (Number(it.calories) || 0), 0);
    const totP = nextItems.reduce((acc, it) => acc + (Number(it.protein) || 0), 0);
    const totC = nextItems.reduce((acc, it) => acc + (Number(it.carbs) || 0), 0);
    const totF = nextItems.reduce((acc, it) => acc + (Number(it.fats) || 0), 0);

    setAnalyzedMeal(prev => ({
      ...prev,
      items: nextItems,
      calories: totCal,
      protein: totP,
      carbs: totC,
      fats: totF
    }));
  };

  const handleAddItem = () => {
    if (!analyzedMeal) return;
    const newItem = {
      name: "New Ingredient",
      portion: "1 serving",
      calories: 100,
      protein: 10,
      carbs: 10,
      fats: 2
    };
    const nextItems = [...analyzedMeal.items, newItem];
    setAnalyzedMeal(prev => ({
      ...prev,
      items: nextItems,
      calories: prev.calories + newItem.calories,
      protein: prev.protein + newItem.protein,
      carbs: prev.carbs + newItem.carbs,
      fats: prev.fats + newItem.fats
    }));
  };

  const handleDeleteItem = (index) => {
    if (!analyzedMeal) return;
    const nextItems = analyzedMeal.items.filter((_, i) => i !== index);
    const totCal = nextItems.reduce((acc, it) => acc + (Number(it.calories) || 0), 0);
    const totP = nextItems.reduce((acc, it) => acc + (Number(it.protein) || 0), 0);
    const totC = nextItems.reduce((acc, it) => acc + (Number(it.carbs) || 0), 0);
    const totF = nextItems.reduce((acc, it) => acc + (Number(it.fats) || 0), 0);

    setAnalyzedMeal(prev => ({
      ...prev,
      items: nextItems,
      calories: totCal,
      protein: totP,
      carbs: totC,
      fats: totF
    }));
  };

  const handleConfirmLog = () => {
    if (!analyzedMeal) return;
    playSound('success', soundEnabled);

    const meal = createMealEntry({
      name: analyzedMeal.name,
      slot: selectedSlot,
      calories: analyzedMeal.calories,
      protein: analyzedMeal.protein,
      carbs: analyzedMeal.carbs,
      fats: analyzedMeal.fats,
      items: analyzedMeal.items.map(it => `${it.portion} ${it.name} (${it.protein}g P)`)
    });

    onLogMeal(meal);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-4 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/70 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-5 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04]"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <Camera className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>AI Meal & Food Scanner</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    High Accuracy
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Describe or snap what you are eating to calculate exact ingredient macros</p>
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

          {/* 1. Camera / Photo Viewport */}
          <div className="relative rounded-2xl bg-black/60 border border-white/10 overflow-hidden">
            {isCameraActive ? (
              <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/20 m-6 rounded-2xl flex items-center justify-center">
                  <div className="w-10 h-10 border-t-2 border-l-2 border-white/40 absolute top-0 left-0 rounded-tl-xl" />
                  <div className="w-10 h-10 border-t-2 border-r-2 border-white/40 absolute top-0 right-0 rounded-tr-xl" />
                  <div className="w-10 h-10 border-b-2 border-l-2 border-white/40 absolute bottom-0 left-0 rounded-bl-xl" />
                  <div className="w-10 h-10 border-b-2 border-r-2 border-white/40 absolute bottom-0 right-0 rounded-br-xl" />
                </div>

                <div className="absolute bottom-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSnapPhoto}
                    className="px-5 py-2.5 rounded-full bg-white text-black font-bold text-xs shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-black" />
                    <span>Take Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-2.5 rounded-full bg-white/20 text-white font-medium text-xs hover:bg-white/30 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : imageBase64 ? (
              <div className="relative aspect-video w-full bg-black/40 flex items-center justify-center p-2">
                <img
                  src={imageBase64}
                  alt="Meal preview"
                  className="max-h-full max-w-full rounded-xl object-contain shadow-lg"
                />
                <button
                  type="button"
                  onClick={() => setImageBase64(null)}
                  className="absolute top-4 right-4 p-1.5 rounded-xl bg-black/70 hover:bg-rose-500/80 text-white transition-all cursor-pointer"
                  title="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="p-5 text-center space-y-3">
                <div className="flex items-center justify-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleTriggerCamera}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 text-xs font-semibold border border-purple-500/30 transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    <Camera className="w-4 h-4 text-purple-400" />
                    <span>Take Photo with Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4 text-sky-400" />
                    <span>Upload from Photos</span>
                  </button>

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Optional: Snap your plate or upload an image. The AI inspects actual food items with zero fabricated assumptions.
                </p>
              </div>
            )}
          </div>

          {/* 2. Custom Meal Description Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>What are you eating?</span>
                <span className="text-[10px] text-slate-400 font-normal font-mono">(Ingredients & Portions)</span>
              </label>

              <button
                type="button"
                onClick={toggleListening}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                  isListening
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse'
                    : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/5'
                }`}
              >
                {isListening ? <MicOff className="w-3 h-3 text-rose-400" /> : <Mic className="w-3 h-3 text-slate-400" />}
                <span>{isListening ? 'Listening...' : 'Voice Dictate'}</span>
              </button>
            </div>

            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 200g chicken breast, 1.5 cups white rice, 2 whole eggs, and 1 tbsp olive oil"
              rows={2}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-white/25 transition-all resize-none"
            />
          </div>

          {/* 3. Analyze Action */}
          <div>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={handleAnalyzeMeal}
              className="w-full py-2.5 rounded-xl text-white font-semibold text-xs shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyzing Ingredients & Calculating Macros...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze Meal & Calculate Protein</span>
                </>
              )}
            </button>
          </div>

          {/* 4. Error / Notice Banner */}
          {analysisError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Notice</div>
                <div className="text-[11px] text-rose-300/90 leading-relaxed mt-0.5">{analysisError}</div>
              </div>
            </div>
          )}

          {/* 5. Analyzed Result with Itemized Customization */}
          {analyzedMeal && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4"
            >
              {/* Header Title & Slot Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/10">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
                    <input
                      type="text"
                      value={analyzedMeal.name}
                      onChange={(e) => setAnalyzedMeal(prev => ({ ...prev, name: e.target.value }))}
                      className="bg-transparent border-b border-white/20 text-white font-bold text-sm focus:outline-none focus:border-white/50 px-1 py-0.5"
                    />
                  </div>
                  {analyzedMeal.notes && (
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{analyzedMeal.notes}</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 uppercase font-mono">Slot:</span>
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="bg-white/10 border border-white/15 rounded-lg text-xs text-white px-2 py-1 font-mono focus:outline-none"
                  >
                    <option value="breakfast" className="bg-slate-900">Breakfast</option>
                    <option value="lunch" className="bg-slate-900">Lunch</option>
                    <option value="dinner" className="bg-slate-900">Dinner</option>
                    <option value="post_workout" className="bg-slate-900">Post-Workout</option>
                    <option value="snack" className="bg-slate-900">Snacks</option>
                  </select>
                </div>
              </div>

              {/* Itemized Breakdown Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Itemized Ingredient Breakdown:</span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Item</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {analyzedMeal.items.map((item, idx) => (
                    <div 
                      key={idx}
                      className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 min-w-[140px]">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                          className="bg-transparent border-b border-white/10 text-white font-semibold text-xs focus:outline-none focus:border-white/40 w-full"
                        />
                        <input
                          type="text"
                          value={item.portion}
                          onChange={(e) => handleItemChange(idx, 'portion', e.target.value)}
                          className="bg-transparent text-slate-400 text-[10px] font-mono focus:outline-none w-full mt-0.5"
                          placeholder="Portion"
                        />
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <div className="text-center">
                          <input
                            type="number"
                            value={item.calories}
                            onChange={(e) => handleItemChange(idx, 'calories', e.target.value)}
                            className="w-14 text-center bg-white/5 rounded border border-white/10 text-white font-bold py-0.5 focus:outline-none"
                          />
                          <div className="text-[9px] text-slate-500 uppercase">kcal</div>
                        </div>

                        <div className="text-center">
                          <input
                            type="number"
                            value={item.protein}
                            onChange={(e) => handleItemChange(idx, 'protein', e.target.value)}
                            className="w-12 text-center bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-300 font-bold py-0.5 focus:outline-none"
                          />
                          <div className="text-[9px] text-slate-500 uppercase">Prot (g)</div>
                        </div>

                        <div className="text-center">
                          <input
                            type="number"
                            value={item.carbs}
                            onChange={(e) => handleItemChange(idx, 'carbs', e.target.value)}
                            className="w-12 text-center bg-sky-500/10 rounded border border-sky-500/20 text-sky-300 font-bold py-0.5 focus:outline-none"
                          />
                          <div className="text-[9px] text-slate-500 uppercase">Carb (g)</div>
                        </div>

                        <div className="text-center">
                          <input
                            type="number"
                            value={item.fats}
                            onChange={(e) => handleItemChange(idx, 'fats', e.target.value)}
                            className="w-12 text-center bg-amber-500/10 rounded border border-amber-500/20 text-amber-300 font-bold py-0.5 focus:outline-none"
                          />
                          <div className="text-[9px] text-slate-500 uppercase">Fat (g)</div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(idx)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Macros Summary Bar */}
              <div className="grid grid-cols-4 gap-2 text-center bg-black/60 p-2.5 rounded-xl border border-white/10 font-mono text-xs">
                <div>
                  <div className="text-white font-bold text-base">{analyzedMeal.calories}</div>
                  <div className="text-slate-500 text-[9px] uppercase">Calories</div>
                </div>
                <div>
                  <div className="text-emerald-400 font-bold text-base">{analyzedMeal.protein}g</div>
                  <div className="text-slate-500 text-[9px] uppercase">Protein</div>
                </div>
                <div>
                  <div className="text-sky-400 font-bold text-base">{analyzedMeal.carbs}g</div>
                  <div className="text-slate-500 text-[9px] uppercase">Carbs</div>
                </div>
                <div>
                  <div className="text-amber-400 font-bold text-base">{analyzedMeal.fats}g</div>
                  <div className="text-slate-500 text-[9px] uppercase">Fats</div>
                </div>
              </div>

              {/* Confirm Log Button */}
              <button
                type="button"
                onClick={handleConfirmLog}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Log Meal to Daily Tracker</span>
              </button>
            </motion.div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};
