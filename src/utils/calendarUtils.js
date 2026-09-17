/**
 * Calendar Date & Time Utilities for Wolfe OS
 */

export function getTodayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateTitle(dateIso) {
  if (!dateIso || typeof dateIso !== 'string') return '';
  try {
    const parts = dateIso.split('-');
    if (parts.length < 3) return dateIso;
    const [y, m, d] = parts.map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return dateIso;
    const date = new Date(y, m - 1, d);
    if (isNaN(date.getTime())) return dateIso;
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  } catch (e) {
    return dateIso || '';
  }
}

export function formatShortDate(dateIso) {
  if (!dateIso || typeof dateIso !== 'string') return '';
  try {
    const parts = dateIso.split('-');
    if (parts.length < 3) return dateIso;
    const [y, m, d] = parts.map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return dateIso;
    const date = new Date(y, m - 1, d);
    if (isNaN(date.getTime())) return dateIso;
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  } catch (e) {
    return dateIso || '';
  }
}

export function addDays(dateIso, n) {
  if (!dateIso || typeof dateIso !== 'string') return getTodayIso();
  try {
    const parts = dateIso.split('-');
    if (parts.length < 3) return getTodayIso();
    const [y, m, d] = parts.map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return getTodayIso();
    const date = new Date(y, m - 1, d);
    if (isNaN(date.getTime())) return getTodayIso();
    date.setDate(date.getDate() + (Number(n) || 0));
    const newY = date.getFullYear();
    const newM = String(date.getMonth() + 1).padStart(2, '0');
    const newD = String(date.getDate()).padStart(2, '0');
    return `${newY}-${newM}-${newD}`;
  } catch (e) {
    return getTodayIso();
  }
}

/**
 * Convert ISO dateTime string (e.g. '2026-08-30T10:30:00-06:00') directly to 12-hour formatted time (e.g. '10:30 AM')
 * Literal string parsing guarantees zero timezone shift or browser locale skew.
 */
