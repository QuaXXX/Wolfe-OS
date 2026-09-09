/**
 * Wolfe OS Unified Cross-Device Cloud Sync Engine
 * Synchronizes all 6 command hubs between Phone and Desktop:
 * - Nutrition (meals, macros, targets, weight history, staples)
 * - Workouts (splits, exercises, sets, history)
 * - Trading (watchlist, positions, journal, paper trader, Hermes briefs)
 * - Academics / School (courses, flashcard decks, quizzes, weak spots)
 * - Calendar / Timeline (schedule, events, tasks)
 * - Settings (theme color, AI config, module visibility)
 */

import { 
  getGoogleAccount, 
  isGoogleCalendarConnected, 
  getValidAccessToken, 
  authedGoogleFetch,
  getOrCreateDeviceId,
  isMobileDevice
} from './googleCalendarService.js';
import { reconcileCalendarItems, getTodayIso } from './calendarUtils.js';
import { aggregateDailyNutrition } from './nutritionEngine.js';

// LocalStorage Keys for all Wolfe OS modules
export const SYNC_KEYS = {
  SETTINGS: 'wolfe_os_settings_v3',
  SETTINGS_FALLBACK: 'wolfe_settings',
  CALENDAR: 'wolfe_os_calendar_v5',
  CALENDAR_FALLBACK: 'wolfe_calendar_data',
  NUTRITION: 'wolfe_nutrition_data',
  WORKOUTS: 'wolfe_workout_data',
  TRADING: 'wolfe_trading_data',
  SCHOOL: 'wolfe_school_data',
  // Extended trading
  TRADING_CONFIG: 'wolfe_trading_config_v1',
  TRADING_WATCHLIST: 'wolfe_trading_watchlist_v1',
  TRADING_POSITIONS: 'wolfe_trading_positions_v1',
  TRADING_JOURNAL: 'wolfe_trading_journal_v1',
  TRADING_HERMES_BRIEFS: 'wolfe_trading_hermes_briefs_v1',
  PAPER_ACCOUNT: 'wolfe_paper_account_v1',
  PAPER_POSITIONS: 'wolfe_paper_positions_v1',
  PAPER_HISTORY: 'wolfe_paper_history_v1',
  // Extended study
  STUDY_DECKS: 'wolfe_study_decks',
  STUDY_QUIZZES: 'wolfe_study_quizzes',
  STUDY_WEAK_SPOTS: 'wolfe_study_weak_spots',
  STUDY_COURSES: 'wolfe_study_courses',
  // Cloud Sync Metadata
  CLOUD_META: 'wolfe_cloud_sync_meta_v1',
  // Permanent Deletion Tombstone Ledger
  TOMBSTONES: 'wolfe_tombstones_v1'
};

/**
 * Safely parse JSON from localStorage
 */
