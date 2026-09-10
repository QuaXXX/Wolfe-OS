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
export function reconcileCalendarItems(localItems = [], remoteGoogleItems = []) {
  if (!Array.isArray(localItems)) localItems = [];
  if (!Array.isArray(remoteGoogleItems)) remoteGoogleItems = [];

  const remoteMap = new Map();
  for (const r of remoteGoogleItems) {
    if (r.id) remoteMap.set(String(r.id), r);
  }

  // 1. Keep local items that are NOT from Google (unsynced local additions, syllabus imports, etc.)
  // These must NOT be deleted just because they don't exist on Google yet!
  const localNonGoogleItems = localItems.filter(it => !it.isGoogle);

  // 2. For items that originated from Google:
  // If still in remoteMap: take the latest remote item (updates time, title, date, etc.)
  // If no longer in remoteMap: it was deleted remotely on Google Calendar -> remove it locally!
  const matchedGoogleItems = [];
  const processedRemoteIds = new Set();

  for (const localItem of localItems) {
    if (localItem.isGoogle && localItem.id) {
      const idStr = String(localItem.id);
      if (remoteMap.has(idStr)) {
        const remoteItem = remoteMap.get(idStr);
        matchedGoogleItems.push({
          ...remoteItem,
          // Preserve local task completion if remote doesn't specify
          completed: localItem.completed !== undefined ? localItem.completed : remoteItem.completed
        });
        processedRemoteIds.add(idStr);
      }
      // If not in remoteMap, localItem is omitted (deleted remotely on Google)
    }
  }

  // 3. New remote items that did not exist locally yet (created on phone, web Google Calendar, etc.)
  const newRemoteItems = [];
  for (const remoteItem of remoteGoogleItems) {
    const idStr = String(remoteItem.id);
    if (idStr && !processedRemoteIds.has(idStr)) {
      newRemoteItems.push(remoteItem);
      processedRemoteIds.add(idStr);
    }
  }

  return [...localNonGoogleItems, ...matchedGoogleItems, ...newRemoteItems];
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
