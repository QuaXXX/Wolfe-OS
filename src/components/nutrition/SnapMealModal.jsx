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
  ScanLine,
  Search,
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
  aiConfig = {},
  soundEnabled = true
}) => {
  const [description, setDescription] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);
  const [analyzedMeal, setAnalyzedMeal] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState('lunch');
  const [isListening, setIsListening] = useState(false);
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState('prompt'); // 'prompt' | 'granted' | 'denied'

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // Sync state, check camera permission, and cleanup on open/close
  useEffect(() => {
    if (isOpen) {
      setAnalysisError(null);
      if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'camera' })
          .then(res => {
            setCameraPermissionStatus(res.state);
            res.onchange = () => {
              setCameraPermissionStatus(res.state);
            };
          })
          .catch(() => {});
      }
    } else {
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
    setBarcodeInput('');
    setIsLookingUpBarcode(false);
    setIsListening(false);
  };

  // Live Barcode Detection Loop (when camera is on)
  useEffect(() => {
    if (!isCameraActive) return;
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
          playSound('success', soundEnabled);
          stopCamera();
          setIsLookingUpBarcode(true);
          const prod = await lookupBarcodeOpenFoodFacts(code);
          if (prod && prod.hasLabel) {
            setAnalyzedMeal({
              name: prod.productName,
              items: [
                {
                  name: prod.productName,
                  portion: prod.servingSize || "1 serving",
                  calories: prod.calories,
                  protein: prod.protein,
                  carbs: prod.carbs,
                  fats: prod.fats
                }
              ],
              calories: prod.calories,
              protein: prod.protein,
              carbs: prod.carbs,
              fats: prod.fats,
              notes: `Scanned Barcode (${code})`
            });
          }
          setIsLookingUpBarcode(false);
        }
      } catch (e) {}
    }, 700);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isCameraActive, isAnalyzing, isLookingUpBarcode]);

  // Camera stream controls
  const startCamera = async (overrideFacing) => {
    playSound('click', soundEnabled);
    setAnalysisError(null);
    const targetFacing = overrideFacing || facingMode;

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints = {
        video: {
          facingMode: { ideal: targetFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsCameraActive(true);
      setCameraPermissionStatus('granted');
    } catch (err) {
      console.warn("Camera start failed:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraPermissionStatus('denied');
        setAnalysisError("Camera access was blocked. Tap 'Phone Camera (Direct)' below to use your native phone camera, or upload a photo.");
      } else {
        setAnalysisError("Could not access camera device. Tap 'Phone Camera (Direct)' or upload an image.");
      }
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (isCameraActive) {
      startCamera(nextMode);
    }
  };

  const handleSnapPhoto = () => {
    if (!videoRef.current) return;
    playSound('click', soundEnabled);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const base64 = canvas.toDataURL('image/jpeg', 0.88);
      setImageBase64(base64);
      setImageMimeType('image/jpeg');
      stopCamera();
      playSound('success', soundEnabled);
    } catch (err) {
      setAnalysisError("Failed to capture snapshot. Please try uploading a photo.");
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

  // Unified Analysis Handler (Scans plates, packages, labels, or text in one pass)
  const handleAnalyze = async () => {
    playSound('click', soundEnabled);
    setIsAnalyzing(true);
    setAnalysisError(null);

    if (!description.trim() && !imageBase64) {
      setAnalysisError("Please take a photo, upload an image, or describe your food (e.g. '1 peanutbutter toast', 'chicken breast with rice').");
      setIsAnalyzing(false);
      return;
    }

    try {
      // 1. Primary Unified Scan via Gemini Vision / Nutrition Engine
      const result = await analyzeMealWithAI({
        imageBase64,
        mimeType: imageMimeType,
        description: description.trim(),
        aiConfig
      });

      if (result.hasFood && Array.isArray(result.items) && result.items.length > 0) {
        setAnalyzedMeal(result);
        playSound('success', soundEnabled);
        setIsAnalyzing(false);
        return;
      }

      // 2. If no plate food was recognized but an image was provided, inspect for Nutrition Facts label
      if (imageBase64) {
        const labelResult = await scanNutritionLabelWithAI({
          imageBase64,
          mimeType: imageMimeType,
          aiConfig
        });

        if (labelResult.hasLabel) {
          const itemTitle = labelResult.productName || "Scanned Food Item";
          setAnalyzedMeal({
            name: itemTitle,
            items: [
              {
                name: itemTitle,
                portion: labelResult.servingSize || "1 serving",
                calories: labelResult.calories || 0,
                protein: labelResult.protein || 0,
                carbs: labelResult.carbs || 0,
                fats: labelResult.fats || 0
              }
            ],
            calories: labelResult.calories || 0,
            protein: labelResult.protein || 0,
            carbs: labelResult.carbs || 0,
            fats: labelResult.fats || 0,
            notes: "Nutrition Facts label scanned accurately"
          });
          playSound('success', soundEnabled);
          setIsAnalyzing(false);
          return;
        }
      }

      // If neither recognized food or label
      setAnalysisError(result.errorMessage || "No food or nutrition label was detected. Please ensure your photo is clear and well-lit.");
      playSound('click', soundEnabled);
    } catch (err) {
      setAnalysisError("Meal scan encountered an error. Please try again or type the items directly.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Manual Barcode Lookup
  const handleManualBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    playSound('click', soundEnabled);
    setIsLookingUpBarcode(true);
    setAnalysisError(null);

    try {
      const prod = await lookupBarcodeOpenFoodFacts(barcodeInput.trim());
      if (prod && prod.hasLabel) {
        const title = prod.productName || `Item #${barcodeInput.trim()}`;
        setAnalyzedMeal({
          name: title,
          items: [
            {
              name: title,
              portion: prod.servingSize || "1 serving",
              calories: prod.calories,
              protein: prod.protein,
              carbs: prod.carbs,
              fats: prod.fats
            }
          ],
          calories: prod.calories,
          protein: prod.protein,
          carbs: prod.carbs,
          fats: prod.fats,
          notes: `Verified from Open Food Facts (${barcodeInput.trim()})`
        });
        playSound('success', soundEnabled);
      } else {
        setAnalysisError(`Barcode ${barcodeInput} was not found in the global food database. Please take a photo of the nutrition label instead.`);
      }
    } catch (err) {
      setAnalysisError("Barcode lookup failed. Please snap a photo of the label.");
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  // Adjust item in analyzed meal
  const handleRemoveItem = (index) => {
    if (!analyzedMeal) return;
    playSound('click', soundEnabled);
    const nextItems = analyzedMeal.items.filter((_, i) => i !== index);
    if (nextItems.length === 0) {
      setAnalyzedMeal(null);
      return;
    }

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

  // Confirm and Log Meal
  const handleConfirmLog = () => {
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
                <Camera className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Food & Nutrition Scanner</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-slate-300 border border-white/10">
                    Unified Vision + OCR
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Point at meals, snacks, or packaging nutrition labels — AI extracts verified macros
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

                  <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-300 flex items-center gap-1.5 shadow-lg">
                    <ScanLine className="w-3 h-3 animate-pulse text-slate-400" />
                    <span>Food Plate or Nutrition Facts Label</span>
                  </div>
                </div>

                <div className="absolute bottom-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSnapPhoto}
                    className="px-5 py-2.5 rounded-full text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Snap Photo</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                    title="Switch Camera"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-slate-300 border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : imageBase64 ? (
              <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                <img
                  src={imageBase64}
                  alt="Captured food or label"
                  className="w-full h-full object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setImageBase64(null);
                    setAnalyzedMeal(null);
                  }}
                  className="absolute top-3 right-3 px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/90 text-white border border-white/20 text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>
              </div>
            ) : (
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                  <Camera className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">Snap Meal or Nutrition Label</h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Take a live photo, use your direct phone camera, or upload an image from your library.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-semibold shadow-md transition-all active:scale-95 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <Camera className="w-4 h-4" />
                    <span>Live Camera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold border border-white/15 transition-all active:scale-95 cursor-pointer"
                    title="Direct phone camera capture without WebRTC permission blocks"
                  >
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Phone Camera (Direct)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4 text-slate-400" />
                    <span>Upload Photo</span>
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
              </div>
            )}
          </div>

          {/* Quick Barcode Number Lookup */}
          <form onSubmit={handleManualBarcodeSubmit} className="flex items-center gap-2 p-2 rounded-xl bg-black/40 border border-white/10">
            <Barcode className="w-4 h-4 text-slate-400 ml-1 shrink-0" />
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Or enter Barcode / UPC number (e.g. 016000275270)..."
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

          {/* Description input with voice dictation */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <UtensilsCrossed className="w-3.5 h-3.5 text-slate-400" />
                <span>Food Details & Notes (Optional Voice or Text)</span>
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
              placeholder='e.g., "1 peanutbutter toast", "quinoa, cottagecheese, kale, chickpea and sweet potato bowl"...'
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-white/25 transition-all resize-none"
            />
          </div>

          {/* Action Button */}
          {!analyzedMeal && (
            <button
              type="button"
              disabled={isAnalyzing || (!imageBase64 && !description.trim())}
              onClick={handleAnalyze}
              className="w-full py-3 rounded-2xl text-white font-bold text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyzing Food & Macros...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analyze & Calculate Macros</span>
                </>
              )}
            </button>
          )}

          {/* Analysis Error */}
          {analysisError && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-red-200">Unable to calculate</p>
                <p className="text-red-300/90 leading-relaxed text-[11px]">{analysisError}</p>
              </div>
            </div>
          )}

          {/* Mobile Camera Permission Block Guidance Banner */}
          {cameraPermissionStatus === 'denied' && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Camera Permission Blocked on Phone</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                If your browser blocked camera access, use the <strong className="text-white">Phone Camera (Direct)</strong> button above.
              </p>
            </div>
          )}

          {/* 2. ANALYZED RESULTS CARD */}
          {analyzedMeal && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4 shadow-xl"
            >
              {/* Meal Title & Slot */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div>
                  <span className="text-[10px] font-mono font-semibold uppercase text-slate-400">Meal Identified</span>
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{analyzedMeal.name}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </h4>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold">Slot:</span>
                  <select
                    value={selectedSlot}
                    onChange={(e) => setSelectedSlot(e.target.value)}
                    className="bg-black/60 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-mono text-white outline-none cursor-pointer"
                  >
                    <option value="breakfast">🍳 Breakfast</option>
                    <option value="lunch">🥗 Lunch</option>
                    <option value="dinner">🥩 Dinner</option>
                    <option value="post_workout">⚡ Post-Workout</option>
                    <option value="snack">🍎 Snack</option>
                  </select>
                </div>
              </div>

              {/* Total Macros Banner */}
              <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-xl bg-black/40 border border-white/5">
                <div>
                  <div className="text-[10px] uppercase font-mono text-slate-400">Calories</div>
                  <div className="text-base font-bold text-white font-mono flex items-center justify-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>{analyzedMeal.calories}</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono text-slate-400">Protein</div>
                  <div className="text-base font-bold text-white font-mono" style={{ color: 'var(--accent-primary)' }}>
                    {analyzedMeal.protein}g
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono text-slate-400">Carbs</div>
                  <div className="text-base font-bold text-white font-mono">
                    {analyzedMeal.carbs}g
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-mono text-slate-400">Fats</div>
                  <div className="text-base font-bold text-white font-mono">
                    {analyzedMeal.fats}g
                  </div>
                </div>
              </div>

              {/* Itemized Ingredients List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <span>Detected Ingredients ({analyzedMeal.items?.length || 0})</span>
                  <span>Portion & Macros</span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {analyzedMeal.items?.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-xs transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--accent-primary)' }} />
                        <span className="font-semibold text-white">{item.name}</span>
                        <span className="text-[11px] font-mono text-slate-400">({item.portion})</span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="font-mono text-right text-[11px]">
                          <span className="text-white font-bold">{item.calories} cal</span>
                          <span className="text-slate-400 ml-1.5">{item.protein}g P • {item.carbs}g C • {item.fats}g F</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-400 transition-all cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {analyzedMeal.notes && (
                <p className="text-[11px] text-slate-400 italic">
                  Note: {analyzedMeal.notes}
                </p>
              )}

              {/* Confirm & Log Button */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    playSound('click', soundEnabled);
                    setAnalyzedMeal(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-semibold text-xs border border-white/10 transition-all cursor-pointer"
                >
                  Scan Another
                </button>

                <button
                  type="button"
                  onClick={handleConfirmLog}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  <Check className="w-4 h-4" />
                  <span>Confirm & Log to Meals</span>
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
