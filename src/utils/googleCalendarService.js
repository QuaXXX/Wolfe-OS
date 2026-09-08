/**
 * Google Calendar & Tasks Integration Service for Wolfe OS
 * Uses Google Calendar REST API v3, Google Tasks API v1, and Automated Token Exchange
 */

import { addDays, getTodayIso, formatEventTimeRange, GOOGLE_COLOR_MAP } from './calendarUtils.js';

const GOOGLE_CLIENT_ID_KEY = 'wolfe_gcal_client_id';
const GOOGLE_CLIENT_SECRET_KEY = 'wolfe_gcal_client_secret';
const GOOGLE_ACCESS_TOKEN_KEY = 'wolfe_gcal_token';
const GOOGLE_REFRESH_TOKEN_KEY = 'wolfe_gcal_refresh_token';
const GOOGLE_EXPIRY_KEY = 'wolfe_gcal_expiry';
const GOOGLE_ACCOUNT_KEY = 'wolfe_gcal_account';
const GOOGLE_DEVICE_AUTH_KEY = 'wolfe_device_authenticated';

const DEFAULT_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID || '';
const DEFAULT_CLIENT_SECRET = import.meta.env?.VITE_GOOGLE_CLIENT_SECRET || '';
const DEFAULT_REFRESH_TOKEN = import.meta.env?.VITE_GOOGLE_REFRESH_TOKEN || '';
const DEFAULT_ACCESS_TOKEN = import.meta.env?.VITE_GOOGLE_ACCESS_TOKEN || '';

export const GOOGLE_CALENDAR_CONFIG = {
  clientId: DEFAULT_CLIENT_ID,
  clientSecret: DEFAULT_CLIENT_SECRET,
  scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
};

/**
 * Get device-specific identifier for persistent connection tracking
 */
export function getOrCreateDeviceId() {
  if (typeof localStorage === 'undefined') return 'device-unknown';
  let id = localStorage.getItem('wolfe_device_id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('wolfe_device_id', id);
  }
  return id;
}

/**
 * Get cached Google Account details (email, display name, avatar)
 */
export function getGoogleAccount() {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(GOOGLE_ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Save Google Account details
 */
export function saveGoogleAccount(account) {
  if (typeof localStorage === 'undefined' || !account) return;
  localStorage.setItem(GOOGLE_ACCOUNT_KEY, JSON.stringify(account));
}

/**
 * Detailed device authentication & sync health status
 */
export function getDeviceSyncDetails() {
  if (typeof localStorage === 'undefined') {
    return { isConnected: false, hasPermanentAccess: false, deviceId: 'unknown' };
  }
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const account = getGoogleAccount();
  const isConnected = isGoogleCalendarConnected();

  return {
    isConnected,
    hasPermanentAccess: !!refreshToken,
    accountEmail: account?.email || null,
    accountName: account?.name || null,
    accountPicture: account?.picture || null,
    hasActiveToken: !!token,
    isExpired: isGoogleTokenExpired(),
    deviceId: getOrCreateDeviceId()
  };
}

/**
 * Check if running on a mobile browser / handheld device
 */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  return (
    window.innerWidth < 768 || 
    /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
}

/**
 * Check if user has an active or refreshable Google Calendar connection on this device.
 * Strictly requires an actual access token or permanent refresh token.
 */
export function isGoogleCalendarConnected() {
  if (typeof localStorage === 'undefined') return false;
  const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  
  // Must have an actual token or refresh token stored on this device
  return Boolean((token && token.trim()) || (refreshToken && refreshToken.trim()));
}

/**
 * Check if token exists but has expired (if refresh token is present, connection is still valid)
 */
export function isGoogleTokenExpired() {
  if (typeof localStorage === 'undefined') return true;
  const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  
  // A refresh token means the device connection never expires
  if (refreshToken) return false;
  if (!token) return true;

  const expiry = localStorage.getItem(GOOGLE_EXPIRY_KEY);
  if (!expiry) return false;
  return Date.now() > Number(expiry);
}

/**
 * Save tokens to localStorage with long device persistence
 */
export function saveGoogleToken(token, expiresInSeconds = 3600, refreshToken = null) {
  if (!token && !refreshToken) return;
  if (typeof localStorage === 'undefined') return;

  localStorage.setItem('wolfe_user_signed_in_google', 'true');
  localStorage.setItem(GOOGLE_DEVICE_AUTH_KEY, 'true');
  
  if (token) {
    const clean = token.trim();
    if (clean.startsWith('1//')) {
      localStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, clean);
    } else {
      localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, clean);
      // Real expiration calculation with 120-second proactive refresh buffer
      const duration = Math.max(300, Number(expiresInSeconds) || 3600);
      const expiryTime = Date.now() + (duration - 120) * 1000;
      localStorage.setItem(GOOGLE_EXPIRY_KEY, String(expiryTime));
    }
  }

  if (refreshToken && typeof refreshToken === 'string' && refreshToken.trim()) {
    localStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, refreshToken.trim());
  }
}

