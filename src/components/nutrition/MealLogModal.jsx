import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Camera, 
  Mic, 
  MicOff, 
  Sparkles, 
  UploadCloud, 
  Check, 
  UtensilsCrossed, 
  Flame, 
  Plus, 
  Minus,
  Trash2, 
  RefreshCw, 
  AlertCircle, 
  Barcode, 
  ScanLine, 
  Search, 
  CheckCircle2, 
  X, 
  Clock, 
  BookmarkPlus
, Video, ExternalLink, Info } from 'lucide-react';
import { playSound } from '../../utils/soundFX';
import { 
  calculateCaloriesFromMacros, 
  createMealEntry, 
  parseMealDescription, 
  DEFAULT_HOUSEHOLD_PANTRY 
} from '../../utils/nutritionEngine.js';
import { 
  analyzeMealWithAI, 
  analyzeQuickLogWithAI,
  scanNutritionLabelWithAI, 
  lookupBarcodeOpenFoodFacts, 
  searchBrandedFoodDatabase 
} from '../../utils/aiService.js';

export const MealLogModal = ({
  isOpen,
  onClose,
  onLogMeal,
  selectedDate = null,
  householdPantry = [],
  onAddHouseholdStaple = null,
  aiConfig = {},
  kitchenCalibration = null,
  soundEnabled = true,
  initialTab = 'quick_add' // 'upload_image' | 'talk_to_add' | 'quick_add'
}) => {
  // 3 Primary Sections
  const [activeTab, setActiveTab] = useState(initialTab);

  // ---------------------------------------------------------------------------
  // SECTION 1: UPLOAD IMAGE / CAMERA SCAN STATE
  // ---------------------------------------------------------------------------
  const [imageDescription, setImageDescription] = useState('');
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMimeType, setImageMimeType] = useState('image/jpeg');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageAnalysisError, setImageAnalysisError] = useState(null);
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState('prompt'); // 'prompt' | 'granted' | 'denied' | 'unknown'
  const [showPermissionGuide, setShowPermissionGuide] = useState(false);
  const [analyzedMeal, setAnalyzedMeal] = useState(null);

  // Barcode & Brand Search within Image Scan
  const [scanLookupMode, setScanLookupMode] = useState('brand'); // 'brand' | 'barcode'
  const [scanBrandQuery, setScanBrandQuery] = useState('');
  const [scanBrandResults, setScanBrandResults] = useState([]);
  const [isSearchingScanBrand, setIsSearchingScanBrand] = useState(false);
  const [scanBrandError, setScanBrandError] = useState(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isLookingUpBarcode, setIsLookingUpBarcode] = useState(false);

  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const streamRef = useRef(null);

  // ---------------------------------------------------------------------------
  // SECTION 2: TALK TO ADD STATE
  // ---------------------------------------------------------------------------
  const [voiceText, setVoiceText] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const [voiceParsedMeal, setVoiceParsedMeal] = useState(null);
  const recognitionRef = useRef(null);

  // ---------------------------------------------------------------------------
  // SECTION 3: QUICK ADD STATE (IMPROVED)
  // ---------------------------------------------------------------------------
  const [quickInputText, setQuickInputText] = useState('');
  const [isQuickAnalyzing, setIsQuickAnalyzing] = useState(false);
  const [quickFeedback, setQuickFeedback] = useState(null);

  // Quick Brand Search
  const [quickBrandQuery, setQuickBrandQuery] = useState('');
  const [quickBrandResults, setQuickBrandResults] = useState([]);
  const [isSearchingQuickBrand, setIsSearchingQuickBrand] = useState(false);
  const [quickBrandError, setQuickBrandError] = useState(null);

  // Fast-Pick Category & Multipliers
  const [pantryCategory, setPantryCategory] = useState('all');
  const [stapleMultipliers, setStapleMultipliers] = useState({});

  // Direct Manual Macro Entry
  const [manualName, setManualName] = useState('');
  const [manualCals, setManualCals] = useState('');
  const [manualP, setManualP] = useState('');
  const [manualC, setManualC] = useState('');
  const [manualF, setManualF] = useState('');
  const [manualItems, setManualItems] = useState('');

  const displayPantry = useMemo(() => {
    return (householdPantry && householdPantry.length > 0) 
      ? householdPantry 
      : DEFAULT_HOUSEHOLD_PANTRY;
  }, [householdPantry]);

  const filteredPantry = useMemo(() => {
    if (pantryCategory === 'all') return displayPantry;
    return displayPantry.filter(s => (s.category || '').toLowerCase() === pantryCategory.toLowerCase());
  }, [displayPantry, pantryCategory]);

  // Sync state & cleanup on modal open/close
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setImageAnalysisError(null);
      setVoiceError(null);
      setQuickFeedback(null);
    } else {
      stopCamera();
      resetAllStates();
    }
  }, [isOpen]);

  const resetAllStates = () => {
    // Image Scan
    setImageDescription('');
    setImageBase64(null);
    setIsCameraActive(false);
    setIsAnalyzingImage(false);
    setImageAnalysisError(null);
    setAnalyzedMeal(null);
    setScanBrandQuery('');
    setScanBrandResults([]);
    setBarcodeInput('');
    setIsLookingUpBarcode(false);

    // Voice
    setVoiceText('');
    setIsVoiceListening(false);
    setIsParsingVoice(false);
    setVoiceError(null);
    setVoiceParsedMeal(null);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
    }

    // Quick Add
    setQuickInputText('');
    setIsQuickAnalyzing(false);
    setQuickFeedback(null);
    setQuickBrandQuery('');
    setQuickBrandResults([]);
    setManualName('');
    setManualCals('');
    setManualP('');
    setManualC('');
    setManualF('');
    setManualItems('');
  };

  // Query camera permission & watch for unblocks in Samsung settings / browser
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const checkPermission = async () => {
        try {
          if (navigator.permissions && navigator.permissions.query) {
            const status = await navigator.permissions.query({ name: 'camera' });
            setCameraPermissionStatus(status.state);
            if (status.state === 'granted') {
              setShowPermissionGuide(false);
            } else if (status.state === 'denied') {
              setShowPermissionGuide(true);
            }
            status.onchange = () => {
              setCameraPermissionStatus(status.state);
              if (status.state === 'granted') {
                setShowPermissionGuide(false);
                setImageAnalysisError(null);
              } else if (status.state === 'denied') {
                setShowPermissionGuide(true);
              }
            };
          }
        } catch (e) {
          // Fallback if query not supported
        }
      };

      checkPermission();

      const handleAppFocus = () => {
        checkPermission();
      };

      window.addEventListener('focus', handleAppFocus);
      document.addEventListener('visibilitychange', handleAppFocus);

      return () => {
        window.removeEventListener('focus', handleAppFocus);
        document.removeEventListener('visibilitychange', handleAppFocus);
      };
    }
  }, []);

  // Stop camera when leaving upload_image tab
  useEffect(() => {
    if (activeTab !== 'upload_image' && isCameraActive) {
      stopCamera();
    }
  }, [activeTab]);

  // ---------------------------------------------------------------------------
  // CAMERA CONTROLS
  // ---------------------------------------------------------------------------
  const triggerNativeCamera = () => {
    playSound('click', soundEnabled);
    setImageAnalysisError(null);
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const handleLiveCameraAction = () => {
    playSound('click', soundEnabled);
    setImageAnalysisError(null);

    // If camera permission was already denied in browser/PWA, launch Samsung camera directly!
    if (cameraPermissionStatus === 'denied') {
      triggerNativeCamera();
      return;
    }

    startCamera();
  };

  const startCamera = async (overrideFacing) => {
    playSound('click', soundEnabled);
    setImageAnalysisError(null);
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
      setShowPermissionGuide(false);
    } catch (err) {
      setIsCameraActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraPermissionStatus('denied');
        setShowPermissionGuide(true);
        setImageAnalysisError("Live stream camera access is blocked in Android settings.");
      } else {
        setImageAnalysisError("Camera unavailable: " + (err.message || "Please use Phone Camera"));
      }
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
    if (isCameraActive) startCamera(nextMode);
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
      setImageAnalysisError("Failed to capture snapshot. Please try uploading a photo.");
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
      setImageAnalysisError(null);
      playSound('success', soundEnabled);
    };
    reader.readAsDataURL(file);
  };

  // ---------------------------------------------------------------------------
  // AI IMAGE MEAL ANALYSIS
  // ---------------------------------------------------------------------------
  const handleAnalyzeImage = async () => {
    playSound('click', soundEnabled);
    setIsAnalyzingImage(true);
    setImageAnalysisError(null);

    if (!imageDescription.trim() && !imageBase64) {
      setImageAnalysisError("Please snap a photo, upload an image, or enter food details.");
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

      if (result.hasFood && Array.isArray(result.items) && result.items.length > 0) {
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

  // Image Scan Barcode Lookup
  const handleScanBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    playSound('click', soundEnabled);
    setIsLookingUpBarcode(true);
    setImageAnalysisError(null);

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
          notes: `Verified barcode (${barcodeInput.trim()})`
        });
        playSound('success', soundEnabled);
      } else {
        setImageAnalysisError(`Barcode ${barcodeInput} was not found in global database.`);
      }
    } catch (err) {
      setImageAnalysisError("Barcode lookup failed. Please snap a photo of the label.");
    } finally {
      setIsLookingUpBarcode(false);
    }
  };

  // Image Scan Brand Search
  const handleScanBrandSearch = async (e) => {
    if (e) e.preventDefault();
    const q = scanBrandQuery.trim();
    if (!q) return;

    playSound('click', soundEnabled);
    setIsSearchingScanBrand(true);
    setScanBrandError(null);

    try {
      const items = await searchBrandedFoodDatabase({ query: q, aiConfig });
      if (items && items.length > 0) {
        setScanBrandResults(items);
        playSound('success', soundEnabled);
      } else {
        setScanBrandResults([]);
        setScanBrandError(`No verified product found for "${q}".`);
      }
    } catch (err) {
      setScanBrandError("Search failed. Please try again.");
    } finally {
      setIsSearchingScanBrand(false);
    }
  };

  const handleSelectScanBrandItem = (item) => {
    playSound('success', soundEnabled);
    const fullTitle = item.brand ? `${item.brand} ${item.name}` : item.name;
    const newItem = {
      name: fullTitle,
      portion: item.servingSize || "1 serving",
      calories: Number(item.calories) || 0,
      protein: Number(item.protein) || 0,
      carbs: Number(item.carbs) || 0,
      fats: Number(item.fats) || 0
    };

    if (analyzedMeal && Array.isArray(analyzedMeal.items) && analyzedMeal.items.length > 0) {
      const nextItems = [...analyzedMeal.items, newItem];
      setAnalyzedMeal({
        ...analyzedMeal,
        name: analyzedMeal.items.length === 1 ? `${analyzedMeal.name} + ${fullTitle}` : analyzedMeal.name,
        items: nextItems,
        calories: nextItems.reduce((acc, it) => acc + (Number(it.calories) || 0), 0),
        protein: nextItems.reduce((acc, it) => acc + (Number(it.protein) || 0), 0),
        carbs: nextItems.reduce((acc, it) => acc + (Number(it.carbs) || 0), 0),
        fats: nextItems.reduce((acc, it) => acc + (Number(it.fats) || 0), 0),
        notes: `Verified ${item.source || 'Brand Search'}`
      });
    } else {
      setAnalyzedMeal({
        name: fullTitle,
        items: [newItem],
        calories: newItem.calories,
        protein: newItem.protein,
        carbs: newItem.carbs,
        fats: newItem.fats,
        notes: `Verified ${item.source || 'Brand Search'}`
      });
    }
    setScanBrandResults([]);
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

  // ---------------------------------------------------------------------------
  // SECTION 2: TALK TO ADD (VOICE)
  // ---------------------------------------------------------------------------
  const toggleVoiceListening = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError("Voice speech recognition is not supported in this browser. Please use Quick Add.");
      return;
    }

    if (isVoiceListening) {
      try { recognitionRef.current?.stop(); } catch (e) {}
      setIsVoiceListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsVoiceListening(true);
        setVoiceError(null);
        playSound('click', soundEnabled);
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const updated = voiceText ? `${voiceText}, ${transcript}` : transcript;
        setVoiceText(updated);
        setIsVoiceListening(false);
        playSound('success', soundEnabled);
        handleParseVoiceText(updated);
      };

      recognition.onerror = () => {
        setIsVoiceListening(false);
      };

      recognition.onend = () => {
        setIsVoiceListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      setIsVoiceListening(false);
    }
  };

  const handleParseVoiceText = async (textToParse) => {
    const query = (textToParse || voiceText).trim();
    if (!query) return;

    playSound('click', soundEnabled);
    setIsParsingVoice(true);
    setVoiceError(null);

    try {
      const result = await analyzeQuickLogWithAI({
        query,
        aiConfig,
        kitchenCalibration,
        householdPantry
      });

      if (result && result.hasFood !== false && Array.isArray(result.items) && result.items.length > 0) {
        setVoiceParsedMeal(result);
        playSound('success', soundEnabled);
      } else {
        setVoiceError(`Could not calculate macros for "${query}". Please adjust your words or use Quick Add.`);
      }
    } catch (err) {
      setVoiceError("Unable to analyze spoken meal. Please try again.");
    } finally {
      setIsParsingVoice(false);
    }
  };

  // ---------------------------------------------------------------------------
  // SECTION 3: QUICK ADD (IMPROVED)
  // ---------------------------------------------------------------------------
  // 1. Natural Language Instant Bar
  const handleQuickInputSubmit = async (e) => {
    if (e) e.preventDefault();
    const query = quickInputText.trim();
    if (!query || isQuickAnalyzing) return;

    playSound('click', soundEnabled);
    setQuickFeedback(null);
    setIsQuickAnalyzing(true);

    try {
      const result = await analyzeQuickLogWithAI({
        query,
        aiConfig,
        kitchenCalibration,
        householdPantry
      });

      if (result && result.hasFood !== false && Array.isArray(result.items) && result.items.length > 0) {
        const meal = createMealEntry({
          date: selectedDate,
          name: result.name,
          slot: result.slot || 'meal',
          calories: result.calories,
          protein: result.protein,
          carbs: result.carbs,
          fats: result.fats,
          items: result.items.map(it => `${it.portion || '1 serving'} ${it.name} (${it.calories || 0} cal, ${it.protein || 0}g P)`)
        });
        onLogMeal(meal);
        playSound('success', soundEnabled);
        onClose();
        return;
      }

      setQuickFeedback(`Could not identify foods in "${query}". Try e.g. "1 peanutbutter toast" or "2 eggs 1 banana".`);
    } catch (err) {
      setQuickFeedback("Failed to add meal. Try selecting from quick staples below.");
    } finally {
      setIsQuickAnalyzing(false);
    }
  };

  // 2. Quick Brand Search
  const handleQuickBrandSearch = async (e) => {
    if (e) e.preventDefault();
    const q = quickBrandQuery.trim();
    if (!q) return;

    playSound('click', soundEnabled);
    setIsSearchingQuickBrand(true);
    setQuickBrandError(null);

    try {
      const items = await searchBrandedFoodDatabase({ query: q, aiConfig });
      if (items && items.length > 0) {
        setQuickBrandResults(items);
        playSound('success', soundEnabled);
      } else {
        setQuickBrandResults([]);
        setQuickBrandError(`No verified product found for "${q}".`);
      }
    } catch (err) {
      setQuickBrandError("Search failed. Please try again.");
    } finally {
      setIsSearchingQuickBrand(false);
    }
  };

  const handleLogQuickBrandItem = (item) => {
    playSound('success', soundEnabled);
    const title = item.brand ? `${item.brand} ${item.name}` : item.name;
    const meal = createMealEntry({
      date: selectedDate,
      name: title,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fats: item.fats,
      items: [`${item.servingSize || '1 serving'} ${title} (${item.calories} kcal, ${item.protein}g P)`]
    });
    onLogMeal(meal);
    onClose();
  };

  // 3. Fast-Pick Staple Log with Multiplier
  const adjustStapleMultiplier = (stapleId, delta) => {
    playSound('click', soundEnabled);
    setStapleMultipliers(prev => {
      const current = prev[stapleId] || 1;
      const next = Math.max(1, Math.min(6, current + delta));
      return { ...prev, [stapleId]: next };
    });
  };

  const handleLogStaple = (staple) => {
    playSound('success', soundEnabled);
    const qty = stapleMultipliers[staple.id] || 1;
    const title = qty > 1 ? `${qty}x ${staple.name}` : staple.name;

    const meal = createMealEntry({
      date: selectedDate,
      name: title,
      calories: staple.calories * qty,
      protein: staple.protein * qty,
      carbs: staple.carbs * qty,
      fats: staple.fats * qty,
      items: [`${qty > 1 ? `${qty}x ` : ''}${staple.portion || staple.name} (${staple.calories * qty} kcal, ${staple.protein * qty}g P)`]
    });

    onLogMeal(meal);
    onClose();
  };

  // 4. Manual Custom Macro Submit
  const handleManualMacroSubmit = (e) => {
    e.preventDefault();
    const p = Math.max(0, parseInt(manualP, 10) || 0);
    const c = Math.max(0, parseInt(manualC, 10) || 0);
    const f = Math.max(0, parseInt(manualF, 10) || 0);
    const rawCals = parseInt(manualCals, 10) || 0;
    const finalCals = rawCals > 0 ? rawCals : calculateCaloriesFromMacros(p, c, f);

    if (finalCals <= 0 && p === 0 && c === 0 && f === 0) return;

    playSound('success', soundEnabled);
    const meal = createMealEntry({
      date: selectedDate,
      name: manualName.trim() || "Custom Meal",
      calories: finalCals,
      protein: p,
      carbs: c,
      fats: f,
      items: manualItems ? manualItems.split(',').map(s => s.trim()) : [manualName.trim() || 'Custom Meal']
    });

    onLogMeal(meal);
    onClose();
  };

  const quickBumpManual = (macro, amount) => {
    playSound('click', soundEnabled);
    if (macro === 'protein') setManualP(prev => String((parseInt(prev, 10) || 0) + amount));
    if (macro === 'carbs') setManualC(prev => String((parseInt(prev, 10) || 0) + amount));
    if (macro === 'fats') setManualF(prev => String((parseInt(prev, 10) || 0) + amount));
    if (macro === 'cals') setManualCals(prev => String((parseInt(prev, 10) || 0) + amount));
  };

  // Final confirmation helper for AI / Voice cards
  const handleConfirmAnalyzedMeal = (mealObj) => {
    if (!mealObj) return;
    playSound('success', soundEnabled);

    const meal = createMealEntry({
      date: selectedDate,
      name: mealObj.name || "Logged Meal",
      calories: mealObj.calories,
      protein: mealObj.protein,
      carbs: mealObj.carbs,
      fats: mealObj.fats,
      items: (mealObj.items || []).map(it => `${it.portion || '1 serving'} ${it.name} (${it.calories} cal, ${it.protein}g P)`)
    });

    onLogMeal(meal);
    onClose();
  };

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence>
      <div className="fixed inset-0 top-0 left-0 w-screen h-screen z-[100] flex items-center justify-center p-3 sm:p-4 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            playSound('click', soundEnabled);
            onClose();
          }}
          className="fixed inset-0 top-0 left-0 w-full h-full bg-black/80 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-xl bg-[#0b0e18]/95 border border-white/15 rounded-3xl p-4 sm:p-6 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl z-10 space-y-4 max-h-[92vh] overflow-y-auto scrollbar-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/[0.04]"
                style={{ border: '1px solid var(--accent-border)' }}
              >
                <UtensilsCrossed className="w-5 h-5" style={{ color: 'var(--accent-primary)' }} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                  <span>Log Food</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-xl bg-white/[0.04] text-slate-300 border border-white/10">
                    Daily Meals
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Upload an image, talk hands-free, or quick-add from staples & brands
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

          {/* Primary Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-black/40 border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setActiveTab('upload_image');
              }}
              className={`py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'upload_image'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" style={{ color: activeTab === 'upload_image' ? 'var(--accent-primary)' : undefined }} />
              <span>Upload Image</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setActiveTab('talk_to_add');
              }}
              className={`py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'talk_to_add'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-rose-400" />
              <span>Talk to Add</span>
            </button>

            <button
              type="button"
              onClick={() => {
                playSound('click', soundEnabled);
                setActiveTab('quick_add');
              }}
              className={`py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'quick_add'
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Quick Add</span>
            </button>
          </div>

          {/* ================================================================= */}
          {/* SECTION 1: UPLOAD IMAGE / CAMERA VIEWPORT                          */}
          {/* ================================================================= */}
          {activeTab === 'upload_image' && (
            <div className="space-y-3.5">
              {/* Camera Viewport */}
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

                    {/* Reticle */}
                    <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-white/20 m-6 sm:m-10 rounded-2xl flex flex-col items-center justify-center">
                      <div className="px-3 py-1 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-300 flex items-center gap-1.5 shadow-lg">
                        <ScanLine className="w-3 h-3 animate-pulse text-slate-400" />
                        <span>Food Plate or Nutrition Facts Label</span>
                      </div>
                    </div>

                    <div className="absolute bottom-4 flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleSnapPhoto}
                        className="px-5 py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center gap-2 cursor-pointer"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        <Camera className="w-4 h-4" />
                        <span>Snap Photo</span>
                      </button>

                      <button
                        type="button"
                        onClick={toggleFacingMode}
                        className="p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                        title="Switch Camera"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={stopCamera}
                        className="p-2.5 rounded-xl bg-black/60 hover:bg-black/80 text-slate-300 border border-white/20 backdrop-blur-md transition-all active:scale-95 cursor-pointer"
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
                  <div className="p-5 text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                      <Camera className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Snap Meal or Nutrition Label</h4>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                        Take a live photo with your phone camera or stream live. Vision AI calibrates portion sizes using your measured dishware.
                      </p>
                    </div>

                    {/* Primary Camera Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch justify-center gap-2 max-w-md mx-auto">
                      {/* Primary 1-Tap Live Photo: Uses Samsung Camera Intent (Works 100% even with browser permission blocked!) */}
                      <button
                        type="button"
                        onClick={triggerNativeCamera}
                        className="flex-1 py-3 px-4 rounded-2xl text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                        title="Take a live photo using your Samsung camera (bypasses browser permission blocks)"
                      >
                        <Camera className="w-4 h-4 text-white" />
                        <span>Take Live Photo</span>
                      </button>

                      {/* In-App Live Stream Viewfinder */}
                      <button
                        type="button"
                        onClick={handleLiveCameraAction}
                        className="py-3 px-4 rounded-2xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold border border-white/15 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                        title="In-app live stream viewfinder"
                      >
                        <Video className="w-4 h-4 text-indigo-400" />
                        <span>Live Stream</span>
                      </button>

                      {/* Gallery / File Picker */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="py-3 px-4 rounded-2xl bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 text-xs font-semibold border border-white/10 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <UploadCloud className="w-4 h-4 text-slate-400" />
                        <span>Gallery</span>
                      </button>
                    </div>

                    {/* Samsung Fullscreen PWA Camera Help Card */}
                    {(cameraPermissionStatus === 'denied' || showPermissionGuide) && (
                      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs space-y-2.5 text-left mt-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 font-bold text-amber-300">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Live Camera Blocked on Samsung (Fullscreen App)</span>
                          </div>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                            PWA Mode
                          </span>
                        </div>

                        <p className="text-[11px] text-amber-200/90 leading-relaxed">
                          Because Wolfe OS runs in <strong>fullscreen mode</strong> on your Samsung, the browser lock icon is hidden. Here is how to snap photos right now and re-enable live streaming:
                        </p>

                        <div className="p-2.5 rounded-xl bg-black/50 border border-amber-500/30 space-y-2">
                          <div className="font-semibold text-white flex items-center gap-1.5 text-xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>1-Tap Solution (Works Right Now):</span>
                          </div>
                          <p className="text-[10px] text-slate-300">
                            Tap <strong>"Take Live Photo"</strong> above. It launches your Samsung camera directly, bypassing browser permission limits!
                          </p>
                          <button
                            type="button"
                            onClick={triggerNativeCamera}
                            className="w-full py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Camera className="w-4 h-4" />
                            <span>Open Samsung Camera Now</span>
                          </button>
                        </div>

                        <div className="space-y-1 pt-1 text-[11px] text-slate-300">
                          <div className="font-semibold text-amber-300 flex items-center justify-between">
                            <span>To Re-Enable In-App Live Stream (5 sec):</span>
                            <button
                              type="button"
                              onClick={() => window.open(window.location.href, '_blank')}
                              className="text-[10px] font-mono text-indigo-300 hover:text-indigo-200 underline cursor-pointer flex items-center gap-1"
                            >
                              <span>Open in Browser</span>
                              <ExternalLink className="w-3 h-3" />
                            </button>
                          </div>
                          <ol className="list-decimal list-inside space-y-0.5 text-slate-300/90 pl-1 font-mono text-[10px]">
                            <li>Go to phone Home Screen & long-press <strong>Wolfe OS</strong> icon</li>
                            <li>Tap <strong>ℹ️ (App Info)</strong> in the top corner</li>
                            <li>Tap <strong>Permissions → Camera → "Allow while using app"</strong></li>
                            <li>Return here — in-app live stream will be unblocked!</li>
                          </ol>
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
                )}
              </div>

              {/* Barcode & Brand Search within Scan */}
              <div className="p-3 rounded-2xl bg-black/40 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-xl border border-white/5 text-xs">
                    <button
                      type="button"
                      onClick={() => setScanLookupMode('brand')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        scanLookupMode === 'brand' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Search className="w-3 h-3 text-indigo-400" />
                      <span>Search Brand</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setScanLookupMode('barcode')}
                      className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        scanLookupMode === 'barcode' ? 'bg-white/15 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Barcode className="w-3 h-3 text-amber-400" />
                      <span>Barcode UPC</span>
                    </button>
                  </div>

                  <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                    {scanLookupMode === 'brand' ? 'Direct Manufacturer Facts' : '12-Digit UPC Scan'}
                  </span>
                </div>

                {scanLookupMode === 'brand' ? (
                  <form onSubmit={handleScanBrandSearch} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={scanBrandQuery}
                      onChange={(e) => setScanBrandQuery(e.target.value)}
                      placeholder='Search any brand (e.g. "Good Culture 2%", "Fairlife 42g", "Quest")...'
                      className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-white/30"
                    />
                    <button
                      type="submit"
                      disabled={isSearchingScanBrand || !scanBrandQuery.trim()}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      {isSearchingScanBrand ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>Search</span>
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleScanBarcodeSubmit} className="flex items-center gap-2">
                    <div className="relative flex-1 flex items-center bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5">
                      <Barcode className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                      <input
                        type="text"
                        value={barcodeInput}
                        onChange={(e) => setBarcodeInput(e.target.value)}
                        placeholder="Enter 12-digit barcode number..."
                        className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 font-mono outline-none"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isLookingUpBarcode || !barcodeInput.trim()}
                      className="px-4 py-2 rounded-xl text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--accent-primary)' }}
                    >
                      {isLookingUpBarcode ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                      <span>Lookup</span>
                    </button>
                  </form>
                )}

                {scanBrandResults.length > 0 && (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pt-1">
                    {scanBrandResults.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 flex items-center justify-between gap-3 transition-all"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white truncate">{item.name}</span>
                            {item.brand && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white/5 text-slate-300 border border-white/10">
                                {item.brand}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            <span>{item.servingSize}</span> • <span className="text-amber-300 font-semibold">{item.calories} kcal</span> • <span className="text-indigo-300 font-semibold">{item.protein}g P</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectScanBrandItem(item)}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold shrink-0 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                          style={{ backgroundColor: 'var(--accent-primary)' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add to Meal</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Optional Food description notes */}
              <div className="space-y-1">
                <input
                  type="text"
                  value={imageDescription}
                  onChange={(e) => setImageDescription(e.target.value)}
                  placeholder="Optional meal details (e.g. 'chicken breast with rice', 'olive oil dressing')..."
                  className="w-full px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none"
                />
              </div>

              {/* Action Button */}
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
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: 'var(--accent-primary)' }} />
                          <span className="font-semibold text-white">{item.name}</span>
                          <span className="text-[11px] font-mono text-slate-400">({item.portion})</span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-white text-[11px]">{item.calories} cal • {item.protein}g P</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAnalyzedItem(idx)}
                            className="p-1 rounded text-slate-400 hover:text-red-400 transition-colors"
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
                      onClick={() => setAnalyzedMeal(null)}
                      className="flex-1 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 font-semibold text-xs border border-white/10"
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
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 2: TALK TO ADD (VOICE)                                    */}
          {/* ================================================================= */}
          {activeTab === 'talk_to_add' && (
            <div className="space-y-4 py-2">
              <div className="text-center space-y-3">
                {/* Big Voice Button */}
                <div className="relative inline-flex items-center justify-center">
                  {isVoiceListening && (
                    <motion.div
                      animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0.1, 0.6] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                      className="absolute inset-0 rounded-3xl bg-rose-500/30 blur-md"
                    />
                  )}
                  <button
                    type="button"
                    onClick={toggleVoiceListening}
                    className={`relative w-20 h-20 rounded-3xl flex items-center justify-center shadow-xl transition-all active:scale-95 cursor-pointer ${
                      isVoiceListening 
                        ? 'bg-rose-600 text-white shadow-rose-600/50' 
                        : 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/15'
                    }`}
                  >
                    {isVoiceListening ? <MicOff className="w-8 h-8 animate-pulse" /> : <Mic className="w-8 h-8 text-rose-400" />}
                  </button>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-white">
                    {isVoiceListening ? "Listening... Speak your meal" : "Tap Microphone to Speak"}
                  </h4>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-0.5">
                    Say whatever you ate (e.g. "1 peanutbutter toast", "8 oz chicken breast with jasmine rice").
                  </p>
                </div>
              </div>

              {/* Real-time Voice Transcription Field */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-300">Recognized Speech & Details</label>
                <textarea
                  rows={3}
                  value={voiceText}
                  onChange={(e) => setVoiceText(e.target.value)}
                  placeholder='Speak or edit: "1 peanutbutter toast and 2 scrambled eggs"...'
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/10 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-white/30 resize-none"
                />
              </div>

              {/* Quick Spoken Examples Chips */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-slate-400">Quick Inspiration:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    "1 peanutbutter toast",
                    "3 whole eggs & 1 banana",
                    "8 oz chicken & 1 cup jasmine rice",
                    "Quinoa, chickpeas & sweet potato bowl"
                  ].map((phrase, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setVoiceText(phrase);
                        handleParseVoiceText(phrase);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/5 text-[11px] font-mono cursor-pointer transition-all active:scale-95"
                    >
                      "{phrase}"
                    </button>
                  ))}
                </div>
              </div>

              {/* Parse Spoken Meal Action */}
              {!voiceParsedMeal && (
                <button
                  type="button"
                  disabled={isParsingVoice || !voiceText.trim()}
                  onClick={() => handleParseVoiceText(voiceText)}
                  className="w-full py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {isParsingVoice ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Calculating Nutrition...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Calculate Macros & Portions</span>
                    </>
                  )}
                </button>
              )}

              {voiceError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{voiceError}</span>
                </div>
              )}

              {/* Voice Parsed Meal Card */}
              {voiceParsedMeal && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3.5 shadow-xl">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-slate-400">Recognized From Speech</span>
                      <h4 className="text-base font-bold text-white flex items-center gap-1.5">
                        <span>{voiceParsedMeal.name}</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      </h4>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-xl bg-black/40 border border-white/5">
                    <div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Calories</div>
                      <div className="text-base font-bold text-white font-mono flex items-center justify-center gap-1">
                        <Flame className="w-3.5 h-3.5 text-amber-400" />
                        <span>{voiceParsedMeal.calories}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Protein</div>
                      <div className="text-base font-bold text-white font-mono" style={{ color: 'var(--accent-primary)' }}>
                        {voiceParsedMeal.protein}g
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Carbs</div>
                      <div className="text-base font-bold text-white font-mono">{voiceParsedMeal.carbs}g</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-mono text-slate-400">Fats</div>
                      <div className="text-base font-bold text-white font-mono">{voiceParsedMeal.fats}g</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleConfirmAnalyzedMeal(voiceParsedMeal)}
                    className="w-full py-2.5 rounded-xl text-white font-bold text-xs shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    <Check className="w-4 h-4" />
                    <span>Confirm & Log Meal</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* SECTION 3: QUICK ADD (IMPROVED MENU)                              */}
          {/* ================================================================= */}
          {activeTab === 'quick_add' && (
            <div className="space-y-4">
              {/* 1. Fast Natural Language Input Bar */}
              <form onSubmit={handleQuickInputSubmit} className="flex items-center gap-2 p-1.5 bg-black/40 border border-white/10 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 flex-1 px-2.5 py-1">
                  <UtensilsCrossed className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={quickInputText}
                    onChange={(e) => setQuickInputText(e.target.value)}
                    disabled={isQuickAnalyzing}
                    placeholder={isQuickAnalyzing ? "AI analyzing meal..." : 'Type meal: "1 peanutbutter toast", "chipotle bowl no cheese", "2 eggs 1 apple"...'}
                    className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!quickInputText.trim() || isQuickAnalyzing}
                  className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  {isQuickAnalyzing ? (
                    <>
                      <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <span>Add</span>
                  )}
                </button>
              </form>

              {quickFeedback && (
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
                  {quickFeedback}
                </div>
              )}

              {/* 2. Direct Brand & Product Search */}
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Search Branded Food</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Exact Manufacturer Facts
                  </span>
                </div>

                <form onSubmit={handleQuickBrandSearch} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={quickBrandQuery}
                    onChange={(e) => setQuickBrandQuery(e.target.value)}
                    placeholder='Search brand (e.g. "Good Culture 2%", "Fairlife", "Quest Bar")...'
                    className="flex-1 px-3 py-1.5 rounded-xl bg-black/50 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isSearchingQuickBrand || !quickBrandQuery.trim()}
                    className="px-3.5 py-1.5 rounded-xl text-white text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0 disabled:opacity-50"
                    style={{ backgroundColor: 'var(--accent-primary)' }}
                  >
                    {isSearchingQuickBrand ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Lookup</span>
                  </button>
                </form>

                {quickBrandError && (
                  <p className="text-[11px] text-amber-400 font-medium">{quickBrandError}</p>
                )}

                {quickBrandResults.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pt-1">
                    {quickBrandResults.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{item.brand ? `${item.brand} ${item.name}` : item.name}</div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {item.servingSize} • <span className="text-amber-300 font-semibold">{item.calories} kcal</span> • <span className="text-indigo-300 font-semibold">{item.protein}g P</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleLogQuickBrandItem(item)}
                          className="px-3 py-1.5 rounded-lg text-white text-xs font-bold shrink-0 transition-all active:scale-95 cursor-pointer flex items-center gap-1"
                          style={{ backgroundColor: 'var(--accent-primary)' }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Log Item</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Fast-Pick Food Staples Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>⭐ Quick Staples</span>
                    <span className="text-[10px] font-mono text-slate-400">Tap to log</span>
                  </span>
                </div>

                {/* Categories */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'protein', label: '🥩 Protein' },
                    { id: 'carbs', label: '🍚 Carbs' },
                    { id: 'dairy', label: '🥛 Dairy' },
                    { id: 'fruit', label: '🍎 Fruit' },
                    { id: 'snacks', label: '🍫 Snacks' },
                    { id: 'fats', label: '🥑 Fats' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setPantryCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                        pantryCategory === cat.id
                          ? 'bg-white/15 text-white shadow-sm'
                          : 'bg-white/[0.03] text-slate-400 hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap max-h-56 overflow-y-auto pr-0.5">
                  {filteredPantry.map((staple) => (
                    <button
                      key={staple.id}
                      type="button"
                      onClick={() => handleLogStaple(staple)}
                      className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] text-white border border-white/10 text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm hover:border-white/20 group"
                      title={`Tap to log ${staple.name}`}
                    >
                      <span className="text-base">{staple.icon || '🍽️'}</span>
                      <span>{staple.name}</span>
                      <div 
                        className="w-5 h-5 rounded-lg flex items-center justify-center text-white transition-transform group-hover:scale-110 ml-0.5"
                        style={{ backgroundColor: 'var(--accent-primary)' }}
                      >
                        <Plus className="w-3 h-3 text-white" strokeWidth={3} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Direct Manual Macro Entry & Quick Bumps */}
              <form onSubmit={handleManualMacroSubmit} className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Manual Custom Macros</span>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                    <span>Quick Bumps:</span>
                    <button type="button" onClick={() => quickBumpManual('protein', 10)} className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-indigo-300">+10g P</button>
                    <button type="button" onClick={() => quickBumpManual('carbs', 25)} className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-sky-300">+25g C</button>
                    <button type="button" onClick={() => quickBumpManual('cals', 100)} className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-amber-300">+100 cal</button>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-mono uppercase text-slate-400">Meal Name</label>
                    <input
                      type="text"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="e.g. Snack, Lunch"
                      className="w-full px-2.5 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-indigo-300">Protein</label>
                    <input
                      type="number"
                      value={manualP}
                      onChange={(e) => setManualP(e.target.value)}
                      placeholder="g"
                      className="w-full px-2 py-1.5 rounded-xl bg-black/40 border border-indigo-500/20 text-xs font-mono font-bold text-indigo-300 text-center outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-sky-300">Carbs</label>
                    <input
                      type="number"
                      value={manualC}
                      onChange={(e) => setManualC(e.target.value)}
                      placeholder="g"
                      className="w-full px-2 py-1.5 rounded-xl bg-black/40 border border-sky-500/20 text-xs font-mono font-bold text-sky-300 text-center outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-amber-300">Fats</label>
                    <input
                      type="number"
                      value={manualF}
                      onChange={(e) => setManualF(e.target.value)}
                      placeholder="g"
                      className="w-full px-2 py-1.5 rounded-xl bg-black/40 border border-amber-500/20 text-xs font-mono font-bold text-amber-300 text-center outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-2 rounded-xl text-white font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                >
                  Log Custom Meal
                </button>
              </form>
            </div>
          )}
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
