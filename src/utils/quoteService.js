// Wolfe OS Quote Engine & Rotation Service
// Handles auto-rotation every 3 hours, chance-based serendipity without repeats,
// and persistence in localStorage.

import { QUOTE_POOL } from './quotesData.js';

const STORAGE_ACTIVE = 'wolfe_active_quote_v2';
const STORAGE_SEEN = 'wolfe_seen_quote_ids_v2';
const STORAGE_FAVORITES = 'wolfe_favorite_quote_ids_v2';

// Auto-rotate every 3 hours (8 dynamic windows per day)
export const ROTATION_HOURS = 3;
export const ROTATION_MS = ROTATION_HOURS * 60 * 60 * 1000;

/**
 * Get current window identifier based on local date and 3-hour blocks
 * e.g. "2026-09-30_w6"
 */
export function getCurrentWindowKey(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const windowIdx = Math.floor(now.getHours() / ROTATION_HOURS);
  return `${yyyy}-${mm}-${dd}_w${windowIdx}`;
}

/**
 * Calculate milliseconds remaining until the next rotation window
 */
export function getRemainingMsInWindow(now = new Date()) {
  const currentHour = now.getHours();
  const currentWindowIdx = Math.floor(currentHour / ROTATION_HOURS);
  const nextWindowHour = (currentWindowIdx + 1) * ROTATION_HOURS;
  
  const nextWindowTime = new Date(now);
  if (nextWindowHour >= 24) {
    nextWindowTime.setDate(nextWindowTime.getDate() + 1);
    nextWindowTime.setHours(0, 0, 0, 0);
  } else {
    nextWindowTime.setHours(nextWindowHour, 0, 0, 0);
  }
  return Math.max(0, nextWindowTime.getTime() - now.getTime());
}

/**
 * Retrieve list of seen quote IDs to prevent repetitions
 */
export function getSeenQuoteIds() {
  try {
    const raw = localStorage.getItem(STORAGE_SEEN);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Record a quote ID as seen
 */
export function markQuoteAsSeen(quoteId) {
  try {
    const seen = getSeenQuoteIds();
    const updated = [quoteId, ...seen.filter(id => id !== quoteId)];
    // Keep up to 350 quotes in history so it won't repeat for weeks
    // Once history gets too big, leave last 30 so the rest recirculate
    if (updated.length > 400) {
      updated.splice(350);
    }
    localStorage.setItem(STORAGE_SEEN, JSON.stringify(updated));
  } catch {}
}

/**
 * Pick an impactful quote by chance from unseen pool
 */
export function drawRandomQuote(preferredCategory = null) {
  if (!QUOTE_POOL || QUOTE_POOL.length === 0) {
    return {
      id: 'wq_default',
      text: 'Freedom is the Goal, Health is the foundation, and family is the reason.',
      author: 'Zach Wolfe',
      category: 'Core Values',
      source: ''
    };
  }

  const seen = new Set(getSeenQuoteIds());
  let candidates = QUOTE_POOL.filter(q => !seen.has(q.id));

  // If we've seen almost all quotes, flush history to allow fresh circulation
  if (candidates.length < 15) {
    try {
      localStorage.removeItem(STORAGE_SEEN);
    } catch {}
    candidates = QUOTE_POOL;
  }

  if (preferredCategory) {
    const catMatches = candidates.filter(q => q.category === preferredCategory);
    if (catMatches.length > 0) candidates = catMatches;
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  const chosen = candidates[randomIndex] || QUOTE_POOL[0];
  markQuoteAsSeen(chosen.id);
  return chosen;
}

/**
 * Fetch currently active quote, rotating automatically if window expired
 */
export function getOrRotateActiveQuote() {
  const currentWindowKey = getCurrentWindowKey();
  
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE);
    if (raw) {
      const stored = JSON.parse(raw);
      // Check if stored quote is valid and matches the current rotation window
      if (stored && stored.windowKey === currentWindowKey && stored.quote?.text) {
        return stored.quote;
      }
    }
  } catch {}

  // Pick a fresh quote randomly from the pool by chance
  const newQuote = drawRandomQuote();

  const activeRecord = {
    windowKey: currentWindowKey,
    rotatedAt: Date.now(),
    quote: newQuote
  };

  try {
    localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(activeRecord));
  } catch {}

  return newQuote;
}

/**
 * Force manual roll to get another random quote immediately
 */
export function rollNextQuoteManual() {
  const newQuote = drawRandomQuote();
  const currentWindowKey = getCurrentWindowKey();

  const activeRecord = {
    windowKey: currentWindowKey,
    rotatedAt: Date.now(),
    quote: newQuote
  };

  try {
    localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(activeRecord));
  } catch {}

  return newQuote;
}

/**
 * Get favorite quote IDs
 */
export function getFavoriteQuoteIds() {
  try {
    const raw = localStorage.getItem(STORAGE_FAVORITES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Toggle favorite quote
 */
export function toggleFavoriteQuote(quoteId) {
  try {
    const current = getFavoriteQuoteIds();
    const isFav = current.includes(quoteId);
    const next = isFav ? current.filter(id => id !== quoteId) : [quoteId, ...current];
    localStorage.setItem(STORAGE_FAVORITES, JSON.stringify(next));
    return !isFav;
  } catch {
    return false;
  }
}