/**
 * Fetch and save Google user profile (email, name, picture)
 */
export async function fetchGoogleUserProfile(token = null) {
  try {
    const accessToken = token || await getValidAccessToken();
    if (!accessToken) return null;
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.ok) {
      const uData = await res.json();
      const account = {
        email: uData.email,
        name: uData.name,
        picture: uData.picture,
        id: uData.id,
        connectedAt: Date.now()
      };
      saveGoogleAccount(account);
      return account;
    }
  } catch (e) {
    // Non-blocking
  }
  return null;
}

/**
 * Disconnect Google Calendar and wipe device credentials
 */
export function disconnectGoogleCalendar() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_EXPIRY_KEY);
  localStorage.removeItem(GOOGLE_REFRESH_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_ACCOUNT_KEY);
  localStorage.removeItem(GOOGLE_DEVICE_AUTH_KEY);
  localStorage.removeItem('wolfe_user_signed_in_google');
}

/**
 * Exchange Authorization Code for permanent Refresh Token and Access Token
 */
export async function exchangeCodeForTokens(code, redirectUri = 'postmessage', codeVerifier = '') {
  if (!code) throw new Error("Missing authorization code.");

  const clientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID || '274840525694-1g49f29hvlvgvur006ki1qshcv90mmmr.apps.googleusercontent.com';
  const clientSecret = localStorage.getItem(GOOGLE_CLIENT_SECRET_KEY) || DEFAULT_CLIENT_SECRET || '';

  const res = await fetch('/api/auth/google-auth?action=exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.details?.error_description || "Failed to exchange authorization code.");
  }

  // Persist permanent tokens on this device
  saveGoogleToken(data.access_token, data.expires_in || 3600, data.refresh_token);
  if (data.user) {
    saveGoogleAccount(data.user);
  }
  localStorage.setItem(GOOGLE_DEVICE_AUTH_KEY, 'true');

  return data;
}

/**
 * Check and handle OAuth redirect from URL (essential for mobile browsers & full-page redirects)
 */
export async function checkAndHandleOAuthRedirect() {
  if (typeof window === 'undefined') return false;

  // 1. Check for authorization code redirect (?code=...)
  if (window.location.search && window.location.search.includes('code=')) {
    try {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      if (code) {
        window.history.replaceState(null, '', window.location.pathname);
        await exchangeCodeForTokens(code, window.location.origin);
        return true;
      }
    } catch (e) {
      console.warn("OAuth code redirect parse notice:", e);
    }
  }

  // 2. Check for access_token hash redirect (#access_token=...)
  if (window.location.hash && window.location.hash.includes('access_token=')) {
    try {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
      if (token) {
        saveGoogleToken(token, expiresIn);
        localStorage.setItem(GOOGLE_DEVICE_AUTH_KEY, 'true');
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        fetchGoogleUserProfile(token).catch(() => {});
        return true;
      }
    } catch (e) {
      console.warn("OAuth redirect parse notice:", e);
    }
  }
  return false;
}

/**
 * Ensure Google Identity Services (GIS) client script is loaded
 */