export function formatIsoTo12Hour(dateTimeStr) {
  if (!dateTimeStr) return '';
  const timePart = dateTimeStr.split('T')[1];
  if (!timePart) return '';
  const match = timePart.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  let h = parseInt(match[1], 10);
  const min = match[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  const padH = String(h).padStart(2, '0');
  return `${padH}:${min} ${ampm}`;
}

export function formatEventTimeRange(startDateTime, endDateTime) {
  if (!startDateTime) return 'All Day';
  const startStr = formatIsoTo12Hour(startDateTime);
  if (!endDateTime) return startStr;
  const endStr = formatIsoTo12Hour(endDateTime);
  return `${startStr} - ${endStr}`;
}

export const GOOGLE_COLOR_MAP = {
  '1': { name: 'Lavender', hex: '#7986cb', tag: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30' },
  '2': { name: 'Sage', hex: '#33b679', tag: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' },
  '3': { name: 'Grape', hex: '#8e24aa', tag: 'bg-purple-500/20 text-purple-200 border-purple-500/30' },
  '4': { name: 'Flamingo', hex: '#e67c73', tag: 'bg-rose-400/20 text-rose-200 border-rose-400/30' },
  '5': { name: 'Banana', hex: '#f6bf26', tag: 'bg-amber-500/20 text-amber-200 border-amber-500/30' },
  '6': { name: 'Tangerine', hex: '#f4511e', tag: 'bg-orange-500/20 text-orange-200 border-orange-500/30' },
  '7': { name: 'Peacock', hex: '#039be5', tag: 'bg-sky-500/20 text-sky-200 border-sky-500/30' },
  '8': { name: 'Graphite', hex: '#616161', tag: 'bg-slate-500/20 text-slate-200 border-slate-500/30' },
  '9': { name: 'Blueberry', hex: '#3f51b5', tag: 'bg-blue-500/20 text-blue-200 border-blue-500/30' },
  '10': { name: 'Basil', hex: '#0b8043', tag: 'bg-teal-500/20 text-teal-200 border-teal-500/30' },
  '11': { name: 'Tomato', hex: '#d50000', tag: 'bg-rose-600/25 text-rose-100 border-rose-500/40' },
};

export function getMonthGrid(yearOrIso, month) {
  let y = yearOrIso;
  let m = month;

  if (typeof yearOrIso === 'string' && yearOrIso.includes('-')) {
    const parts = yearOrIso.split('-').map(Number);
    y = parts[0];
    m = parts[1] - 1;
  } else if (typeof yearOrIso === 'object' && yearOrIso instanceof Date) {
    y = yearOrIso.getFullYear();
    m = yearOrIso.getMonth();
  }

  // month: 0-indexed (0 = Jan, 11 = Dec)
  const firstDayOfMonth = new Date(y, m, 1);
  const lastDayOfMonth = new Date(y, m + 1, 0);

  const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const daysInMonth = lastDayOfMonth.getDate();

  const prevMonthLastDay = new Date(y, m, 0).getDate();

  const grid = [];
  const todayIso = getTodayIso();

  // Previous month trailing days
  for (let i = startingDayOfWeek - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const prevMonth = m === 0 ? 11 : m - 1;
    const prevYear = m === 0 ? y - 1 : y;
    const dateIso = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    grid.push({
      dayNumber: day,
      dateIso,
      isCurrentMonth: false,
      isToday: dateIso === todayIso
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateIso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    grid.push({
      dayNumber: d,
      dateIso,
      isCurrentMonth: true,
      isToday: dateIso === todayIso
    });
  }

  // Next month leading days (fill up to 35 or 42 cells)
  const remaining = (7 - (grid.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = m === 11 ? 0 : m + 1;
    const nextYear = m === 11 ? y + 1 : y;
    const dateIso = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    grid.push({
      dayNumber: d,
      dateIso,
      isCurrentMonth: false,
      isToday: dateIso === todayIso
    });
  }

  return grid;
}

/**
 * Smart 2-Way Calendar Reconciliation
 * Merges fresh remote items from Google with local items, preserving unsynced local creations
 * and reflecting remote additions, modifications, and deletions.
 */
export function reconcileCalendarItems(localItems = [], remoteGoogleItems = [], customTombstones = null) {
  if (!Array.isArray(localItems)) localItems = [];
  if (!Array.isArray(remoteGoogleItems)) remoteGoogleItems = [];

  let tombstones = customTombstones;
  if (!tombstones && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('wolfe_tombstones');
      tombstones = raw ? JSON.parse(raw) : {};
    } catch {
      tombstones = {};
    }
  }
  if (!tombstones) tombstones = {};

  const isTomb = (id) => Boolean(id && tombstones[String(id)]);

  const remoteMap = new Map();
  for (const r of remoteGoogleItems) {
    if (r && r.id && !isTomb(r.id)) {
      remoteMap.set(String(r.id), r);
    }
  }

  const result = [];
  const processedRemoteIds = new Set();
  const now = Date.now();

  // Active sync window boundaries (-60 days to +365 days)
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 60);
  windowStart.setHours(0, 0, 0, 0);
  const windowStartIso = windowStart.toISOString().split('T')[0];

  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + 365);
  windowEnd.setHours(23, 59, 59, 999);
  const windowEndIso = windowEnd.toISOString().split('T')[0];

  for (const localItem of localItems) {
    if (!localItem || !localItem.id) continue;
    const idStr = String(localItem.id);

    // Skip explicitly deleted items
    if (isTomb(idStr)) continue;

    // 1. If remote Google Calendar has this item, adopt the latest remote properties
    if (remoteMap.has(idStr)) {
      const remoteItem = remoteMap.get(idStr);
      result.push({
        ...localItem,
        ...remoteItem,
        // Preserve local properties if remote doesn't specify
        completed: localItem.completed !== undefined ? localItem.completed : remoteItem.completed,
        priority: localItem.priority || remoteItem.priority,
        category: localItem.category || remoteItem.category,
      });
      processedRemoteIds.add(idStr);
      continue;
    }

    // 2. Also match by date + title if remote item exists with different ID (e.g. temporary local ID -> Google ID)
    const matchByTitleAndDate = remoteGoogleItems.find(r => 
      r && !processedRemoteIds.has(String(r.id)) && 
      r.date === localItem.date && 
      r.title?.trim().toLowerCase() === localItem.title?.trim().toLowerCase()
    );
    if (matchByTitleAndDate) {
      const remoteIdStr = String(matchByTitleAndDate.id);
      result.push({
        ...localItem,
        ...matchByTitleAndDate,
        id: matchByTitleAndDate.id,
        isGoogle: true,
        completed: localItem.completed !== undefined ? localItem.completed : matchByTitleAndDate.completed,
      });
      processedRemoteIds.add(remoteIdStr);
      continue;
    }

    // 3. Local item NOT found on Google:
    // Retain if:
    // a) Local non-Google item (!localItem.isGoogle)
    // b) Recently created or modified (within 10 minutes) to account for Google API propagation latency
    // c) Item date is outside the fetch query window (< windowStartIso or > windowEndIso)
    const itemDate = localItem.date || '';
    const isOutsideWindow = itemDate && (itemDate < windowStartIso || itemDate > windowEndIso);
    const itemAge = localItem.createdAt ? (now - new Date(localItem.createdAt).getTime()) : 0;
    const isRecentlyCreated = !localItem.createdAt || itemAge < 10 * 60 * 1000;

    if (!localItem.isGoogle || isOutsideWindow || isRecentlyCreated) {
      result.push(localItem);
    }
  }

  // 4. Add new remote Google items that didn't exist locally
  for (const remoteItem of remoteGoogleItems) {
    if (!remoteItem || !remoteItem.id) continue;
    const idStr = String(remoteItem.id);
    if (!isTomb(idStr) && !processedRemoteIds.has(idStr)) {
      result.push(remoteItem);
      processedRemoteIds.add(idStr);
    }
  }

  return result;
}

/**
 * Check if the current local calendar is out of sync with Google
 */
export function isCalendarOutOfSync(localItems = [], lastSyncTimestamp = 0) {
  if (!Array.isArray(localItems)) return false;
  // If there are unsynced local items (e.g. newly created locally), we are out of sync
  const hasUnsyncedLocal = localItems.some(it => !it.isGoogle);
  if (hasUnsyncedLocal) return true;

  // If more than 45 seconds have passed since last successful sync, check again
  if (Date.now() - (lastSyncTimestamp || 0) > 45000) {
    return true;
  }

  return false;
}

/**
 * Calculate default event start and end time based on the current time rounded to the nearest hour
 */
export function getDefaultEventTimes() {
  const now = new Date();
  const minutes = now.getMinutes();
  const startHour = minutes >= 30 ? (now.getHours() + 1) % 24 : now.getHours();
  const endHour = (startHour + 1) % 24;

  const to12h = (h, m = 0) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  };

  const to24h = (h, m = 0) => {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  return {
    startTime12: to12h(startHour, 0),
    endTime12: to12h(endHour, 0),
    startTime24: to24h(startHour, 0),
    endTime24: to24h(endHour, 0)
  };
}

/**
 * Convert 24-hour time "HH:mm" to 12-hour format "hh:mm AM/PM"
 */
export function convert24to12(time24) {
  if (!time24 || !time24.includes(':')) return time24 || '12:00 PM';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Convert 12-hour time "hh:mm AM/PM" to 24-hour format "HH:mm"
 */
export function convert12to24(time12) {
  if (!time12) return '12:00';
  const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) return '12:00';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const p = (match[3] || '').toUpperCase();
  if (p === 'PM' && h < 12) h += 12;
  if (p === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}`;
}