function readStorageJson(key, fallback = null) {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * Safely write JSON to localStorage
 */
function writeStorageJson(key, value) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Failed to persist ${key} to localStorage:`, e);
  }
}

/**
 * Tombstone Ledger Management
 * Permanently tracks deleted item IDs across all collections to prevent cross-device resurrection.
 */
export function getTombstones() {
  return readStorageJson(SYNC_KEYS.TOMBSTONES, {}) || {};
}

export function saveTombstones(tombstones) {
  writeStorageJson(SYNC_KEYS.TOMBSTONES, tombstones);
}

let lastLocalMutationAt = 0;

export function markLocalMutation() {
  lastLocalMutationAt = Date.now();
}

export function isLocalMutationRecent(windowMs = 6000) {
  return (Date.now() - lastLocalMutationAt) < windowMs;
}

/**
 * Permanently record a deletion tombstone and immediately notify cloud
 */
export function recordDeletion(id) {
  if (!id) return;
  const idStr = String(id);
  const tombstones = getTombstones();
  tombstones[idStr] = Date.now();
  saveTombstones(tombstones);
  markLocalMutation();
  triggerImmediateCloudPush();
  return tombstones;
}

/**
 * Record an item creation or update: clears any old tombstone so item can exist cleanly
 */
export function recordAdditionOrUpdate(id) {
  if (!id) return;
  const idStr = String(id);
  const tombstones = getTombstones();
  if (tombstones[idStr]) {
    delete tombstones[idStr];
    saveTombstones(tombstones);
  }
  markLocalMutation();
  triggerImmediateCloudPush();
}

/**
 * Get the verified Google User ID or email for cloud vault keying
 */
export function getCloudUserKey() {
  const account = getGoogleAccount();
  const email = account?.email || (typeof localStorage !== 'undefined' ? (localStorage.getItem('wolfe_user_email') || localStorage.getItem('user_email')) : null);
  if (email && typeof email === 'string' && email.trim()) {
    return `user_${email.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
  if (account?.id) return `user_${account.id}`;
  return 'primary_user';
}

/**
 * Export complete OS state from local storage into a unified portable vault
 */
export function exportFullOsState() {
  const account = getGoogleAccount();
  const deviceId = getOrCreateDeviceId();
  const platform = isMobileDevice() ? 'mobile' : 'desktop';

  const settings = readStorageJson(SYNC_KEYS.SETTINGS) || readStorageJson(SYNC_KEYS.SETTINGS_FALLBACK) || {};
  const calendar = readStorageJson(SYNC_KEYS.CALENDAR) || readStorageJson(SYNC_KEYS.CALENDAR_FALLBACK) || { items: [] };
  const nutrition = readStorageJson(SYNC_KEYS.NUTRITION) || {};
  const workouts = readStorageJson(SYNC_KEYS.WORKOUTS) || {};
  const trading = readStorageJson(SYNC_KEYS.TRADING) || {};
  const school = readStorageJson(SYNC_KEYS.SCHOOL) || {};

  // Extended modules
  const tradingConfig = readStorageJson(SYNC_KEYS.TRADING_CONFIG) || {};
  const tradingWatchlist = readStorageJson(SYNC_KEYS.TRADING_WATCHLIST) || [];
  const tradingPositions = readStorageJson(SYNC_KEYS.TRADING_POSITIONS) || [];
  const tradingJournal = readStorageJson(SYNC_KEYS.TRADING_JOURNAL) || [];
  const hermesBriefs = readStorageJson(SYNC_KEYS.TRADING_HERMES_BRIEFS) || [];
  const paperAccount = readStorageJson(SYNC_KEYS.PAPER_ACCOUNT) || {};
  const paperPositions = readStorageJson(SYNC_KEYS.PAPER_POSITIONS) || [];
  const paperHistory = readStorageJson(SYNC_KEYS.PAPER_HISTORY) || [];

  const studyDecks = readStorageJson(SYNC_KEYS.STUDY_DECKS) || [];
  const studyQuizzes = readStorageJson(SYNC_KEYS.STUDY_QUIZZES) || [];
  const studyWeakSpots = readStorageJson(SYNC_KEYS.STUDY_WEAK_SPOTS) || [];
  const studyCourses = readStorageJson(SYNC_KEYS.STUDY_COURSES) || [];

  const meta = readStorageJson(SYNC_KEYS.CLOUD_META) || {};

  return {
    version: 2,
    lastUpdated: meta.lastUpdated || Date.now(),
    lastDevice: deviceId,
    lastPlatform: platform,
    _tombstones: getTombstones(),
    googleAccount: account ? { email: account.email, name: account.name, picture: account.picture } : null,
    nutrition,
    workouts,
    trading: {
      dashboard: trading,
      config: tradingConfig,
      watchlist: tradingWatchlist,
      positions: tradingPositions,
      journal: tradingJournal,
      hermesBriefs,
      paperAccount,
      paperPositions,
      paperHistory
    },
    school: {
      dashboard: school,
      decks: studyDecks,
      quizzes: studyQuizzes,
      weakSpots: studyWeakSpots,
      courses: studyCourses
    },
    calendar,
    settings
  };
}

/**
 * Intelligent 2-Way Conflict-Free Merger with Tombstone Guarantee
 * Merges local device state with remote cloud state.
 * Tombstoned (deleted) items are permanently suppressed and can never be resurrected.
 */
export function mergeOsState(localVault, remoteVault) {
  if (!remoteVault) return localVault;
  if (!localVault) return remoteVault;

  // 0. Merge Tombstones
  const localTombstones = localVault._tombstones || {};
  const remoteTombstones = remoteVault._tombstones || {};
  const allTombstones = { ...remoteTombstones, ...localTombstones };

  const isTombstoned = (id, updatedAt) => {
    if (!id) return false;
    const tombTime = allTombstones[String(id)];
    if (!tombTime) return false;
    const itemTime = updatedAt ? (new Date(updatedAt).getTime() || Number(updatedAt) || 0) : 0;
    return itemTime <= tombTime;
  };

  const isMutatingLocally = isLocalMutationRecent(4000);

  const merged = {
    version: 2,
    lastUpdated: Math.max(localVault.lastUpdated || 0, remoteVault.lastUpdated || 0, Date.now()),
    googleAccount: remoteVault.googleAccount || localVault.googleAccount,
    _tombstones: allTombstones
  };

  // 1. NUTRITION MERGE
  const localNut = localVault.nutrition || {};
  const remoteNut = remoteVault.nutrition || {};

  // Merge meals by ID (purging tombstoned)
  const mealMap = new Map();
  (remoteNut.meals || []).forEach(m => {
    if (!m || !m.id) return;
    if (!isTombstoned(m.id, m.updatedAt || m.createdAt || m.time)) {
      mealMap.set(m.id, m);
    }
  });
  (localNut.meals || []).forEach(m => {
    if (!m || !m.id) return;
    if (!isTombstoned(m.id, m.updatedAt || m.createdAt || m.time)) {
      mealMap.set(m.id, { ...(mealMap.get(m.id) || {}), ...m });
    }
  });
  const getMealSortTime = (m) => {
    if (m?.createdAt && typeof m.createdAt === 'number') return m.createdAt;
    if (m?.updatedAt && typeof m.updatedAt === 'number') return m.updatedAt;
    if (m?.id && typeof m.id === 'string') {
      const parts = m.id.split('-');
      const ts = parseInt(parts[1], 10);
      if (!isNaN(ts) && ts > 1000000) return ts;
    }
    return 0;
  };
  const mergedMeals = Array.from(mealMap.values()).sort((a, b) => getMealSortTime(b) - getMealSortTime(a));

  // Merge weight logs by date/id (purging tombstoned)
  const weightMap = new Map();
  (remoteNut.weightLogs || []).forEach(w => {
    const k = w.id || w.date;
    if (!isTombstoned(k, w.updatedAt || new Date(w.date).getTime())) {
      weightMap.set(k, w);
    }
  });
  (localNut.weightLogs || []).forEach(w => {
    const k = w.id || w.date;
    if (!isTombstoned(k, w.updatedAt || new Date(w.date).getTime())) {
      weightMap.set(k, { ...(weightMap.get(k) || {}), ...w });
    }
  });
  const mergedWeightLogs = Array.from(weightMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Merge household pantry staples by name or ID (purging tombstoned)
  const pantryMap = new Map();
  (remoteNut.householdPantry || []).forEach(p => {
    const k = p.id || p.name?.toLowerCase();
    if (!isTombstoned(k, p.updatedAt) && !isTombstoned(p.id, p.updatedAt)) {
      pantryMap.set(k, p);
    }
  });
  (localNut.householdPantry || []).forEach(p => {
    const k = p.id || p.name?.toLowerCase();
    if (!isTombstoned(k, p.updatedAt) && !isTombstoned(p.id, p.updatedAt)) {
      pantryMap.set(k, { ...(pantryMap.get(k) || {}), ...p });
    }
  });
  const mergedPantry = Array.from(pantryMap.values());

  // Merge kitchen calibration tasks intelligently across devices
  const localCalib = localNut.kitchenCalibration || {};
  const remoteCalib = remoteNut.kitchenCalibration || {};
  const localTasks = Array.isArray(localCalib.tasks) ? localCalib.tasks : [];
  const remoteTasks = Array.isArray(remoteCalib.tasks) ? remoteCalib.tasks : [];

  const taskMap = new Map();

  // 1. Seed from remote tasks
  remoteTasks.forEach(task => {
    if (task && task.id && !isTombstoned(task.id, task.completedAt)) {
      taskMap.set(task.id, task);
    }
  });

  // 2. Merge local tasks
  localTasks.forEach(localTask => {
    if (!localTask || !localTask.id) return;
    if (isTombstoned(localTask.id, localTask.completedAt)) {
      taskMap.delete(localTask.id);
      return;
    }

    const remoteTask = taskMap.get(localTask.id);
    if (!remoteTask) {
      taskMap.set(localTask.id, localTask);
      return;
    }

    // Both exist: if one is completed and the other is not, COMPLETED ALWAYS WINS!
    if (localTask.completed && !remoteTask.completed) {
      taskMap.set(localTask.id, localTask);
    } else if (!localTask.completed && remoteTask.completed) {
      // Remote completed wins unless locally cleared more recently
      const remoteCompletedTime = remoteTask.completedAt ? new Date(remoteTask.completedAt).getTime() : 0;
      const localClearedTime = localTask.clearedAt ? new Date(localTask.clearedAt).getTime() : 0;
      if (localClearedTime > remoteCompletedTime) {
        taskMap.set(localTask.id, localTask);
      } else {
        taskMap.set(localTask.id, remoteTask);
      }
    } else if (localTask.completed && remoteTask.completed) {
      // Both completed: whichever was completed or updated more recently wins
      const localTime = localTask.completedAt ? new Date(localTask.completedAt).getTime() : (localCalib.updatedAt || 0);
      const remoteTime = remoteTask.completedAt ? new Date(remoteTask.completedAt).getTime() : (remoteCalib.updatedAt || 0);
      if (localTime >= remoteTime) {
        taskMap.set(localTask.id, { ...remoteTask, ...localTask });
      } else {
        taskMap.set(localTask.id, { ...localTask, ...remoteTask });
      }
    } else {
      // Neither completed: merge metadata
      taskMap.set(localTask.id, { ...remoteTask, ...localTask });
    }
  });

  const mergedCalibrationTasks = Array.from(taskMap.values());
  const mergedCalibration = {
    ...(localCalib.tasks?.length ? localCalib : remoteCalib),
    ...(localCalib.updatedAt >= (remoteCalib.updatedAt || 0) ? localCalib : remoteCalib),
    tasks: mergedCalibrationTasks,
    updatedAt: Math.max(localCalib.updatedAt || 0, remoteCalib.updatedAt || 0, Date.now())
  };

  const localNutUpdated = localNut.updatedAt || 0;
  const remoteNutUpdated = remoteNut.updatedAt || 0;
  const localIsNewerNut = isMutatingLocally || localNutUpdated >= remoteNutUpdated || (localVault.lastUpdated || 0) >= (remoteVault.lastUpdated || 0);
  const baseNut = localIsNewerNut ? localNut : remoteNut;

  const targetCalories = (localIsNewerNut || !remoteNut.targetCalories) 
    ? (localNut.targetCalories || remoteNut.targetCalories || 3250)
    : (remoteNut.targetCalories || localNut.targetCalories || 3250);

  const protein = (localIsNewerNut || !remoteNut.protein)
    ? (localNut.protein || remoteNut.protein)
    : (remoteNut.protein || localNut.protein);

  const carbs = (localIsNewerNut || !remoteNut.carbs)
    ? (localNut.carbs || remoteNut.carbs)
    : (remoteNut.carbs || localNut.carbs);

  const fats = (localIsNewerNut || !remoteNut.fats)
    ? (localNut.fats || remoteNut.fats)
    : (remoteNut.fats || localNut.fats);

  const todayIso = getTodayIso();
  const todayMeals = mergedMeals.filter(m => m.date === todayIso);
  const todayTotals = aggregateDailyNutrition(todayMeals);

  merged.nutrition = {
    ...baseNut,
    _migration3173Applied: true,
    currentDate: todayIso,
    consumedCalories: todayTotals.calories,
    protein: {
      ...(protein || { target: 180, unit: "g", color: "#6366f1" }),
      current: todayTotals.protein
    },
    carbs: {
      ...(carbs || { target: 450, unit: "g", color: "#06b6d4" }),
      current: todayTotals.carbs
    },
    fats: {
      ...(fats || { target: 80, unit: "g", color: "#f59e0b" }),
      current: todayTotals.fats
    },
    targetCalories,
    updatedAt: Math.max(localNutUpdated, remoteNutUpdated, Date.now()),
    meals: mergedMeals,
    weightLogs: mergedWeightLogs,
    householdPantry: mergedPantry.length > 0 ? mergedPantry : baseNut.householdPantry,
    kitchenCalibration: mergedCalibration
  };

  // 2. WORKOUTS MERGE
  const localWork = localVault.workouts || {};
  const remoteWork = remoteVault.workouts || {};
  const baseWork = localIsNewerNut ? localWork : remoteWork;

  const historyMap = new Map();
  (remoteWork.history || []).forEach(h => {
    const k = h.id || `${h.date}_${h.routine}`;
    if (!isTombstoned(k, h.updatedAt || new Date(h.date).getTime())) {
      historyMap.set(k, h);
    }
  });
  (localWork.history || []).forEach(h => {
    const k = h.id || `${h.date}_${h.routine}`;
    if (!isTombstoned(k, h.updatedAt || new Date(h.date).getTime())) {
      historyMap.set(k, { ...(historyMap.get(k) || {}), ...h });
    }
  });

  merged.workouts = {
    ...baseWork,
    history: Array.from(historyMap.values())
  };

  // 3. TRADING MERGE
  const localTrade = localVault.trading || {};
  const remoteTrade = remoteVault.trading || {};
  const localIsNewerTrade = isMutatingLocally || (localVault.lastUpdated || 0) >= (remoteVault.lastUpdated || 0);

  const journalMap = new Map();
  (remoteTrade.journal || []).forEach(j => {
    if (!isTombstoned(j.id, j.updatedAt || new Date(j.openedAt || j.closedAt).getTime())) {
      journalMap.set(j.id, j);
    }
  });
  (localTrade.journal || []).forEach(j => {
    if (!isTombstoned(j.id, j.updatedAt || new Date(j.openedAt || j.closedAt).getTime())) {
      journalMap.set(j.id, { ...(journalMap.get(j.id) || {}), ...j });
    }
  });

  const watchMap = new Map();
  (remoteTrade.watchlist || []).forEach(w => {
    if (!isTombstoned(w.symbol, w.updatedAt)) {
      watchMap.set(w.symbol, w);
    }
  });
  (localTrade.watchlist || []).forEach(w => {
    if (!isTombstoned(w.symbol, w.updatedAt)) {
      watchMap.set(w.symbol, { ...(watchMap.get(w.symbol) || {}), ...w });
    }
  });

  const paperHistMap = new Map();
  (remoteTrade.paperHistory || []).forEach(p => {
    if (!isTombstoned(p.id, p.updatedAt)) {
      paperHistMap.set(p.id, p);
    }
  });
  (localTrade.paperHistory || []).forEach(p => {
    if (!isTombstoned(p.id, p.updatedAt)) {
      paperHistMap.set(p.id, { ...(paperHistMap.get(p.id) || {}), ...p });
    }
  });

  merged.trading = {
    dashboard: localIsNewerTrade ? (localTrade.dashboard || {}) : (remoteTrade.dashboard || {}),
    config: { ...(remoteTrade.config || {}), ...(localTrade.config || {}) },
    watchlist: Array.from(watchMap.values()),
    positions: localIsNewerTrade ? (localTrade.positions || []) : (remoteTrade.positions || []),
    journal: Array.from(journalMap.values()),
    hermesBriefs: localIsNewerTrade ? (localTrade.hermesBriefs || []) : (remoteTrade.hermesBriefs || []),
    paperAccount: localIsNewerTrade ? (localTrade.paperAccount || {}) : (remoteTrade.paperAccount || {}),
    paperPositions: localIsNewerTrade ? (localTrade.paperPositions || []) : (remoteTrade.paperPositions || []),
    paperHistory: Array.from(paperHistMap.values())
  };

  // 4. ACADEMICS / SCHOOL MERGE
  const localSchool = localVault.school || {};
  const remoteSchool = remoteVault.school || {};

  const decksMap = new Map();
  (remoteSchool.decks || []).forEach(d => {
    if (!isTombstoned(d.id, d.updatedAt || new Date(d.lastStudied || 0).getTime())) {
      decksMap.set(d.id, d);
    }
  });
  (localSchool.decks || []).forEach(d => {
    if (!isTombstoned(d.id, d.updatedAt || new Date(d.lastStudied || 0).getTime())) {
      decksMap.set(d.id, { ...(decksMap.get(d.id) || {}), ...d });
    }
  });

  const quizMap = new Map();
  (remoteSchool.quizzes || []).forEach(q => {
    if (!isTombstoned(q.id, q.updatedAt)) {
      quizMap.set(q.id, q);
    }
  });
  (localSchool.quizzes || []).forEach(q => {
    if (!isTombstoned(q.id, q.updatedAt)) {
      quizMap.set(q.id, { ...(quizMap.get(q.id) || {}), ...q });
    }
  });

  merged.school = {
    dashboard: localIsNewerNut ? (localSchool.dashboard || {}) : (remoteSchool.dashboard || {}),
    decks: Array.from(decksMap.values()),
    quizzes: Array.from(quizMap.values()),
    weakSpots: localIsNewerNut ? (localSchool.weakSpots || []) : (remoteSchool.weakSpots || []),
    courses: localIsNewerNut ? (localSchool.courses || []) : (remoteSchool.courses || [])
  };

  // 5. CALENDAR MERGE (Google Calendar is single master when connected)
  const localCalItems = (localVault.calendar?.items || []).filter(it => !isTombstoned(it.id, it.updatedAt));
  const remoteCalItems = (remoteVault.calendar?.items || []).filter(it => !isTombstoned(it.id, it.updatedAt));
  merged.calendar = {
    ...(localIsNewerNut ? localVault.calendar : remoteVault.calendar),
    items: isGoogleCalendarConnected()
      ? localCalItems
      : reconcileCalendarItems(localCalItems, remoteCalItems).filter(it => !isTombstoned(it.id, it.updatedAt))
  };

  // 6. SETTINGS MERGE
  merged.settings = {
    ...(remoteVault.settings || {}),
    ...(localVault.settings || {})
  };

  return merged;
}

let isApplyingRemoteSync = false;

export function isRemoteSyncApplying() {
  return isApplyingRemoteSync;
}

/**
 * Save unified vault into device localStorage and dispatch live state events
 */
export function importFullOsState(vault) {
  if (!vault || typeof vault !== 'object') return false;
  isApplyingRemoteSync = true;

  // 0. Update Tombstones ledger
  const activeTombstones = { ...getTombstones(), ...(vault._tombstones || {}) };
  saveTombstones(activeTombstones);

  const isTomb = (id) => id && activeTombstones[String(id)];

  // Clean incoming vault collections against active tombstones before importing
  const cleanNutrition = vault.nutrition ? {
    ...vault.nutrition,
    meals: (vault.nutrition.meals || []).filter(m => !isTomb(m.id)),
    weightLogs: (vault.nutrition.weightLogs || []).filter(w => !isTomb(w.id) && !isTomb(w.date)),
    householdPantry: (vault.nutrition.householdPantry || []).filter(s => !isTomb(s.id) && !isTomb(s.name?.toLowerCase())),
    kitchenCalibration: vault.nutrition.kitchenCalibration ? {
      ...vault.nutrition.kitchenCalibration,
      tasks: (vault.nutrition.kitchenCalibration.tasks || []).filter(t => !isTomb(t.id))
    } : vault.nutrition.kitchenCalibration
  } : null;

  const cleanWorkouts = vault.workouts ? {
    ...vault.workouts,
    history: (vault.workouts.history || []).filter(h => !isTomb(h.id) && !isTomb(`${h.date}_${h.routine}`))
  } : null;

  const cleanTrading = vault.trading ? {
    ...vault.trading,
    watchlist: (vault.trading.watchlist || []).filter(w => !isTomb(w.symbol)),
    journal: (vault.trading.journal || []).filter(j => !isTomb(j.id)),
    paperHistory: (vault.trading.paperHistory || []).filter(p => !isTomb(p.id))
  } : null;

  const cleanSchool = vault.school ? {
    ...vault.school,
    decks: (vault.school.decks || []).filter(d => !isTomb(d.id)),
    quizzes: (vault.school.quizzes || []).filter(q => !isTomb(q.id))
  } : null;

  // 1. Core modules
  if (cleanNutrition) {
    writeStorageJson(SYNC_KEYS.NUTRITION, cleanNutrition);
  }
  if (cleanWorkouts) {
    writeStorageJson(SYNC_KEYS.WORKOUTS, cleanWorkouts);
  }
  if (cleanTrading?.dashboard) {
    writeStorageJson(SYNC_KEYS.TRADING, cleanTrading.dashboard);
  }
  if (cleanSchool?.dashboard) {
    writeStorageJson(SYNC_KEYS.SCHOOL, cleanSchool.dashboard);
  }
  // Only apply calendar from vault if Google Calendar is not connected (Google is single master)
  if (vault.calendar && !isGoogleCalendarConnected()) {
    const cleanCalendar = {
      ...vault.calendar,
      items: (vault.calendar.items || []).filter(it => !isTomb(it.id))
    };
    writeStorageJson(SYNC_KEYS.CALENDAR, cleanCalendar);
    writeStorageJson(SYNC_KEYS.CALENDAR_FALLBACK, cleanCalendar);
  }
  if (vault.settings) {
    writeStorageJson(SYNC_KEYS.SETTINGS, vault.settings);
    writeStorageJson(SYNC_KEYS.SETTINGS_FALLBACK, vault.settings);
  }

  // 2. Extended trading
  if (cleanTrading?.config) writeStorageJson(SYNC_KEYS.TRADING_CONFIG, cleanTrading.config);
  if (cleanTrading?.watchlist) writeStorageJson(SYNC_KEYS.TRADING_WATCHLIST, cleanTrading.watchlist);
  if (cleanTrading?.positions) writeStorageJson(SYNC_KEYS.TRADING_POSITIONS, cleanTrading.positions);
  if (cleanTrading?.journal) writeStorageJson(SYNC_KEYS.TRADING_JOURNAL, cleanTrading.journal);
  if (cleanTrading?.hermesBriefs) writeStorageJson(SYNC_KEYS.TRADING_HERMES_BRIEFS, cleanTrading.hermesBriefs);
  if (cleanTrading?.paperAccount) writeStorageJson(SYNC_KEYS.PAPER_ACCOUNT, cleanTrading.paperAccount);
  if (cleanTrading?.paperPositions) writeStorageJson(SYNC_KEYS.PAPER_POSITIONS, cleanTrading.paperPositions);
  if (cleanTrading?.paperHistory) writeStorageJson(SYNC_KEYS.PAPER_HISTORY, cleanTrading.paperHistory);

  // 3. Extended study
  if (cleanSchool?.decks) writeStorageJson(SYNC_KEYS.STUDY_DECKS, cleanSchool.decks);
  if (cleanSchool?.quizzes) writeStorageJson(SYNC_KEYS.STUDY_QUIZZES, cleanSchool.quizzes);
  if (cleanSchool?.weakSpots) writeStorageJson(SYNC_KEYS.STUDY_WEAK_SPOTS, cleanSchool.weakSpots);
  if (cleanSchool?.courses) writeStorageJson(SYNC_KEYS.STUDY_COURSES, cleanSchool.courses);

  // 4. Update cloud sync metadata
  writeStorageJson(SYNC_KEYS.CLOUD_META, {
    lastSyncedAt: Date.now(),
    lastUpdated: vault.lastUpdated || Date.now(),
    status: 'synced',
    deviceId: getOrCreateDeviceId()
  });

  const sanitizedVault = {
    ...vault,
    _tombstones: activeTombstones,
    nutrition: cleanNutrition || vault.nutrition,
    workouts: cleanWorkouts || vault.workouts,
    trading: cleanTrading || vault.trading,
    school: cleanSchool || vault.school
  };

  // 5. Dispatch live window event so React state updates without page reload
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-applied', {
      detail: {
        vault: sanitizedVault,
        timestamp: Date.now()
      }
    }));
  }

  // Release remote sync suppression after React renders
  setTimeout(() => {
    isApplyingRemoteSync = false;
  }, 1500);

  return true;
}

