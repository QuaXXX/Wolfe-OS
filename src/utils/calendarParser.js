/**
 * Natural Language Calendar & Schedule Parser for Wolfe OS
 * High-precision extraction of Event/Deadline/Task types, clean entity titles,
 * exact calendar dates (relative & explicit), time intervals, and categories.
 */

import { getTodayIso, addDays } from './calendarUtils.js';

// Month lookup
const MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

const DAY_NAMES = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

/**
 * Parses any date expression (relative or explicit) to a strict "YYYY-MM-DD" string.
 */
export function parseTargetDate(text, todayIso = getTodayIso()) {
  if (!text || typeof text !== 'string') return todayIso;
  const lower = text.toLowerCase();

  if (lower.match(/\ball\b/) && lower.match(/\b(?:days|events|everything|calendar|schedule)\b/)) {
    return 'ALL';
  }

  // 1. Relative phrases
  if (lower.match(/\bday\s+after\s+tomorrow\b/)) {
    return addDays(todayIso, 2);
  }
  if (lower.match(/\btomorrow\b/)) {
    return addDays(todayIso, 1);
  }
  if (lower.match(/\byesterday\b/)) {
    return addDays(todayIso, -1);
  }
  if (lower.match(/\btoday\b|\btonight\b|\bthis\s+evening\b|\bthis\s+afternoon\b/)) {
    return todayIso;
  }

  // "in N days" / "N days from now"
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/) || lower.match(/\b(\d+)\s+days?\s+from\s+now\b/);
  if (inDaysMatch) {
    return addDays(todayIso, parseInt(inDaysMatch[1], 10));
  }

  // "in a week" / "next week"
  if (lower.match(/\bin\s+a\s+week\b|\bnext\s+week\b/)) {
    return addDays(todayIso, 7);
  }

  // "in N weeks"
  const inWeeksMatch = lower.match(/\bin\s+(\d+)\s+weeks?\b/);
  if (inWeeksMatch) {
    return addDays(todayIso, parseInt(inWeeksMatch[1], 10) * 7);
  }

  // 2. Explicit numeric ISO or US format: YYYY-MM-DD or MM/DD/YYYY or MM/DD
  const isoMatch = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(isoMatch[2]).padStart(2, '0')}-${String(isoMatch[3]).padStart(2, '0')}`;
  }

  const slashDateMatch = lower.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDateMatch) {
    const y = slashDateMatch[3] ? (slashDateMatch[3].length === 2 ? `20${slashDateMatch[3]}` : slashDateMatch[3]) : todayIso.split('-')[0];
    const m = String(slashDateMatch[1]).padStart(2, '0');
    const d = String(slashDateMatch[2]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. Month name + Day: e.g. "Sept 20", "September 20th", "20th of Sept", "Oct 2"
  const monthDayMatch = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/) ||
                        lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/);
  if (monthDayMatch) {
    let mStr, dStr;
    if (isNaN(monthDayMatch[1])) {
      mStr = monthDayMatch[1];
      dStr = monthDayMatch[2];
    } else {
      dStr = monthDayMatch[1];
      mStr = monthDayMatch[2];
    }
    const mNum = MONTH_NAMES[mStr.slice(0, 3)];
    if (mNum) {
      const currentYear = parseInt(todayIso.split('-')[0], 10);
      const mPadded = String(mNum).padStart(2, '0');
      const dPadded = String(dStr).padStart(2, '0');
      const candidateDate = `${currentYear}-${mPadded}-${dPadded}`;
      const diffDays = (new Date(candidateDate).getTime() - new Date(todayIso).getTime()) / (1000 * 3600 * 24);
      const finalYear = diffDays < -90 ? currentYear + 1 : currentYear;
      return `${finalYear}-${mPadded}-${dPadded}`;
    }
  }

  // 4. Day of week: "next Monday", "this Friday", "Friday"
  const dayNamesRegex = /\b(?:(next|this|coming)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/;
  const dayMatch = lower.match(dayNamesRegex);
  if (dayMatch) {
    const modifier = (dayMatch[1] || '').toLowerCase();
    const dayKey = dayMatch[2].toLowerCase();
    const targetDay = DAY_NAMES[dayKey];

    if (targetDay !== undefined) {
      const [currY, currM, currD] = todayIso.split('-').map(Number);
      const currDateObj = new Date(currY, currM - 1, currD);
      const currentDay = currDateObj.getDay(); // 0 = Sunday, 1 = Monday...

      let diff = targetDay - currentDay;

      if (modifier === 'next') {
        if (diff <= 0) diff += 7;
        else diff += 7;
      } else if (modifier === 'this' || modifier === 'coming') {
        if (diff < 0) diff += 7;
      } else {
        if (diff <= 0) diff += 7;
      }

      return addDays(todayIso, diff);
    }
  }

  return todayIso;
}

/**
 * Normalizes any date string (including LLM output like "tomorrow" or ISO datetime) to "YYYY-MM-DD".
 */
export function normalizeCalendarDate(dateStr, todayIso = getTodayIso()) {
  if (!dateStr || typeof dateStr !== 'string') return todayIso;
  const clean = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  if (clean.includes('T')) return clean.split('T')[0];
  return parseTargetDate(clean, todayIso);
}

const SPOKEN_NUMBER_WORDS = {
  'zero': 0, 'oh': 0,
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
  'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50
};

/**
 * Normalizes spoken numbers and conversational unpunctuated time pairs.
 * e.g. "6 30" -> "6:30", "8 49" -> "8:49", "six thirty" -> "6:30", "6 for finance 30" -> "finance at 6:30"
 */
export function normalizeSpokenTimes(text) {
  if (!text || typeof text !== 'string') return '';
  let str = text;

  // 1. Convert relative phrases like "half past six", "quarter past seven", "quarter to eight"
  str = str.replace(/\bhalf\s+past\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi, (match, h) => {
    const hour = SPOKEN_NUMBER_WORDS[h.toLowerCase()] || parseInt(h, 10);
    return `${hour}:30`;
  });
  str = str.replace(/\bquarter\s+(?:past|after)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi, (match, h) => {
    const hour = SPOKEN_NUMBER_WORDS[h.toLowerCase()] || parseInt(h, 10);
    return `${hour}:15`;
  });
  str = str.replace(/\bquarter\s+(?:to|till)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\b/gi, (match, h) => {
    let hour = (SPOKEN_NUMBER_WORDS[h.toLowerCase()] || parseInt(h, 10)) - 1;
    if (hour <= 0) hour = 12;
    return `${hour}:45`;
  });

  // Word hours + minutes: "six thirty", "eight forty nine", "eight forty-nine"
  str = str.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(o'?clock)\b/gi, (match, h) => {
    const hour = SPOKEN_NUMBER_WORDS[h.toLowerCase()];
    return `${hour}:00`;
  });
  str = str.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(fifteen|twenty|thirty|forty|fifty)(?:[-\s](one|two|three|four|five|six|seven|eight|nine))?\b/gi, (match, h, tens, ones) => {
    const hour = SPOKEN_NUMBER_WORDS[h.toLowerCase()];
    let min = SPOKEN_NUMBER_WORDS[tens.toLowerCase()] || 0;
    if (ones && SPOKEN_NUMBER_WORDS[ones.toLowerCase()]) {
      min += SPOKEN_NUMBER_WORDS[ones.toLowerCase()];
    }
    return `${hour}:${String(min).padStart(2, '0')}`;
  });

  // 2. Speech-to-text anomaly: "6 for finance 30" -> "finance at 6:30"
  str = str.replace(/\b(\d{1,2})\s+(?:for|at)\s+([a-zA-Z\s]+?)\s+([0-5]\d)\b/gi, (match, h, subject, m) => {
    const hour = parseInt(h, 10);
    if (hour >= 1 && hour <= 12) {
      return `${subject.trim()} at ${hour}:${m}`;
    }
    return match;
  });

  // 3. Unpunctuated numeric time pairs: "6 30", "8 49", "10 15", "12 30", "2 15"
  const timePairRegex = /(?<!\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+)\b([01]?\d|2[0-3])\s+([0-5]\d)(?:\s*(am|pm))?\b(?!\s*(?:hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|lbs?|kg|calories?|kcal|grams?|g\b|%|percent))/gi;
  
  str = str.replace(timePairRegex, (match, h, m, meridiem) => {
    const hNum = parseInt(h, 10);
    if (hNum >= 0 && hNum <= 23) {
      return `${hNum}:${m}${meridiem ? ' ' + meridiem : ''}`;
    }
    return match;
  });

  // 4. "6 o'clock", "8 oclock", "6 o clock" -> "6:00", "8:00"
  str = str.replace(/\b(\d{1,2})\s*o'?\s*clock\b/gi, '$1:00');

  return str;
}

/**
 * Parses time expressions and returns standardized 12-hour strings.
 * Includes deep conversational context clues for AM/PM resolution.
 */
export function parseEventTimes(text) {
  if (!text || typeof text !== 'string') {
    return { startTime: 'All Day', endTime: 'All Day', time: 'All Day', isAllDay: true, hasTime: false };
  }
  const normalized = normalizeSpokenTimes(text);
  const lower = normalized.toLowerCase();

  // Contextual clues for AM / PM resolution
  const resolveMeridiem = (hour, textContext = '') => {
    const ctx = textContext.toLowerCase();
    const isNightOrEvening = /\b(tonight|this\s+evening|evening|night|dinner|supper|pm|p\.m\.|late|after\s+work|bedtime)\b/i.test(ctx);
    const isMorning = /\b(morning|in\s+the\s+morning|am|a\.m\.|breakfast|early|fasted|wake\s*up)\b/i.test(ctx);
    const isAfternoon = /\b(afternoon|in\s+the\s+afternoon|lunch|lunchtime|midday)\b/i.test(ctx);

    if (hour >= 13) return 'pm';
    if (hour === 0) return 'am';
    if (hour === 12) return isNightOrEvening && ctx.includes('midnight') ? 'am' : 'pm';

    if (isNightOrEvening && !isMorning) return 'pm';
    if (isMorning && !isNightOrEvening) return 'am';
    if (isAfternoon) return 'pm';

    // Academic clues: lectures/exams at 8-11 default to AM, at 1-6 default to PM
    const isAcademic = /\b(class|lecture|exam|quiz|midterm|finals|school|test|fnce|econ|stat|cpsc|math|study|homework|assignment|ta|office\s+hours|finance)\b/i.test(ctx);
    if (isAcademic) {
      if (hour >= 8 && hour <= 11) return 'am';
      if (hour >= 1 && hour <= 6) return 'pm';
    }

    // Workout clues: evening gym 4-9pm is most common
    const isWorkout = /\b(gym|workout|lift|bench|squat|cardio|run|training)\b/i.test(ctx);
    if (isWorkout) {
      if (hour <= 6) return 'pm';
      if (hour >= 7 && hour <= 9) return 'pm';
      if (hour >= 10 && hour <= 11) return 'am';
    }

    // Financial / market clues: opens morning, closes afternoon
    const isMarket = /\b(market|stocks?|open|fomc|cpi|bell)\b/i.test(ctx);
    if (isMarket) {
      if (hour >= 7 && hour <= 11) return 'am';
      if (hour >= 1 && hour <= 4) return 'pm';
    }

    // General waking defaults: 1-6 -> PM, 8-11 -> AM, 7 -> PM unless breakfast/morning
    if (hour >= 1 && hour <= 6) return 'pm';
    if (hour >= 8 && hour <= 11) return 'am';
    if (hour === 7) return 'pm';

    return 'pm';
  };

  const format12H = (h, m = 0, meridiem = null) => {
    let hour = parseInt(h, 10);
    let min = parseInt(m || 0, 10);
    let p = meridiem ? meridiem.toLowerCase() : null;

    if (!p) {
      p = resolveMeridiem(hour, lower);
    } else {
      if (p === 'pm' && hour < 12) hour += 12;
      if (p === 'am' && hour === 12) hour = 0;
    }

    if (hour === 0) {
      hour = 12;
      p = 'am';
    } else if (hour === 12) {
      p = p || 'pm';
    } else if (hour > 12) {
      hour -= 12;
      p = 'pm';
    } else {
      p = p || 'am';
    }

    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')} ${p.toUpperCase()}`;
  };

  const addMinutesToTime = (time12H, minutesToAdd) => {
    const match = time12H.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return '03:00 PM';
    let h = parseInt(match[1], 10);
    let m = parseInt(match[2], 10);
    const p = match[3].toUpperCase();
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;

    const totalM = h * 60 + m + minutesToAdd;
    let newH = Math.floor(totalM / 60) % 24;
    let newM = totalM % 60;
    let newP = newH >= 12 ? 'PM' : 'AM';
    if (newH === 0) newH = 12;
    else if (newH > 12) newH -= 12;

    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')} ${newP}`;
  };

  // 1. Duration check: "for 2 hours", "for 90 mins", "for 1.5 hours", "for an hour"
  let durationMinutes = 60;
  const durMatch = lower.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (durMatch) {
    durationMinutes = Math.round(parseFloat(durMatch[1]) * 60);
  } else if (lower.match(/\bfor\s+(?:an|one)\s*hour\b/i)) {
    durationMinutes = 60;
  } else if (lower.match(/\bfor\s+(\d+)\s*(?:minutes?|mins?)\b/i)) {
    durationMinutes = parseInt(lower.match(/\bfor\s+(\d+)\s*(?:minutes?|mins?)\b/i)[1], 10);
  }

  // 2. Explicit range: "from 6:30 to 8:00", "6:30 - 8:30", "4-6pm"
  const rangeMatch = lower.match(/(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i) ||
                     lower.match(/\b(\d{1,2})-(\d{1,2})\s*(am|pm)\b/i);

  if (rangeMatch) {
    let h1 = rangeMatch[1], m1 = rangeMatch[2] || 0, p1 = rangeMatch[3];
    let h2 = rangeMatch[4], m2 = rangeMatch[5] || 0, p2 = rangeMatch[6];

    if (!p1 && p2) p1 = p2;
    if (!p2 && p1) p2 = p1;
    if (!p1 && !p2) {
      const resolved = resolveMeridiem(parseInt(h2, 10), lower);
      p1 = resolved;
      p2 = resolved;
    }

    const startTime = format12H(h1, m1, p1);
    const endTime = format12H(h2, m2, p2);
    return {
      startTime,
      endTime,
      time: `${startTime} - ${endTime}`,
      isAllDay: false,
      hasTime: true
    };
  }

  // 3. Single time point: "at 6:30", "for 6:30", "6:30pm", "6:30", "at 5", "5pm"
  const singleMatch = lower.match(/\b(?:at|for|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i) ||
                      lower.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i) ||
                      lower.match(/\b(\d{1,2})\s*(am|pm)\b/i);

  if (singleMatch) {
    const h = singleMatch[1];
    const m = singleMatch[2] || 0;
    const p = singleMatch[3];
    const startTime = format12H(h, m, p);
    const endTime = addMinutesToTime(startTime, durationMinutes);
    return {
      startTime,
      endTime,
      time: `${startTime} - ${endTime}`,
      isAllDay: false,
      hasTime: true
    };
  }

  // 4. Named times
  if (lower.match(/\b(?:at\s+)?noon\b/)) {
    return { startTime: '12:00 PM', endTime: addMinutesToTime('12:00 PM', durationMinutes), time: `12:00 PM - ${addMinutesToTime('12:00 PM', durationMinutes)}`, isAllDay: false, hasTime: true };
  }
  if (lower.match(/\b(?:at\s+)?midnight\b/)) {
    return { startTime: '12:00 AM', endTime: addMinutesToTime('12:00 AM', durationMinutes), time: `12:00 AM - ${addMinutesToTime('12:00 AM', durationMinutes)}`, isAllDay: false, hasTime: true };
  }
  if (lower.match(/\b(?:in\s+the\s+)?morning\b/)) {
    return { startTime: '09:00 AM', endTime: '10:00 AM', time: '09:00 AM - 10:00 AM', isAllDay: false, hasTime: true };
  }
  if (lower.match(/\b(?:at\s+)?lunch(?:time)?\b/)) {
    return { startTime: '12:00 PM', endTime: '01:00 PM', time: '12:00 PM - 01:00 PM', isAllDay: false, hasTime: true };
  }
  if (lower.match(/\b(?:in\s+the\s+)?afternoon\b/)) {
    return { startTime: '02:00 PM', endTime: '03:00 PM', time: '02:00 PM - 03:00 PM', isAllDay: false, hasTime: true };
  }
  if (lower.match(/\b(?:tonight|this\s+evening|in\s+the\s+evening)\b/)) {
    return { startTime: '06:00 PM', endTime: '07:00 PM', time: '06:00 PM - 07:00 PM', isAllDay: false, hasTime: true };
  }

  return {
    startTime: 'All Day',
    endTime: 'All Day',
    time: 'All Day',
    isAllDay: true,
    hasTime: false
  };
}

