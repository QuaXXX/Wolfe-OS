/**
 * Wolfe OS Cloud Sync Serverless API Endpoint
 * Handles cross-device state synchronization between Phone and Desktop.
 * 
 * Endpoints:
 *   GET  /api/sync?user_id=<google_user_id>   -> Returns cloud vault
 *   POST /api/sync                            -> Saves/updates cloud vault
 */

import fs from 'fs';
import path from 'path';

// In-memory cache for fast lambda execution
const memoryStore = new Map();

// Local file storage path when running in Node / Vite dev
const DEV_STORAGE_DIR = path.resolve(process.cwd(), 'data');
const DEV_STORAGE_FILE = path.join(DEV_STORAGE_DIR, 'wolfe_cloud_vault.json');

function ensureDevStorage() {
  try {
    if (!fs.existsSync(DEV_STORAGE_DIR)) {
      fs.mkdirSync(DEV_STORAGE_DIR, { recursive: true });
    }
  } catch (e) {
    // Non-blocking in serverless environments where root fs is read-only
  }
}

function loadDevVaults() {
  try {
    if (fs.existsSync(DEV_STORAGE_FILE)) {
      const raw = fs.readFileSync(DEV_STORAGE_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {}
  return {};
}

function saveDevVaults(vaults) {
  try {
    ensureDevStorage();
    fs.writeFileSync(DEV_STORAGE_FILE, JSON.stringify(vaults, null, 2), 'utf8');
  } catch (e) {
    // Non-blocking
  }
}

/**
 * Hash or normalize user ID to prevent key injection
 */
function sanitizeUserId(userId) {
  if (!userId) return 'default_user';
  return String(userId).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const urlObj = new URL(req.url, 'http://localhost');
  const queryUserId = urlObj.searchParams.get('user_id') || urlObj.searchParams.get('userId');

  // Verify optional Google Token passed in Authorization header
  let verifiedUserId = queryUserId;
  const headers = req.headers || {};
  const authHeader = headers['authorization'] || headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  let tokenEmail = null;
  let tokenId = null;

  if (token) {
    try {
      const gRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (gRes.ok) {
        const uData = await gRes.json();
        tokenEmail = uData.email;
        tokenId = uData.id;
        if (!verifiedUserId || verifiedUserId === 'primary_user') {
          verifiedUserId = tokenEmail || tokenId;
        }
      }
    } catch (err) {
      // Best-effort
    }
  }

  const userKey = sanitizeUserId(verifiedUserId || 'primary_user');
  const candidateKeys = [
    userKey,
    tokenEmail ? sanitizeUserId(`user_${tokenEmail}`) : null,
    tokenId ? sanitizeUserId(`user_${tokenId}`) : null,
    'primary_user'
  ].filter(Boolean);

  // -------------------------------------------------------------------------
  // 1. GET: RETRIEVE CLOUD VAULT
  // -------------------------------------------------------------------------
  if (req.method === 'GET') {
    let vault = null;

    // Helper to find vault across all candidate keys, selecting the most recent version
    const findVault = (sourceMapOrObj) => {
      let newest = null;
      for (const k of candidateKeys) {
        if (!k) continue;
        const val = sourceMapOrObj instanceof Map ? sourceMapOrObj.get(k) : sourceMapOrObj[k];
        if (val) {
          if (!newest || (val.lastUpdated || 0) > (newest.lastUpdated || 0)) {
            newest = val;
          }
        }
      }
      return newest;
    };

    // 1. Check in-memory store
    vault = findVault(memoryStore);

    // 2. Check local dev storage
    if (!vault) {
      const fileVaults = loadDevVaults();
      vault = findVault(fileVaults);
      if (!vault && queryUserId && fileVaults[queryUserId]) {
        vault = fileVaults[queryUserId];
      }
      // If still no vault, find best match across dev storage
      if (!vault) {
        const entries = Object.entries(fileVaults);
        if (entries.length > 0) {
          if (tokenEmail || queryUserId) {
            const needle = sanitizeUserId(tokenEmail || queryUserId).toLowerCase();
            const matched = entries.find(([k, v]) => 
              k.toLowerCase().includes(needle) || 
              (v?.googleAccount?.email && sanitizeUserId(v.googleAccount.email).toLowerCase().includes(needle))
            );
            if (matched) vault = matched[1];
          }
          if (!vault) {
            entries.sort((a, b) => (b[1]?.lastUpdated || 0) - (a[1]?.lastUpdated || 0));
            vault = entries[0][1];
          }
        }
      }
      if (vault) {
        memoryStore.set(userKey, vault);
      }
    }

    // 3. Check Vercel KV / Upstash Redis if configured
    const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!vault && kvUrl && kvToken) {
      for (const k of candidateKeys) {
        if (!k) continue;
        try {
          const kvRes = await fetch(`${kvUrl}/get/wolfe_vault_${encodeURIComponent(k)}`, {
            headers: { Authorization: `Bearer ${kvToken}` }
          });
          if (kvRes.ok) {
            const kvData = await kvRes.json();
            if (kvData && kvData.result) {
              vault = typeof kvData.result === 'string' ? JSON.parse(kvData.result) : kvData.result;
              memoryStore.set(userKey, vault);
              break;
            }
          }
        } catch (kvErr) {
          console.warn("KV fetch notice:", kvErr.message);
        }
      }
    }

    if (!vault) {
      return res.status(200).json({
        success: true,
        exists: false,
        userKey,
        vault: null,
        message: 'No cloud vault found for this account yet.'
      });
    }

    return res.status(200).json({
      success: true,
      exists: true,
      userKey,
      vault,
      lastModified: vault.lastUpdated || Date.now()
    });
  }

  // -------------------------------------------------------------------------
  // 2. POST: SAVE / UPDATE CLOUD VAULT
  // -------------------------------------------------------------------------
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body.' });
      }
    }

    const payloadVault = body?.vault || body;
    if (!payloadVault || typeof payloadVault !== 'object') {
      return res.status(400).json({ error: 'Missing vault data.' });
    }

    const targetUserId = sanitizeUserId(body?.userId || verifiedUserId || 'primary_user');
    
    // Existing vault in memory, dev file, or KV across candidate keys
    const fileVaults = loadDevVaults();
    let existingVault = null;
    for (const k of [targetUserId, ...candidateKeys]) {
      if (k && (memoryStore.has(k) || fileVaults[k])) {
        existingVault = memoryStore.get(k) || fileVaults[k];
        break;
      }
    }
    if (!existingVault) {
      const entries = Object.entries(fileVaults);
      if (entries.length > 0) {
        entries.sort((a, b) => (b[1]?.lastUpdated || 0) - (a[1]?.lastUpdated || 0));
        existingVault = entries[0][1];
      }
    }

    const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!existingVault && kvUrl && kvToken) {
      for (const k of [targetUserId, ...candidateKeys]) {
        if (!k) continue;
        try {
          const kvRes = await fetch(`${kvUrl}/get/wolfe_vault_${encodeURIComponent(k)}`, {
            headers: { Authorization: `Bearer ${kvToken}` }
          });
          if (kvRes.ok) {
            const kvData = await kvRes.json();
            if (kvData && kvData.result) {
              existingVault = typeof kvData.result === 'string' ? JSON.parse(kvData.result) : kvData.result;
              if (existingVault) break;
            }
          }
        } catch (kvErr) {
          // Best-effort KV fetch
        }
      }
    }

    const mergedTombstones = {
      ...(existingVault?._tombstones || {}),
      ...(payloadVault._tombstones || {})
    };

    const isTomb = (id, updatedAt) => {
      if (!id) return false;
      const tombTime = mergedTombstones[String(id)];
      if (!tombTime) return false;
      const itemTime = updatedAt ? (new Date(updatedAt).getTime() || Number(updatedAt) || 0) : 0;
      return itemTime <= tombTime;
    };

    // Intelligently merge nutrition (meals, weightHistory/logs, pantry, dailyTargets)
    let finalMeals = [];
    let finalWeight = [];
    let finalPantry = [];
    let finalDailyTargets = {};

    if (payloadVault.nutrition || existingVault?.nutrition) {
      // 1. Merge meals
      const mealMap = new Map();
      (existingVault?.nutrition?.meals || []).forEach(m => {
        if (!m) return;
        const mId = m.id || `${m.date}-${m.name}-${m.calories}`;
        const cleanM = m.id ? m : { ...m, id: mId };
        if (!isTomb(cleanM.id, cleanM.updatedAt || cleanM.createdAt || cleanM.time)) {
          mealMap.set(cleanM.id, cleanM);
        }
      });
      (payloadVault.nutrition?.meals || []).forEach(m => {
        if (!m) return;
        const mId = m.id || `${m.date}-${m.name}-${m.calories}`;
        const cleanM = m.id ? m : { ...m, id: mId };
        if (!isTomb(cleanM.id, cleanM.updatedAt || cleanM.createdAt || cleanM.time)) {
          const existingM = mealMap.get(cleanM.id);
          if (!existingM) {
            mealMap.set(cleanM.id, cleanM);
          } else {
            const incomingTime = cleanM.updatedAt || cleanM.createdAt || 0;
            const existingTime = existingM.updatedAt || existingM.createdAt || 0;
            if (incomingTime >= existingTime) {
              mealMap.set(cleanM.id, { ...existingM, ...cleanM });
            } else {
              mealMap.set(cleanM.id, { ...cleanM, ...existingM });
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
      finalMeals = Array.from(mealMap.values()).sort((a, b) => getMealSortTime(b) - getMealSortTime(a));

      // 2. Merge weightHistory / weightLogs
      const weightMap = new Map();
      const existingWeight = Array.isArray(existingVault?.nutrition?.weightHistory)
        ? existingVault.nutrition.weightHistory
        : (Array.isArray(existingVault?.nutrition?.weightLogs) ? existingVault.nutrition.weightLogs : []);
      const payloadWeight = Array.isArray(payloadVault.nutrition?.weightHistory)
        ? payloadVault.nutrition.weightHistory
        : (Array.isArray(payloadVault.nutrition?.weightLogs) ? payloadVault.nutrition.weightLogs : []);

      existingWeight.forEach(w => {
        if (!w) return;
        const k = w.id || w.date;
        const wVal = w.weightLbs ?? w.weight ?? 0;
        const cleanW = { ...w, weightLbs: wVal, weight: wVal };
        if (!isTomb(k, cleanW.updatedAt || new Date(cleanW.date).getTime())) {
          weightMap.set(k, cleanW);
        }
      });
      payloadWeight.forEach(w => {
        if (!w) return;
        const k = w.id || w.date;
        const wVal = w.weightLbs ?? w.weight ?? 0;
        const cleanW = { ...w, weightLbs: wVal, weight: wVal };
        if (!isTomb(k, cleanW.updatedAt || new Date(cleanW.date).getTime())) {
          const existingW = weightMap.get(k);
          if (!existingW) {
            weightMap.set(k, cleanW);
          } else {
            const incomingTime = cleanW.updatedAt || new Date(cleanW.date).getTime() || 0;
            const existingTime = existingW.updatedAt || new Date(existingW.date).getTime() || 0;
            if (incomingTime >= existingTime) {
              weightMap.set(k, { ...existingW, ...cleanW });
            } else {
              weightMap.set(k, { ...cleanW, ...existingW });
            }
          }
        }
      });
      finalWeight = Array.from(weightMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

      // 3. Merge household pantry
      const pantryMap = new Map();
      (existingVault?.nutrition?.householdPantry || []).forEach(p => {
        if (!p) return;
        const k = p.id || p.name?.toLowerCase();
        if (!isTomb(k, p.updatedAt) && !isTomb(p.id, p.updatedAt)) {
          pantryMap.set(k, p);
        }
      });
      (payloadVault.nutrition?.householdPantry || []).forEach(p => {
        if (!p) return;
        const k = p.id || p.name?.toLowerCase();
        if (!isTomb(k, p.updatedAt) && !isTomb(p.id, p.updatedAt)) {
          pantryMap.set(k, { ...(pantryMap.get(k) || {}), ...p });
        }
      });
      finalPantry = Array.from(pantryMap.values());

      // 4. Merge dailyTargets
      finalDailyTargets = {
        ...(existingVault?.nutrition?.dailyTargets || {}),
        ...(payloadVault.nutrition?.dailyTargets || {})
      };
    }

    const payloadNut = payloadVault.nutrition || {};
    const sanitizedNutrition = (payloadVault.nutrition || existingVault?.nutrition) ? {
      ...(existingVault?.nutrition || {}),
      ...payloadNut,
      meals: finalMeals,
      weightHistory: finalWeight,
      weightLogs: finalWeight,
      householdPantry: finalPantry,
      dailyTargets: finalDailyTargets,
      updatedAt: Math.max(payloadNut.updatedAt || 0, existingVault?.nutrition?.updatedAt || 0, Date.now())
    } : null;

    const sanitizedWorkouts = payloadVault.workouts ? {
      ...payloadVault.workouts,
      history: (payloadVault.workouts.history || []).filter(h => !isTomb(h.id, h.date) && !isTomb(`${h.date}_${h.routine}`, h.date))
    } : payloadVault.workouts;

    const sanitizedTrading = payloadVault.trading ? {
      ...payloadVault.trading,
      watchlist: (payloadVault.trading.watchlist || []).filter(w => !isTomb(w.symbol)),
      journal: (payloadVault.trading.journal || []).filter(j => !isTomb(j.id)),
      paperHistory: (payloadVault.trading.paperHistory || []).filter(p => !isTomb(p.id))
    } : payloadVault.trading;

    const sanitizedSchool = payloadVault.school ? {
      ...payloadVault.school,
      decks: (payloadVault.school.decks || []).filter(d => !isTomb(d.id)),
      quizzes: (payloadVault.school.quizzes || []).filter(q => !isTomb(q.id))
    } : payloadVault.school;

    const sanitizedCalendar = payloadVault.calendar ? {
      ...payloadVault.calendar,
      items: (payloadVault.calendar.items || []).filter(it => !isTomb(it.id))
    } : payloadVault.calendar;

    const enrichedVault = {
      ...payloadVault,
      googleAccount: payloadVault.googleAccount || existingVault?.googleAccount || null,
      _tombstones: mergedTombstones,
      nutrition: sanitizedNutrition,
      workouts: sanitizedWorkouts,
      trading: sanitizedTrading,
      school: sanitizedSchool,
      calendar: sanitizedCalendar,
      lastUpdated: Date.now(),
      serverSyncedAt: new Date().toISOString()
    };

    // 1. Update in-memory store across all candidate keys and user identity aliases
    const writeKeys = Array.from(new Set([
      targetUserId,
      'primary_user',
      payloadVault.googleAccount?.email ? sanitizeUserId(`user_${payloadVault.googleAccount.email}`) : null,
      existingVault?.googleAccount?.email ? sanitizeUserId(`user_${existingVault.googleAccount.email}`) : null,
      ...candidateKeys
    ].filter(Boolean)));
    writeKeys.forEach(k => memoryStore.set(k, enrichedVault));

    // 2. Update local dev storage file across keys
    writeKeys.forEach(k => { fileVaults[k] = enrichedVault; });
    saveDevVaults(fileVaults);

    // 3. Update Vercel KV / Upstash Redis if configured
    if (kvUrl && kvToken) {
      for (const k of writeKeys) {
        try {
          await fetch(`${kvUrl}/set/wolfe_vault_${encodeURIComponent(k)}`, {
            method: 'POST',
            headers: { 
              'Authorization': `Bearer ${kvToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(enrichedVault)
          });
        } catch (kvErr) {
          console.warn("KV save notice:", kvErr.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      saved: true,
      userKey: targetUserId,
      lastModified: enrichedVault.lastUpdated,
      sizeBytes: JSON.stringify(enrichedVault).length
    });
  }

  return res.status(405).json({ error: 'Method Not Allowed' });
}