/**
 * Fetch remote vault from serverless API (/api/sync)
 */
async function fetchVaultFromServerless(userKey) {
  try {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/sync?user_id=${encodeURIComponent(userKey)}`, {
      method: 'GET',
      headers
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.exists && data.vault) {
        return data.vault;
      }
    }
  } catch (err) {
    console.debug("Serverless vault fetch notice:", err.message);
  }
  return null;
}

/**
 * Save vault to serverless API (/api/sync)
 */
async function saveVaultToServerless(userKey, vault) {
  try {
    const token = await getValidAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        userId: userKey,
        vault,
        deviceId: getOrCreateDeviceId()
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.success;
    }
  } catch (err) {
    console.debug("Serverless vault save notice:", err.message);
  }
  return false;
}

const GCAL_VAULT_SUMMARY = '[Wolfe OS Cloud Vault - Do Not Delete]';
const GCAL_VAULT_EVENT_ID_KEY = 'wolfe_gcal_vault_event_id';

/**
 * Fetch backup vault directly from Google Calendar system event
 */
export async function fetchVaultFromGoogleCalendar() {
  if (!isGoogleCalendarConnected()) return null;
  try {
    const cachedEventId = typeof localStorage !== 'undefined' ? localStorage.getItem(GCAL_VAULT_EVENT_ID_KEY) : null;
    
    // 1. Try fetching directly by cached event ID
    if (cachedEventId) {
      const res = await authedGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(cachedEventId)}`);
      if (res.ok) {
        const item = await res.json();
        if (item && item.description && item.summary === GCAL_VAULT_SUMMARY) {
          return JSON.parse(item.description);
        }
      }
    }

    // 2. Search for the system event on primary calendar
    const searchUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    searchUrl.searchParams.append('q', '[Wolfe OS Cloud Vault - Do Not Delete]');
    searchUrl.searchParams.append('maxResults', '5');

    const searchRes = await authedGoogleFetch(searchUrl.toString());
    if (searchRes.ok) {
      const data = await searchRes.json();
      const items = data.items || [];
      const vaultEvent = items.find(it => it.summary === GCAL_VAULT_SUMMARY);
      if (vaultEvent) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(GCAL_VAULT_EVENT_ID_KEY, vaultEvent.id);
        }
        if (vaultEvent.description) {
          return JSON.parse(vaultEvent.description);
        }
      }
    }
  } catch (err) {
    console.debug("Google Calendar vault fetch notice:", err.message);
  }
  return null;
}

