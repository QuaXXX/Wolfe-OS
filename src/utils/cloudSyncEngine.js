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
import { reconcileCalendarItems } from './calendarUtils.js';

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
  CLOUD_META: 'wolfe_cloud_sync_meta_v1'
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
 * Get the verified Google User ID or email for cloud vault keying
 */
export function getCloudUserKey() {
  const account = getGoogleAccount();
  if (account?.id) return `user_${account.id}`;
  if (account?.email) return `user_${account.email.replace(/[^a-zA-Z0-9]/g, '_')}`;
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
 * Intelligent 2-Way Conflict-Free Merger
 * Merges local device state with remote cloud state without loss of user updates.
 */
export function mergeOsState(localVault, remoteVault) {
  if (!remoteVault) return localVault;
  if (!localVault) return remoteVault;

  const merged = {
    version: 2,
    lastUpdated: Math.max(localVault.lastUpdated || 0, remoteVault.lastUpdated || 0, Date.now()),
    googleAccount: remoteVault.googleAccount || localVault.googleAccount
  };

  // 1. NUTRITION MERGE
  const localNut = localVault.nutrition || {};
  const remoteNut = remoteVault.nutrition || {};

  // Merge meals by ID
  const mealMap = new Map();
  (remoteNut.meals || []).forEach(m => mealMap.set(m.id, m));
  (localNut.meals || []).forEach(m => {
    // Local meal wins if it has newer or same ID
    mealMap.set(m.id, { ...(mealMap.get(m.id) || {}), ...m });
  });
  const mergedMeals = Array.from(mealMap.values()).sort((a, b) => (b.time || 0) - (a.time || 0));

  // Merge weight logs by date/id
  const weightMap = new Map();
  (remoteNut.weightLogs || []).forEach(w => weightMap.set(w.date || w.id, w));
  (localNut.weightLogs || []).forEach(w => weightMap.set(w.date || w.id, { ...(weightMap.get(w.date || w.id) || {}), ...w }));
  const mergedWeightLogs = Array.from(weightMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

  // Merge household pantry staples by name
  const pantryMap = new Map();
  (remoteNut.householdPantry || []).forEach(p => pantryMap.set(p.name?.toLowerCase(), p));
  (localNut.householdPantry || []).forEach(p => pantryMap.set(p.name?.toLowerCase(), { ...(pantryMap.get(p.name?.toLowerCase()) || {}), ...p }));
  const mergedPantry = Array.from(pantryMap.values());

  // Use the newer overall daily target or deficit
  const localIsNewerNut = (localVault.lastUpdated || 0) >= (remoteVault.lastUpdated || 0);
  const baseNut = localIsNewerNut ? localNut : remoteNut;

  merged.nutrition = {
    ...baseNut,
    meals: mergedMeals,
    weightLogs: mergedWeightLogs,
    householdPantry: mergedPantry.length > 0 ? mergedPantry : baseNut.householdPantry
  };

  // 2. WORKOUTS MERGE
  const localWork = localVault.workouts || {};
  const remoteWork = remoteVault.workouts || {};
  const baseWork = localIsNewerNut ? localWork : remoteWork;

  // Merge history by ID
  const historyMap = new Map();
  (remoteWork.history || []).forEach(h => historyMap.set(h.id || `${h.date}_${h.routine}`, h));
  (localWork.history || []).forEach(h => historyMap.set(h.id || `${h.date}_${h.routine}`, { ...(historyMap.get(h.id || `${h.date}_${h.routine}`) || {}), ...h }));

  merged.workouts = {
    ...baseWork,
    history: Array.from(historyMap.values())
  };

  // 3. TRADING MERGE
  const localTrade = localVault.trading || {};
  const remoteTrade = remoteVault.trading || {};
  const localIsNewerTrade = (localVault.lastUpdated || 0) >= (remoteVault.lastUpdated || 0);

  // Journal entries merged by ID
  const journalMap = new Map();
  (remoteTrade.journal || []).forEach(j => journalMap.set(j.id, j));
  (localTrade.journal || []).forEach(j => journalMap.set(j.id, { ...(journalMap.get(j.id) || {}), ...j }));

  // Watchlist merged by symbol
  const watchMap = new Map();
  (remoteTrade.watchlist || []).forEach(w => watchMap.set(w.symbol, w));
  (localTrade.watchlist || []).forEach(w => watchMap.set(w.symbol, { ...(watchMap.get(w.symbol) || {}), ...w }));

  // Paper history merged by ID
  const paperHistMap = new Map();
  (remoteTrade.paperHistory || []).forEach(p => paperHistMap.set(p.id, p));
  (localTrade.paperHistory || []).forEach(p => paperHistMap.set(p.id, { ...(paperHistMap.get(p.id) || {}), ...p }));

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

  // Merge flashcard decks
  const decksMap = new Map();
  (remoteSchool.decks || []).forEach(d => decksMap.set(d.id, d));
  (localSchool.decks || []).forEach(d => decksMap.set(d.id, { ...(decksMap.get(d.id) || {}), ...d }));

  // Merge quizzes
  const quizMap = new Map();
  (remoteSchool.quizzes || []).forEach(q => quizMap.set(q.id, q));
  (localSchool.quizzes || []).forEach(q => quizMap.set(q.id, { ...(quizMap.get(q.id) || {}), ...q }));

  merged.school = {
    dashboard: localIsNewerNut ? (localSchool.dashboard || {}) : (remoteSchool.dashboard || {}),
    decks: Array.from(decksMap.values()),
    quizzes: Array.from(quizMap.values()),
    weakSpots: localIsNewerNut ? (localSchool.weakSpots || []) : (remoteSchool.weakSpots || []),
    courses: localIsNewerNut ? (localSchool.courses || []) : (remoteSchool.courses || [])
  };

  // 5. CALENDAR MERGE (Google Calendar is single master when connected)
  const localCalItems = localVault.calendar?.items || [];
  const remoteCalItems = remoteVault.calendar?.items || [];
  merged.calendar = {
    ...(localIsNewerNut ? localVault.calendar : remoteVault.calendar),
    items: isGoogleCalendarConnected()
      ? localCalItems
      : reconcileCalendarItems(localCalItems, remoteCalItems)
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

  // 1. Core modules
  if (vault.nutrition) {
    writeStorageJson(SYNC_KEYS.NUTRITION, vault.nutrition);
  }
  if (vault.workouts) {
    writeStorageJson(SYNC_KEYS.WORKOUTS, vault.workouts);
  }
  if (vault.trading?.dashboard) {
    writeStorageJson(SYNC_KEYS.TRADING, vault.trading.dashboard);
  }
  if (vault.school?.dashboard) {
    writeStorageJson(SYNC_KEYS.SCHOOL, vault.school.dashboard);
  }
  // Only apply calendar from vault if Google Calendar is not connected (Google is single master)
  if (vault.calendar && !isGoogleCalendarConnected()) {
    writeStorageJson(SYNC_KEYS.CALENDAR, vault.calendar);
    writeStorageJson(SYNC_KEYS.CALENDAR_FALLBACK, vault.calendar);
  }
  if (vault.settings) {
    writeStorageJson(SYNC_KEYS.SETTINGS, vault.settings);
    writeStorageJson(SYNC_KEYS.SETTINGS_FALLBACK, vault.settings);
  }

  // 2. Extended trading
  if (vault.trading?.config) writeStorageJson(SYNC_KEYS.TRADING_CONFIG, vault.trading.config);
  if (vault.trading?.watchlist) writeStorageJson(SYNC_KEYS.TRADING_WATCHLIST, vault.trading.watchlist);
  if (vault.trading?.positions) writeStorageJson(SYNC_KEYS.TRADING_POSITIONS, vault.trading.positions);
  if (vault.trading?.journal) writeStorageJson(SYNC_KEYS.TRADING_JOURNAL, vault.trading.journal);
  if (vault.trading?.hermesBriefs) writeStorageJson(SYNC_KEYS.TRADING_HERMES_BRIEFS, vault.trading.hermesBriefs);
  if (vault.trading?.paperAccount) writeStorageJson(SYNC_KEYS.PAPER_ACCOUNT, vault.trading.paperAccount);
  if (vault.trading?.paperPositions) writeStorageJson(SYNC_KEYS.PAPER_POSITIONS, vault.trading.paperPositions);
  if (vault.trading?.paperHistory) writeStorageJson(SYNC_KEYS.PAPER_HISTORY, vault.trading.paperHistory);

  // 3. Extended study
  if (vault.school?.decks) writeStorageJson(SYNC_KEYS.STUDY_DECKS, vault.school.decks);
  if (vault.school?.quizzes) writeStorageJson(SYNC_KEYS.STUDY_QUIZZES, vault.school.quizzes);
  if (vault.school?.weakSpots) writeStorageJson(SYNC_KEYS.STUDY_WEAK_SPOTS, vault.school.weakSpots);
  if (vault.school?.courses) writeStorageJson(SYNC_KEYS.STUDY_COURSES, vault.school.courses);

  // 4. Update cloud sync metadata
  writeStorageJson(SYNC_KEYS.CLOUD_META, {
    lastSyncedAt: Date.now(),
    lastUpdated: vault.lastUpdated || Date.now(),
    status: 'synced',
    deviceId: getOrCreateDeviceId()
  });

  // 5. Dispatch live window event so React state updates without page reload
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-applied', {
      detail: {
        vault,
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

/**
 * Primary Master Sync: Executes 2-way sync across Phone and Desktop
 */
let activeSyncPromise = null;

export async function syncFullOsWithCloud({ forcePush = false, forcePull = false } = {}) {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    // Notify starting sync
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wolfe-cloud-sync-status', {
        detail: { status: 'syncing', timestamp: Date.now() }
      }));
    }

    try {
      const isConnected = isGoogleCalendarConnected();
      const userKey = getCloudUserKey();

      const localVault = exportFullOsState();

      // 1. Force Push: Upload local state directly
      if (forcePush) {
        const enrichedLocal = { ...localVault, lastUpdated: Date.now() };
        await saveVaultToServerless(userKey, enrichedLocal);
        importFullOsState(enrichedLocal);
        return { success: true, mode: 'pushed', vault: enrichedLocal };
      }

      // 2. Fetch Remote Cloud Vault
      const remoteVault = await fetchVaultFromServerless(userKey);

      // 3. Force Pull: Replace local with remote if remote exists
      if (forcePull && remoteVault) {
        importFullOsState(remoteVault);
        return { success: true, mode: 'pulled', vault: remoteVault };
      }

      // 4. Standard 2-Way Sync
      let finalVault;
      if (remoteVault) {
        // Both exist: merge intelligently
        finalVault = mergeOsState(localVault, remoteVault);
      } else {
        // First device initial seed: push local up
        finalVault = { ...localVault, lastUpdated: Date.now() };
      }

      // Apply merged vault locally
      importFullOsState(finalVault);

      // Save merged master vault back to cloud
      await saveVaultToServerless(userKey, finalVault);

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
