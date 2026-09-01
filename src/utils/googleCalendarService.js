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
 * Check if user has an active or refreshable Google Calendar connection
 */
export function isGoogleCalendarConnected() {
  if (typeof localStorage === 'undefined') return false;
  const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  const wasSignedIn = localStorage.getItem('wolfe_user_signed_in_google') === 'true';
  
  if (refreshToken) return true;
  if (token) {
    const expiry = localStorage.getItem(GOOGLE_EXPIRY_KEY);
    if (!expiry || Date.now() < Number(expiry)) return true;
  }
  // If user previously signed in with GIS, background silent renewal keeps connection alive!
  if (wasSignedIn && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    return true;
  }
  return false;
}

/**
 * Check if token exists but has expired
 */
export function isGoogleTokenExpired() {
  if (typeof localStorage === 'undefined') return true;
  const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  if (refreshToken) return false;
  if (!token) return true;

  const expiry = localStorage.getItem(GOOGLE_EXPIRY_KEY);
  if (!expiry) return false;
  return Date.now() > Number(expiry);
}

/**
 * Save tokens to localStorage
 */
export function saveGoogleToken(token, expiresInSeconds = 3600, refreshToken = null) {
  if (!token) return;
  const clean = token.trim();
  localStorage.setItem('wolfe_user_signed_in_google', 'true');
  
  if (clean.startsWith('1//')) {
    localStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, clean);
  } else {
    localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, clean);
    // Buffer expiry by 60 seconds
    const expiryTime = Date.now() + Math.max(300, expiresInSeconds - 60) * 1000;
    localStorage.setItem(GOOGLE_EXPIRY_KEY, String(expiryTime));
  }
  if (refreshToken) {
    localStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, refreshToken.trim());
  }
}

/**
 * Disconnect Google Calendar
 */
export function disconnectGoogleCalendar() {
  localStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
  localStorage.removeItem(GOOGLE_EXPIRY_KEY);
  localStorage.removeItem(GOOGLE_REFRESH_TOKEN_KEY);
  localStorage.removeItem('wolfe_user_signed_in_google');
}

/**
 * Check and handle OAuth redirect from URL hash (essential for mobile browsers)
 */
export function checkAndHandleOAuthRedirect() {
  if (typeof window === 'undefined') return false;
  if (window.location.hash && window.location.hash.includes('access_token=')) {
    try {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
      if (token) {
        saveGoogleToken(token, expiresIn);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        return true;
      }
    } catch (e) {
      console.warn("OAuth redirect parse notice:", e);
    }
  }
  return false;
}

/**
 * One-Click Official Google Sign-In using Google Identity Services (GIS)
 */
