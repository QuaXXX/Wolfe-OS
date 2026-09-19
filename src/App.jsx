import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { TopBar } from './components/layout/TopBar';
import { BackgroundGlow } from './components/layout/BackgroundGlow';
import { ComingSoonModal } from './components/common/ComingSoonModal';
import { UndoActionPopup } from './components/common/UndoActionPopup';
import { playSound } from './utils/soundFX';
import { getTodayIso } from './utils/calendarUtils';
import { synchronizeNutritionData, aggregateDailyNutrition } from './utils/nutritionEngine.js';
import { 
  recordDeletion, 
  recordAdditionOrUpdate, 
  markLocalMutation 
} from './utils/cloudSyncEngine';

// Resilient code-split loader
function resilientLazy(factory, retries = 2, intervalMs = 400) {
  return lazy(() => new Promise((resolve, reject) => {
    const attempt = (remaining) => {
      factory()
        .then(resolve)
        .catch((err) => {
          if (remaining <= 0) {
            console.error("View dynamic import failed:", err);
            reject(err);
          } else {
            setTimeout(() => attempt(remaining - 1), intervalMs);
          }
        });
    };
    attempt(retries);
  }));
}

// Nutrition is the primary core view of Wolfe OS
const NutritionView = resilientLazy(() => import('./components/views/NutritionView').then(m => ({ default: m.NutritionView || m.default })));
const SettingsModal = resilientLazy(() => import('./components/layout/SettingsModal').then(m => ({ default: m.SettingsModal })));

// Mock Initial Data
import { INITIAL_USER, INITIAL_NUTRITION_DATA } from './utils/mockData';

// Error Boundary
class ViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("ViewErrorBoundary caught:", error, info);
  }
  handleRecoverAndReload = () => {
    try {
      const raw = localStorage.getItem('wolfe_nutrition_data');
      if (raw) {
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch (e) { parsed = {}; }
        const sanitized = synchronizeNutritionData(parsed);
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(sanitized));
      }
    } catch (e) {}
    window.location.reload();
  };
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto mt-20 p-6 rounded-3xl bg-[#0f1220]/95 border border-rose-500/30 text-center space-y-3 shadow-2xl backdrop-blur-xl">
          <div className="text-sm font-bold text-rose-200">Something went wrong rendering nutrition view.</div>
          <div className="text-xs text-rose-300/70 font-mono break-all">{this.state.error?.message}</div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/20 transition-all cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={this.handleRecoverAndReload}
              className="px-4 py-2 rounded-xl text-white text-xs font-semibold shadow-lg transition-all active:scale-95 cursor-pointer"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              Recover & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function safeGetItem(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeSetItem(key, val) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, val);
  } catch (e) {
    try {
      localStorage.setItem(key, val);
    } catch (err) {}
  }
}

function ViewLoadingFallback() {
  return (
    <div className="w-full py-28 flex flex-col items-center justify-center space-y-3 select-none">
      <div 
        className="w-10 h-10 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center shadow-lg"
        style={{ borderColor: 'var(--accent-border)' }}
      >
        <div 
          className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" 
          style={{ borderColor: 'var(--accent-primary)', borderTopColor: 'transparent' }}
        />
      </div>
      <div className="text-[11px] font-bold text-slate-400 tracking-widest uppercase">Loading Macros...</div>
    </div>
  );
}

const STORAGE_KEY_SETTINGS = 'wolfe_os_settings_v3';

const DEFAULT_SETTINGS = {
  accentHue: 222, // Cyber Blue
  soundEnabled: true,
  compactMode: false,
  aiConfig: {
    provider: 'gemini',
    apiKey: import.meta.env?.VITE_GEMINI_API_KEY || '',
    groqApiKey: import.meta.env?.VITE_GROQ_API_KEY || '',
    model: 'gemini-3.5-flash-lite',
    voiceResponse: false,
  }
};

