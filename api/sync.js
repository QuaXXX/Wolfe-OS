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

    // Helper to find vault across all candidate keys
    const findVault = (sourceMapOrObj) => {
      for (const k of candidateKeys) {
        if (!k) continue;
        const val = sourceMapOrObj instanceof Map ? sourceMapOrObj.get(k) : sourceMapOrObj[k];
        if (val) return val;
      }
      return null;
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
      // If still no vault and only 1 vault exists in dev storage, return that vault
      if (!vault) {
        const keys = Object.keys(fileVaults);
        if (keys.length === 1) {
          vault = fileVaults[keys[0]];
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
    
    // Existing vault in memory or dev file
    const existingVault = memoryStore.get(targetUserId) || loadDevVaults()[targetUserId] || null;
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

    // Intelligently merge meals between existing server vault and incoming payload
    let finalMeals = [];
    if (payloadVault.nutrition || existingVault?.nutrition) {
      const mealMap = new Map();
      // 1. Existing meals
      (existingVault?.nutrition?.meals || []).forEach(m => {
        if (!m) return;
        const mId = m.id || `${m.date}-${m.name}-${m.calories}`;
        const cleanM = m.id ? m : { ...m, id: mId };
        if (!isTomb(cleanM.id, cleanM.updatedAt || cleanM.createdAt || cleanM.time)) {
          mealMap.set(cleanM.id, cleanM);
        }
      });
      // 2. Incoming payload meals
      (payloadVault.nutrition?.meals || []).forEach(m => {
        if (!m) return;
        const mId = m.id || `${m.date}-${m.name}-${m.calories}`;
        const cleanM = m.id ? m : { ...m, id: mId };
        if (!isTomb(cleanM.id, cleanM.updatedAt || cleanM.createdAt || cleanM.time)) {
          mealMap.set(cleanM.id, { ...(mealMap.get(cleanM.id) || {}), ...cleanM });
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
    }

    // Purge tombstoned items from the incoming payload
    const sanitizedNutrition = payloadVault.nutrition ? {
      ...payloadVault.nutrition,
      meals: finalMeals,
      weightLogs: (payloadVault.nutrition.weightLogs || []).filter(w => !isTomb(w.id, w.updatedAt) && !isTomb(w.date, w.updatedAt)),
      householdPantry: (payloadVault.nutrition.householdPantry || []).filter(s => !isTomb(s.id, s.updatedAt) && !isTomb(s.name?.toLowerCase(), s.updatedAt))
    } : payloadVault.nutrition;

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
      _tombstones: mergedTombstones,
      nutrition: sanitizedNutrition,
      workouts: sanitizedWorkouts,
      trading: sanitizedTrading,
      school: sanitizedSchool,
      calendar: sanitizedCalendar,
      lastUpdated: Date.now(),
      serverSyncedAt: new Date().toISOString()
    };

    // 1. Update in-memory store across all candidate keys
    const writeKeys = Array.from(new Set([targetUserId, ...candidateKeys].filter(Boolean)));
    writeKeys.forEach(k => memoryStore.set(k, enrichedVault));

    // 2. Update local dev storage file across keys
    const fileVaults = loadDevVaults();
    writeKeys.forEach(k => { fileVaults[k] = enrichedVault; });
    saveDevVaults(fileVaults);

    // 3. Update Vercel KV / Upstash Redis if configured
    const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

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
