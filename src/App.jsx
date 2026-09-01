import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TopBar } from './components/layout/TopBar';
import { Dock, NAV_ITEMS } from './components/layout/Dock';
import { BackgroundGlow } from './components/layout/BackgroundGlow';
import { SettingsModal } from './components/layout/SettingsModal';
import { GoogleCalendarModal } from './components/calendar/GoogleCalendarModal';
import { ComingSoonModal } from './components/common/ComingSoonModal';
import { UndoActionPopup } from './components/common/UndoActionPopup';
import { playSound } from './utils/soundFX';
import { getTodayIso, formatDateTitle, addDays } from './utils/calendarUtils';
import { 
  isGoogleCalendarConnected, 
  fetchGoogleCalendarEvents,
  createGoogleCalendarEvent, 
  deleteGoogleCalendarEvent,
  updateGoogleTaskStatus,
  purgeGoogleCalendarEntriesByKeywords,
  checkAndHandleOAuthRedirect
} from './utils/googleCalendarService';

// Views
import { HomeView } from './components/views/HomeView';
import { SchoolView } from './components/views/SchoolView';
import { WorkoutsView } from './components/views/WorkoutsView';
import { NutritionView } from './components/views/NutritionView';
import { TradingView } from './components/views/TradingView';
import { CalendarView } from './components/views/CalendarView';

// Mock Data
import { 
  INITIAL_USER, 
  INITIAL_SCHOOL_DATA, 
  INITIAL_WORKOUT_DATA, 
  INITIAL_NUTRITION_DATA, 
  INITIAL_TRADING_DATA, 
  INITIAL_CALENDAR_DATA 
} from './utils/mockData';

// Error Boundary to prevent black-screen crashes from view errors
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
  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto mt-20 p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center space-y-3">
          <div className="text-sm font-bold text-rose-200">Something went wrong rendering this view.</div>
          <div className="text-xs text-rose-300/70 font-mono break-all">{this.state.error?.message}</div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-semibold border border-rose-500/30 transition-all"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const STORAGE_KEY_SETTINGS = 'wolfe_os_settings_v3';
const STORAGE_KEY_CALENDAR = 'wolfe_os_calendar_v5';

const DEFAULT_SETTINGS = {
  accentHue: 222, // Cyber Blue
  soundEnabled: true,
  compactMode: false,
  visibleModules: {
    timeline: true,
    trading: true,
    school: true,
    workouts: true,
    nutrition: true,
  },
  aiConfig: {
    provider: 'gemini',
    apiKey: import.meta.env?.VITE_GEMINI_API_KEY || '',
    model: 'gemini-3.5-flash',
    voiceResponse: false,
  }
};

