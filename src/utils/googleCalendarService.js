/**
 * Google Calendar & Tasks Integration Service for Wolfe OS
 * Uses Google Calendar REST API v3, Google Tasks API v1, and Automated Refresh Token Exchange
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
 * Check if user is authenticated with a valid or refreshable token
 */
export function isGoogleCalendarConnected() {
  if (typeof localStorage === 'undefined') return false;
  const token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  return Boolean(token || refreshToken);
}

/**
 * Save tokens
 */
export function saveGoogleToken(token, expiresInSeconds = 3600, refreshToken = null) {
  if (!token) return;
  const clean = token.trim();
  if (clean.startsWith('1//')) {
    // It's a permanent refresh token!
    localStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, clean);
  } else {
    localStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, clean);
    localStorage.setItem(GOOGLE_EXPIRY_KEY, String(Date.now() + (expiresInSeconds * 1000)));
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
}

/**
 * Force refresh access token using refresh_token
 */
export async function refreshAccessToken() {
  if (typeof localStorage === 'undefined') return null;
  const refreshToken = localStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
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
 * Automatically get a valid access token, auto-refreshing via refresh_token if expired
 */
export async function getValidAccessToken() {
  let token = localStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
  const expiry = localStorage.getItem(GOOGLE_EXPIRY_KEY);

  // If token exists and has >120s remaining, use it
  if (token && expiry && Date.now() < (Number(expiry) - 120000)) {
    return token;
  }

  // Otherwise, refresh it
  const freshToken = await refreshAccessToken();
  return freshToken || token || DEFAULT_ACCESS_TOKEN;
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
 * Fetch full calendar events & tasks across past and future
 */
export async function fetchGoogleCalendarEvents() {
  let token = await getValidAccessToken();
  if (!token) {
    throw new Error("Google Calendar is not connected.");
  }

  let calendarEvents = [];

  try {
    const startRange = new Date();
    startRange.setFullYear(startRange.getFullYear() - 2); // 2 years in past
    startRange.setHours(0, 0, 0, 0);

    const endRange = new Date();
    endRange.setFullYear(endRange.getFullYear() + 2); // 2 years in future
    endRange.setHours(23, 59, 59, 999);

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
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
      }
    }

    if (response.ok) {
      const data = await response.json();
      const rawItems = data.items || [];

      calendarEvents = rawItems.map(item => {
        const isAllDay = !item.start?.dateTime && !!item.start?.date;
        const dateStr = item.start?.dateTime ? item.start.dateTime.split('T')[0] : (item.start?.date || getTodayIso());
        const timeString = isAllDay ? "All Day" : formatEventTimeRange(item.start?.dateTime, item.end?.dateTime);

        const summary = item.summary || "Untitled Event";
        const lowerSummary = summary.toLowerCase().trim();

        let type = "event";
        if (item.colorId === "11" || summary.startsWith('🚨') || lowerSummary.startsWith('deadline:') || (isAllDay && lowerSummary.includes('deadline'))) {
          type = "deadline";
        } else if (item.colorId === "8" || summary.startsWith('✅') || lowerSummary.startsWith('task:')) {
          type = "task";
        } else if (summary.startsWith('🔔') || lowerSummary.startsWith('reminder:')) {
          type = "reminder";
        }

        let category = "General";
        if (lowerSummary.includes('class') || lowerSummary.includes('study') || lowerSummary.includes('exam') || lowerSummary.includes('cs ') || lowerSummary.includes('homework') || lowerSummary.includes('math') || lowerSummary.includes('chemistry') || lowerSummary.includes('physics') || lowerSummary.includes('diploma') || lowerSummary.includes('calculus') || lowerSummary.includes('statistics')) {
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
        };
      });
    } else {
      console.warn(`Google Calendar fetch notice (${response.status})`);
    }
  } catch (err) {
    console.warn("Calendar API fetch error:", err);
  }

  // Also fetch Google Tasks
  const googleTasks = await fetchGoogleTasks();

  return [...calendarEvents, ...googleTasks];
}

let cachedDeadlinesCalId = null;

/**
 * Get or locate the 'Deadlines' calendar ID from Google Calendar
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
    throw new Error("Google Calendar is not connected.");
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

  // Deadlines go to the "Deadlines" calendar (Red), normal events go to primary ("Zach Wolfe")
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

  // 1. Update on Google Tasks API
  try {
    const taskBody = completed
      ? { status: 'completed', completed: new Date().toISOString() }
      : { status: 'needsAction', completed: null };

    let res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskBody)
    });

    if (res.status === 401) {
      token = await refreshAccessToken();
      if (token) {
        await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(taskBody)
        });
      }
    }
  } catch (e) {
    // Ignore
  }

  // 2. Also update if stored as a Calendar Event
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
  } catch (err) {
    // Ignore
  }
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

/**
 * Delete an event directly from Google Calendar or Tasks
 */