/**
 * Save backup vault directly to Google Calendar system event
 */
export async function saveVaultToGoogleCalendar(vault) {
  if (!isGoogleCalendarConnected() || !vault) return false;
  try {
    const cachedEventId = typeof localStorage !== 'undefined' ? localStorage.getItem(GCAL_VAULT_EVENT_ID_KEY) : null;
    const bodyPayload = {
      summary: GCAL_VAULT_SUMMARY,
      description: JSON.stringify(vault),
      start: { dateTime: '2000-01-01T00:00:00Z' },
      end: { dateTime: '2000-01-01T00:05:00Z' },
      transparency: 'transparent',
      visibility: 'private'
    };

    if (cachedEventId) {
      const patchRes = await authedGoogleFetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(cachedEventId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        }
      );
      if (patchRes.ok) return true;
    }

    // Search or create
    const searchUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    searchUrl.searchParams.append('q', '[Wolfe OS Cloud Vault - Do Not Delete]');
    searchUrl.searchParams.append('maxResults', '5');

    const searchRes = await authedGoogleFetch(searchUrl.toString());
    if (searchRes.ok) {
      const data = await searchRes.json();
      const existing = (data.items || []).find(it => it.summary === GCAL_VAULT_SUMMARY);
      if (existing) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(GCAL_VAULT_EVENT_ID_KEY, existing.id);
        }
        const patchRes = await authedGoogleFetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existing.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
          }
        );
        if (patchRes.ok) return true;
      }
    }

    // Create new event
    const createRes = await authedGoogleFetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      }
    );
    if (createRes.ok) {
      const created = await createRes.json();
      if (created?.id && typeof localStorage !== 'undefined') {
        localStorage.setItem(GCAL_VAULT_EVENT_ID_KEY, created.id);
      }
      return true;
    }
  } catch (err) {
    console.debug("Google Calendar vault save notice:", err.message);
  }
  return false;
}