export function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [comingSoonData, setComingSoonData] = useState(null);
  const [undoAction, setUndoAction] = useState(null);

  // Mark root rendered on mount
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.getElementById('root')?.setAttribute('data-rendered', 'true');
    }
  }, []);

  // Settings State with LocalStorage Persistence
  const [settings, setSettings] = useState(() => {
    try {
      const saved = safeGetItem(STORAGE_KEY_SETTINGS);
      if (!saved) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(saved);
      const envApiKey = import.meta.env?.VITE_GEMINI_API_KEY || '';
      const storedApiKey = parsed?.aiConfig?.apiKey?.trim();
      const envGroqApiKey = import.meta.env?.VITE_GROQ_API_KEY || '';
      const storedGroqApiKey = parsed?.aiConfig?.groqApiKey?.trim();
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        aiConfig: {
          ...DEFAULT_SETTINGS.aiConfig,
          ...(parsed.aiConfig || {}),
          apiKey: storedApiKey || envApiKey || '',
          groqApiKey: storedGroqApiKey || envGroqApiKey || ''
        }
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Nutrition & Fuel State
  const [nutritionData, setNutritionData] = useState(() => {
    try {
      const saved = safeGetItem('wolfe_nutrition_data');
      if (saved) {
        const parsed = JSON.parse(saved);
        return synchronizeNutritionData(parsed);
      }
    } catch (e) {}
    return synchronizeNutritionData(INITIAL_NUTRITION_DATA);
  });

  // Auto-detect day rollover across midnight, window focus, visibility change for nutrition
  useEffect(() => {
    const checkDayRollover = () => {
      const freshToday = getTodayIso();
      setNutritionData(prev => {
        if (!prev) return prev;
        const synced = synchronizeNutritionData(prev, freshToday);
        if (
          synced.currentDate !== prev.currentDate ||
          synced.consumedCalories !== prev.consumedCalories ||
          synced.meals !== prev.meals
        ) {
          try {
            localStorage.setItem('wolfe_nutrition_data', JSON.stringify(synced));
          } catch (e) {}
          return synced;
        }
        return prev;
      });
    };

    window.addEventListener('focus', checkDayRollover);
    const handleVis = () => {
      if (document.visibilityState === 'visible') checkDayRollover();
    };
    document.addEventListener('visibilitychange', handleVis);
    const interval = setInterval(checkDayRollover, 30000);

    return () => {
      window.removeEventListener('focus', checkDayRollover);
      document.removeEventListener('visibilitychange', handleVis);
      clearInterval(interval);
    };
  }, []);

  // Save settings & nutrition changes to localStorage
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    safeSetItem('wolfe_nutrition_data', JSON.stringify(nutritionData));
    safeSetItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [nutritionData, settings]);

  // Dynamically update CSS root variables and tab favicon when accentHue changes
  useEffect(() => {
    const hue = settings.accentHue || 222;
    document.documentElement.style.setProperty('--accent-hue', hue);
    document.documentElement.style.setProperty('--accent-primary', `hsl(${hue}, 95%, 58%)`);
    document.documentElement.style.setProperty('--accent-subtle', `hsla(${hue}, 95%, 58%, 0.12)`);
    document.documentElement.style.setProperty('--accent-border', `hsla(${hue}, 95%, 58%, 0.25)`);
    document.documentElement.style.setProperty('--accent-glow', `hsla(${hue}, 95%, 58%, 0.35)`);

    try {
      const color = `hsl(${hue}, 95%, 58%)`;
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#08090d" />
        <rect width="24" height="24" rx="6" stroke="${color}" stroke-width="0.8" stroke-opacity="0.4" fill="none" />
        <path fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M5.5 5.5L8.5 11L4.5 13.5L5.5 5.5Z" />
        <path fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M18.5 5.5L15.5 11L19.5 13.5L18.5 5.5Z" />
        <path stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M8.5 11L12 8L15.5 11" />
        <path fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="M9 13.5L12 19L15 13.5L12 11.5L9 13.5Z" />
        <path stroke="${color}" stroke-width="1.6" stroke-linecap="round" d="M4.5 13.5L9 13.5" />
        <path stroke="${color}" stroke-width="1.6" stroke-linecap="round" d="M19.5 13.5L15 13.5" />
      </svg>`;
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const blobUrl = URL.createObjectURL(blob);
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement('link');
        link.type = 'image/svg+xml';
        link.rel = 'shortcut icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = blobUrl;
    } catch (e) {}
  }, [settings.accentHue]);

  const handleResetSettings = () => {
    playSound('switch', settings.soundEnabled);
    setSettings(DEFAULT_SETTINGS);
    safeSetItem(STORAGE_KEY_SETTINGS, JSON.stringify(DEFAULT_SETTINGS));
  };

  const handleToggleSound = () => {
    const nextSound = !settings.soundEnabled;
    playSound('switch', nextSound);
    setSettings(prev => ({ ...prev, soundEnabled: nextSound }));
  };

  const handleOpenComingSoon = (featureData) => {
    playSound('pop', settings.soundEnabled);
    setComingSoonData(featureData);
  };

  const handleCloseComingSoon = () => {
    playSound('click', settings.soundEnabled);
    setComingSoonData(null);
  };

  // Dedicated Target Adjustment Handler (updates calories, protein, carbs, fats)
  const handleUpdateNutritionTargets = ({ targetCalories, protein, carbs, fats }) => {
    playSound('success', settings.soundEnabled);
    const today = getTodayIso();
    markLocalMutation();

    setNutritionData(prev => {
      const base = (prev && typeof prev === 'object') ? prev : {};
      const updatedDailyTargets = {
        ...(base.dailyTargets || {}),
        [today]: {
          ...(base.dailyTargets?.[today] || {}),
          calories: targetCalories,
          protein,
          carbs,
          fats
        }
      };

      const next = {
        ...base,
        targetCalories,
        protein: {
          ...(base.protein || { current: 0, unit: 'g', color: '#6366f1' }),
          target: protein
        },
        carbs: {
          ...(base.carbs || { current: 0, unit: 'g', color: '#06b6d4' }),
          target: carbs
        },
        fats: {
          ...(base.fats || { current: 0, unit: 'g', color: '#f59e0b' }),
          target: fats
        },
        dailyTargets: updatedDailyTargets,
        updatedAt: Date.now()
      };

      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(next));
      } catch (e) {}

      return next;
    });
  };

  // Global Food Logging Handler (triggered from voice in TopBar)
  const handleLogMeal = useCallback((mealEntry) => {
    playSound('success', settings.soundEnabled);
    const today = getTodayIso();
    const mealDate = mealEntry?.date || today;
    const stampedMeal = {
      ...mealEntry,
      date: mealDate,
      createdAt: mealEntry?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    if (stampedMeal?.id) recordAdditionOrUpdate(stampedMeal.id);
    markLocalMutation();

    setNutritionData(prev => {
      const base = (prev && typeof prev === 'object') ? prev : {};
      let storageMeals = [];
      try {
        const raw = localStorage.getItem('wolfe_nutrition_data');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.meals)) storageMeals = parsed.meals;
        }
      } catch (e) {}

      const combined = [stampedMeal, ...(base.meals || []), ...storageMeals];
      const mealMap = new Map();
      combined.forEach(m => {
        if (m && m.id && !mealMap.has(m.id)) {
          mealMap.set(m.id, m);
        }
      });
      const nextMeals = Array.from(mealMap.values());
      const todayMeals = nextMeals.filter(m => m && m.date === today);
      const todayTotals = aggregateDailyNutrition(todayMeals);

      const nextData = {
        ...base,
        currentDate: today,
        consumedCalories: todayTotals.calories,
        protein: { ...(base.protein || {}), current: todayTotals.protein },
        carbs: { ...(base.carbs || {}), current: todayTotals.carbs },
        fats: { ...(base.fats || {}), current: todayTotals.fats },
        meals: nextMeals,
        updatedAt: Date.now()
      };

      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}

      return nextData;
    });
  }, [settings.soundEnabled]);

  // Undo Action Handler for deleted meals
  const handleUndoAction = (action) => {
    if (!action) return;
    playSound('switch', settings.soundEnabled);

    if (action.mealRestored) {
      handleLogMeal(action.mealRestored);
    }
    setUndoAction(null);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-white/20">
      {/* Background Ambient Glow */}
      <BackgroundGlow accentHue={settings.accentHue} />

      {/* Top Application Bar */}
      <TopBar 
        soundEnabled={settings.soundEnabled}
        onToggleSound={handleToggleSound}
        onOpenSettings={() => setIsSettingsOpen(true)}
        aiConfig={settings.aiConfig}
        osData={{
          settings,
          nutritionData,
          setSettings,
          setNutritionData,
          onLogMeal: handleLogMeal
        }}
        onOpenMealLogModal={() => {
          // Trigger meal log modal inside nutrition view via dispatch
          window.dispatchEvent(new CustomEvent('wolfe-open-meal-modal'));
        }}
        onLogMeal={handleLogMeal}
      />

      {/* Primary Viewport: Macro & Nutrition Tracker */}
      <main className={`flex-1 w-full px-3 sm:px-6 pt-4 pb-12 ${settings.compactMode ? 'max-w-5xl' : 'max-w-6xl'} mx-auto`}>
        <ViewErrorBoundary>
          <Suspense fallback={<ViewLoadingFallback />}>
            <NutritionView 
              nutritionData={nutritionData}
              setNutritionData={setNutritionData}
              settings={settings}
              user={INITIAL_USER}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenComingSoon={handleOpenComingSoon}
              soundEnabled={settings.soundEnabled}
            />
          </Suspense>
        </ViewErrorBoundary>
      </main>

      {/* Persistent Undo Action Toast Popup */}
      <UndoActionPopup 
        undoAction={undoAction}
        onUndo={handleUndoAction}
        onDismiss={() => setUndoAction(null)}
        soundEnabled={settings.soundEnabled}
      />

      {/* Macro Targets & App Settings Drawer */}
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal 
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            settings={settings}
            onUpdateSettings={setSettings}
            onResetSettings={handleResetSettings}
            nutritionData={nutritionData}
            onUpdateTargets={handleUpdateNutritionTargets}
            soundEnabled={settings.soundEnabled}
          />
        </Suspense>
      )}

      {/* Reusable Coming Soon Feature Preview Modal */}
      <ComingSoonModal 
        isOpen={!!comingSoonData}
        onClose={handleCloseComingSoon}
        soundEnabled={settings.soundEnabled}
        {...comingSoonData}
      />
    </div>
  );
}

export default App;