export async function ensureGoogleGsiLoaded() {
  if (typeof window === 'undefined') return false;
  if (window.google?.accounts?.oauth2?.initTokenClient) return true;

  if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }

  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.google?.accounts?.oauth2?.initTokenClient) {
        clearInterval(interval);
        resolve(true);
      } else if (attempts > 35) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Sign in once with Google Authorization Code Flow for Permanent Device Access (Offline flow)
 * Uses GIS initCodeClient (popup mode) or OAuth popup window with custom credentials.
 */
export function signInWithGoogleCode(clientIdOverride = null) {
  return new Promise((resolve, reject) => {
    const clientId = clientIdOverride || localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID || '274840525694-1g49f29hvlvgvur006ki1qshcv90mmmr.apps.googleusercontent.com';

    if (!clientId) {
      return reject(new Error("No Google Client ID configured."));
    }

    if (typeof window === 'undefined') {
      return reject(new Error("Window is not defined."));
    }

    // DESKTOP & MODERN BROWSERS: Google Identity Services (GIS) Code Client (Official popup flow)
    if (window.google?.accounts?.oauth2?.initCodeClient) {
      try {
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
          ux_mode: 'popup',
          callback: async (response) => {
            if (response.error) {
              return reject(new Error(response.error_description || response.error));
            }
            if (response.code) {
              try {
                const exchangeResult = await exchangeCodeForTokens(response.code, 'postmessage');
                resolve(exchangeResult);
              } catch (exErr) {
                reject(exErr);
              }
            } else {
              reject(new Error("No authorization code received from Google."));
            }
          },
          error_callback: (err) => {
            reject(new Error(err.message || "Google Sign-In window was closed."));
          }
        });
        client.requestCode();
        return;
      } catch (err) {
        console.warn("GIS code client initialization fallback:", err);
      }
    }

    const redirectUri = window.location.origin;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

    // Popup window fallback
    const width = 500;
    const height = 620;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(authUrl, 'google_signin_popup', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      return reject(new Error("Popup blocked by browser. Please allow popups for Wolfe OS."));
    }

    const pollTimer = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(pollTimer);
          reject(new Error("Google sign-in window was closed."));
          return;
        }
        if (popup.location.href && popup.location.href.includes('code=')) {
          const url = new URL(popup.location.href);
          const code = url.searchParams.get('code');
          if (code) {
            clearInterval(pollTimer);
            popup.close();
            try {
              const exchangeResult = await exchangeCodeForTokens(code, redirectUri);
              resolve(exchangeResult);
            } catch (exErr) {
              reject(exErr);
            }
          }
        }
      } catch (e) {
        // Cross-origin restriction before redirect - ignore
      }
    }, 500);
  });
}

/**
 * Master One-Click Google Sign-In (Client-side Token Flow)
 * Uses Google Identity Services initTokenClient for both mobile and desktop.
 * Does NOT require custom redirect_uri registration (bypasses Error 400 "Access blocked: app's request is invalid").
 * Reliably requests calendar & tasks permissions without full-page navigation.
 */
export async function signInWithGooglePopup(clientIdOverride = null) {
  const clientId = clientIdOverride || localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID || '274840525694-1g49f29hvlvgvur006ki1qshcv90mmmr.apps.googleusercontent.com';

  if (!clientId) {
    throw new Error("No Google Client ID configured.");
  }

  if (typeof window === 'undefined') {
    throw new Error("Window is not defined.");
  }

  // Ensure GIS library is available
  await ensureGoogleGsiLoaded();

  if (!window.google?.accounts?.oauth2?.initTokenClient) {
    throw new Error("Google Identity Services is initializing. Please try again in a moment.");
  }

  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
        callback: (tokenResponse) => {
          if (tokenResponse.error) {
            return reject(new Error(tokenResponse.error_description || tokenResponse.error));
          }
          if (tokenResponse.access_token) {
            const expiresIn = tokenResponse.expires_in || 3600;
            saveGoogleToken(tokenResponse.access_token, expiresIn);
            localStorage.setItem(GOOGLE_DEVICE_AUTH_KEY, 'true');
            fetchGoogleUserProfile(tokenResponse.access_token).catch(() => {});
            resolve(tokenResponse.access_token);
          } else {
            reject(new Error("No access token received from Google."));
          }
        },
        error_callback: (err) => {
          reject(new Error(err.message || "Google Sign-In was closed or cancelled."));
        }
      });

      // Prompt for consent synchronously on user click/tap
      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      console.warn("GIS initTokenClient error:", err);
      reject(err);
    }
  });
}