/**
 * Primary Master Sync: Executes 2-Way sync across Phone and Desktop with Dual-Layer Persistence
 */
let activeSyncPromise = null;

export async function syncFullOsWithCloud(options = {}) {
  const { forcePush = false, forcePull = false } = options;

  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    if (!isGoogleCalendarConnected()) {
      return { success: false, reason: 'google_account_not_connected' };
    }

    // Notify starting sync
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
        detail: { status: 'syncing', timestamp: Date.now() }
      }));
    }

    try {
      const userKey = getCloudUserKey();
      const localVault = exportFullOsState();

      // 1. Force Push: Upload local state directly
      if (forcePush) {
        const enrichedLocal = { ...localVault, lastUpdated: Date.now() };
        await saveVaultToServerless(userKey, enrichedLocal);
        saveVaultToGoogleCalendar(enrichedLocal).catch(() => {});
        importFullOsState(enrichedLocal);
        return { success: true, mode: 'pushed', vault: enrichedLocal };
      }

      // 2. Fetch Remote Cloud Vault (Serverless + Google Calendar Fallback)
      let remoteVault = await fetchVaultFromServerless(userKey);
      if (!remoteVault) {
        remoteVault = await fetchVaultFromGoogleCalendar();
      } else {
        // If serverless returned a vault, check if Google Calendar has a newer version in the background
        fetchVaultFromGoogleCalendar().then(gVault => {
          if (gVault && (gVault.lastUpdated || 0) > (remoteVault.lastUpdated || 0)) {
            const updated = mergeOsState(exportFullOsState(), gVault);
            importFullOsState(updated);
          }
        }).catch(() => {});
      }

      // 3. Force Pull: Replace local with remote if remote exists
      if (forcePull && remoteVault) {
        importFullOsState(remoteVault);
        return { success: true, mode: 'pulled', vault: remoteVault };
      }

      // 4. Standard 2-Way Sync
      let finalVault;
      if (remoteVault) {
        // Both exist: merge intelligently with tombstone guarantees
        finalVault = mergeOsState(localVault, remoteVault);
      } else {
        // First device initial seed: push local up
        finalVault = { ...localVault, lastUpdated: Date.now() };
      }

      // Apply merged vault locally
      importFullOsState(finalVault);

      // Save merged master vault back to cloud (both serverless and Google Calendar)
      await saveVaultToServerless(userKey, finalVault);
      saveVaultToGoogleCalendar(finalVault).catch(() => {});

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
          detail: { 
            status: 'synced', 
            timestamp: Date.now(),
            userKey,
            hubsCount: 6
          }
        }));
      }

      return {
        success: true,
        mode: remoteVault ? 'merged' : 'initial_seed',
        vault: finalVault,
        lastSyncedAt: Date.now()
      };
    } catch (err) {
      console.warn("Cloud sync engine notice:", err);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
          detail: { status: 'failed', error: err.message, timestamp: Date.now() }
        }));
      }
      return { success: false, error: err.message };
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

