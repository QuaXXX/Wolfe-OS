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
  Edit3,
  Barcode,
  Tag,
  ScanLine,
  Search,
  FileText,
  CheckCircle2
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { createMealEntry, calculateCaloriesFromMacros } from '../../utils/nutritionEngine.js';
import { 
  analyzeMealWithAI, 
  scanNutritionLabelWithAI, 
  lookupBarcodeOpenFoodFacts 
} from '../../utils/aiService.js';

export const SnapMealModal = ({
  isOpen,
  onClose,
  onLogMeal,
  initialMode = 'plate', // 'plate' | 'label'
  aiConfig = {},
  soundEnabled = true
}) => {
  const [scanMode, setScanMode] = useState(initialMode || 'plate');
  const [description, setDescription] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [analyzedMeal, setAnalyzedMeal] = useState(null);
  const [scannedLabel, setScannedLabel] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState('lunch');
  const [isListening, setIsListening] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // Sync mode and cleanup on open/close
  useEffect(() => {
    if (isOpen) {
      setScanMode(initialMode || 'plate');
      setAnalysisError(null);
    } else {
      stopCamera();
      resetState();
    }
  }, [isOpen, initialMode]);

  const resetState = () => {
    setDescription('');
    setImageBase64(null);
    setIsCameraActive(false);
    setIsAnalyzing(false);
    setAnalysisError(null);
    setAnalyzedMeal(null);
    setScannedLabel(null);
    setBarcodeInput('');
    setIsLookingUpBarcode(false);
    setServingMultiplier(1);
    setIsListening(false);
  };

  // Live Barcode Detection Loop (when camera is on in label mode)
  useEffect(() => {
    if (!isCameraActive || scanMode !== 'label') return;
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) return;

    let active = true;
    let detector;
    try {
      detector = new window.BarcodeDetector({ 
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'] 
      });
    } catch (e) {
      return;
    }

    const interval = setInterval(async () => {
      if (!active || !videoRef.current || isAnalyzing || isLookingUpBarcode) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
          const code = barcodes[0].rawValue;
          active = false;
          clearInterval(interval);
          handleBarcodeDetected(code);
        }
      } catch (err) {}
    }, 600);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isCameraActive, scanMode, isAnalyzing, isLookingUpBarcode]);

  const handleBarcodeDetected = async (code) => {
    if (!code) return;
    playSound('click', soundEnabled);
    setIsLookingUpBarcode(true);
    setAnalysisError(null);
    try {
      const product = await lookupBarcodeOpenFoodFacts(code);
      if (product) {
        playSound('success', soundEnabled);
        setScannedLabel(product);
        setServingMultiplier(1);
        stopCamera();
      } else {
        setAnalysisError(`Barcode ${code} found, but product is not in database. Snap a photo of the Nutrition Facts label for exact reading.`);
      }
    } catch (e) {
      setAnalysisError("Barcode lookup failed. Please take a photo of the Nutrition Facts label directly.");
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  const handleManualBarcodeSubmit = (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    handleBarcodeDetected(barcodeInput.trim());
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
  const handleAnalyze = async () => {
    playSound('click', soundEnabled);
    setIsAnalyzing(true);
    setAnalysisError(null);

    if (scanMode === 'label') {
      if (!imageBase64) {
        setAnalysisError("Please snap or upload a photo of the Nutrition Facts panel or barcode.");
        setIsAnalyzing(false);
        return;
      }
      try {
        const result = await scanNutritionLabelWithAI({
          imageBase64,
          mimeType: imageMimeType,
          aiConfig
        });
        if (!result.hasLabel) {
          setAnalysisError(result.errorMessage || "Could not read Nutrition Facts label. Please ensure the label is well-lit and clear.");
          playSound('click', soundEnabled);
        } else {
          setScannedLabel(result);
          setServingMultiplier(1);
          playSound('success', soundEnabled);
        }
      } catch (err) {
        setAnalysisError("Label scan encountered an error. Please try again or type the items directly.");
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      // Plate Mode
      if (!description.trim() && !imageBase64) {
        setAnalysisError("Please provide a photo or describe what you are eating (e.g. '200g chicken breast, 1.5 cups white rice, 2 eggs').");
        setIsAnalyzing(false);
        return;
      }

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
    }
  };

  // Itemized Editing Handlers for Plate Mode
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
      name: "New Item",
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

  // Confirm and Log Plate Meal
  const handleConfirmLogPlate = () => {
    if (!analyzedMeal) return;
    playSound('success', soundEnabled);

    const meal = createMealEntry({
      name: analyzedMeal.name || "Logged Meal",
      slot: selectedSlot,
      calories: analyzedMeal.calories,
      protein: analyzedMeal.protein,
      carbs: analyzedMeal.carbs,
      fats: analyzedMeal.fats,
      items: analyzedMeal.items.map(it => `${it.portion || '1 serving'} ${it.name} (${it.calories} kcal, ${it.protein}g P)`)
    });

    onLogMeal(meal);
    onClose();
  };

  // Confirm and Log Scanned Label / Barcode Item
  const handleConfirmLogLabel = () => {
    if (!scannedLabel) return;
    playSound('success', soundEnabled);

    const qty = Math.max(0.25, Number(servingMultiplier) || 1);
    const totCal = Math.round(scannedLabel.calories * qty);
    const totP = Math.round(scannedLabel.protein * qty);
    const totC = Math.round(scannedLabel.carbs * qty);
    const totF = Math.round(scannedLabel.fats * qty);

    const title = scannedLabel.productName || "Scanned Item";
    const itemDesc = `${qty !== 1 ? `${qty}x ` : ''}${scannedLabel.servingSize || '1 serving'} ${title} (${totCal} kcal, ${totP}g P, ${totC}g C, ${totF}g F)`;

    const meal = createMealEntry({
      name: `${qty !== 1 ? `${qty}x ` : ''}${title}`,
      slot: selectedSlot,
      calories: totCal,
      protein: totP,
      carbs: totC,
      fats: totF,
      items: [itemDesc]
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
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/75 backdrop-blur-xl"
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
                {scanMode === 'label' ? (
                  <Barcode className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Camera className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>{scanMode === 'label' ? 'Label & Barcode Scanner' : 'AI Meal & Plate Scanner'}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/10">
                    {scanMode === 'label' ? 'Nutrition Facts OCR' : 'Multimodal Vision'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {scanMode === 'label' 
                    ? 'Scan printed Nutrition Facts on packaging or scan barcode' 
                    : 'Describe or snap cooked meals on your plate to calculate macros'}
                </p>
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

          {/* Mode Tabs: Meal Plate vs Nutrition Label & Barcode */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setScanMode('plate');
                setAnalysisError(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scanMode === 'plate'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" />
              <span>🍽️ Plate & Meal Vision</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setScanMode('label');
                setAnalysisError(null);
              }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                scanMode === 'label'
                  ? 'bg-white/10 text-white shadow-sm font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Barcode className="w-3.5 h-3.5 text-slate-400" />
              <span>🏷️ Nutrition Label & Barcode</span>
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

                {/* Reticle Overlay */}
                <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/20 m-6 sm:m-10 rounded-2xl flex flex-col items-center justify-center">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-white/40 absolute top-0 left-0 rounded-tl-xl" />
                  <div className="w-8 h-8 border-t-2 border-r-2 border-white/40 absolute top-0 right-0 rounded-tr-xl" />
                  <div className="w-8 h-8 border-b-2 border-l-2 border-white/40 absolute bottom-0 left-0 rounded-bl-xl" />
                  <div className="w-8 h-8 border-b-2 border-r-2 border-white/40 absolute bottom-0 right-0 rounded-br-xl" />

                  {scanMode === 'label' && (
                    <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-300 flex items-center gap-1.5 shadow-lg">
                      <ScanLine className="w-3 h-3 animate-pulse text-slate-400" />
                      <span>Align Nutrition Facts or Barcode</span>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSnapPhoto}
                    className="px-5 py-2.5 rounded-full bg-white text-black font-bold text-xs shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4 text-black" />
                    <span>{scanMode === 'label' ? 'Capture Label' : 'Take Photo'}</span>
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
                  alt="Preview"
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
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer shadow-sm"
                  >
                    <Camera className="w-4 h-4 text-slate-400" />
                    <span>{scanMode === 'label' ? 'Scan Label with Camera' : 'Take Photo with Camera'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4 text-slate-400" />
                    <span>Upload from Photos</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  {scanMode === 'label' 
                    ? 'Take a photo of the Nutrition Facts panel or barcode on granola bars, packages, or wrappers'
                    : 'Clear top-down photos of meals yield the most accurate macro estimation'}
                </p>
              </div>
            )}
          </div>

          {/* Quick Barcode Number Lookup (when in Label mode) */}
          {scanMode === 'label' && (
            <form onSubmit={handleManualBarcodeSubmit} className="flex items-center gap-2 p-2 rounded-xl bg-black/40 border border-white/10">
              <Barcode className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
              <input
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Enter Barcode / UPC number (e.g. 016000275270)..."
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 font-mono outline-none"
              />
              <button
                type="submit"
                disabled={isLookingUpBarcode || !barcodeInput.trim()}
                className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/15 text-xs font-semibold flex items-center gap-1 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
              >
                {isLookingUpBarcode ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                <span>Lookup</span>
              </button>
            </form>
          )}

          {/* Plate Mode: Description input with voice dictation */}
          {scanMode === 'plate' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" />
                  <span>Meal Details & Ingredients (Optional Voice or Text)</span>
                </label>

                <button
                  type="button"
                  onClick={toggleListening}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                    isListening 
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse' 
                      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5'
                  }`}
                  title="Click to dictate what you are eating"
                >
                  {isListening ? <MicOff className="w-3 h-3 text-red-400" /> : <Mic className="w-3 h-3 text-slate-400" />}
                  <span>{isListening ? 'Listening...' : 'Voice Dictate'}</span>
                </button>
              </div>

              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., 2 eggs, 1 apple, and 1 granola bar, or 200g chicken breast with 1.5 cups white rice..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-white/25 transition-all resize-none"
              />
            </div>
          )}

          {/* Action Button: Analyze Plate or Scan Label */}
          <div>
            <button
              type="button"
              disabled={isAnalyzing}
              onClick={handleAnalyze}
              className="w-full py-2.5 rounded-xl text-white font-semibold text-xs shadow-lg transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{scanMode === 'label' ? 'Scanning Nutrition Facts Label...' : 'Analyzing Ingredients & Calculating Macros...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{scanMode === 'label' ? 'Scan & Read Nutrition Facts' : 'Analyze Plate & Calculate Macros'}</span>
                </>
              )}
            </button>
          </div>

          {/* Error / Notice Banner */}
          {analysisError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Notice</div>
                <div className="text-[11px] text-rose-300/90 leading-relaxed mt-0.5">{analysisError}</div>
              </div>
            </div>
          )}

          {/* SCANNED LABEL RESULT CARD */}
          {scannedLabel && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-white/[0.03] border border-emerald-500/30 space-y-4"
            >
              {/* Product Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <input
                      type="text"
                      value={scannedLabel.productName}
                      onChange={(e) => setScannedLabel(prev => ({ ...prev, productName: e.target.value }))}
                      className="bg-transparent border-b border-white/20 text-white font-bold text-sm focus:outline-none focus:border-white/50 px-1 py-0.5"
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5 font-mono flex items-center gap-2">
                    <span>{scannedLabel.brand ? `${scannedLabel.brand} • ` : ''}Serving: {scannedLabel.servingSize || '1 serving'}</span>
                    {scannedLabel.barcodeNumber && (
                      <span className="text-emerald-400">UPC: {scannedLabel.barcodeNumber}</span>
                    )}
                  </div>
                </div>

                {/* Slot Selector */}
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

              {/* Servings Adjuster */}
              <div className="flex items-center justify-between bg-black/40 p-2.5 rounded-xl border border-white/5 text-xs">
                <span className="text-slate-300 font-medium">Number of Servings:</span>
                <div className="flex items-center gap-2 font-mono">
                  <button
                    type="button"
                    onClick={() => setServingMultiplier(prev => Math.max(0.25, prev - (prev > 1 ? 1 : 0.25)))}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center cursor-pointer"
                  >
                    -
                  </button>
                  <span className="text-white font-bold text-sm w-12 text-center">{servingMultiplier}x</span>
                  <button
                    type="button"
                    onClick={() => setServingMultiplier(prev => prev + (prev >= 1 ? 1 : 0.25))}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold flex items-center justify-center cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Nutrition Facts Macros Grid */}
              <div className="grid grid-cols-4 gap-2 text-center bg-black/60 p-3 rounded-xl border border-white/10 font-mono text-xs">
                <div>
                  <div className="text-white font-bold text-lg">
                    {Math.round(scannedLabel.calories * servingMultiplier)}
                  </div>
                  <div className="text-slate-500 text-[9px] uppercase">Calories</div>
                </div>
                <div>
                  <div className="text-emerald-400 font-bold text-lg">
                    {Math.round(scannedLabel.protein * servingMultiplier)}g
                  </div>
                  <div className="text-slate-500 text-[9px] uppercase">Protein</div>
                </div>
                <div>
                  <div className="text-sky-400 font-bold text-lg">
                    {Math.round(scannedLabel.carbs * servingMultiplier)}g
                  </div>
                  <div className="text-slate-500 text-[9px] uppercase">Carbs</div>
                </div>
                <div>
                  <div className="text-amber-400 font-bold text-lg">
                    {Math.round(scannedLabel.fats * servingMultiplier)}g
                  </div>
                  <div className="text-slate-500 text-[9px] uppercase">Fats</div>
                </div>
              </div>

              {(scannedLabel.fiber != null || scannedLabel.sugar != null) && (
                <div className="flex items-center justify-between px-3 text-[11px] font-mono text-slate-400 border-t border-white/5 pt-2">
                  {scannedLabel.fiber != null && (
                    <span>Fiber: <strong className="text-slate-200">{Math.round(scannedLabel.fiber * servingMultiplier)}g</strong></span>
                  )}
                  {scannedLabel.sugar != null && (
                    <span>Sugars: <strong className="text-slate-200">{Math.round(scannedLabel.sugar * servingMultiplier)}g</strong></span>
                  )}
                  <span>Source: {scannedLabel.notes || 'Nutrition Facts'}</span>
                </div>
              )}

              {/* Confirm & Log Button */}
              <button
                type="button"
                onClick={handleConfirmLogLabel}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Log Scanned Food ({Math.round(scannedLabel.calories * servingMultiplier)} kcal)</span>
              </button>
            </motion.div>
          )}

          {/* ANALYZED PLATE RESULT */}
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
                onClick={handleConfirmLogPlate}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-lg transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirm & Log Plate Meal to Daily Tracker</span>
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