/**
 * Force refresh access token using permanent refresh_token via serverless proxy or Google token endpoint.
 * Zero popups, zero iframe cookies required.
 */
export async function refreshAccessToken() {
  if (typeof localStorage === 'undefined') return null;
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY) || DEFAULT_REFRESH_TOKEN;
  if (!refreshToken) return null;

  const clientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID || '274840525694-1g49f29hvlvgvur006ki1qshcv90mmmr.apps.googleusercontent.com';
  const clientSecret = localStorage.getItem(GOOGLE_CLIENT_SECRET_KEY) || DEFAULT_CLIENT_SECRET;

  // 1. Primary: Serverless refresh endpoint (/api/auth/google-auth?action=refresh)
  try {
    const res = await fetch('/api/auth/google-auth?action=refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.access_token) {
        saveGoogleToken(data.access_token, data.expires_in || 3600, refreshToken);
        return data.access_token;
      }
    }
  } catch (apiErr) {
    console.debug("Serverless token refresh notice:", apiErr);
  }

  // 2. Direct Google Token Endpoint fallback (if clientSecret is available)
  if (clientSecret) {
    try {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          saveGoogleToken(data.access_token, data.expires_in || 3600, refreshToken);
          return data.access_token;
        }
      }
    } catch (err) {
      console.warn("Direct token refresh notice:", err);
    }
  }

  return null;
}

let activeGisRefreshPromise = null;

/**
 * Secondary fallback: Silent GIS token renewal
 * Never opens a popup or modal window.
 */
export function silentRefreshGISToken() {
  if (activeGisRefreshPromise) {
    return activeGisRefreshPromise;
  }

  activeGisRefreshPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      return resolve(null);
    }

    const runInit = () => {
      if (!window.google?.accounts?.oauth2) {
        return resolve(null);
      }
      const clientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID || '274840525694-1g49f29hvlvgvur006ki1qshcv90mmmr.apps.googleusercontent.com';
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
          callback: (tokenResponse) => {
            if (tokenResponse?.access_token) {
              saveGoogleToken(tokenResponse.access_token, tokenResponse.expires_in || 3600);
              resolve(tokenResponse.access_token);
            } else {
              resolve(null);
            }
          },
          error_callback: () => {
            resolve(null);
          }
        });
        client.requestAccessToken({ prompt: 'none' });
      } catch (e) {
        resolve(null);
      }
    };

    if (window.google?.accounts?.oauth2) {
      runInit();
    } else {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (window.google?.accounts?.oauth2) {
          clearInterval(interval);
          runInit();
        } else if (attempts >= 10) {
          clearInterval(interval);
          resolve(null);
        }
      }, 100);
    }
  }).finally(() => {
    activeGisRefreshPromise = null;
  });

  return activeGisRefreshPromise;
}

/**
 * Get valid access token or refresh in background
 * Strictly silent background refresh via permanent refresh_token (0 popups, 0 iframes).
 */
export async function getValidAccessToken(forceRefresh = false) {
  let token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const expiry = localStorage.getItem(GOOGLE_EXPIRY_KEY);

  // If token exists and hasn't expired (and not forced), return immediately
  if (!forceRefresh && token && expiry && Date.now() < Number(expiry)) {
    return token;
  }

  // 1. Silent serverless background refresh via permanent refresh_token
  try {
    const freshToken = await refreshAccessToken();
    if (freshToken) return freshToken;
  } catch (e) {}

  // 2. Return existing stored token as best-effort fallback
  if (token) {
    return token;
  }

  return DEFAULT_ACCESS_TOKEN || null;
}

/**
 * Authenticated Google Fetch with automatic 401 token refresh & transparent retry
 * Never triggers popups, modals, or interactive sign-in prompts.
 */