export async function deleteGoogleCalendarEvent(eventId, isGoogleTask = false) {
  let token = await getValidAccessToken();
  if (!token || !eventId) return;

  // Try the most likely API first based on item type, then fall back to the other
  if (isGoogleTask) {
    // 1. Try Google Tasks API first
    try {
      let taskRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (taskRes.status === 401) {
        token = await refreshAccessToken();
        if (token) {
          taskRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${eventId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
          });
        }
      }
      if (taskRes.ok || taskRes.status === 204) return; // Success
    } catch (e) {}
  }

  // 2. Try Google Calendar API
  try {
    let calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (calRes.status === 401) {
      token = await refreshAccessToken();
      if (token) {
        calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    }
    if (calRes.ok || calRes.status === 204) return; // Success
  } catch (err) {}

  // 2b. Also try Deadlines secondary calendar if exists
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

  // 3. If not a task initially, try Tasks API as fallback
  if (!isGoogleTask) {
    try {
      await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${eventId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }
}

/**
 * Permanently delete all Google Calendar events and Google Tasks matching specific keywords
 */
export async function purgeGoogleCalendarEntriesByKeywords(keywords = ['FNCE', 'OPMA']) {
  let token = await getValidAccessToken();
  if (!token) return { deletedCount: 0 };

  let deletedCount = 0;

  // 1. Discover all calendars for the user (primary, Deadlines, etc.)
  let calendarIds = ['primary'];
  try {
    const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      (listData.items || []).forEach(cal => {
        if (cal.id && !calendarIds.includes(cal.id)) {
          calendarIds.push(cal.id);
        }
      });
    }
  } catch (err) {
    console.warn("Could not list calendars for purge:", err);
  }

  // 2. Query and delete from each calendar for each keyword
  for (const calId of calendarIds) {
    for (const kw of keywords) {
      try {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`);
        url.searchParams.append('q', kw);
        url.searchParams.append('maxResults', '250');

        const searchRes = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const items = searchData.items || [];
          for (const item of items) {
            try {
              const delRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${item.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (delRes.ok || delRes.status === 204) {
                deletedCount++;
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
  }

  // 3. Query and delete from Google Tasks
  try {
    const tasksRes = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks?maxResults=100', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (tasksRes.ok) {
      const tasksData = await tasksRes.json();
      const tasks = tasksData.items || [];
      for (const t of tasks) {
        const titleUpper = (t.title || '').toUpperCase();
        const notesUpper = (t.notes || '').toUpperCase();
        if (keywords.some(kw => titleUpper.includes(kw) || notesUpper.includes(kw))) {
          try {
            await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${t.id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
            deletedCount++;
          } catch (e) {}
        }
      }
    }
  } catch (e) {}

  return { deletedCount };
}

/**
 * Delete all tasks from Google Tasks API (or tasks matching a specific date)
 */
export async function clearGoogleTasks(targetDate = 'ALL') {
  let token = await getValidAccessToken();
  if (!token) return;

  try {
    const tasks = await fetchGoogleTasks();
    const toDelete = targetDate === 'ALL' 
      ? tasks 
      : tasks.filter(t => t.date === targetDate);

    for (const t of toDelete) {
      await deleteGoogleCalendarEvent(t.id, true);
    }
  } catch (err) {
    console.warn("Clear Google Tasks error:", err);
  }
}

/**
 * Clear all events for a specific date on Google Calendar
 */
export async function clearGoogleCalendarEventsForDate(dateStr) {
  let token = await getValidAccessToken();
  if (!token) return;

  try {
    const startOfDay = new Date(`${dateStr}T00:00:00`);
    const endOfDay = new Date(`${dateStr}T23:59:59`);

    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    url.searchParams.append('timeMin', startOfDay.toISOString());
    url.searchParams.append('timeMax', endOfDay.toISOString());
    url.searchParams.append('singleEvents', 'true');

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;
    const data = await res.json();
    const items = data.items || [];

    for (const item of items) {
      await deleteGoogleCalendarEvent(item.id);
    }
  } catch (err) {
    console.warn("Clear Google Calendar failed:", err);
  }
}