/**
 * Converts a 12-hour or 24-hour time string into minutes from midnight (0-1440).
 * Ideal for chronological sorting of calendar events.
 */
export function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  if (timeStr === 'All Day') return -1;
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return 0;
  let h = parseInt(match[1], 10);
  const m = match[2] ? parseInt(match[2], 10) : 0;
  const p = (match[3] || '').toLowerCase();
  if (p === 'pm' && h < 12) h += 12;
  if (p === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

/**
 * Preserves recognized uppercase acronyms and title-cases regular words.
 */
export function formatTitleCase(str) {
  const acronyms = new Set(['FNCE', 'ECON', 'CPSC', 'STAT', 'CHEM', 'PHYS', 'BIOL', 'AI', 'GPA', 'FOMC', 'CPI', 'USA', 'P&L', 'USDC']);
  return str.split(' ').map(word => {
    const cleanWord = word.replace(/[^a-zA-Z0-9&]/g, '');
    if (acronyms.has(cleanWord.toUpperCase())) {
      return word.toUpperCase();
    }
    const courseMatch = word.match(/^([a-zA-Z]+)(\d+)$/);
    if (courseMatch) {
      return `${courseMatch[1].toUpperCase()} ${courseMatch[2]}`;
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Surgically extracts the clean entity title by stripping command verbs,
 * dates, times, prepositions, and conversational buffer noise.
 */
export function extractCleanTitle(rawText) {
  if (!rawText) return "New Event";

  let str = normalizeSpokenTimes(rawText).trim();

  // Strip conversational buffer junk
  str = str
    .replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '')
    .replace(/^(?:hey|hi|yo|ok|okay|please|can you|could you|would you|i want to|i need to|i have to|i gotta|just|help me|wolfe|assistant)\s+/gi, '')
    .replace(/\s+(?:please|thanks|thank you)\s*$/gi, '')
    .trim();

  // Strip initial action verbs and calendar targets:
  str = str.replace(/^(?:add|schedule|create|put|set|book|log|insert|make)\s+(?:an|a|the|my)?\s*(?:new\s+)?(?:calendar\s+item|event|deadline|task|reminder|todo)?\s*(?:to|on|in)?\s*(?:my\s+|the\s+)?(?:calendar|schedule|timeline)?[:\s]*/gi, '');
  str = str.replace(/^(?:remind\s+me\s+to|remember\s+to|don'?t\s+forget\s+to|make\s+sure\s+to)\s+/gi, '');
  str = str.replace(/^(?:an|a|the|my)?\s*(?:new\s+)?(?:calendar\s+item|event|deadline|task|reminder|todo|appointment|meeting|exam|test|quiz)\s*(?:called|named|titled|:)\s*/gi, '');
  str = str.replace(/^submit\s+(?=(?:essay|assignment|homework|paper|project|lab|report|deliverable)\b)/gi, '');
  str = str.replace(/\b(?:to|on|in)\s+(?:my\s+|the\s+)?(?:calendar|schedule|timeline)\b[:\s]*/gi, ' ');

  // Strip date indicators
  str = str.replace(/\b(?:on\s+)?(?:today|tomorrow|day\s+after\s+tomorrow|yesterday)\b/gi, ' ');
  str = str.replace(/\b(?:on\s+)?(?:next|this|coming)\s+(?:week|sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/gi, ' ');
  str = str.replace(/\b(?:on\s+)?(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ');
  str = str.replace(/\b(?:on\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, ' ');
  str = str.replace(/\b(?:on\s+)?\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi, ' ');
  str = str.replace(/\b(?:in\s+)?\d+\s+days?\b/gi, ' ');
  str = str.replace(/\bin\s+a\s+week\b/gi, ' ');

  // Strip time indicators (including normalized times and ranges)
  str = str.replace(/\b(?:from\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|-|until|till)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, ' ');
  str = str.replace(/\b(?:from\s+)?\d{1,2}:\d{2}\s*(?:to|-|until|till)\s*\d{1,2}:\d{2}\b/gi, ' ');
  str = str.replace(/\b\d{1,2}-\d{1,2}\s*(?:am|pm)\b/gi, ' ');
  str = str.replace(/\b(?:at|for|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, ' ');
  str = str.replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi, ' ');
  str = str.replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, ' ');
  str = str.replace(/\bfor\s+\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?)\b/gi, ' ');
  str = str.replace(/\bfor\s+(?:an|one)\s*hour\b/gi, ' ');
  str = str.replace(/\b(?:at\s+)?(?:noon|midnight)\b/gi, ' ');
  str = str.replace(/\b(?:in\s+the\s+)?(?:morning|afternoon|evening)\b/gi, ' ');
  str = str.replace(/\b(?:tonight|this\s+evening)\b/gi, ' ');

  // Strip deadline prepositions: "due by", "due on", "due at", "due"
  str = str.replace(/\b(?:due\s+(?:by|on|at)?|by)\s*$/gi, ' ');

  // Strip hanging prepositions and punctuation
  str = str
    .replace(/^[\s,;:\-–—\./]+|[\s,;:\-–—\./]+$/g, '')
    .replace(/^(?:for|at|on|about|called|named|titled)\b\s*/gi, '')
    .replace(/\s+\b(?:for|to|at|on|by|from|about)\b\s*$/gi, '')
    .replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '')
    .trim();

  str = str.replace(/\s{2,}/g, ' ');

  if (!str || str.length === 0) return "Scheduled Event";

  return formatTitleCase(str);
}

/**
 * Accurately detects item category based on title and input text context.
 */
export function detectCategory(title, text) {
  const combined = `${title || ''} ${text || ''}`.toLowerCase();
  if (combined.match(/\b(gym|workout|lift|lifting|bench|squat|deadlift|run|running|cardio|fitness|push|pull|legs|chest|triceps|biceps|shoulders|training|sparring|boxing|athletic)\b/)) {
    return 'Fitness';
  }
  if (combined.match(/\b(grocery|groceries|meal\s+prep|dinner|lunch|breakfast|food|cook|cooking|protein|shake|creatine|smoothie|snack)\b/)) {
    return 'Nutrition';
  }
  if (combined.match(/\b(lecture|class|exam|midterm|finals|quiz|test|homework|assignment|essay|study|syllabus|professor|advisor|ta|office\s+hours|course|math|stats|stat|fnce|econ|chem|phys|cpsc|finance|accounting|mgmt|marketing)\b/)) {
    if (!combined.match(/\b(?:eye|dental|medical|annual|physical)\s+exam\b/)) {
      return 'School';
    }
  }
  return 'General';
}

/**
 * Complete Natural Language Calendar Command Parser.
 * Returns parsed item object if the input is a calendar scheduling request, or null otherwise.
 */
export function parseCalendarCommand(text, todayIso = getTodayIso()) {
  if (!text || typeof text !== 'string') return null;
  const normalized = normalizeSpokenTimes(text);
  const lower = normalized.toLowerCase().trim();

  // Check if this looks like a calendar/schedule intent
  const isSchoolExam = lower.match(/\b(?:exam|quiz|midterm|finals|test)\b/) && !lower.match(/\b(?:eye|dental|medical|annual|physical)\s+exam\b/);
  const isDeadline = lower.match(/\b(?:deadline|due|submission)\b/) || lower.match(/\bsubmit\s+(?:essay|assignment|paper|project|homework|report)\b/) || isSchoolExam;
  const isDirectAdd = lower.match(/^(?:add|schedule|create|put|set|book|log|insert|make)\b/);
  const isReminder = lower.match(/\b(?:remind\s+me|reminder|remember\s+to|don'?t\s+forget)\b/);
  const isTask = lower.match(/\b(?:task|todo|to-do)\b/) || lower.match(/^(?:buy|call|clean|finish|prepare|prep|pay)\b/);
  const isEventEntity = lower.match(/\b(?:appointment|meeting|dentist|doctor|interview|flight|class|lecture|session|party|dinner|lunch|breakfast|haircut|workout|gym|study|finance|market|fnce|econ|stat|cpsc)\b/);

  const timeInfo = parseEventTimes(text);
  const hasTime = timeInfo.hasTime;
  const hasDate = lower.match(/\b(?:today|tomorrow|tonight|yesterday|morning|afternoon|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|in\s+\d+\s+days?|next\s+week|next\s+[a-z]+|this\s+[a-z]+)\b/) ||
                  lower.match(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/);

  if (!isDirectAdd && !isReminder && !isTask && !isDeadline && !isEventEntity && !(hasTime && (hasDate || isEventEntity || isDirectAdd))) {
    if (!hasTime) return null;
  }

  // Determine item type
  let type = 'event';
  if (isDeadline) {
    type = 'deadline';
  } else if (isReminder) {
    type = 'reminder';
  } else if (isTask && !lower.includes('event') && !lower.includes('appointment')) {
    type = 'task';
  }

  const date = parseTargetDate(lower, todayIso);
  const title = extractCleanTitle(text);
  const category = detectCategory(title, text);

  // If type is deadline or task, default to All Day unless explicit time given
  const isDeadlineOrTask = type === 'deadline' || type === 'task';
  const isAllDay = isDeadlineOrTask ? (!timeInfo.hasTime || timeInfo.isAllDay) : timeInfo.isAllDay;

  return {
    isCalendarCommand: true,
    type,
    title,
    date,
    startTime: isAllDay ? 'All Day' : timeInfo.startTime,
    endTime: isAllDay ? 'All Day' : timeInfo.endTime,
    time: isAllDay ? 'All Day' : timeInfo.time,
    isAllDay,
    category,
    priority: type === 'deadline' ? 'urgent' : 'normal',
    completed: false
  };
}
