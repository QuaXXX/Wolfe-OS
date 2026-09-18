/**
 * Wolfe OS Unified Cross-Device Cloud Sync Engine
 * Synchronizes core command hubs between Phone and Desktop:
 * - Nutrition (meals, macros, targets, weight history, staples)
 * - Calendar / Timeline (schedule, events, tasks)
 * - Settings (theme color, AI config, module visibility)
 */

import { 
  getGoogleAccount, 
  saveGoogleAccount,
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
 * Wipes all user-generated data and sync ledgers from localStorage on logout.
 * Ensures the device returns to a clean zero/empty state so no personal data remains.
 */
export function wipeLocalUserData() {
  if (typeof localStorage === 'undefined') return;
  try {
    cancelPendingCloudPushes();
    localStorage.removeItem(SYNC_KEYS.NUTRITION);
    localStorage.removeItem(SYNC_KEYS.CALENDAR);
    localStorage.removeItem(SYNC_KEYS.CALENDAR_FALLBACK);
    localStorage.removeItem(SYNC_KEYS.SETTINGS);
    localStorage.removeItem(SYNC_KEYS.SETTINGS_FALLBACK);
    localStorage.removeItem(SYNC_KEYS.CLOUD_META);
    localStorage.removeItem(SYNC_KEYS.TOMBSTONES);

    localStorage.removeItem('wolfe_calendar_data');
    localStorage.removeItem('wolfe_nutrition_data');
    localStorage.removeItem('wolfe_os_calendar_v5');
    localStorage.removeItem('wolfe_user_email');
    localStorage.removeItem('user_email');
    localStorage.removeItem('wolfe_user_signed_in_google');
    localStorage.removeItem('wolfe_gcal_deadlines_id');
    localStorage.removeItem('wolfe_gcal_vault_event_id');
    localStorage.removeItem('wolfe_study_decks');
    localStorage.removeItem('wolfe_study_quizzes');
    localStorage.removeItem('wolfe_study_weak_spots');
    localStorage.removeItem('wolfe_study_courses');
    localStorage.removeItem('wolfe_trading_data');
    localStorage.removeItem('wolfe_notes_data');
    localStorage.removeItem('wolfe_data_owner_email');
  } catch (e) {
    console.warn("Error wiping local user data:", e);
  }
}

/**
 * Returns pristine blank nutrition data with target calories defaulted to 3000 kcal
 * and 0 meals, 0 consumed calories, and empty weight logs.
 */
export function getBlankNutritionData() {
  return {
    targetCalories: 3000,
    consumedCalories: 0,
    protein: { current: 0, target: 180, unit: "g", color: "#6366f1" },
    carbs: { current: 0, target: 400, unit: "g", color: "#06b6d4" },
    fats: { current: 0, target: 75, unit: "g", color: "#f59e0b" },
    waterGlasses: 0,
    targetGlasses: 10,
    waterMl: 0,
    targetWaterMl: 3000,
    currentDate: getTodayIso(),
    weightHistory: [],
    weightLogs: [],
    householdPantry: [],
    kitchenCalibration: { tasks: [] },
    dailyTargets: {},
    meals: []
  };
}

/**
 * Returns a pristine blank OS vault for a newly connected Google account.
 */
export function getBlankVault(account = null) {
  const deviceId = getOrCreateDeviceId();
  const platform = isMobileDevice() ? 'mobile' : 'desktop';
  return {
    version: 2,
    lastUpdated: Date.now(),
    lastDevice: deviceId,
    lastPlatform: platform,
    _tombstones: {},
    googleAccount: account ? { email: account.email, name: account.name, picture: account.picture } : null,
    nutrition: getBlankNutritionData(),
    calendar: { items: [] },
    settings: {}
  };
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
  const rawNutrition = readStorageJson(SYNC_KEYS.NUTRITION) || {};
  const rawWeight = Array.isArray(rawNutrition.weightHistory) 
    ? rawNutrition.weightHistory 
    : (Array.isArray(rawNutrition.weightLogs) ? rawNutrition.weightLogs : []);
  const normalizedWeight = rawWeight.map(w => {
    if (!w) return null;
    const wVal = w.weightLbs ?? w.weight ?? 0;
    return { ...w, weightLbs: wVal, weight: wVal };
  }).filter(Boolean);
  const nutrition = {
    ...rawNutrition,
    targetCalories: rawNutrition.targetCalories || 3000,
    weightHistory: normalizedWeight,
    weightLogs: normalizedWeight
  };

  const meta = readStorageJson(SYNC_KEYS.CLOUD_META) || {};

  const calculatedLastUpdated = Math.max(
    meta.lastUpdated || 0,
    nutrition.updatedAt || 0,
    lastLocalMutationAt || 0,
    (isLocalMutationRecent(10000) ? Date.now() : 0)
  );

  return {
    version: 2,
    lastUpdated: calculatedLastUpdated || Date.now(),
    lastDevice: deviceId,
    lastPlatform: platform,
    _tombstones: getTombstones(),
    googleAccount: account ? { email: account.email, name: account.name, picture: account.picture } : null,
    nutrition,
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

  // Merge meals by ID (purging tombstoned, newest timestamp wins on conflict)
  const mealMap = new Map();
  (remoteNut.meals || []).forEach(m => {
    if (!m) return;
    const mealId = m.id || `${m.date || getTodayIso()}-${m.name || 'meal'}-${m.calories || 0}`;
    const cleanMeal = m.id ? m : { ...m, id: mealId };
    if (!isTombstoned(cleanMeal.id, cleanMeal.updatedAt || cleanMeal.createdAt || cleanMeal.time)) {
      mealMap.set(cleanMeal.id, cleanMeal);
    }
  });
  (localNut.meals || []).forEach(m => {
    if (!m) return;
    const mealId = m.id || `${m.date || getTodayIso()}-${m.name || 'meal'}-${m.calories || 0}`;
    const cleanMeal = m.id ? m : { ...m, id: mealId };
    if (!isTombstoned(cleanMeal.id, cleanMeal.updatedAt || cleanMeal.createdAt || cleanMeal.time)) {
      const existing = mealMap.get(cleanMeal.id);
      if (!existing) {
        mealMap.set(cleanMeal.id, cleanMeal);
      } else {
        const localTime = cleanMeal.updatedAt || cleanMeal.createdAt || 0;
        const remoteTime = existing.updatedAt || existing.createdAt || 0;
        if (localTime >= remoteTime) {
          mealMap.set(cleanMeal.id, { ...existing, ...cleanMeal });
        } else {
          mealMap.set(cleanMeal.id, { ...cleanMeal, ...existing });
        }
      }
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

  // Merge weight logs by date/id (purging tombstoned), normalizing weightHistory and weightLogs seamlessly
  const weightMap = new Map();
  const remoteWeightRaw = Array.isArray(remoteNut.weightHistory) 
    ? remoteNut.weightHistory 
    : (Array.isArray(remoteNut.weightLogs) ? remoteNut.weightLogs : []);
  const localWeightRaw = Array.isArray(localNut.weightHistory) 
    ? localNut.weightHistory 
    : (Array.isArray(localNut.weightLogs) ? localNut.weightLogs : []);

  remoteWeightRaw.forEach(w => {
    if (!w) return;
    const k = w.id || w.date;
    const wVal = w.weightLbs ?? w.weight ?? 0;
    const cleanW = { ...w, weightLbs: wVal, weight: wVal };
    if (!isTombstoned(k, cleanW.updatedAt || new Date(cleanW.date).getTime())) {
      weightMap.set(k, cleanW);
    }
  });
  localWeightRaw.forEach(w => {
    if (!w) return;
    const k = w.id || w.date;
    const wVal = w.weightLbs ?? w.weight ?? 0;
    const cleanW = { ...w, weightLbs: wVal, weight: wVal };
    if (!isTombstoned(k, cleanW.updatedAt || new Date(cleanW.date).getTime())) {
      const existing = weightMap.get(k);
      if (!existing) {
        weightMap.set(k, cleanW);
      } else {
        const localTime = cleanW.updatedAt || new Date(cleanW.date).getTime() || 0;
        const remoteTime = existing.updatedAt || new Date(existing.date).getTime() || 0;
        if (localTime >= remoteTime) {
          weightMap.set(k, { ...existing, ...cleanW });
        } else {
          weightMap.set(k, { ...cleanW, ...existing });
        }
      }
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
    ? (localNut.targetCalories || remoteNut.targetCalories || 3000)
    : (remoteNut.targetCalories || localNut.targetCalories || 3000);

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

  // Merge dailyTargets (per-date historical targets) across local and remote vaults
  const mergedDailyTargets = {
    ...(remoteNut.dailyTargets || {}),
    ...(localNut.dailyTargets || {})
  };

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
    dailyTargets: mergedDailyTargets,
    updatedAt: Math.max(localNutUpdated, remoteNutUpdated, Date.now()),
    meals: mergedMeals,
    weightHistory: mergedWeightLogs,
    weightLogs: mergedWeightLogs,
    householdPantry: mergedPantry.length > 0 ? mergedPantry : (baseNut.householdPantry || []),
    kitchenCalibration: mergedCalibration
  };

  // 2. CALENDAR MERGE (Google Calendar is single master when connected)
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
export function importFullOsState(vault, options = {}) {
  if (!vault || typeof vault !== 'object') return false;
  isApplyingRemoteSync = true;

  const isReplacing = Boolean(options.replaceLocal || options.forcePull);

  // 0. Update Tombstones ledger
  const activeTombstones = isReplacing ? (vault._tombstones || {}) : { ...getTombstones(), ...(vault._tombstones || {}) };
  saveTombstones(activeTombstones);

  // Auto-link Google Account from incoming vault so secondary devices adopt identical identity
  if (vault.googleAccount?.email && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('wolfe_user_email', vault.googleAccount.email);
      const existingAcc = getGoogleAccount();
      if (!existingAcc || !existingAcc.email) {
        saveGoogleAccount(vault.googleAccount);
      }
    } catch (e) {}
  }

  const isTomb = (id, updatedAt) => {
    if (!id) return false;
    const tombTime = activeTombstones[String(id)];
    if (!tombTime) return false;
    const itemTime = updatedAt ? (new Date(updatedAt).getTime() || Number(updatedAt) || 0) : 0;
    return itemTime <= tombTime;
  };

  // Read current local meals and weight so newly added local entries are NEVER dropped by incoming sync
  const currentLocalNutrition = isReplacing ? {} : (readStorageJson(SYNC_KEYS.NUTRITION) || {});
  const currentLocalMeals = isReplacing ? [] : (Array.isArray(currentLocalNutrition.meals) ? currentLocalNutrition.meals : []);

  // Clean incoming vault collections against active tombstones before importing
  let cleanNutrition = null;
  if (vault.nutrition) {
    const mealMap = new Map();
    // 1. First add incoming meals (if not tombstoned)
    (vault.nutrition.meals || []).forEach(m => {
      if (!m) return;
      const mId = m.id || `${m.date || getTodayIso()}-${m.name || 'meal'}-${m.calories || 0}`;
      const cleanM = m.id ? m : { ...m, id: mId };
      if (!isTomb(cleanM.id, cleanM.updatedAt || cleanM.createdAt || cleanM.time)) {
        mealMap.set(cleanM.id, cleanM);
      }
    });
    // 2. Union with current local meals: any meal in local storage that is not tombstoned MUST be preserved!
    currentLocalMeals.forEach(m => {
      if (!m) return;
      const mId = m.id || `${m.date || getTodayIso()}-${m.name || 'meal'}-${m.calories || 0}`;
      const cleanM = m.id ? m : { ...m, id: mId };
      if (!isTomb(cleanM.id, cleanM.updatedAt || cleanM.createdAt || cleanM.time)) {
        const existing = mealMap.get(cleanM.id);
        if (!existing) {
          mealMap.set(cleanM.id, cleanM);
        } else {
          const localTime = cleanM.updatedAt || cleanM.createdAt || 0;
          const remoteTime = existing.updatedAt || existing.createdAt || 0;
          if (localTime >= remoteTime) {
            mealMap.set(cleanM.id, { ...existing, ...cleanM });
          } else {
            mealMap.set(cleanM.id, { ...cleanM, ...existing });
          }
        }
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
    const finalCleanMeals = Array.from(mealMap.values()).sort((a, b) => getMealSortTime(b) - getMealSortTime(a));
    const todayIso = getTodayIso();
    const todayMeals = finalCleanMeals.filter(m => m.date === todayIso);
    const todayTotals = aggregateDailyNutrition(todayMeals);

    // Union weight logs across local and incoming
    const incomingWeightRaw = (Array.isArray(vault.nutrition.weightHistory) ? vault.nutrition.weightHistory : (Array.isArray(vault.nutrition.weightLogs) ? vault.nutrition.weightLogs : []));
    const localWeightRaw = (Array.isArray(currentLocalNutrition.weightHistory) ? currentLocalNutrition.weightHistory : (Array.isArray(currentLocalNutrition.weightLogs) ? currentLocalNutrition.weightLogs : []));
    const weightMap = new Map();

    incomingWeightRaw.forEach(w => {
      if (!w) return;
      const k = w.id || w.date;
      if (!isTomb(k, w.updatedAt) && !isTomb(w.id, w.updatedAt) && !isTomb(w.date, w.updatedAt)) {
        const wVal = w.weightLbs ?? w.weight ?? 0;
        weightMap.set(k, { ...w, weightLbs: wVal, weight: wVal });
      }
    });

    localWeightRaw.forEach(w => {
      if (!w) return;
      const k = w.id || w.date;
      if (!isTomb(k, w.updatedAt) && !isTomb(w.id, w.updatedAt) && !isTomb(w.date, w.updatedAt)) {
        const wVal = w.weightLbs ?? w.weight ?? 0;
        const cleanW = { ...w, weightLbs: wVal, weight: wVal };
        const existing = weightMap.get(k);
        if (!existing) {
          weightMap.set(k, cleanW);
        } else {
          const localTime = cleanW.updatedAt || cleanW.createdAt || new Date(cleanW.date).getTime() || 0;
          const remoteTime = existing.updatedAt || existing.createdAt || new Date(existing.date).getTime() || 0;
          if (localTime >= remoteTime) {
            weightMap.set(k, { ...existing, ...cleanW });
          } else {
            weightMap.set(k, { ...cleanW, ...existing });
          }
        }
      }
    });

    const finalCleanWeight = Array.from(weightMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

    cleanNutrition = {
      ...vault.nutrition,
      targetCalories: vault.nutrition.targetCalories || 3000,
      currentDate: todayIso,
      consumedCalories: todayTotals.calories,
      protein: {
        ...(vault.nutrition.protein || { target: 180, unit: "g", color: "#6366f1" }),
        current: todayTotals.protein
      },
      carbs: {
        ...(vault.nutrition.carbs || { target: 450, unit: "g", color: "#06b6d4" }),
        current: todayTotals.carbs
      },
      fats: {
        ...(vault.nutrition.fats || { target: 80, unit: "g", color: "#f59e0b" }),
        current: todayTotals.fats
      },
      meals: finalCleanMeals,
      weightHistory: finalCleanWeight,
      weightLogs: finalCleanWeight,
      householdPantry: (vault.nutrition.householdPantry || []).filter(s => s && !isTomb(s.id, s.updatedAt) && !isTomb(s.name?.toLowerCase(), s.updatedAt)),
      kitchenCalibration: vault.nutrition.kitchenCalibration ? {
        ...vault.nutrition.kitchenCalibration,
        tasks: (vault.nutrition.kitchenCalibration.tasks || []).filter(t => !isTomb(t.id, t.completedAt))
      } : vault.nutrition.kitchenCalibration
    };
  }

  // 1. Core modules
  if (cleanNutrition) {
    writeStorageJson(SYNC_KEYS.NUTRITION, cleanNutrition);
  }
  // Always persist clean calendar from incoming vault as resilient local backup
  if (vault.calendar) {
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

  // 2. Update cloud sync metadata
  writeStorageJson(SYNC_KEYS.CLOUD_META, {
    lastSyncedAt: Date.now(),
    lastUpdated: vault.lastUpdated || Date.now(),
    status: 'synced',
    deviceId: getOrCreateDeviceId()
  });

  const sanitizedVault = {
    ...vault,
    _tombstones: activeTombstones,
    nutrition: cleanNutrition || vault.nutrition
  };

  // 5. Dispatch live window event so React state updates without page reload
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-applied', {
      detail: {
        vault: sanitizedVault,
        timestamp: Date.now(),
        options
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
async function fetchVaultFromServerless(userKey, since = null) {
  try {
    const token = await getValidAccessToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let url = `/api/sync?user_id=${encodeURIComponent(userKey)}`;
    if (since && typeof since === 'number' && since > 0) {
      url += `&since=${encodeURIComponent(since)}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.exists) {
        if (data.modified === false) {
          return { unmodified: true, lastUpdated: data.lastModified };
        }
        if (data.vault) {
          return data.vault;
        }
      }
      return null;
    } else {
      const errData = await res.json().catch(() => null);
      console.warn(`Serverless vault fetch returned status ${res.status}:`, errData?.error || res.statusText);
    }
  } catch (err) {
    console.warn("Serverless vault fetch network error:", err.message);
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
      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const ch = new BroadcastChannel('wolfe_cloud_sync_bus');
          ch.postMessage({ type: 'VAULT_PUSHED', timestamp: Date.now() });
          ch.close();
        } catch (e) {}
      }
      return !!data.success;
    } else {
      const errData = await res.json().catch(() => null);
      console.warn(`Serverless vault save returned status ${res.status}:`, errData?.error || res.statusText);
    }
  } catch (err) {
    console.warn("Serverless vault save network error:", err.message);
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
 * Prunes the vault before persisting to Google Calendar system event.
 * Keeps payloads lightweight (<40KB) to ensure Google Calendar event description limits (100KB)
 * are never reached, and stripping transient blobs or ancient records.
 */
export function pruneVaultForCalendarBackup(vault) {
  if (!vault || typeof vault !== 'object') return vault;
  try {
    const cloned = JSON.parse(JSON.stringify(vault));

    // Prune nutrition meals to recent 150 meals and strip any large base64 images
    if (cloned.nutrition) {
      if (Array.isArray(cloned.nutrition.meals)) {
        cloned.nutrition.meals = cloned.nutrition.meals.slice(0, 150).map(m => {
          if (!m) return m;
          const cleanMeal = { ...m };
          if (cleanMeal.imageBase64) delete cleanMeal.imageBase64;
          if (cleanMeal.image && cleanMeal.image.length > 500) delete cleanMeal.image;
          return cleanMeal;
        });
      }
      const rawW = Array.isArray(cloned.nutrition.weightHistory) ? cloned.nutrition.weightHistory : (Array.isArray(cloned.nutrition.weightLogs) ? cloned.nutrition.weightLogs : []);
      const prunedW = rawW.slice(-90);
      cloned.nutrition.weightHistory = prunedW;
      cloned.nutrition.weightLogs = prunedW;
    }

    // Prune calendar items to 200 items
    if (cloned.calendar && Array.isArray(cloned.calendar.items)) {
      cloned.calendar.items = cloned.calendar.items.slice(0, 200);
    }

    return cloned;
  } catch (err) {
    return vault;
  }
}

/**
 * Save backup vault directly to Google Calendar system event
 */
export async function saveVaultToGoogleCalendar(vault) {
  if (!isGoogleCalendarConnected() || !vault) return false;
  try {
    const cachedEventId = typeof localStorage !== 'undefined' ? localStorage.getItem(GCAL_VAULT_EVENT_ID_KEY) : null;
    const safeVault = pruneVaultForCalendarBackup(vault);
    const bodyPayload = {
      summary: GCAL_VAULT_SUMMARY,
      description: JSON.stringify(safeVault),
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
 * Hard-resets the active user's cloud vault to a pristine blank state (3000 kcal, 0 meals, empty weight history).
 * Overwrites both Serverless KV and Google Calendar vault backups, and cleans local storage.
 */
export async function resetAccountCloudVault() {
  const account = getGoogleAccount();
  const userKey = getCloudUserKey();
  const blankVault = getBlankVault(account);

  if (account?.email && typeof localStorage !== 'undefined') {
    localStorage.setItem('wolfe_data_owner_email', account.email.trim().toLowerCase());
  }

  // Overwrite local storage directly with clean blank state
  writeStorageJson(SYNC_KEYS.NUTRITION, blankVault.nutrition);
  writeStorageJson(SYNC_KEYS.CALENDAR, blankVault.calendar);
  writeStorageJson(SYNC_KEYS.CALENDAR_FALLBACK, blankVault.calendar);
  saveTombstones({});

  // Overwrite serverless and Google Calendar vaults
  await saveVaultToServerless(userKey, blankVault);
  if (isGoogleCalendarConnected()) {
    await saveVaultToGoogleCalendar(blankVault).catch(() => {});
  }

  writeStorageJson(SYNC_KEYS.CLOUD_META, {
    lastRemoteVaultUpdated: blankVault.lastUpdated,
    lastSyncedAt: Date.now(),
    status: 'synced',
    deviceId: getOrCreateDeviceId()
  });

  // Notify React app to replace in-memory state cleanly
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-applied', {
      detail: { vault: blankVault, options: { replaceLocal: true, forcePull: true } }
    }));
    window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
      detail: { status: 'synced', timestamp: Date.now(), userKey, hubsCount: 6 }
    }));
  }

  return true;
}

/**
 * Primary Master Sync: Executes 2-Way sync across Phone and Desktop with Dual-Layer Persistence
 */
let activeSyncPromise = null;
let hasQueuedSync = false;

export async function syncFullOsWithCloud(options = {}) {
  const { forcePush = false, forcePull = false, forceSync = false, silent = false, replaceLocal = false } = options;

  // Cloud synchronization is strictly active for logged-in accounts
  const hasAccount = isGoogleCalendarConnected() || getGoogleAccount() || (typeof localStorage !== 'undefined' && localStorage.getItem('wolfe_user_email'));
  if (!hasAccount) {
    if (typeof window !== 'undefined' && !silent) {
      window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
        detail: { status: 'disconnected', timestamp: Date.now() }
      }));
    }
    return { success: false, reason: 'disconnected' };
  }

  if (activeSyncPromise) {
    hasQueuedSync = true;
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    // Notify starting sync (skip if silent background check to avoid UI flickering)
    if (typeof window !== 'undefined' && !silent) {
      window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
        detail: { status: 'syncing', timestamp: Date.now() }
      }));
    }

    try {
      const account = getGoogleAccount();
      const activeEmail = account?.email ? account.email.trim().toLowerCase() : null;
      const storedOwnerEmail = typeof localStorage !== 'undefined' ? (localStorage.getItem('wolfe_data_owner_email') || '').trim().toLowerCase() : null;

      const isAccountMismatch = Boolean(activeEmail && storedOwnerEmail && activeEmail !== storedOwnerEmail);

      // If local data belongs to another account, wipe local user storage and start with a clean blank slate
      if (isAccountMismatch) {
        console.warn(`[Cloud Sync] Account mismatch detected (stored owner: ${storedOwnerEmail}, active: ${activeEmail}). Purging foreign local data.`);
        wipeLocalUserData();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('wolfe_data_owner_email', activeEmail);
        }
      } else if (activeEmail && !storedOwnerEmail && typeof localStorage !== 'undefined') {
        localStorage.setItem('wolfe_data_owner_email', activeEmail);
      }

      const userKey = getCloudUserKey();
      let localVault = isAccountMismatch ? getBlankVault(account) : exportFullOsState();

      // 1. Force Push: Upload local state directly
      if (forcePush) {
        const enrichedLocal = { ...localVault, lastUpdated: Date.now() };
        await saveVaultToServerless(userKey, enrichedLocal);
        if (isGoogleCalendarConnected()) {
          saveVaultToGoogleCalendar(enrichedLocal).catch(() => {});
        }
        importFullOsState(enrichedLocal, { replaceLocal });
        writeStorageJson(SYNC_KEYS.CLOUD_META, {
          lastRemoteVaultUpdated: enrichedLocal.lastUpdated,
          lastSyncedAt: Date.now(),
          status: 'synced',
          deviceId: getOrCreateDeviceId()
        });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
            detail: { status: 'synced', timestamp: Date.now(), userKey, hubsCount: 6 }
          }));
        }
        return { success: true, mode: 'pushed', vault: enrichedLocal };
      }

      // Check last known remote timestamp to pass since parameter (bypassed if forceSync)
      const meta = readStorageJson(SYNC_KEYS.CLOUD_META, {});
      const sinceTimestamp = forceSync ? 0 : (meta?.lastRemoteVaultUpdated || 0);

      // 2. Fetch Remote Cloud Vault (Serverless primary + Google Calendar backup)
      let remoteVault = await fetchVaultFromServerless(userKey, sinceTimestamp);
      if (!remoteVault && isGoogleCalendarConnected()) {
        remoteVault = await fetchVaultFromGoogleCalendar();
      }

      // 2b. Efficient Conditional GET Handshake: If remote is unmodified and not forceSync
      if (remoteVault?.unmodified && !forceSync && !isAccountMismatch) {
        if (!isLocalMutationRecent(15000)) {
          if (typeof window !== 'undefined' && !silent) {
            window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
              detail: { status: 'synced', timestamp: Date.now(), userKey, hubsCount: 6 }
            }));
          }
          return { success: true, mode: 'unmodified', lastSyncedAt: Date.now() };
        } else {
          // Local mutation occurred while remote was untouched -> push local directly
          const enrichedLocal = { ...localVault, lastUpdated: Date.now() };
          await saveVaultToServerless(userKey, enrichedLocal);
          if (isGoogleCalendarConnected()) {
            saveVaultToGoogleCalendar(enrichedLocal).catch(() => {});
          }
          writeStorageJson(SYNC_KEYS.CLOUD_META, {
            lastRemoteVaultUpdated: enrichedLocal.lastUpdated,
            lastSyncedAt: Date.now(),
            status: 'synced',
            deviceId: getOrCreateDeviceId()
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
              detail: { status: 'synced', timestamp: Date.now(), userKey, hubsCount: 6 }
            }));
          }
          return { success: true, mode: 'pushed', vault: enrichedLocal };
        }
      }

      // 3. Force Pull / Account Mismatch / Replace Local:
      if (forcePull || replaceLocal || isAccountMismatch) {
        if (remoteVault) {
          importFullOsState(remoteVault, { replaceLocal: true, forcePull: true });
          writeStorageJson(SYNC_KEYS.CLOUD_META, {
            lastRemoteVaultUpdated: remoteVault.lastUpdated || Date.now(),
            lastSyncedAt: Date.now(),
            status: 'synced',
            deviceId: getOrCreateDeviceId()
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
              detail: { status: 'synced', timestamp: Date.now(), userKey, hubsCount: 6 }
            }));
          }
          return { success: true, mode: 'pulled', vault: remoteVault };
        } else {
          // Brand new account with no remote vault!
          // Seed new account with pristine blank vault so it NEVER inherits previous user's data
          const blankVault = getBlankVault(account);
          importFullOsState(blankVault, { replaceLocal: true, forcePull: true });
          await saveVaultToServerless(userKey, blankVault);
          if (isGoogleCalendarConnected()) {
            saveVaultToGoogleCalendar(blankVault).catch(() => {});
          }
          writeStorageJson(SYNC_KEYS.CLOUD_META, {
            lastRemoteVaultUpdated: blankVault.lastUpdated,
            lastSyncedAt: Date.now(),
            status: 'synced',
            deviceId: getOrCreateDeviceId()
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
              detail: { status: 'synced', timestamp: Date.now(), userKey, hubsCount: 6 }
            }));
          }
          return { success: true, mode: 'initial_seed', vault: blankVault };
        }
      }

      // 4. Standard 2-Way Sync / Force Sync
      let finalVault;
      if (remoteVault && !remoteVault.unmodified) {
        // Both exist: merge intelligently with tombstone guarantees
        finalVault = mergeOsState(localVault, remoteVault);
      } else {
        // No remote vault exists yet:
        // Only push localVault if localVault belongs to this user. Otherwise, seed with blank vault.
        const isOwnedByActiveUser = activeEmail && storedOwnerEmail === activeEmail;
        finalVault = isOwnedByActiveUser
          ? { ...localVault, lastUpdated: Date.now() }
          : getBlankVault(account);
      }

      // Apply merged vault locally
      importFullOsState(finalVault);

      // Save merged master vault back to cloud (both serverless and Google Calendar)
      await saveVaultToServerless(userKey, finalVault);
      if (isGoogleCalendarConnected()) {
        saveVaultToGoogleCalendar(finalVault).catch(() => {});
      }

      writeStorageJson(SYNC_KEYS.CLOUD_META, {
        lastRemoteVaultUpdated: finalVault.lastUpdated || Date.now(),
        lastSyncedAt: Date.now(),
        status: 'synced',
        deviceId: getOrCreateDeviceId()
      });

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
      if (typeof window !== 'undefined' && !silent) {
        window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
          detail: { status: 'failed', error: err.message, timestamp: Date.now() }
        }));
      }
      return { success: false, error: err.message };
    } finally {
      activeSyncPromise = null;
      if (hasQueuedSync) {
        hasQueuedSync = false;
        setTimeout(() => {
          syncFullOsWithCloud({ forcePush: false, silent: true }).catch(() => {});
        }, 100);
      }
    }
  })();

  return activeSyncPromise;
}

/**
 * Debounced Auto-Push: Debounces rapid local edits to prevent network spam
 */
let debouncePushTimer = null;

export function triggerDebouncedCloudPush(delayMs = 250, forcePush = false) {
  if (isApplyingRemoteSync) return;
  if (typeof window === 'undefined') return;

  if (debouncePushTimer) {
    clearTimeout(debouncePushTimer);
  }

  debouncePushTimer = setTimeout(() => {
    if (isApplyingRemoteSync) return;
    syncFullOsWithCloud({ forcePush, silent: true }).catch(err => {
      console.debug("Debounced cloud push notice:", err.message);
    });
  }, delayMs);
}

/**
 * Immediate Cloud Push: Sends immediate signal on item additions/deletions
 * Force pushes local state directly to cloud serverless vault with ultra-low latency (50ms)
 */
let immediatePushTimer = null;

export function triggerImmediateCloudPush(delayMs = 50, forcePush = true) {
  if (typeof window === 'undefined') return;

  markLocalMutation();

  if (debouncePushTimer) {
    clearTimeout(debouncePushTimer);
    debouncePushTimer = null;
  }
  if (immediatePushTimer) {
    clearTimeout(immediatePushTimer);
  }

  immediatePushTimer = setTimeout(() => {
    syncFullOsWithCloud({ forcePush, silent: false }).catch(err => {
      console.debug("Immediate cloud push notice:", err.message);
    });
  }, delayMs);
}

/**
  * Cancel all pending debounced or immediate cloud pushes
  */
export function cancelPendingCloudPushes() {
  if (debouncePushTimer) {
    clearTimeout(debouncePushTimer);
    debouncePushTimer = null;
  }
  if (immediatePushTimer) {
    clearTimeout(immediatePushTimer);
    immediatePushTimer = null;
  }
}