/**
 * Debounced Auto-Push: Debounces local changes by 2.5s to prevent excessive network calls
 */
let debouncePushTimer = null;

export function triggerDebouncedCloudPush(delayMs = 2500) {
  if (!isGoogleCalendarConnected()) return;
  if (isApplyingRemoteSync) return;
  if (typeof window === 'undefined') return;

  if (debouncePushTimer) {
    clearTimeout(debouncePushTimer);
  }

  debouncePushTimer = setTimeout(() => {
    if (isApplyingRemoteSync || !isGoogleCalendarConnected()) return;
    syncFullOsWithCloud({ forcePush: false }).catch(err => {
      console.debug("Debounced cloud push notice:", err.message);
    });
  }, delayMs);
}

/**
 * Immediate Cloud Push: Sends immediate signal on item additions/deletions
 * Confirms change on cloud serverless vault with low latency (150ms)
 */
let immediatePushTimer = null;

export function triggerImmediateCloudPush(delayMs = 150) {
  if (!isGoogleCalendarConnected()) return;
  if (typeof window === 'undefined') return;

  if (debouncePushTimer) {
    clearTimeout(debouncePushTimer);
    debouncePushTimer = null;
  }
  if (immediatePushTimer) {
    clearTimeout(immediatePushTimer);
  }

  immediatePushTimer = setTimeout(() => {
    if (!isGoogleCalendarConnected()) return;
    syncFullOsWithCloud({ forcePush: false }).catch(err => {
      console.debug("Immediate cloud push notice:", err.message);
    });
  }, delayMs);
}
