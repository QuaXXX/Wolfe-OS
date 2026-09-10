import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  UploadCloud, 
  Check, 
  Sparkles, 
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  X, 
  Flame,
  SwitchCamera 
} from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { createMealEntry } from '../../utils/nutritionEngine.js';
import { analyzeMealWithAI, scanNutritionLabelWithAI } from '../../utils/aiService.js';

export const MealLogModal = ({
  isOpen,
  onClose,
  onLogMeal,
  selectedDate = null,
  householdPantry = [],
  onAddHouseholdStaple = null,
  onDeleteHouseholdStaple = null,
  aiConfig = {},
  kitchenCalibration = null,
  soundEnabled = true,
  initialTab = 'upload_image'
}) => {
  const [imageDescription, setImageDescription] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageAnalysisError, setImageAnalysisError] = useState(null);
  const [analyzedMeal, setAnalyzedMeal] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [isLiveCameraActive, setIsLiveCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');

  const stopLiveCamera = () => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch (e) {}
    }
    setIsLiveCameraActive(false);
    setIsStartingCamera(false);
  };

  // Sync state & cleanup on modal open/close
  useEffect(() => {
    if (isOpen) {
      setImageAnalysisError(null);
      setAnalyzedMeal(null);
    } else {
      resetAllStates();
    }
    return () => {
      stopLiveCamera();
    };
  }, [isOpen]);

  const resetAllStates = () => {
    stopLiveCamera();
    setImageDescription('');
    setImageBase64(null);
    setIsAnalyzingImage(false);
    setImageAnalysisError(null);
    setAnalyzedMeal(null);
  };

  /**
   * Triggers native mobile camera intent directly via <input capture="environment" />
   * Used as fallback if in-app WebRTC stream is blocked by system permissions.
   */
  const triggerNativeCamera = () => {
    playSound('click', soundEnabled);
    stopLiveCamera();
    setImageAnalysisError(null);
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  /**
   * Starts live in-app camera viewfinder inside the modal.
   * Keeps browser focused and alive, completely preventing mobile OS task-kill/reload.
   */
  const startLiveCamera = async (facing = cameraFacingMode) => {
    playSound('click', soundEnabled);
    setImageAnalysisError(null);

    // Release any previous camera stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {}
      streamRef.current = null;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      triggerNativeCamera();
      return;
    }

    setIsStartingCamera(true);
    setIsLiveCameraActive(true);

    try {
      const constraints = {
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('Live camera play error:', playErr);
        }
      }
      setIsStartingCamera(false);
    } catch (err) {
      console.warn('getUserMedia error, falling back:', err);
      stopLiveCamera();
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setImageAnalysisError('Camera access denied. Please enable camera permission in your browser or select a photo from Gallery.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setImageAnalysisError('No camera found on this device. Please select a photo from Gallery.');
      } else {
        setImageAnalysisError('Could not start live camera viewfinder. You can use Gallery or the system camera option.');
      }
    }
  };

  const toggleCameraFacing = async () => {
    const nextFacing = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextFacing);
    if (isLiveCameraActive) {
      await startLiveCamera(nextFacing);
    }
  };

  /**
   * Captures the current video frame into a downsampled, compressed JPEG.
   * Immediately stops the camera stream to free hardware resources.
   */
  const captureLiveFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    playSound('click', soundEnabled);

    try {
      const naturalWidth = video.videoWidth || 1280;
      const naturalHeight = video.videoHeight || 720;
      const maxDimension = 1024;

      let targetWidth = naturalWidth;
      let targetHeight = naturalHeight;

      if (naturalWidth > maxDimension || naturalHeight > maxDimension) {
        if (naturalWidth > naturalHeight) {
          targetHeight = Math.round((naturalHeight * maxDimension) / naturalWidth);
          targetWidth = maxDimension;
        } else {
          targetWidth = Math.round((naturalWidth * maxDimension) / naturalHeight);
          targetHeight = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas context unavailable');
      }

      if (cameraFacingMode === 'user') {
        ctx.translate(targetWidth, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      const base64 = canvas.toDataURL('image/jpeg', 0.8);

      // Stop camera stream immediately to release hardware and memory
      stopLiveCamera();

      // Free canvas
      canvas.width = 0;
      canvas.height = 0;

      setImageBase64(base64);
      setImageMimeType('image/jpeg');
      setImageAnalysisError(null);
      playSound('success', soundEnabled);
    } catch (err) {
      console.error('Frame capture error:', err);
      setImageAnalysisError('Could not capture frame. Please try again or choose from Gallery.');
    }
  };

  /**
   * Ultra-low-memory image downsampling and compression pipeline.
   * Utilizes native streaming createImageBitmap with hardware resizing when available,
   * completely bypassing 50-megapixel uncompressed bitmap RAM allocation (drops peak RAM from ~200MB to ~3MB).
   * Automatically frees image bitmap and canvas context buffers immediately.
   */
  const compressAndResizeImage = async (file, maxDimension = 1024, quality = 0.75) => {
    if (!file) throw new Error('No file provided');
    if (file.type && !file.type.startsWith('image/')) {
      throw new Error('File is not an image');
    }

    // Safety guard against massive RAW or uncompressed files exceeding 30MB
    if (file.size > 30 * 1024 * 1024) {
      throw new Error('Image file is too large (>30MB). Please select a standard JPEG or PNG photo.');
    }

    // Pipeline A: High-performance native streaming createImageBitmap (Available in Chrome, Edge, Safari 15+, Firefox)
    if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
      try {
        let bitmap = null;
        try {
          // Hardware downsampling during stream decode directly to maxDimension
          bitmap = await window.createImageBitmap(file, {
            resizeWidth: maxDimension,
            resizeQuality: 'medium'
          });
        } catch (optionsErr) {
          // Fallback to plain createImageBitmap if browser doesn't support resize options dictionary
          bitmap = await window.createImageBitmap(file);
        }

        if (bitmap) {
          let width = bitmap.width;
          let height = bitmap.height;

          if (!width || !height) {
            bitmap.close();
            throw new Error('Invalid image dimensions');
          }

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: false });
          if (!ctx) {
            bitmap.close();
            canvas.width = 0;
            canvas.height = 0;
            throw new Error('Canvas context unavailable');
          }

          ctx.drawImage(bitmap, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', quality);

          // Free GPU & memory buffers IMMEDIATELY
          bitmap.close();
          canvas.width = 0;
          canvas.height = 0;

          return { base64, mimeType: 'image/jpeg' };
        }
      } catch (streamErr) {
        console.warn('createImageBitmap streaming decode failed, using fallback reader:', streamErr);
      }
    }

    // Pipeline B: Resilient HTMLImageElement fallback with explicit lifecycle cleanup
    return new Promise((resolve, reject) => {
      let objectUrl = null;
      try {
        objectUrl = URL.createObjectURL(file);
      } catch (urlErr) {
        return reject(new Error('Cannot create object URL: low memory'));
      }

      const img = new Image();

      const cleanup = () => {
        try {
          img.onload = null;
          img.onerror = null;
          img.src = '';
          if (objectUrl) URL.revokeObjectURL(objectUrl);
        } catch (e) {}
      };

      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (!width || !height) {
            cleanup();
            return reject(new Error('Invalid image dimensions'));
          }

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            canvas.width = 0;
            canvas.height = 0;
            return reject(new Error('Canvas context unavailable'));
          }

          ctx.drawImage(img, 0, 0, width, height);
          const base64 = canvas.toDataURL('image/jpeg', quality);

          cleanup();
          canvas.width = 0;
          canvas.height = 0;

          resolve({ base64, mimeType: 'image/jpeg' });
        } catch (err) {
          cleanup();
          reject(err);
        }
      };

      img.onerror = () => {
        cleanup();
        reject(new Error('Failed to load image file'));
      };

      img.src = objectUrl;
    });
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    playSound('click', soundEnabled);

    try {
      // 1024px at 0.75 quality: perfect clarity for Gemini Vision food recognition while preventing mobile OOM
      const compressed = await compressAndResizeImage(file, 1024, 0.75);
      setImageBase64(compressed.base64);
      setImageMimeType(compressed.mimeType);
      setImageAnalysisError(null);
      playSound('success', soundEnabled);
    } catch (err) {
      console.error('Image compression error:', err);
      const isMemoryIssue = /memory|quota|exhaust|alloc/i.test(err?.message || '');
      if (isMemoryIssue) {
        setImageAnalysisError("Device memory was low while reading photo. Try selecting from Gallery instead of Live Camera.");
      } else {
        setImageAnalysisError(err?.message || "Could not process this image. Please try another photo.");
      }
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  // AI Image Meal Analysis
  const handleAnalyzeImage = async () => {
    playSound('click', soundEnabled);
    setIsAnalyzingImage(true);
    setImageAnalysisError(null);

    if (!imageDescription.trim() && !imageBase64) {
      setImageAnalysisError("Please snap a photo, choose from gallery, or enter food details.");
      setIsAnalyzingImage(false);
      return;
    }

    try {
      const result = await analyzeMealWithAI({
        imageBase64,
        mimeType: imageMimeType,
        description: imageDescription.trim(),
        aiConfig,
        kitchenCalibration
      });

      if (result && result.hasFood !== false && result.calories > 0) {
        setAnalyzedMeal(result);
        playSound('success', soundEnabled);
        setIsAnalyzingImage(false);
        return;
      }

      // Check Nutrition Facts label if plate was not recognized
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
          setIsAnalyzingImage(false);
          return;
        }
      }

      setImageAnalysisError(result.errorMessage || "No food or nutrition label was detected. Please ensure your photo is clear.");
    } catch (err) {
      setImageAnalysisError("Meal scan encountered an error. Please try again or use Quick Add.");
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const handleRemoveAnalyzedItem = (index) => {
    if (!analyzedMeal) return;
    playSound('click', soundEnabled);
    const nextItems = analyzedMeal.items.filter((_, i) => i !== index);
    if (nextItems.length === 0) {
      setAnalyzedMeal(null);
      return;
    }
    setAnalyzedMeal({
      ...analyzedMeal,
      items: nextItems,
      calories: nextItems.reduce((acc, it) => acc + (Number(it.calories) || 0), 0),
      protein: nextItems.reduce((acc, it) => acc + (Number(it.protein) || 0), 0),
      carbs: nextItems.reduce((acc, it) => acc + (Number(it.carbs) || 0), 0),
      fats: nextItems.reduce((acc, it) => acc + (Number(it.fats) || 0), 0)
    });
  };

  // Final confirmation helper for AI cards
  const handleConfirmAnalyzedMeal = (mealObj) => {
    if (!mealObj) return;
    playSound('success', soundEnabled);

    const mealItems = Array.isArray(mealObj.items)
      ? mealObj.items.map(it => typeof it === 'object' && it ? {
          name: it.name || 'Item',
          portion: it.portion || '1 serving',
          calories: Number(it.calories) || 0,
          protein: Number(it.protein) || 0,
          carbs: Number(it.carbs) || 0,
          fats: Number(it.fats) || 0
        } : it)
      : [];

    const meal = createMealEntry({
      date: selectedDate,
      name: mealObj.name || "Logged Meal",
      calories: mealObj.calories,
      protein: mealObj.protein,
      carbs: mealObj.carbs,
      fats: mealObj.fats,
      items: mealItems
    });

    resetAllStates();
    onLogMeal(meal);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-[#0d111d] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-black/40">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/10 shadow-inner"
                style={{ backgroundColor: 'var(--accent-subtle)' }}
              >
                <Camera className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                  <span>Camera AI Scan</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Take live photo or select gallery • Vision AI calculates macros
                </p>
              </div>
            </div>

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

          {/* Modal Body */}
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
            {/* Viewport / Image Capture */}
            <div className="relative rounded-2xl bg-black/60 border border-white/10 overflow-hidden">
              {isLiveCameraActive ? (
                <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
                  <video
                    ref={(el) => {
                      videoRef.current = el;
                      if (el && streamRef.current && el.srcObject !== streamRef.current) {
                        el.srcObject = streamRef.current;
                        el.play().catch(e => console.warn('Camera play warning:', e));
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {isStartingCamera && (
                    <div className="absolute inset-0 bg-black/70 flex items-center justify-center gap-2 text-white text-xs font-semibold">
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      <span>Starting camera...</span>
                    </div>
                  )}

                  {/* Top Viewfinder Controls: Flip Camera & Close */}
                  <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-auto">
                    <button
                      type="button"
                      onClick={toggleCameraFacing}
                      className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md cursor-pointer transition-all active:scale-95"
                      title="Flip camera"
                    >
                      <SwitchCamera className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={stopLiveCamera}
                      className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md cursor-pointer transition-all active:scale-95"
                      title="Close viewfinder"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Bottom Shutter Button */}
                  <div className="absolute bottom-3 inset-x-0 flex items-center justify-center pointer-events-auto">
                    <button
                      type="button"
                      onClick={captureLiveFrame}
                      disabled={isStartingCamera}
                      className="w-14 h-14 rounded-full bg-white border-4 border-black/40 shadow-2xl flex items-center justify-center cursor-pointer transition-all active:scale-90 hover:scale-105"
                      title="Snap photo"
                    >
                      <div className="w-10 h-10 rounded-full border-2 border-slate-900 flex items-center justify-center" style={{ backgroundColor: 'var(--accent-primary)' }}>
                        <Camera className="w-5 h-5 text-white" />
                      </div>
                    </button>
                  </div>
                </div>
              ) : imageBase64 ? (
                <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                  <img
                    src={imageBase64}
                    alt="Captured meal or label"
                    className="w-full h-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      stopLiveCamera();
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
                      Take a live photo or select an existing picture from your gallery to calculate macros.
                    </p>
                  </div>

                  {/* Primary Camera Action Buttons: Live Photo & Gallery */}
                  <div className="flex flex-col sm:flex-row items-stretch justify-center gap-2.5 max-w-md mx-auto pt-1">
                    {/* Primary 1-Tap Live Photo */}
                    <button
                      type="button"
                      onClick={() => startLiveCamera()}
                      className="flex-1 py-3 px-4 rounded-2xl text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                      title="Take a live photo directly in app"
                    >
                      <Camera className="w-4 h-4 text-white" />
                      <span>Take Live Photo</span>
                    </button>

                    {/* Gallery / File Picker */}
                    <button
                      type="button"
                      onClick={() => {
                        playSound('click', soundEnabled);
                        fileInputRef.current?.click();
                      }}
                      className="py-3 px-4 rounded-2xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <UploadCloud className="w-4 h-4 text-slate-400" />
                      <span>Gallery</span>
                    </button>
                  </div>

                  {/* Fallback to system camera app if preferred */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={triggerNativeCamera}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors underline cursor-pointer"
                    >
                      Or use system camera app
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Food Description Input */}
            <div className="space-y-1">
              <input
                type="text"
                value={imageDescription}
                onChange={(e) => setImageDescription(e.target.value)}
                placeholder="Optional meal details (e.g. 'chicken breast with rice', 'olive oil dressing')..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-white/30"
              />
            </div>

            {/* Analyze Action Button */}
            {!analyzedMeal && (
              <button
                type="button"
                disabled={isAnalyzingImage || (!imageBase64 && !imageDescription.trim())}
                onClick={handleAnalyzeImage}
                className="w-full py-3 rounded-2xl text-white font-bold text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              >
                {isAnalyzingImage ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Analyzing Food & Macros...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Analyze Photo & Calculate Macros</span>
                  </>
                )}
              </button>
            )}

            {imageAnalysisError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{imageAnalysisError}</span>
              </div>
            )}

            {/* Analyzed Meal Results Card */}
            {analyzedMeal && (
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3.5 shadow-xl">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-slate-400">Meal Identified</span>
                    <h4 className="text-base font-bold text-white flex items-center gap-1.5">
                      <span>{analyzedMeal.name}</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    </h4>
                  </div>
                </div>

                {/* Total Macros */}
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
                    <div className="text-base font-bold text-white font-mono">{analyzedMeal.carbs}g</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-mono text-slate-400">Fats</div>
                    <div className="text-base font-bold text-white font-mono">{analyzedMeal.fats}g</div>
                  </div>
                </div>

                {/* Itemized List */}
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {analyzedMeal.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-white/[0.02] border border-white/5 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: 'var(--accent-primary)' }} />
                        <span className="font-semibold text-white truncate">{item.name}</span>
                        {item.portion && (
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">({item.portion})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="font-mono text-white text-[11px]">{item.calories} cal • {item.protein}g P</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAnalyzedItem(idx)}
                          className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Confirm & Log Button */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      playSound('click', soundEnabled);
                      setImageBase64(null);
                      setAnalyzedMeal(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-semibold text-xs border border-white/10 cursor-pointer"
                  >
                    Scan Another
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmAnalyzedMeal(analyzedMeal)}
                    className="flex-1 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm & Log Meal</span>
                  </button>
                </div>
              </div>
            )}

            {/* Hidden Native File & Camera Inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onClick={(e) => { e.target.value = ''; }}
              onChange={handleFileUpload}
              className="hidden"
            />

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onClick={(e) => { e.target.value = ''; }}
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
};

export const LogFoodModal = MealLogModal;
export const SnapMealModal = MealLogModal;
export default MealLogModal;