export async function authedGoogleFetch(url, options = {}, retryCount = 1) {
  let token = await getValidAccessToken();
  if (!token) {
    throw new Error("No active Google session");
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });

  if (res.status === 401 && retryCount > 0) {
    console.log("🔄 Google access token expired (401). Performing automatic background refresh...");
    localStorage.removeItem(GOOGLE_EXPIRY_KEY);
    
    // Refresh via serverless endpoint using permanent refresh_token
    const freshToken = await refreshAccessToken();
    if (freshToken) {
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${freshToken}`
        }
      });
    }
  }

  return res;
}

/**
 * Format local RFC3339 timestamp with local timezone offset
 */
function formatLocalRFC3339(dateStr, timeStr) {
  const targetDate = dateStr || getTodayIso();
  const [y, m, d] = targetDate.split('-').map(Number);
  
  const match = (timeStr || '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  let h = 12, min = 0;
  if (match) {
    h = parseInt(match[1], 10);
    min = match[2] ? parseInt(match[2], 10) : 0;
    const p = match[3]?.toLowerCase();
    if (p === 'pm' && h < 12) h += 12;
    if (p === 'am' && h === 12) h = 0;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const localDate = new Date(y, m - 1, d, h, min, 0);

  const offsetMin = -localDate.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offH = pad(Math.floor(Math.abs(offsetMin) / 60));
  const offM = pad(Math.abs(offsetMin) % 60);
  const offsetStr = `${sign}${offH}:${offM}`;

  return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:00${offsetStr}`;
}

/**
 * Fetch tasks from Google Tasks API
 */
async function fetchGoogleTasks() {
  try {
    const url = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&maxResults=100';
    let response = await authedGoogleFetch(url, {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) return [];
    const data = await response.json();
    const rawTasks = data.items || [];

    return rawTasks.map(t => {
      const dateStr = t.due ? t.due.split('T')[0] : getTodayIso();
      return {
        id: t.id,
        type: 'task',
        title: t.title || "Untitled Task",
        date: dateStr,
        time: 'All Day',
        isAllDay: true,
        category: 'General',
        priority: 'normal',
        completed: t.status === 'completed',
        isGoogle: true,
        isGoogleTask: true
      };
    });
  } catch (err) {
    return [];
  }
}

/**
 * Fetch all calendars on user's account to ensure complete 2-way sync
 */
async function getUserCalendarIds() {
  const calIds = ['primary'];
  try {
    const res = await authedGoogleFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      items.forEach(c => {
        if (c.id && c.id !== 'primary' && c.selected !== false) {
          // Include secondary active calendars (e.g. Deadlines, School, Classes)
          calIds.push(c.id);
        }
      });
    }
  } catch (e) {
    console.debug("Calendar list check notice:", e);
  }
  return calIds;
}

/**
 * Fetch full calendar events & tasks across all user calendars
 * @param {boolean} interactive - Whether initiated by direct user button click
 */
export async function fetchGoogleCalendarEvents(interactive = false) {
  let token = await getValidAccessToken();
  if (!token) {
    if (!interactive) return null;
    throw new Error("Google Calendar is not connected or session expired.");
  }

  const startRange = new Date();
  startRange.setFullYear(startRange.getFullYear() - 2);
  startRange.setHours(0, 0, 0, 0);

  const endRange = new Date();
  endRange.setFullYear(endRange.getFullYear() + 2);
  endRange.setHours(23, 59, 59, 999);

  let allEvents = [];
  const calendarIds = await getUserCalendarIds();

  for (const calId of calendarIds) {
    try {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
      url.searchParams.append('timeMin', startRange.toISOString());
      url.searchParams.append('timeMax', endRange.toISOString());
      url.searchParams.append('singleEvents', 'true');
      url.searchParams.append('orderBy', 'startTime');
      url.searchParams.append('maxResults', '500');

      let response = await authedGoogleFetch(url.toString(), {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error?.message || `Google Calendar API error (${response.status})`;
        console.warn(`Google Calendar API error for ${calId} (${response.status}):`, errMsg);
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Google authorization expired or rejected (${response.status}). Please reconnect calendar.`);
        }
        if (calId === 'primary') {
          throw new Error(`Google Calendar primary sync failed (${response.status}): ${errMsg}`);
        }
      } else {
        const data = await response.json();
        const rawItems = data.items || [];

        const parsed = rawItems.map(item => {
          const isAllDay = !item.start?.dateTime && !!item.start?.date;
          const dateStr = item.start?.dateTime ? item.start.dateTime.split('T')[0] : (item.start?.date || getTodayIso());
          const timeString = isAllDay ? "All Day" : formatEventTimeRange(item.start?.dateTime, item.end?.dateTime);

          const summary = item.summary || "Untitled Event";
          const lowerSummary = summary.toLowerCase().trim();

          let type = "event";
          if (item.colorId === "11" || summary.startsWith('🚨') || lowerSummary.startsWith('deadline:') || (isAllDay && lowerSummary.includes('deadline')) || calId.toLowerCase().includes('deadline')) {
            type = "deadline";
          } else if (item.colorId === "8" || summary.startsWith('✅') || lowerSummary.startsWith('task:')) {
            type = "task";
          } else if (summary.startsWith('🔔') || lowerSummary.startsWith('reminder:')) {
            type = "reminder";
          }

          let category = "General";
          if (lowerSummary.includes('class') || lowerSummary.includes('study') || lowerSummary.includes('exam') || lowerSummary.includes('cs ') || lowerSummary.includes('homework') || lowerSummary.includes('math') || lowerSummary.includes('chemistry') || lowerSummary.includes('physics') || lowerSummary.includes('diploma') || lowerSummary.includes('calculus') || lowerSummary.includes('statistics') || calId.toLowerCase().includes('school')) {
            category = "School";
          } else if (lowerSummary.includes('trade') || lowerSummary.includes('market') || lowerSummary.includes('stock')) {
            category = "Trading";
          } else if (lowerSummary.includes('gym') || lowerSummary.includes('workout') || lowerSummary.includes('push') || lowerSummary.includes('pull') || lowerSummary.includes('legs') || lowerSummary.includes('run')) {
            category = "Fitness";
          } else if (lowerSummary.includes('lunch') || lowerSummary.includes('dinner') || lowerSummary.includes('meal')) {
            category = "Nutrition";
          }

          const cleanTitle = summary
            .replace(/^🚨\s*Deadline:\s*/i, '')
            .replace(/^✅\s*Task:\s*/i, '')
            .replace(/^🔔\s*Reminder:\s*/i, '')
            .trim();

          return {
            id: item.id || `gcal-${Date.now()}-${Math.random()}`,
            type,
            title: cleanTitle || summary,
            date: dateStr,
            time: timeString,
            isAllDay,
            colorId: item.colorId || (type === 'deadline' ? '11' : type === 'task' ? '8' : '9'),
            category,
            priority: type === 'deadline' ? 'urgent' : 'normal',
            completed: false,
            isGoogle: true,
            htmlLink: item.htmlLink,
            calendarId: calId
          };
        });

        allEvents = [...allEvents, ...parsed];
      }
    } catch (err) {
      console.warn(`Calendar fetch error for ${calId}:`, err);
      // Re-throw critical authentication and primary calendar errors
      if (err.message?.includes('expired') || err.message?.includes('unauthorized') || err.message?.includes('rejected') || err.message?.includes('primary')) {
        throw err;
      }
    }
  }

  // Also fetch Google Tasks
  const googleTasks = await fetchGoogleTasks();
  allEvents = [...allEvents, ...googleTasks];

  // Deduplicate by ID
  const seenIds = new Set();
  const deduped = [];
  for (const it of allEvents) {
    if (!seenIds.has(it.id)) {
      seenIds.add(it.id);
      deduped.push(it);
    }
  }

  return deduped;
}

let cachedDeadlinesCalId = null;

/**
 * Locate the 'Deadlines' calendar ID if available, otherwise return primary
 */
export async function getDeadlinesCalendarId() {
  if (cachedDeadlinesCalId) return cachedDeadlinesCalId;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('wolfe_gcal_deadlines_id') : null;
  if (stored) {
    cachedDeadlinesCalId = stored;
    return stored;
  }

  try {
    const res = await authedGoogleFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList');
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      const deadlines = items.find(c => 
        c.summary?.toLowerCase() === 'deadlines' || 
        c.summary?.toLowerCase() === 'deadline' ||
        c.summary?.toLowerCase() === 'school deadlines' ||
        c.summary?.toLowerCase() === 'academics'
      );
      if (deadlines) {
        cachedDeadlinesCalId = deadlines.id;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('wolfe_gcal_deadlines_id', deadlines.id);
        }
        return deadlines.id;
      }
    }
  } catch (err) {
    console.warn("Deadlines calendar lookup notice:", err);
  }

  return 'primary';
}

/**
 * Create a new item (Deadline in Red, Timed Event, Task, Reminder) on Google Calendar & Tasks
 */
export async function createGoogleCalendarEvent(itemData) {
  const { type, title, startTime, endTime, dateStr, isAllDay } = itemData;
  const targetDate = dateStr || getTodayIso();

  // If type is Task, create on Google Tasks API
  if (type === 'task') {
    try {
      const dueDateTime = new Date(`${targetDate}T12:00:00.000Z`).toISOString();
      const taskRes = await authedGoogleFetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title || "New Task",
          notes: `Wolfe OS • ${itemData.category || 'General'}`,
          due: dueDateTime,
          status: 'needsAction'
        })
      });
      if (taskRes.ok) {
        const createdTask = await taskRes.json();
        return {
          id: createdTask.id,
          type: 'task',
          title: title,
          date: targetDate,
          time: 'All Day',
          isAllDay: true,
          colorId: '8',
          category: itemData.category || "General",
          priority: 'normal',
          completed: false,
          isGoogle: true,
          isGoogleTask: true
        };
      }
    } catch (e) {
      // Fall through to Calendar event
    }
  }

  let targetCalendarId = 'primary';
  let colorId = "9"; // Blue (default for events)

  if (type === 'deadline') {
    targetCalendarId = await getDeadlinesCalendarId();
    colorId = "11"; // Google Red (Tomato)
  } else if (type === 'task') {
    colorId = "8"; // Graphite
  } else if (type === 'reminder') {
    colorId = "5"; // Banana Yellow
  } else if (type === 'event' && (itemData.category === 'Fitness' || itemData.category === 'Workouts')) {
    colorId = "2"; // Sage Green
  }

  const body = {
    summary: title || "New Event",
    description: `Wolfe OS • ${itemData.category || 'General'}`,
    colorId,
  };

  const isActuallyAllDay = isAllDay || type === 'deadline' || type === 'task' || !startTime || startTime === 'All Day';

  if (isActuallyAllDay) {
    body.start = { date: targetDate };
    body.end = { date: addDays(targetDate, 1) };
  } else {
    const startIso = formatLocalRFC3339(targetDate, startTime);
    const endIso = formatLocalRFC3339(targetDate, endTime || (startTime ? addOneHour(startTime) : '03:00 PM'));

    body.start = { dateTime: startIso };
    body.end = { dateTime: endIso };
  }

  const targetUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events`;

  let response = await authedGoogleFetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Google Calendar API error (${response.status})`);
  }

  const created = await response.json();
  return {
    id: created.id,
    type: type || 'event',
    title: title,
    date: targetDate,
    time: isActuallyAllDay ? 'All Day' : `${startTime || '02:00 PM'} - ${endTime || '03:00 PM'}`,
    isAllDay: isActuallyAllDay,
    colorId,
    category: itemData.category || "General",
    priority: type === 'deadline' ? 'urgent' : 'normal',
    completed: false,
    isGoogle: true,
    htmlLink: created.htmlLink
  };
}

function addOneHour(timeStr) {
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return '03:00 PM';
  let h = parseInt(match[1], 10);
  const min = match[2] || '00';
  let p = (match[3] || 'pm').toLowerCase();
  
  h = h + 1;
  if (h === 12) {
    p = p === 'am' ? 'pm' : 'am';
  } else if (h > 12) {
    h = h - 12;
  }
  const padH = String(h).padStart(2, '0');
  return `${padH}:${min} ${p.toUpperCase()}`;
}

/**
 * Update task status on Google Tasks API and Google Calendar
 */
export async function updateGoogleTaskStatus(taskId, completed) {
  if (!taskId) return;

  try {
    const taskBody = completed
      ? { status: 'completed', completed: new Date().toISOString() }
      : { status: 'needsAction', completed: null };

    await authedGoogleFetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskBody)
    });
  } catch (e) {}

  try {
    const getRes = await authedGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${taskId}`);
    if (getRes.ok) {
      const event = await getRes.json();
      const cleanSummary = (event.summary || '').replace(/^[✅☑️✔️❌]\s*/, '');
      const newSummary = completed ? `✅ ${cleanSummary}` : cleanSummary;

      await authedGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ summary: newSummary })
      });
    }
  } catch (err) {}
}

