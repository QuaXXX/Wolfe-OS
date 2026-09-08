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

  if (token && !verifiedUserId) {
    try {
      const gRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (gRes.ok) {
        const uData = await gRes.json();
        verifiedUserId = uData.id || uData.email;
      }
    } catch (err) {
      // Best-effort
    }
  }

  const userKey = sanitizeUserId(verifiedUserId || 'primary_user');

  // -------------------------------------------------------------------------
  // 1. GET: RETRIEVE CLOUD VAULT
  // -------------------------------------------------------------------------
  if (req.method === 'GET') {
    // 1. Check in-memory store
    let vault = memoryStore.get(userKey);

    // 2. Check local dev storage
    if (!vault) {
      const fileVaults = loadDevVaults();
      if (fileVaults[userKey]) {
        vault = fileVaults[userKey];
        memoryStore.set(userKey, vault);
      }
    }

    // 3. Check Vercel KV / Upstash Redis if configured
    const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!vault && kvUrl && kvToken) {
      try {
        const kvRes = await fetch(`${kvUrl}/get/wolfe_vault_${encodeURIComponent(userKey)}`, {
          headers: { Authorization: `Bearer ${kvToken}` }
        });
        if (kvRes.ok) {
          const kvData = await kvRes.json();
          if (kvData && kvData.result) {
            vault = typeof kvData.result === 'string' ? JSON.parse(kvData.result) : kvData.result;
            memoryStore.set(userKey, vault);
          }
        }
      } catch (kvErr) {
        console.warn("KV fetch notice:", kvErr.message);
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
    const enrichedVault = {
      ...payloadVault,
      lastUpdated: Date.now(),
      serverSyncedAt: new Date().toISOString()
    };

    // 1. Update in-memory store
    memoryStore.set(targetUserId, enrichedVault);

    // 2. Update local dev storage file
    const fileVaults = loadDevVaults();
    fileVaults[targetUserId] = enrichedVault;
    saveDevVaults(fileVaults);

    // 3. Update Vercel KV / Upstash Redis if configured
    const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (kvUrl && kvToken) {
      try {
        await fetch(`${kvUrl}/set/wolfe_vault_${encodeURIComponent(targetUserId)}`, {
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