export function signInWithGooglePopup(clientIdOverride = null) {
  return new Promise((resolve, reject) => {
    const clientId = clientIdOverride || localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID || '274840525694-1g49f29hvlvgvur006ki1qshcv90mmmr.apps.googleusercontent.com';

    if (!clientId) {
      return reject(new Error("No Google Client ID configured."));
    }

    if (typeof window === 'undefined') {
      return reject(new Error("Window is not defined."));
    }

    // 1. Google Identity Services (GIS) Token Client (Official flow)
    if (window.google?.accounts?.oauth2) {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks',
          callback: (tokenResponse) => {
            if (tokenResponse.error) {
              return reject(new Error(tokenResponse.error_description || tokenResponse.error));
            }
            if (tokenResponse.access_token) {
              saveGoogleToken(tokenResponse.access_token, tokenResponse.expires_in || 3600);
              resolve(tokenResponse.access_token);
            } else {
              reject(new Error("No access token received from Google."));
            }
          },
          error_callback: (err) => {
            reject(new Error(err.message || "Google Sign-In was closed or interrupted."));
          }
        });
        client.requestAccessToken({ prompt: 'consent' });
        return;
      } catch (err) {
        console.warn("GIS token client fallback:", err);
      }
    }

    // 2. Mobile/Popup Fallback OAuth 2.0 Flow
    const redirectUri = window.location.origin;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${scope}&include_granted_scopes=true&prompt=consent`;

    const isMobile = window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = authUrl;
      return;
    }

    const width = 500;
    const height = 620;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(authUrl, 'google_signin_popup', `width=${width},height=${height},left=${left},top=${top}`);

    if (!popup) {
      window.location.href = authUrl;
      return;
    }

    const pollTimer = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(pollTimer);
          reject(new Error("Google sign-in window was closed."));
          return;
        }
        if (popup.location.href && popup.location.href.includes('access_token')) {
          const hash = popup.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const token = params.get('access_token');
          const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
          if (token) {
            saveGoogleToken(token, expiresIn);
            popup.close();
            clearInterval(pollTimer);
            resolve(token);
          }
        }
      } catch (e) {
        // Cross-origin before redirect - ignore
      }
    }, 500);
  });
}

/**
 * Force refresh access token using refresh_token if available
 */
export async function refreshAccessToken() {
  if (typeof localStorage === 'undefined') return null;
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY) || DEFAULT_REFRESH_TOKEN;
  const clientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || DEFAULT_CLIENT_ID;
  const clientSecret = localStorage.getItem(GOOGLE_CLIENT_SECRET_KEY) || DEFAULT_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) return null;

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
        saveGoogleToken(data.access_token, data.expires_in || 3600);
        return data.access_token;
      }
    }
  } catch (err) {
    console.warn("Token refresh notice:", err);
  }
  return null;
}

/**
 * Attempt silent token renewal via Google Identity Services without showing any popup
 */
export function silentRefreshGISToken() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
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
        error_callback: () => resolve(null)
      });
      // prompt: '' enables silent renewal using existing Google session cookie
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Get valid access token or refresh
 */
export async function getValidAccessToken() {
  let token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const expiry = localStorage.getItem(GOOGLE_EXPIRY_KEY);

  // If token exists and hasn't expired, return it
  if (token && expiry && Date.now() < Number(expiry)) {
    return token;
  }

  // 1. Attempt refresh if refresh token is available
  const freshToken = await refreshAccessToken();
  if (freshToken) return freshToken;

  // 2. Attempt silent GIS renewal if user was signed in previously
  if (typeof localStorage !== 'undefined' && localStorage.getItem('wolfe_user_signed_in_google') === 'true') {
    const silentToken = await silentRefreshGISToken();
    if (silentToken) return silentToken;
  }

  if (token && (!expiry || Date.now() < Number(expiry))) {
    return token;
  }

  return DEFAULT_ACCESS_TOKEN || null;
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
  let token = await getValidAccessToken();
  if (!token) return [];

  try {
    const url = 'https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?showCompleted=true&showHidden=true&maxResults=100';
    let response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json'
      }
    });

    if (response.status === 401) {
      token = await refreshAccessToken();
      if (token) {
        response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
        });
      }
    }

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
async function getUserCalendarIds(token) {
  const calIds = ['primary'];
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
 */
export async function fetchGoogleCalendarEvents() {
  let token = await getValidAccessToken();
  if (!token) {
    disconnectGoogleCalendar();
    throw new Error("Google Calendar is not connected or session expired.");
  }

  const startRange = new Date();
  startRange.setFullYear(startRange.getFullYear() - 2);
  startRange.setHours(0, 0, 0, 0);

  const endRange = new Date();
  endRange.setFullYear(endRange.getFullYear() + 2);
  endRange.setHours(23, 59, 59, 999);

  let allEvents = [];
  const calendarIds = await getUserCalendarIds(token);

  for (const calId of calendarIds) {
    try {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
      url.searchParams.append('timeMin', startRange.toISOString());
      url.searchParams.append('timeMax', endRange.toISOString());
      url.searchParams.append('singleEvents', 'true');
      url.searchParams.append('orderBy', 'startTime');
      url.searchParams.append('maxResults', '500');

      let response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });

      if (response.status === 401) {
        token = await refreshAccessToken();
        if (token) {
          response = await fetch(url.toString(), {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
          });
        } else {
          disconnectGoogleCalendar();
          throw new Error("Google Calendar authentication expired. Please reconnect.");
        }
      }

      if (response.ok) {
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
export async function getDeadlinesCalendarId(token) {
  if (cachedDeadlinesCalId) return cachedDeadlinesCalId;
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('wolfe_gcal_deadlines_id') : null;
  if (stored) {
    cachedDeadlinesCalId = stored;
    return stored;
  }

  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
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
  let token = await getValidAccessToken();
  if (!token) {
    disconnectGoogleCalendar();
    throw new Error("Google Calendar is not connected or session expired.");
  }

  const { type, title, startTime, endTime, dateStr, isAllDay } = itemData;
  const targetDate = dateStr || getTodayIso();

  // If type is Task, create on Google Tasks API
  if (type === 'task') {
    try {
      const dueDateTime = new Date(`${targetDate}T12:00:00.000Z`).toISOString();
      const taskRes = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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
    targetCalendarId = await getDeadlinesCalendarId(token);
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

  let response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      });
    } else {
      disconnectGoogleCalendar();
      throw new Error("Google Calendar authentication expired. Please reconnect.");
    }
  }

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
  let token = await getValidAccessToken();
  if (!token || !taskId) return;

  try {
    const taskBody = completed
      ? { status: 'completed', completed: new Date().toISOString() }
      : { status: 'needsAction', completed: null };

    await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskBody)
    });
  } catch (e) {}

  try {
    const getRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${taskId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (getRes.ok) {
      const event = await getRes.json();
      const cleanSummary = (event.summary || '').replace(/^[✅☑️✔️❌]\s*/, '');
      const newSummary = completed ? `✅ ${cleanSummary}` : cleanSummary;

      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
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
  let token = await getValidAccessToken();
  if (!token) return;

  try {
    await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/clear', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
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
  let token = await getValidAccessToken();
  if (!token || !dateStr) return;

  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.append('timeMin', `${dateStr}T00:00:00Z`);
    url.searchParams.append('timeMax', `${dateStr}T23:59:59Z`);
    url.searchParams.append('singleEvents', 'true');

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` }
    });

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
  let token = await getValidAccessToken();
  if (!token || !eventId) return;

  if (isGoogleTask) {
    try {
      let taskRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (taskRes.ok || taskRes.status === 204) return;
    } catch (e) {}
  }

  try {
    let calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (calRes.ok || calRes.status === 204) return;
  } catch (err) {}

  const deadlinesId = typeof localStorage !== 'undefined' ? localStorage.getItem('wolfe_gcal_deadlines_id') : null;
  if (deadlinesId && deadlinesId !== 'primary') {
    try {
      let calRes2 = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(deadlinesId)}/events/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (calRes2.ok || calRes2.status === 204) return;
    } catch (e) {}
  }

  if (!isGoogleTask) {
    try {
      await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }
}