/**
 * Clear all completed tasks on Google Tasks
 */
export async function clearCompletedGoogleTasks() {
  try {
    await authedGoogleFetch('https://tasks.googleapis.com/tasks/v1/lists/@default/clear', {
      method: 'POST'
    });
  } catch (err) {
    console.warn("Clear completed Google Tasks notice:", err);
  }
}

export const clearGoogleTasks = clearCompletedGoogleTasks;

/**
 * Clear events for a specific date from Google Calendar
 */
export async function clearGoogleCalendarEventsForDate(dateStr) {
  if (!dateStr) return;

  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.append('timeMin', `${dateStr}T00:00:00Z`);
    url.searchParams.append('timeMax', `${dateStr}T23:59:59Z`);
    url.searchParams.append('singleEvents', 'true');

    const res = await authedGoogleFetch(url.toString());
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      for (const item of items) {
        await deleteGoogleCalendarEvent(item.id, false);
      }
    }
  } catch (e) {
    console.warn("Clear events for date notice:", e);
  }
}

/**
 * Delete an event directly from Google Calendar or Tasks
 */
export async function deleteGoogleCalendarEvent(eventId, isGoogleTask = false) {
  if (!eventId) return;

  if (isGoogleTask) {
    try {
      let taskRes = await authedGoogleFetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${eventId}`, {
        method: 'DELETE'
      });
      if (taskRes.ok || taskRes.status === 204) return;
    } catch (e) {}
  }

  try {
    let calRes = await authedGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE'
    });
    if (calRes.ok || calRes.status === 204) return;
  } catch (err) {}

  const deadlinesId = typeof localStorage !== 'undefined' ? localStorage.getItem('wolfe_gcal_deadlines_id') : null;
  if (deadlinesId && deadlinesId !== 'primary') {
    try {
      let calRes2 = await authedGoogleFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(deadlinesId)}/events/${eventId}`, {
        method: 'DELETE'
      });
      if (calRes2.ok || calRes2.status === 204) return;
    } catch (e) {}
  }

  if (!isGoogleTask) {
    try {
      await authedGoogleFetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${eventId}`, {
        method: 'DELETE'
      });
    } catch (e) {}
  }
}

/**
 * Automatically upload any local items (created in Wolfe OS) to Google Calendar
 * and update their IDs with the official Google ID.
 */
export async function syncLocalItemsToGoogle(currentItems) {
  if (!Array.isArray(currentItems) || !isGoogleCalendarConnected()) {
    return currentItems;
  }

  const unsyncedItems = currentItems.filter(it => !it.isGoogle);
  if (unsyncedItems.length === 0) {
    return currentItems;
  }

  console.log(`📤 Auto-uploading ${unsyncedItems.length} unsynced local item(s) to Google Calendar...`);
  let updatedItems = [...currentItems];

  for (const item of unsyncedItems) {
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

      if (created?.id) {
        updatedItems = updatedItems.map(it => it.id === item.id ? {
          ...it,
          id: created.id,
          isGoogle: true,
          isGoogleTask: item.type === 'task',
          htmlLink: created.htmlLink
        } : it);
      }
    } catch (err) {
      console.warn(`Auto-upload item failed for "${item.title}":`, err);
    }
  }

  return updatedItems;
}