export function App() {
  const [activeView, setActiveView] = useState('home');
  const [slideDirection, setSlideDirection] = useState(0); // -1 for left, 1 for right
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGCalModalOpen, setIsGCalModalOpen] = useState(false);
  const [comingSoonData, setComingSoonData] = useState(null);
  const [undoAction, setUndoAction] = useState(null);

  // Settings State with LocalStorage Persistence
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Calendar & Timeline State
  const [calendarData, setCalendarData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CALENDAR);
      if (saved) {
        const parsed = JSON.parse(saved);
        const cleanItems = (parsed.items || [])
          .filter(it => it.isGoogle || !it.id?.startsWith('cal-'))
          .filter(it => !it.title?.toUpperCase().includes('FNCE') && !it.title?.toUpperCase().includes('OPMA'));
        return {
          ...parsed,
          items: cleanItems
        };
      }
    } catch {}
    return {
      currentDate: formatDateTitle(getTodayIso()),
      selectedDate: getTodayIso(),
      items: []
    };
  });

  // Clean out any legacy tokens and handle Google OAuth redirect
  useEffect(() => {
    // 1. Check if returning from Google OAuth redirect (mobile Safari/Chrome)
    const justAuthorized = checkAndHandleOAuthRedirect();

    try {
      if (!justAuthorized && typeof localStorage !== 'undefined' && !localStorage.getItem('wolfe_user_signed_in_google')) {
        localStorage.removeItem('wolfe_gcal_token');
        localStorage.removeItem('wolfe_gcal_refresh_token');
        localStorage.removeItem('wolfe_gcal_expiry');
      }
    } catch {}

    setCalendarData(prev => ({
      ...prev,
      items: prev.items.filter(it => !it.title?.toUpperCase().includes('FNCE') && !it.title?.toUpperCase().includes('OPMA'))
    }));

    if (isGoogleCalendarConnected()) {
      fetchGoogleCalendarEvents()
        .then(events => {
          if (events && events.length > 0) {
            setCalendarData(prev => ({ ...prev, items: events }));
          }
        })
        .catch(err => console.warn("Google sync on startup:", err));
    }
  }, []);

  // Nutrition State
  const [nutritionData, setNutritionData] = useState(() => {
    try {
      const saved = localStorage.getItem('wolfe_os_nutrition_v5');
      return saved ? JSON.parse(saved) : INITIAL_NUTRITION_DATA;
    } catch { return INITIAL_NUTRITION_DATA; }
  });

  // Workout State
  const [workoutData, setWorkoutData] = useState(() => {
    try {
      const saved = localStorage.getItem('wolfe_os_workout_v5');
      return saved ? JSON.parse(saved) : INITIAL_WORKOUT_DATA;
    } catch { return INITIAL_WORKOUT_DATA; }
  });

  // Trading State
  const [tradingData, setTradingData] = useState(() => {
    try {
      const saved = localStorage.getItem('wolfe_os_trading_v5');
      return saved ? JSON.parse(saved) : INITIAL_TRADING_DATA;
    } catch { return INITIAL_TRADING_DATA; }
  });

  // School State (Fresh minimal reset)
  const [schoolData, setSchoolData] = useState(() => {
    try {
      const saved = localStorage.getItem('wolfe_os_school_v5');
      return saved ? JSON.parse(saved) : INITIAL_SCHOOL_DATA;
    } catch { return INITIAL_SCHOOL_DATA; }
  });

  // Sync settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn("Storage notice:", e);
    }
  }, [settings]);

  // Sync all hubs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CALENDAR, JSON.stringify(calendarData));
      localStorage.setItem('wolfe_os_nutrition_v5', JSON.stringify(nutritionData));
      localStorage.setItem('wolfe_os_workout_v5', JSON.stringify(workoutData));
      localStorage.setItem('wolfe_os_trading_v5', JSON.stringify(tradingData));
      localStorage.setItem('wolfe_os_school_v5', JSON.stringify(schoolData));
    } catch (e) {
      console.warn("Storage notice:", e);
    }
  }, [calendarData, nutritionData, workoutData, tradingData, schoolData]);

  // Automatic Real-Time 2-Way Sync with Google Calendar & Google Tasks
  const syncWithGoogle = useCallback(async () => {
    if (!isGoogleCalendarConnected()) return;
    try {
      const liveGoogleItems = await fetchGoogleCalendarEvents();
      if (liveGoogleItems && Array.isArray(liveGoogleItems)) {
        setCalendarData(prev => ({
          ...prev,
          currentDate: formatDateTitle(getTodayIso()),
          selectedDate: getTodayIso(),
          items: liveGoogleItems
        }));
      }
    } catch (err) {
      console.debug("Auto sync check:", err);
    }
  }, []);

  // Sync from Google ONLY once on initial app load
  useEffect(() => {
    syncWithGoogle();
  }, [syncWithGoogle]);

  // Touch Swipe Gesture State
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  // Dynamically update CSS root variables and tab favicon when accentHue changes
  useEffect(() => {
    const hue = settings.accentHue || 222;
    document.documentElement.style.setProperty('--accent-hue', hue);
    document.documentElement.style.setProperty('--accent-primary', `hsl(${hue}, 95%, 58%)`);
    document.documentElement.style.setProperty('--accent-subtle', `hsla(${hue}, 95%, 58%, 0.12)`);
    document.documentElement.style.setProperty('--accent-border', `hsla(${hue}, 95%, 58%, 0.25)`);
    document.documentElement.style.setProperty('--accent-glow', `hsla(${hue}, 95%, 58%, 0.35)`);

    // Dynamically update browser tab favicon with sleek geometric wolf design & dark background matching active theme
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
        link.rel = 'icon';
        link.type = 'image/svg+xml';
        document.head.appendChild(link);
      }
      link.href = blobUrl;
    } catch (e) {
      console.debug("Favicon sync notice:", e);
    }
  }, [settings.accentHue]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight' || e.key === 'l') {
        handleNextView();
      } else if (e.key === 'ArrowLeft' || e.key === 'h') {
        handlePrevView();
      } else if (e.key === ',' || e.key === 'Escape') {
        setIsSettingsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeView]);

  const viewIds = NAV_ITEMS.map(item => item.id);

  const handleNavigate = (newView) => {
    if (newView === activeView) return;
    const currentIndex = viewIds.indexOf(activeView);
    const newIndex = viewIds.indexOf(newView);
    setSlideDirection(newIndex > currentIndex ? 1 : -1);
    setActiveView(newView);
  };

  const handleNextView = () => {
    const currentIndex = viewIds.indexOf(activeView);
    const nextIndex = (currentIndex + 1) % viewIds.length;
    setSlideDirection(1);
    setActiveView(viewIds[nextIndex]);
  };

  const handlePrevView = () => {
    const currentIndex = viewIds.indexOf(activeView);
    const prevIndex = (currentIndex - 1 + viewIds.length) % viewIds.length;
    setSlideDirection(-1);
    setActiveView(viewIds[prevIndex]);
  };

  // Touch Swipe Handlers for Mobile
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;

    const diffX = touchStartX.current - touchEndX;
    const diffY = touchStartY.current - touchEndY;

    // Must be predominantly horizontal and sufficiently long
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 60) {
      playSound('swipe', settings.soundEnabled);
      if (diffX > 0) {
        handleNextView();
      } else {
        handlePrevView();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    playSound('switch', true);
  };

  const handleOpenComingSoon = (featureName, category, description) => {
    setComingSoonData({ featureName, category, description });
  };

  const handleCloseComingSoon = () => {
    setComingSoonData(null);
  };

  const handleSyncGoogleCalendarSuccess = (newItems) => {
    if (newItems && Array.isArray(newItems)) {
      setCalendarData(prev => ({
        ...prev,
        items: newItems
      }));
    }
  };

  // Calendar Item Operations (Universal 2-Way Sync + Undo Tracking)
  const handleAddItem = async (newItem) => {
    if (!newItem) return;
    if (Array.isArray(newItem)) {
      return handleBatchAddItems(newItem);
    }

    let itemToSave = { ...newItem };

    if (isGoogleCalendarConnected() && !itemToSave.isGoogle) {
      try {
        const createdGcal = await createGoogleCalendarEvent({
          type: itemToSave.type,
          title: itemToSave.title,
          startTime: itemToSave.isAllDay ? 'All Day' : itemToSave.time.split(' - ')[0],
          endTime: itemToSave.isAllDay ? 'All Day' : (itemToSave.time.split(' - ')[1] || '03:00 PM'),
          dateStr: itemToSave.date,
          isAllDay: itemToSave.isAllDay,
          category: itemToSave.category
        });
        itemToSave.id = createdGcal.id;
        itemToSave.isGoogle = true;
        itemToSave.htmlLink = createdGcal.htmlLink;
      } catch (err) {
        console.warn("Manual add Google Calendar sync error:", err);
      }
    }

    setCalendarData(prev => ({
      ...prev,
      items: [itemToSave, ...prev.items.filter(i => i.id !== itemToSave.id)]
    }));

    // Trigger Undo Action Toast
    setUndoAction({
      title: itemToSave.type === 'deadline' ? "Deadline Added" : "Calendar Item Added",
      description: `Added "${itemToSave.title}" on ${itemToSave.date}`,
      type: "ADD_ITEM",
      itemsAdded: [itemToSave],
      itemsRemoved: []
    });
  };

  const handleBatchAddItems = (itemsArray) => {
    if (!itemsArray || itemsArray.length === 0) return;
    playSound('success', settings.soundEnabled);

    // 1. Immediately create local items for 0ms visual lag
    const localItems = itemsArray.map((item, idx) => ({
      ...item,
      id: item.id || `batch-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      completed: false
    }));

    // Instant state update — zero screen freeze or visual lag!
    setCalendarData(prev => ({
      ...prev,
      items: [...localItems, ...prev.items.filter(it => !localItems.some(l => l.id === it.id))]
    }));

    const isGcalConnected = isGoogleCalendarConnected();

    // 2. Set initial Undo Toast with background sync status
    setUndoAction({
      title: "📚 Syllabus Items Added",
      description: isGcalConnected ? `Added ${localItems.length} items • Syncing to Google...` : `Added ${localItems.length} items to calendar`,
      type: "BATCH_ADD",
      itemsAdded: localItems,
      itemsRemoved: [],
      syncProgress: isGcalConnected ? { current: 0, total: localItems.length, inProgress: true } : null
    });

    // 3. Perform Google Calendar Sync in the Background (Non-blocking)
    if (isGcalConnected) {
      (async () => {
        const syncedItems = [];
        let completedCount = 0;

        for (const item of localItems) {
          let updatedItem = { ...item };
          try {
            const createdGcal = await createGoogleCalendarEvent({
              type: item.type,
              title: item.title,
              startTime: item.isAllDay ? 'All Day' : item.time?.split(' - ')[0],
              endTime: item.isAllDay ? 'All Day' : (item.time?.split(' - ')[1] || '03:00 PM'),
              dateStr: item.date,
              isAllDay: item.isAllDay,
              category: item.category
            });
            updatedItem.id = createdGcal.id;
            updatedItem.isGoogle = true;
            updatedItem.isGoogleTask = item.type === 'task';
            updatedItem.htmlLink = createdGcal.htmlLink;
          } catch (err) {
            console.warn("Background batch sync error:", err);
          }

          completedCount++;
          syncedItems.push(updatedItem);

          // Update sync progress state in live Undo Toast
          setUndoAction(prev => (prev && prev.type === 'BATCH_ADD') ? {
            ...prev,
            itemsAdded: syncedItems,
            syncProgress: {
              current: completedCount,
              total: localItems.length,
              inProgress: completedCount < localItems.length
            },
            description: completedCount < localItems.length 
              ? `Syncing to Google Calendar (${completedCount}/${localItems.length})...`
              : `✅ ${localItems.length} items synced to Google Calendar`
          } : prev);
        }

        // Final state update with official Google IDs
        setCalendarData(prev => ({
          ...prev,
          items: prev.items.map(it => {
            const match = syncedItems.find(s => s.date === it.date && s.title === it.title);
            return match || it;
          })
        }));
      })();
    }
  };

  const handleClearDeadlines = async (targetDate = 'ALL') => {
    playSound('switch', settings.soundEnabled);
    const toDelete = calendarData.items.filter(it => it.type === 'deadline' && (targetDate === 'ALL' || it.date === targetDate));

    setCalendarData(prev => ({
      ...prev,
      items: prev.items.filter(it => !(it.type === 'deadline' && (targetDate === 'ALL' || it.date === targetDate)))
    }));

    if (isGoogleCalendarConnected()) {
      for (const dl of toDelete) {
        deleteGoogleCalendarEvent(dl.id, false).catch(console.warn);
      }
    }

    setUndoAction({
      title: "🗑️ Deadlines Removed",
      description: `Removed ${toDelete.length} deadline(s) from calendar`,
      type: "CLEAR_DEADLINES",
      itemsAdded: [],
      itemsRemoved: toDelete
    });
  };

  const handleDeleteItem = async (id) => {
    playSound('click', settings.soundEnabled);
    const targetItem = calendarData.items.find(it => it.id === id);
    const isGoogleTask = targetItem?.isGoogleTask || targetItem?.type === 'task';

    // Instant optimistic removal from UI
    setCalendarData(prev => ({
      ...prev,
      items: prev.items.filter(it => it.id !== id)
    }));

    // Insta-delete on Google Calendar and Google Tasks in background
    if (isGoogleCalendarConnected()) {
      deleteGoogleCalendarEvent(id, isGoogleTask).catch(err => console.warn("Delete error:", err));
    }

    if (targetItem) {
      setUndoAction({
        title: "🗑️ Item Deleted",
        description: `Removed "${targetItem.title}"`,
        type: "DELETE_ITEM",
        itemsAdded: [],
        itemsRemoved: [targetItem]
      });
    }
  };

  // Delete a specific event by title and optional date (e.g. from Voice / Text commands)
  const handleDeleteSpecificItem = async (titleQuery, targetDate) => {
    playSound('click', settings.soundEnabled);
    const lowerQuery = (titleQuery || '').toLowerCase().trim();

    const targetItem = calendarData.items.find(it => {
      const titleMatch = it.title.toLowerCase().includes(lowerQuery) || lowerQuery.includes(it.title.toLowerCase());
      if (!titleMatch) return false;
      if (targetDate && targetDate !== 'ANY') {
        return it.date === targetDate;
      }
      return true;
    });

    if (targetItem) {
      const isGoogleTask = targetItem.isGoogleTask || targetItem.type === 'task';
      setCalendarData(prev => ({
        ...prev,
        items: prev.items.filter(it => it.id !== targetItem.id)
      }));
      if (isGoogleCalendarConnected()) {
        deleteGoogleCalendarEvent(targetItem.id, isGoogleTask).catch(err => console.warn("Delete error:", err));
      }

      setUndoAction({
        title: "🗑️ Item Deleted",
        description: `Removed "${targetItem.title}"`,
        type: "DELETE_ITEM",
        itemsAdded: [],
        itemsRemoved: [targetItem]
      });
    }
  };

  const handleClearCalendar = async (targetDate) => {
    playSound('switch', settings.soundEnabled);
    const dateToClear = targetDate || getTodayIso();
    const removedItems = calendarData.items.filter(it => dateToClear === 'ALL' || it.date === dateToClear);

    setCalendarData(prev => ({
      ...prev,
      items: dateToClear === 'ALL' ? [] : prev.items.filter(it => it.date !== dateToClear)
    }));

    if (isGoogleCalendarConnected()) {
      // Delete each removed item from Google (handles both Calendar events and Tasks)
      for (const it of removedItems) {
        deleteGoogleCalendarEvent(it.id, it.isGoogleTask || it.type === 'task').catch(console.warn);
      }
    }

    setUndoAction({
      title: "🧹 Calendar Cleared",
      description: `Cleared ${removedItems.length} items for ${dateToClear === 'ALL' ? 'all days' : dateToClear}`,
      type: "CLEAR_ITEMS",
      itemsAdded: [],
      itemsRemoved: removedItems,
      targetDate: dateToClear
    });
  };

  const handleToggleTask = async (id) => {
    const item = calendarData.items.find(it => it.id === id);
    if (!item) return;

    const nextCompleted = !item.completed;
    if (nextCompleted) playSound('success', settings.soundEnabled);

    // Optimistic UI update first
    setCalendarData(prev => ({
      ...prev,
      items: prev.items.map(it => {
        if (it.id === id) {
          return { ...it, completed: nextCompleted };
        }
        return it;
      })
    }));

    // Sync to Google in background
    if (isGoogleCalendarConnected()) {
      updateGoogleTaskStatus(id, nextCompleted).catch(err => console.warn("Task toggle sync error:", err));
    }
  };

  // Universal Undo Action Handler
  const handleUndoAction = async (action) => {
    if (!action) return;
    playSound('switch', settings.soundEnabled);

    // 1. If items were added, remove them
    if (action.itemsAdded && action.itemsAdded.length > 0) {
      const idsToRemove = new Set(action.itemsAdded.map(it => it.id));
      setCalendarData(prev => ({
        ...prev,
        items: prev.items.filter(it => !idsToRemove.has(it.id))
      }));

      // Delete from Google Calendar & Tasks in background
      if (isGoogleCalendarConnected()) {
        for (const item of action.itemsAdded) {
          deleteGoogleCalendarEvent(item.id, item.isGoogleTask || item.type === 'task').catch(console.warn);
        }
      }
    }

    // 2. If items were removed, restore them
    if (action.itemsRemoved && action.itemsRemoved.length > 0) {
      // First, restore items to local state immediately (optimistic)
      setCalendarData(prev => ({
        ...prev,
        items: [...action.itemsRemoved, ...prev.items.filter(it => !action.itemsRemoved.some(r => r.id === it.id))]
      }));

      // Re-create on Google Calendar in background and update IDs
      if (isGoogleCalendarConnected()) {
        for (const item of action.itemsRemoved) {
          try {
            const created = await createGoogleCalendarEvent({
              type: item.type,
              title: item.title,
              startTime: item.isAllDay ? 'All Day' : (item.time?.split(' - ')[0] || '02:00 PM'),
              endTime: item.isAllDay ? 'All Day' : (item.time?.split(' - ')[1] || '03:00 PM'),
              dateStr: item.date,
              isAllDay: item.isAllDay,
              category: item.category
            });
            // Update local state with new Google ID so future operations work
            if (created?.id) {
              const oldId = item.id;
              setCalendarData(prev => ({
                ...prev,
                items: prev.items.map(it => it.id === oldId ? { ...it, id: created.id, isGoogle: true, htmlLink: created.htmlLink } : it)
              }));
            }
          } catch (e) {
            console.warn("Undo restore Google sync error:", e);
          }
        }
      }
    }

    setUndoAction(null);
  };

  // Render current active view
  const renderActiveView = () => {
    const commonProps = {
      user: INITIAL_USER,
      settings: settings,
      onOpenSettings: () => setIsSettingsOpen(true),
      onOpenComingSoon: handleOpenComingSoon,
      onNavigate: handleNavigate,
      soundEnabled: settings.soundEnabled
    };

    switch (activeView) {
      case 'home':
        return (
          <HomeView 
            schoolData={schoolData}
            workoutData={workoutData}
            nutritionData={nutritionData}
            tradingData={tradingData}
            calendarData={calendarData}
            setSettings={setSettings}
            setNutritionData={setNutritionData}
            setWorkoutData={setWorkoutData}
            setTradingData={setTradingData}
            setSchoolData={setSchoolData}
            setCalendarData={setCalendarData}
            onItemCreated={handleAddItem}
            onClearCalendar={handleClearCalendar}
            onClearDeadlines={handleClearDeadlines}
            onDeleteSpecificItem={handleDeleteSpecificItem}
            onToggleTask={handleToggleTask}
            {...commonProps}
          />
        );
      case 'school':
        return (
          <SchoolView 
            schoolData={schoolData}
            onAddItem={handleAddItem}
            onBatchAddItems={handleBatchAddItems}
            {...commonProps}
          />
        );
      case 'workouts':
        return (
          <WorkoutsView 
            workoutData={workoutData}
            {...commonProps}
          />
        );
      case 'nutrition':
        return (
          <NutritionView 
            nutritionData={nutritionData}
            {...commonProps}
          />
        );
      case 'trading':
        return (
          <TradingView 
            tradingData={tradingData}
            {...commonProps}
          />
        );
      case 'calendar':
        return (
          <CalendarView 
            calendarData={calendarData}
            onAddItem={handleAddItem}
            onBatchAddItems={handleBatchAddItems}
            onClearDeadlines={handleClearDeadlines}
            onDeleteItem={handleDeleteItem}
            onToggleTask={handleToggleTask}
            {...commonProps}
          />
        );
      default:
        return null;
    }
  };

  // Variants for direction-aware swipe animations
  const pageVariants = {
    initial: (dir) => ({
      opacity: 0,
      x: dir * 30,
    }),
    animate: {
      opacity: 1,
      x: 0,
      transition: {
        x: { type: 'spring', stiffness: 350, damping: 30 },
        opacity: { duration: 0.15 }
      }
    },
    exit: (dir) => ({
      opacity: 0,
      x: dir * -30,
      transition: {
        opacity: { duration: 0.1 }
      }
    })
  };

  return (
    <div 
      className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-white/20"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background Interactive Ambient Glow */}
      <BackgroundGlow accentHue={settings.accentHue} />

      {/* Top Application Bar */}
      <TopBar 
        activeView={activeView} 
        onNavigate={handleNavigate}
        onOpenSettings={() => setIsSettingsOpen(true)}
        soundEnabled={settings.soundEnabled}
        onToggleSound={() => setSettings(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
        aiConfig={settings.aiConfig}
        osData={{
          schoolData,
          workoutData,
          nutritionData,
          tradingData,
          calendarData,
          setSettings,
          setNutritionData,
          setWorkoutData,
          setTradingData,
          setSchoolData,
          setCalendarData,
          onClearDeadlines: handleClearDeadlines
        }}
        onEventCreated={handleAddItem}
        onClearCalendar={handleClearCalendar}
        onDeleteSpecificItem={handleDeleteSpecificItem}
      />

      {/* Main Dynamic Viewport Container */}
      <main className={`flex-1 w-full px-4 sm:px-6 pt-5 ${settings.compactMode ? 'max-w-5xl' : 'max-w-6xl'} mx-auto`}>
        <AnimatePresence mode="wait" custom={slideDirection}>
          <motion.div
            key={activeView}
            custom={slideDirection}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <ViewErrorBoundary key={activeView}>
              {renderActiveView()}
            </ViewErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Floating Interactive Dock */}
      <Dock 
        activeView={activeView} 
        onViewChange={handleNavigate}
        soundEnabled={settings.soundEnabled}
      />

      {/* Persistent Undo Action Toast Popup */}
      <UndoActionPopup 
        undoAction={undoAction}
        onUndo={handleUndoAction}
        onDismiss={() => setUndoAction(null)}
        soundEnabled={settings.soundEnabled}
      />

      {/* Interactive Settings Drawer with Google Calendar & Color Slider */}
      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        onResetSettings={handleResetSettings}
        onOpenGoogleCalendarModal={() => setIsGCalModalOpen(true)}
        onSyncGoogleCalendarSuccess={handleSyncGoogleCalendarSuccess}
        soundEnabled={settings.soundEnabled}
      />

      {/* Google Calendar 2-Way Sync Modal */}
      <GoogleCalendarModal 
        isOpen={isGCalModalOpen}
        onClose={() => setIsGCalModalOpen(false)}
        onSyncSuccess={handleSyncGoogleCalendarSuccess}
        soundEnabled={settings.soundEnabled}
      />

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
