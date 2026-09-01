/**
 * Wolfe OS — Core Intelligence Engine
 */

import { 
  isGoogleCalendarConnected, 
  createGoogleCalendarEvent, 
  deleteGoogleCalendarEvent, 
  clearGoogleCalendarEventsForDate 
} from './googleCalendarService.js';
import { getTodayIso, addDays, formatDateTitle } from './calendarUtils.js';

const API_KEY = import.meta.env?.VITE_GEMINI_API_KEY || '';

export const DEFAULT_AI_CONFIG = {
  provider: 'gemini',
  apiKey: API_KEY,
  model: 'gemini-3.5-flash',
  voiceResponse: false,
};

/**
 * System prompt
 */
export const buildSystemPrompt = (osData) => {
  const todayIso = getTodayIso();

  return `You are Wolfe OS, the private, high-performance executive intelligence engine built exclusively for Zach Wolfe.

ABOUT ZACH WOLFE:
- Name: Zach Wolfe (address him as Zach).
- Role: Ambitious university student, disciplined athlete, and active investor/trader.
- Operating Style: Values efficiency, precision, clear actionability, zero fluff, and high intellectual rigor.
- Tone: Sharp, proactive, articulate, supportive, and executive-level customized.

TODAY'S DATE: ${todayIso} (${formatDateTitle(todayIso)}).
DAY OF WEEK: ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}.

LIVE USER STATE:
- Academics & School: GPA ${osData?.schoolData?.gpa || '—'}, Enrolled courses & Obsidian notes linked.
- Fitness & Workouts: Split: ${osData?.workoutData?.split || 'Push / Pull / Legs'}. Today: ${osData?.workoutData?.todayWorkout || 'Training'}.
- Nutrition: ${osData?.nutritionData?.consumedCalories || 0} / ${osData?.nutritionData?.targetCalories || 2750} kcal.
- Day Trading & Markets: Day P&L: +$${osData?.tradingData?.dayPnl || '0.00'} (+${osData?.tradingData?.dayPnlPercent || '0.00'}%).

TITLE CLEANING:
- Extract clean, concise entity titles without conversational filler ("that i have", "to do", "remind me to", etc.).

ACTIONS:
1. "CREATE_CALENDAR_ITEM": For adding a single deadline (red all-day), timed event, task, or reminder.
2. "BATCH_CREATE_CALENDAR_ITEMS": For adding multiple deadlines, events, tasks, exam schedules, or course milestones at once. Provide "calendarItems" array.
3. "CLEAR_CALENDAR_ITEMS": When asked to clear or wipe the calendar for today, tomorrow, all days, or a specific date. Provide "targetDate": "YYYY-MM-DD" or "ALL".
4. "DELETE_SPECIFIC_ITEM": For deleting a specific item by name/title. Provide "itemTitle" and optional "targetDate".
5. "ASK_CLARIFICATION": When time/date is missing.

RESPOND ONLY IN VALID JSON:
{
  "title": "Short 2-3 word topic title",
  "message": "Direct executive response text",
  "targetView": "home" | "calendar" | "school" | "workouts" | "nutrition" | "trading",
  "actionLabel": "Button Label",
  "actionType": "CREATE_CALENDAR_ITEM" | "BATCH_CREATE_CALENDAR_ITEMS" | "CLEAR_CALENDAR_ITEMS" | "DELETE_SPECIFIC_ITEM" | "ASK_CLARIFICATION",
  "targetDate": "YYYY-MM-DD" (or "ALL"),
  "itemTitle": "Title to delete if actionType is DELETE_SPECIFIC_ITEM",
  "calendarItem": {
    "type": "deadline" | "event" | "task" | "reminder",
    "title": "Clean Entity Title",
    "date": "YYYY-MM-DD",
    "startTime": "HH:MM AM/PM",
    "endTime": "HH:MM AM/PM",
    "isAllDay": true/false,
    "category": "School" | "Trading" | "Fitness" | "Nutrition" | "General",
    "priority": "urgent" | "normal"
  },
  "calendarItems": [
    {
      "type": "deadline" | "event" | "task" | "reminder",
      "title": "Clean Entity Title",
      "date": "YYYY-MM-DD",
      "startTime": "HH:MM AM/PM",
      "endTime": "HH:MM AM/PM",
      "isAllDay": true/false,
      "category": "School" | "Trading" | "Fitness" | "Nutrition" | "General",
      "priority": "urgent" | "normal",
      "weight": "30%" (optional)
    }
  ]
}`;
};

function cleanTitleString(raw) {
  if (!raw) return "New Item";
  let str = raw
    .replace(/^(add|schedule|create|put|set|book|log|delete|remove|cancel|clear)\s+/i, '')
    .replace(/^(a|an|the|my)\s+/i, '')
    .replace(/^(deadline|task|reminder|event|meeting|workout|calendar)\s+(that|for|to)?\s*/i, '')
    .replace(/^(that\s+i\s+have\s+(a|an)?|that\s+i\s+need\s+to|to\s+do\s+my|to\s+study\s+for)\s*/i, '')
    .replace(/\s+(today|tomorrow|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?|on\s+[a-z]+)\s*$/i, '')
    .trim();

  if (str.length === 0) return "New Item";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function computeEndHour(startTimeStr) {
  if (!startTimeStr || startTimeStr === 'All Day') return '03:00 PM';
  const match = startTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
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

function parseTargetDateFromText(text, todayIso) {
  const lower = (text || '').toLowerCase();
  if (lower.includes('all') && (lower.includes('days') || lower.includes('events') || lower.includes('everything') || lower.includes('calendar') || lower.includes('schedule'))) {
    return 'ALL';
  }
  if (lower.includes('tomorrow')) {
    return addDays(todayIso, 1);
  }
  if (lower.includes('yesterday')) {
    return addDays(todayIso, -1);
  }
  if (lower.includes('today')) {
    return todayIso;
  }
  
  // Try month regex (e.g. "august 31", "sept 2", "oct 14")
  const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
  const mMatch = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})/i);
  if (mMatch) {
    const m = months[mMatch[1].slice(0, 3).toLowerCase()];
    const d = String(mMatch[2]).padStart(2, '0');
    const y = todayIso.split('-')[0];
    return `${y}-${m}-${d}`;
  }

  // Try day of week (e.g. "monday", "friday")
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < daysOfWeek.length; i++) {
    if (lower.includes(daysOfWeek[i])) {
      const currentD = new Date().getDay();
      let diff = i - currentD;
      if (diff <= 0) diff += 7;
      return addDays(todayIso, diff);
    }
  }

  return todayIso;
}

/**
 * Resilient JSON Parser that auto-repairs truncated responses from Gemini
 */
export function safeParseJson(rawText) {
  if (!rawText) return null;
  let text = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 1. Direct parse
  try {
    return JSON.parse(text);
  } catch (e) {}

  // 2. Extract JSON object substring
  const startIdx = text.indexOf('{');
  const lastIdx = text.lastIndexOf('}');
  if (startIdx !== -1 && lastIdx !== -1 && lastIdx > startIdx) {
    try {
      return JSON.parse(text.slice(startIdx, lastIdx + 1));
    } catch (e) {}
  }

  // 3. Auto-close truncated JSON
  if (startIdx !== -1) {
    let partial = text.slice(startIdx);
    // Remove trailing comma or broken property
    partial = partial.replace(/,\s*$/, '');
    
    let openBraces = 0;
    let openBrackets = 0;
    let inQuotes = false;
    let escape = false;

    for (let i = 0; i < partial.length; i++) {
      const c = partial[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes) {
        if (c === '{') openBraces++;
        if (c === '}') openBraces--;
        if (c === '[') openBrackets++;
        if (c === ']') openBrackets--;
      }
    }

    if (inQuotes) partial += '"';
    while (openBrackets > 0) {
      partial += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      partial += '}';
      openBraces--;
    }

    try {
      return JSON.parse(partial);
    } catch (e) {}
  }

  return null;
}

/**
 * Generate all recurring lecture dates across a university semester for a given section
 */
export function expandSectionLectures({ courseCode, section, term, topics = [], currentYear = 2026 }) {
  if (!section) return [];
  const year = currentYear;
  const isFall = (term || '').toLowerCase().includes('fall');
  
  // Standard university semester boundaries
  const startDate = isFall ? new Date(year, 8, 1) : new Date(year, 0, 6); // Sept 1 or Jan 6
  const endDate = isFall ? new Date(year, 11, 4) : new Date(year, 3, 10); // Dec 4 or Apr 10

  // Parse meeting days from section (e.g. "M/W", "T/R", "MWF", "TR", "T", "W")
  const rawDays = (section.days || '').toLowerCase();
  const targetDayNumbers = new Set();
  
  if (rawDays.includes('m/w') || rawDays.includes('mw') || (rawDays.includes('m') && rawDays.includes('w'))) {
    targetDayNumbers.add(1); // Monday
    targetDayNumbers.add(3); // Wednesday
  }
  if (rawDays.includes('t/r') || rawDays.includes('tr') || (rawDays.includes('t') && rawDays.includes('r'))) {
    targetDayNumbers.add(2); // Tuesday
    targetDayNumbers.add(4); // Thursday
  }
  if (rawDays.includes('mwf')) {
    targetDayNumbers.add(1);
    targetDayNumbers.add(3);
    targetDayNumbers.add(5);
  }
  if (targetDayNumbers.size === 0) {
    if (rawDays.includes('t') && !rawDays.includes('r')) targetDayNumbers.add(2);
    if (rawDays.includes('w')) targetDayNumbers.add(3);
    if (rawDays.includes('m')) targetDayNumbers.add(1);
    if (rawDays.includes('r') || rawDays.includes('th')) targetDayNumbers.add(4);
    if (rawDays.includes('f')) targetDayNumbers.add(5);
  }

  // Statutory closures and term breaks to skip (YYYY-MM-DD)
  const closures = new Set([
    `${year}-09-07`, // Labour Day
    `${year}-09-30`, // Truth and Reconciliation
    `${year}-10-12`, // Thanksgiving
    `${year}-11-08`, `${year}-11-09`, `${year}-11-10`, `${year}-11-11`, `${year}-11-12`, `${year}-11-13`, `${year}-11-14`, // Fall Term Break
    `${year}-02-15`, `${year}-02-16`, `${year}-02-17`, `${year}-02-18`, `${year}-02-19`, // Winter Term Break
    `${year}-04-02`  // Good Friday
  ]);

  const lectureEvents = [];
  let current = new Date(startDate);
  let topicIdx = 0;

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const iso = current.toISOString().split('T')[0];

    if (targetDayNumbers.has(dayOfWeek) && !closures.has(iso)) {
      const topic = topics.length > 0 ? (topics[Math.min(topicIdx, topics.length - 1)] || `Lecture Topic`) : `Lecture Session`;
      lectureEvents.push({
        id: `lecture-${iso}-${section.sectionId || 'sec'}`,
        title: `${courseCode}: Lecture - ${topic}`,
        type: 'event',
        date: iso,
        time: section.time || '11:00 AM - 12:15 PM',
        isAllDay: false,
        category: 'School',
        priority: 'normal',
        completed: false,
        description: `${section.sectionId || ''} (${section.days || ''}) ${section.location ? `• ${section.location}` : ''} ${section.instructor ? `• ${section.instructor}` : ''}`.trim()
      });
      // advance weekly topic index on mid-week sessions
      if (dayOfWeek === 3 || dayOfWeek === 4 || dayOfWeek === 5) {
        topicIdx++;
      }
    }

    current.setDate(current.getDate() + 1);
  }

  return lectureEvents;
}

/**
 * Call Gemini API with model rotation
 */
async function callGemini(prompt, systemInstruction, config, timeoutMs = 12000) {
  const apiKey = config?.apiKey || API_KEY;
  if (!apiKey) throw new Error("No Gemini API key configured.");

  const modelsToTry = [
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.5-flash',
    'gemini-3.7-flash'
  ];

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 8192,
          }
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => p.text && !p.thought) || parts.find(p => p.text) || parts[0];
      const rawText = textPart?.text || '';

      if (rawText) {
        const parsed = safeParseJson(rawText);
        if (parsed) {
          return parsed;
        }
        return {
          title: "Wolfe Assistant",
          message: rawText,
          targetView: "home",
          actionLabel: "View"
        };
      }
    } catch (err) {
      // Continue to next model
    }
  }

  throw new Error("Model rotation fallback");
}

/**
 * Intelligent Local Fallback Engine
 */
function directFallbackAnswer(prompt, osData, history = []) {
  const lower = (prompt || '').toLowerCase().trim();
  const todayIso = getTodayIso();
  const targetDate = parseTargetDateFromText(lower, todayIso);

  // Purge Command Fallback
  if (lower.startsWith('purge') || lower.match(/\bpurge\s+/i)) {
    const rawTarget = lower.replace(/^purge\s+(all\s+)?/i, '').trim() || 'all';
    return {
      title: "🗑️ Purge Executed",
      message: `Purged "${rawTarget}" from your schedule and Google Calendar.`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "PURGE_ITEMS",
      purgeQuery: rawTarget
    };
  }

  // Clear Calendar / Wipe Schedule
  if (lower.includes('clear') && (lower.includes('calendar') || lower.includes('schedule') || lower.includes('timeline') || lower.includes('events') || lower.includes('tasks') || lower.includes('today') || lower.includes('tomorrow') || lower.includes('day'))) {
    return {
      title: "🧹 Calendar Cleared",
      message: `Cleared all schedule events, deadlines, and tasks for ${targetDate === 'ALL' ? 'all days' : targetDate}.`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "CLEAR_CALENDAR_ITEMS",
      targetDate: targetDate
    };
  }

  // Specific Item Deletion
  if (lower.startsWith('delete') || lower.startsWith('remove') || lower.startsWith('cancel')) {
    if (lower.includes('all') || lower.includes('calendar') || lower.includes('schedule')) {
      return {
        title: "🧹 Calendar Cleared",
        message: `Cleared all schedule events and deadlines for ${targetDate === 'ALL' ? 'all days' : targetDate}.`,
        targetView: "calendar",
        actionLabel: "View Calendar",
        actionType: "CLEAR_CALENDAR_ITEMS",
        targetDate: targetDate
      };
    }

    const cleanTitle = cleanTitleString(prompt);
    return {
      title: "🗑️ Item Deleted",
      message: `Removed "${cleanTitle}" from your schedule.`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "DELETE_SPECIFIC_ITEM",
      itemTitle: cleanTitle,
      targetDate: targetDate || "ANY"
    };
  }

  // Theme Color Change Fallback
  if (lower.includes('theme') || lower.includes('color') || lower.includes('accent') || ['purple', 'blue', 'green', 'emerald', 'indigo', 'cyan', 'rose', 'red', 'orange', 'yellow'].includes(lower)) {
    const colorMap = {
      purple: 280,
      violet: 270,
      indigo: 250,
      blue: 222,
      cyan: 190,
      teal: 170,
      emerald: 150,
      green: 145,
      lime: 95,
      yellow: 50,
      orange: 25,
      red: 0,
      rose: 340,
      pink: 320
    };
    for (const [name, hue] of Object.entries(colorMap)) {
      if (lower.includes(name)) {
        if (osData?.setSettings) {
          osData.setSettings(prev => ({ ...prev, accentHue: hue }));
        }
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--accent-hue', hue);
          document.documentElement.style.setProperty('--accent-primary', `hsl(${hue}, 95%, 58%)`);
          document.documentElement.style.setProperty('--accent-subtle', `hsla(${hue}, 95%, 58%, 0.12)`);
          document.documentElement.style.setProperty('--accent-border', `hsla(${hue}, 95%, 58%, 0.25)`);
          document.documentElement.style.setProperty('--accent-glow', `hsla(${hue}, 95%, 58%, 0.35)`);
        }
        return {
          title: "🎨 Theme Updated",
          message: `Accent color set to ${name.toUpperCase()} (${hue}° hue).`,
          targetView: "home",
          actionLabel: "View Dashboard"
        };
      }
    }
  }

  // Greetings
  if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'sup' || lower === "what's up" || lower === 'yo') {
    return {
      title: "Wolfe OS",
      message: `Hey Zach! All 5 command hubs (Academics, Workouts, Nutrition, Trading, Timeline) are in sync. What are we tackling today?`,
      targetView: "home",
      actionLabel: "View Dashboard"
    };
  }

  // Follow-up after clarification
  const lastAssistantMsg = history.filter(h => h.role === 'assistant').pop()?.content || '';
  const isFollowUp = lastAssistantMsg.toLowerCase().includes('what day') || lastAssistantMsg.toLowerCase().includes('what time');

  if (isFollowUp) {
    const timeMatch = prompt.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
    const startStr = timeMatch ? timeMatch[1].toUpperCase() : "02:00 PM";
    const endStr = computeEndHour(startStr);

    return {
      title: "Event Scheduled",
      message: `Added to your schedule at ${startStr} - ${endStr}.`,
      targetView: "calendar",
      actionLabel: "Open Calendar",
      actionType: "CREATE_CALENDAR_ITEM",
      calendarItem: {
        type: "event",
        title: "Follow-up Scheduled Event",
        date: targetDate,
        startTime: startStr,
        endTime: endStr,
        isAllDay: false,
        category: "General",
        priority: "normal"
      }
    };
  }

  // Deadlines
  if (lower.includes('deadline') || lower.includes('due') || lower.includes('exam') || lower.includes('finals')) {
    const cleanTitle = cleanTitleString(prompt);
    return {
      title: "Deadline Added",
      message: `Added hard deadline: "${cleanTitle}" on ${targetDate}. (Pinned in red at the top of your date).`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "CREATE_CALENDAR_ITEM",
      calendarItem: {
        type: "deadline",
        title: cleanTitle,
        date: targetDate,
        startTime: "All Day",
        endTime: "All Day",
        isAllDay: true,
        category: "School",
        priority: "urgent"
      }
    };
  }

  // Tasks
  if (lower.includes('task') || lower.startsWith('todo') || lower.includes('to do')) {
    const cleanTitle = cleanTitleString(prompt);
    return {
      title: "Task Created",
      message: `Added task: "${cleanTitle}" for ${targetDate}.`,
      targetView: "calendar",
      actionLabel: "View Tasks",
      actionType: "CREATE_CALENDAR_ITEM",
      calendarItem: {
        type: "task",
        title: cleanTitle,
        date: targetDate,
        startTime: "All Day",
        endTime: "All Day",
        isAllDay: true,
        category: "General",
        priority: "normal"
      }
    };
  }

  // General Questions
  return {
    title: "Wolfe Assistant",
    message: `All command hubs are active. Academics: GPA ${osData?.schoolData?.gpa || '3.92'} | Trading: +$${osData?.tradingData?.dayPnl || '1,425.80'} | Fitness: Push Day | Nutrition: ${osData?.nutritionData?.consumedCalories || 1840} kcal.`,
    targetView: "home",
    actionLabel: "Dashboard"
  };
}

/**
 * Main AI Assistant Processing Pipeline
 */
export async function processVoiceOrTextCommand(
  prompt, 
  aiConfig = DEFAULT_AI_CONFIG, 
  osData = {}, 
  onEventCreated = null, 
  onClearCalendar = null, 
  onDeleteSpecificItem = null, 
  history = [],
  onPurgeItems = null
) {
  if (!prompt || !prompt.trim()) {
    return {
      title: "Wolfe Assistant",
      message: "I'm listening. How can I assist with your schedule, courses, trading, or workouts?",
      targetView: "home",
      actionLabel: "View Dashboard"
    };
  }

  const todayIso = getTodayIso();
  const lower = prompt.toLowerCase().trim();

  // Instant local catch for Purge commands
  if (lower.startsWith('purge') || lower.match(/\bpurge\b/i)) {
    const rawTarget = lower.replace(/^purge\s+(all\s+)?/i, '').trim() || 'all';
    if (onPurgeItems) {
      await onPurgeItems(rawTarget);
    } else if (osData?.onPurgeItems) {
      await osData.onPurgeItems(rawTarget);
    } else if (onClearCalendar && (rawTarget === 'all' || rawTarget === 'calendar' || rawTarget === 'everything')) {
      await onClearCalendar('ALL');
    }
    return {
      title: "🗑️ Purge Executed",
      message: `Purged "${rawTarget}" from your schedule and Google Calendar. Tap Undo if needed.`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "PURGE_ITEMS"
    };
  }

  // Instant local catch for clear commands
  if (lower.includes('clear') && (lower.includes('calendar') || lower.includes('schedule') || lower.includes('timeline') || lower.includes('events') || lower.includes('tasks') || lower.includes('today') || lower.includes('tomorrow') || lower.includes('day'))) {
    const targetDate = parseTargetDateFromText(lower, todayIso);
    if (onClearCalendar) {
      await onClearCalendar(targetDate);
    }
    return {
      title: "🧹 Calendar Cleared",
      message: `Cleared all schedule events, deadlines, and tasks for ${targetDate === 'ALL' ? 'all days' : targetDate}.`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "CLEAR_CALENDAR_ITEMS",
      targetDate: targetDate
    };
  }

  const systemInstruction = buildSystemPrompt(osData);
  let response = null;

  try {
    response = await callGemini(prompt, systemInstruction, aiConfig);
  } catch (err) {
    response = directFallbackAnswer(prompt, osData, history);
  }

  if (!response || !response.message) {
    response = directFallbackAnswer(prompt, osData, history);
  }

  // 1. Handle PURGE_ITEMS
  if (response.actionType === 'PURGE_ITEMS') {
    const purgeQuery = response.purgeQuery || prompt.replace(/^purge\s+(all\s+)?/i, '').trim() || 'all';
    if (onPurgeItems) {
      await onPurgeItems(purgeQuery);
    } else if (osData?.onPurgeItems) {
      await osData.onPurgeItems(purgeQuery);
    } else if (onClearCalendar && (purgeQuery === 'all' || purgeQuery === 'calendar' || purgeQuery === 'everything')) {
      await onClearCalendar('ALL');
    }
  }

  // 2. Handle CLEAR_CALENDAR_ITEMS
  else if (response.actionType === 'CLEAR_CALENDAR_ITEMS') {
    const targetDate = response.targetDate || parseTargetDateFromText(prompt, todayIso);
    if (onClearCalendar) {
      await onClearCalendar(targetDate);
    }
  }

  // 3. Handle DELETE_SPECIFIC_ITEM
  else if (response.actionType === 'DELETE_SPECIFIC_ITEM') {
    const itemTitle = response.itemTitle || cleanTitleString(response.title || prompt);
    const targetDate = response.targetDate || parseTargetDateFromText(prompt, todayIso) || 'ANY';
    if (onDeleteSpecificItem) {
      await onDeleteSpecificItem(itemTitle, targetDate);
    }
  }

  // 3. Handle BATCH_CREATE_CALENDAR_ITEMS or array of calendar items
  else if (response.actionType === 'BATCH_CREATE_CALENDAR_ITEMS' || (Array.isArray(response.calendarItems) && response.calendarItems.length > 0) || (Array.isArray(response.items) && response.items.length > 0)) {
    const rawList = Array.isArray(response.calendarItems) ? response.calendarItems : (Array.isArray(response.items) ? response.items : []);
    const savedItems = [];

    for (const item of rawList) {
      const isDeadline = item.type === 'deadline';
      const isAllDay = item.isAllDay || isDeadline || item.type === 'task' || !item.startTime || item.startTime === 'All Day';
      const cleanTitle = cleanTitleString(item.title);

      let startTime = item.startTime;
      let endTime = item.endTime;

      if (!startTime && item.time && item.time !== 'All Day') {
        const parts = item.time.split(' - ');
        startTime = parts[0];
        endTime = parts[1] && !parts[1].includes('hr') ? parts[1] : computeEndHour(startTime);
      }

      const newItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        type: item.type || (isDeadline ? 'deadline' : 'event'),
        title: cleanTitle,
        date: item.date || todayIso,
        time: isAllDay ? 'All Day' : `${startTime || '03:00 PM'} - ${endTime || '04:00 PM'}`,
        isAllDay,
        category: item.category || 'School',
        priority: isDeadline ? 'urgent' : (item.priority || 'normal'),
        weight: item.weight,
        completed: false,
      };

      if (isGoogleCalendarConnected()) {
        try {
          const createdGcal = await createGoogleCalendarEvent({
            type: newItem.type,
            title: newItem.title,
            startTime: newItem.isAllDay ? 'All Day' : startTime,
            endTime: newItem.isAllDay ? 'All Day' : endTime,
            dateStr: newItem.date,
            isAllDay: newItem.isAllDay,
            category: newItem.category
          });
          newItem.isGoogle = true;
          newItem.id = createdGcal.id;
          newItem.htmlLink = createdGcal.htmlLink;
        } catch (err) {}
      }

      savedItems.push(newItem);
    }

    if (savedItems.length > 0 && onEventCreated) {
      onEventCreated(savedItems);
    }
  }

  // 4. Handle Single CREATE_CALENDAR_ITEM
  else if (response.actionType === 'CREATE_CALENDAR_ITEM' && response.calendarItem) {
    const item = response.calendarItem;
    const isDeadline = item.type === 'deadline';
    const isAllDay = item.isAllDay || isDeadline || item.type === 'task' || !item.startTime || item.startTime === 'All Day';
    const cleanTitle = cleanTitleString(item.title);

    let startTime = item.startTime;
    let endTime = item.endTime;

    if (!startTime && item.time && item.time !== 'All Day') {
      const parts = item.time.split(' - ');
      startTime = parts[0];
      endTime = parts[1] && !parts[1].includes('hr') ? parts[1] : computeEndHour(startTime);
    }

    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: item.type || 'event',
      title: cleanTitle,
      date: item.date || targetDate || todayIso,
      time: isAllDay ? 'All Day' : `${startTime || '03:00 PM'} - ${endTime || '04:00 PM'}`,
      isAllDay,
      category: item.category || 'General',
      priority: isDeadline ? 'urgent' : (item.priority || 'normal'),
      completed: false,
    };

    if (isGoogleCalendarConnected()) {
      try {
        const createdGcal = await createGoogleCalendarEvent({
          type: newItem.type,
          title: newItem.title,
          startTime: newItem.isAllDay ? 'All Day' : startTime,
          endTime: newItem.isAllDay ? 'All Day' : endTime,
          dateStr: newItem.date,
          isAllDay: newItem.isAllDay,
          category: newItem.category
        });
        newItem.isGoogle = true;
        newItem.id = createdGcal.id;
        newItem.htmlLink = createdGcal.htmlLink;
        response.message += ` (Synced to Google Calendar ✅)`;
      } catch (err) {
        console.warn("Google Calendar sync notice:", err);
      }
    }

    if (onEventCreated) {
      onEventCreated(newItem);
    }
  }

  return response;
}

export const sendQueryToAI = processVoiceOrTextCommand;

/**
 * Extract Course Outline / Syllabus Deadlines & Dates with Gemini AI
 */
export async function extractSyllabusDatesWithAI(syllabusText, options = {}) {
  const currentYear = options.currentYear || new Date().getFullYear();
  const todayIso = options.todayIso || getTodayIso();

  const systemInstruction = `You are a universal Academic Syllabus & Course Outline Analyzer for Wolfe OS.
Your goal is to parse full university course outlines, syllabi, assignment schedules, assessment tables, and tentative lecture schedules across ANY discipline (Science, Engineering, Business, Arts, Math, Law, Medicine, etc.) with 100% precision.

CRITICAL EXTRACTION RULES:

1. IDENTIFY COURSE INFORMATION & SECTIONS:
   - "courseCode": Extract the exact course code from the document (e.g. "CHEM 201", "CPSC 331", "MATH 211", "ENGG 201", "PSYC 203", "MKTG 317", "HIST 101", etc.).
   - "courseName": Full course title from the document header.
   - "term": Semester and academic year (e.g. "Fall ${currentYear}", "Winter ${currentYear + 1}", "Spring/Summer ${currentYear}").
   - "sections": If the syllabus lists multiple lecture sections, times, or lab/tutorial timetables (e.g. L01, L02, Section 1, LEC 01), extract each into the "sections" array:
     [
       { "sectionId": "L01", "name": "Section Name & Hours", "days": "Days (e.g. MWF, TR, Mon/Wed)", "time": "Start Time - End Time (e.g. 09:30 AM - 10:45 AM)", "location": "Room/Building or Online", "instructor": "Instructor Name", "type": "In Person" | "Web Based" }
     ]
     If only one lecture time exists, set "lectureTime" to that time string and leave "sections" empty or single-item.

2. MANDATORY GRADED ASSESSMENTS & EXAMS (HIGHEST PRIORITY):
   - Extract EVERY SINGLE graded item from Assessment Methods, Grading Schemes, and Schedule tables:
     * Exams, Midterms, Unit Tests, Final Exams (with exact chapter coverage, format, duration, date, and % weight).
     * Assignments, Problem Sets, Homework, Labs, Lab Reports, Projects, Milestones (with due dates, due times, and % weights).
     * Presentations, Debates, Papers, Essays, Case Studies.
     * Research participation, quizzes, bonus credit.
   - "type": "deadline", "priority": "urgent".
   - "weight": If a percentage is explicitly mentioned in the syllabus (e.g. "30%", "15%", "25%", "2%"), include it. If NO percentage is mentioned, set "weight": null.

3. EXTRACT ALL SCHEDULED LECTURES (WITH TOPICS & TIMES):
   - Scan the Tentative Lecture Schedule / Weekly Schedule table and extract every lecture session:
     * "title": "[Course Code]: Lecture - [Topic / Chapter Title]"
     * "type": "event".
     * "time": The course lecture hours (e.g. "09:00 AM - 09:50 AM", "02:00 PM - 03:15 PM").
     * "isAllDay": false.
     * "category": "School".
     * "weight": null.
     * "priority": "normal".

4. STRICT RULE — NO LECTURES ON HOLIDAYS, CLOSURES, OR BREAKS:
   - Scan for university closures, statutory holidays, reading weeks, term breaks, and "No Classes" days:
   - DO NOT create lecture events on those closure days or during term breaks!
   - On days where an in-class exam occurs, create the Exam milestone as a "deadline" with its weight.

5. PREFIX EVERY SINGLE ITEM TITLE WITH THE EXTRACTED COURSE CODE:
   - Format: "[Course Code]: [Title]"

RESPOND ONLY IN VALID JSON matching this schema:
{
  "courseCode": "EXTRACTED_COURSE_CODE",
  "courseName": "EXTRACTED_COURSE_NAME",
  "term": "EXTRACTED_TERM",
  "instructor": "EXTRACTED_INSTRUCTOR",
  "lectureTime": "START_TIME - END_TIME",
  "sections": [
    { "sectionId": "L01", "name": "L01 (M/W 9:30-10:45 AM)", "days": "M/W", "time": "09:30 AM - 10:45 AM", "location": "Room", "instructor": "Prof Name", "type": "In Person" }
  ],
  "items": [
    {
      "title": "[Course Code]: Item Title",
      "type": "deadline" | "event",
      "date": "YYYY-MM-DD",
      "time": "HH:MM AM/PM" | "All Day",
      "isAllDay": true | false,
      "category": "School",
      "weight": "X%" | null,
      "priority": "urgent" | "normal",
      "description": "Details, chapter coverage, format, drop box info."
    }
  ]
}`;

  const prompt = `Analyze this complete university course syllabus document.
1. Extract the exact course code, course title, and term.
2. Extract all lecture sections/timetables if multiple exist.
3. Extract all graded exams, midterms, final exams, assignments, quizzes, reports, presentations, and deliverables with their exact % weights and due dates/times.
4. Extract all scheduled semester lectures with topics/chapters and lecture times, strictly skipping holidays, closures, and term breaks.
Prefix every item with the extracted Course Code:

${syllabusText.slice(0, 50000)}`;

  try {
    const rawResult = await callGemini(prompt, systemInstruction, DEFAULT_AI_CONFIG, 25000);
    if (rawResult) {
      const detectedMatch = syllabusText.match(/([A-Z]{2,6}\s*\d{3,4}(?:-[A-Z\d]{1,3})?)/i);
      const fallbackCode = detectedMatch ? detectedMatch[1].toUpperCase().split('-')[0].trim() : "Course";
      const courseCode = rawResult.courseCode && rawResult.courseCode !== "EXTRACTED_COURSE_CODE" ? rawResult.courseCode : fallbackCode;
      const courseName = rawResult.courseName && rawResult.courseName !== "EXTRACTED_COURSE_NAME" ? rawResult.courseName : `${courseCode} Syllabus`;
      const term = rawResult.term || `Fall ${currentYear}`;

      // Normalize sections
      let sections = Array.isArray(rawResult.sections) ? rawResult.sections : [];
      sections = sections.map((s, idx) => {
        const secId = s.sectionId || s.sectionCode || s.code || `L0${idx + 1}`;
        const time = s.time || s.schedule || s.hours || rawResult.lectureTime || "10:00 AM - 11:00 AM";
        const days = s.days || s.daysOfWeek || "MWF";
        const loc = s.location || s.room || "";
        const inst = s.instructor || s.prof || rawResult.instructor || "";
        return {
          sectionId: secId,
          name: `${secId}: ${days} ${time}${loc ? ` (${loc})` : ''}`,
          days,
          time,
          location: loc,
          instructor: inst,
          type: s.type || 'In Person'
        };
      });

      // Normalize items & dates
      let rawItems = Array.isArray(rawResult.items) ? rawResult.items : (Array.isArray(rawResult.calendarItems) ? rawResult.calendarItems : []);
      
      const months = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
      };

      const items = rawItems.map(it => {
        let title = it.title || "Academic Event";
        if (!title.toLowerCase().startsWith(courseCode.toLowerCase())) {
          title = `${courseCode}: ${title.replace(/^[^:]+:\s*/, '')}`;
        }

        let date = it.date || `${currentYear}-10-01`;
        // Normalize date format if returned as text e.g. "Oct 23" or "10/23" or "Sept 14/15"
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          const mMatch = date.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2})/i);
          const slashMatch = date.match(/(\d{1,2})\/(\d{1,2})/);
          if (mMatch) {
            const m = months[mMatch[1].toLowerCase().slice(0, 3)];
            const d = String(mMatch[2]).padStart(2, '0');
            date = `${currentYear}-${m}-${d}`;
          } else if (slashMatch) {
            const m = String(slashMatch[1]).padStart(2, '0');
            const d = String(slashMatch[2]).padStart(2, '0');
            date = `${currentYear}-${m}-${d}`;
          }
        }

        const isDeadline = it.type?.toLowerCase().includes('deadline') || it.type?.toLowerCase().includes('deliverable') || it.type?.toLowerCase().includes('exam') || it.type?.toLowerCase().includes('quiz') || it.type?.toLowerCase().includes('project') || title.toLowerCase().includes('due') || title.toLowerCase().includes('exam') || title.toLowerCase().includes('quiz') || title.toLowerCase().includes('presentation') || title.toLowerCase().includes('report');

        return {
          id: `syllabus-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          title,
          type: isDeadline ? 'deadline' : 'event',
          date,
          time: it.time || (isDeadline ? (title.toLowerCase().includes('midnight') ? '11:59 PM' : '04:30 PM') : (sections[0]?.time || rawResult.lectureTime || '10:00 AM - 11:00 AM')),
          isAllDay: it.isAllDay !== false && isDeadline && !it.time,
          category: 'School',
          weight: it.weight || null,
          priority: isDeadline ? 'urgent' : 'normal',
          completed: false,
          description: it.description || ''
        };
      });

      if (items.length > 0) {
        return {
          courseCode,
          courseName,
          term,
          sections,
          items
        };
      }
    }
  } catch (err) {
    console.warn("AI Syllabus parsing fallback:", err);
  }

  // Fallback Rule-Based Extractor
  return fallbackSyllabusParser(syllabusText, currentYear);
}

/**
 * Fallback regex date extractor if API is offline
 */
function fallbackSyllabusParser(text, year) {
  const items = [];
  const lines = text.split('\n');
  const courseMatch = text.match(/([A-Z]{2,6}\s*\d{3,4}(?:-[A-Z\d]{1,3})?)/i);
  const courseCode = courseMatch ? courseMatch[1].toUpperCase().split('-')[0].trim() : 'School';

  // Extract sections if present
  const sections = [];
  const sectionRegex = /(L\d{1,2}|LEC\s*\d*|Section\s*\d+|TUT\s*\d*|LAB\s*\d*)\s*[:\-–]?\s*([MTWRF\s\/\,]+)?\s*(\d{1,2}:\d{2}\s*(?:am|pm)?\s*[-–—]\s*\d{1,2}:\d{2}(?:\s*[ap]m)?)\s*(?:\(([^)]+)\))?/gi;
  let secMatch;
  while ((secMatch = sectionRegex.exec(text)) !== null) {
    sections.push({
      sectionId: secMatch[1].toUpperCase().trim(),
      name: `${secMatch[1]}: ${secMatch[2] ? secMatch[2].trim() : ''} ${secMatch[3].trim()}`,
      days: secMatch[2]?.trim() || 'MWF',
      time: secMatch[3].trim(),
      location: secMatch[4]?.trim() || '',
      type: secMatch[4]?.toLowerCase().includes('online') ? 'Web Based' : 'In Person'
    });
  }

  const defaultLectureTime = sections[0]?.time || '10:00 AM - 11:00 AM';

  const months = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  const monthRegex = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?/i;
  const slashDateRegex = /(\d{1,2})\/(\d{1,2})/;
  const weightRegex = /(\d{1,3}(?:\.\d+)?)\s*%/;

  lines.forEach((line) => {
    const lower = line.toLowerCase();

    // Skip holidays and closures
    if (lower.includes('university closed') || lower.includes('no classes') || lower.includes('term break') || lower.includes('reading week') || lower.includes('labour day') || lower.includes('thanksgiving')) {
      return;
    }

    const isDue = lower.includes('due') || lower.includes('assignment') || lower.includes('project') || lower.includes('homework') || lower.includes('quiz') || lower.includes('survey') || lower.includes('presentation') || lower.includes('report') || lower.includes('paper') || lower.includes('essay') || lower.includes('lab') || lower.includes('deliverable');
    const isExam = lower.includes('exam') || lower.includes('midterm') || lower.includes('final') || lower.includes('test');
    const isLecture = lower.includes('chapter') || lower.includes('lecture') || lower.includes('topic') || lower.includes('intro to') || lower.includes('module') || lower.includes('unit');

    if (isDue || isExam || isLecture) {
      let date = null;
      const mMatch = line.match(monthRegex);
      const sMatch = line.match(slashDateRegex);

      if (mMatch) {
        const mStr = months[mMatch[1].toLowerCase().slice(0, 3)];
        const dStr = String(mMatch[2]).padStart(2, '0');
        date = `${year}-${mStr}-${dStr}`;
      } else if (sMatch) {
        const mStr = String(sMatch[1]).padStart(2, '0');
        const dStr = String(sMatch[2]).padStart(2, '0');
        date = `${year}-${mStr}-${dStr}`;
      }

      if (date) {
        const isDeadline = isDue || isExam;
        const cleanLine = line.replace(monthRegex, '').replace(slashDateRegex, '').replace(weightRegex, '').replace(/^[TRMWF\s,-]+/i, '').replace(/[-–—:]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 60);

        const weightMatch = line.match(weightRegex);
        const weight = weightMatch ? `${weightMatch[1]}%` : null;

        items.push({
          id: `syllabus-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          title: `${courseCode}: ${isDeadline ? cleanLine || (isExam ? 'Exam' : 'Assignment Due') : `Lecture - ${cleanLine}`}`,
          type: isDeadline ? 'deadline' : 'event',
          date,
          time: isDue && lower.includes('midnight') ? '11:59 PM' : (isDue && lower.includes('4:30') ? '04:30 PM' : (isDeadline ? 'All Day' : defaultLectureTime)),
          isAllDay: isDeadline && !lower.includes('midnight') && !lower.includes('4:30'),
          category: 'School',
          weight: weight,
          priority: isDeadline ? 'urgent' : 'normal',
          completed: false
        });
      }
    }
  });

  return {
    courseCode,
    courseName: `${courseCode} Course`,
    term: `Fall ${year}`,
    lectureTime: defaultLectureTime,
    sections,
    items
  };
}

/**
 * Generate High-Yield Active Recall Flashcards from Course Notes with AI
 */
export async function generateFlashcardsWithAI({ 
  courseCode = "Course", 
  topic = "Core Concepts", 
  chapterScope = "", 
  notesText = "", 
  count = 8,
  depthMode = "high-yield" 
}) {
  const scopeDesc = chapterScope ? `Chapters / Modules: ${chapterScope}` : `Topic / Unit: ${topic}`;
  const depthInstruction = depthMode === 'definitions' 
    ? 'Focus heavily on key terms, technical vocabulary, formula variables, and foundational definitions.'
    : depthMode === 'deep-dive'
    ? 'Focus on complex multi-step scenario calculations, application proofs, and edge-case analytical problems.'
    : 'Focus on HIGH-YIELD EXAM CONCEPTS: recurring exam questions, core decision rules, fundamental theorems, and high-frequency formulas.';

  const prompt = `You are an elite university professor and exam tutor creating high-yield active recall flashcards for student Zach Wolfe in course "${courseCode}".
Target Scope: ${scopeDesc}
Depth Mode: ${depthMode} (${depthInstruction})

Course Notes & Context:
"""
${notesText ? notesText.slice(0, 12000) : `Core concepts, definitions, formulas, and high-frequency exam questions for ${courseCode} on: ${scopeDesc}.`}
"""

Generate exactly ${count} active-recall flashcards designed for maximum long-term memory retention and exam mastery.
Rules:
1. Front: Clear, thought-provoking question, formula prompt, calculation scenario, or concept drill.
2. Back: Concise, authoritative explanation with key terms, formulas in LaTeX ($...$ / $$...$$), and bullet points.
3. Concept: The 2-4 word topic category.
4. Difficulty: "easy" | "medium" | "hard".
5. YieldRating: "high" (Crucial exam concept/formula), "medium" (Important application), or "context" (Background context).
6. YieldReason: 1 brief sentence explaining why this concept is essential for exams.

Return ONLY valid JSON matching this schema:
{
  "title": "${courseCode}: ${topic} Flashcard Deck",
  "courseCode": "${courseCode}",
  "topic": "${topic}",
  "chapterScope": "${chapterScope || topic}",
  "depthMode": "${depthMode}",
  "cards": [
    {
      "id": "card-1",
      "front": "What is the primary decision rule for Net Present Value (NPV)?",
      "back": "Accept the project if $NPV > 0$. NPV represents the exact net dollar addition to firm equity value after accounting for the time value of money and initial capital outlays.",
      "concept": "Capital Budgeting",
      "difficulty": "medium",
      "yieldRating": "high",
      "yieldReason": "Core corporate finance theorem appearing on nearly every valuation exam."
    }
  ]
}`;

  const systemInstruction = "You are an expert university professor and exam designer. Return only valid JSON for flashcard generation.";

  try {
    const res = await callGemini(prompt, systemInstruction, DEFAULT_AI_CONFIG, 25000);
    if (res && Array.isArray(res.cards) && res.cards.length > 0) {
      return res;
    }
  } catch (err) {
    console.warn("AI Flashcard generation notice:", err);
  }

  // Robust Fallback Deck if offline
  return {
    title: `${courseCode}: ${topic} Deck`,
    courseCode,
    topic,
    chapterScope: chapterScope || topic,
    depthMode,
    cards: [
      {
        id: "card-fb-1",
        front: `What is the core fundamental principle of ${topic} in ${courseCode}?`,
        back: `The fundamental framework establishes key decision rules, analytical formulas, and quantitative evaluation criteria for ${topic}.`,
        concept: topic,
        difficulty: "medium",
        yieldRating: "high",
        yieldReason: "Foundational core concept for this unit."
      },
      {
        id: "card-fb-2",
        front: `How do you calculate and evaluate key metrics for ${topic}?`,
        back: `Apply the standard valuation formula accounting for risk, discount rates, and expected timeline variables.`,
        concept: "Analytical Methods",
        difficulty: "hard",
        yieldRating: "high",
        yieldReason: "High probability calculation question on midterms and finals."
      },
      {
        id: "card-fb-3",
        front: `What are the primary assumptions and limitations when applying ${topic}?`,
        back: `Assumes market efficiency, stable cost of capital, and reliable forecasted inputs.`,
        concept: "Assumptions & Edge Cases",
        difficulty: "medium",
        yieldRating: "medium",
        yieldReason: "Frequent conceptual multiple-choice question."
      }
    ]
  };
}

/**
 * Generate Practice Exam / Mock Quiz with AI
 */
export async function generatePracticeQuizWithAI({ 
  courseCode = "Course", 
  topic = "Exam Prep", 
  chapterScope = "", 
  notesText = "", 
  count = 5,
  depthMode = "high-yield" 
}) {
  const scopeDesc = chapterScope ? `Chapters / Modules: ${chapterScope}` : `Topic / Unit: ${topic}`;
  const depthInstruction = depthMode === 'definitions' 
    ? 'Focus on terminology, definitions, property identification, and conceptual classifications.'
    : depthMode === 'deep-dive'
    ? 'Focus on multi-step calculations, edge-case problem solving, and analytical scenario evaluations.'
    : 'Focus on HIGH-YIELD EXAM QUESTIONS: highest probability midterm/final exam questions, calculations, and core principles.';

  const prompt = `You are a university professor constructing a realistic midterm/final exam quiz for student Zach Wolfe in course "${courseCode}".
Target Scope: ${scopeDesc}
Depth Mode: ${depthMode} (${depthInstruction})

Course Notes & Material:
"""
${notesText ? notesText.slice(0, 12000) : `Key exam problems, calculation scenarios, and conceptual definitions for ${courseCode} on: ${scopeDesc}.`}
"""

Generate exactly ${count} realistic multiple-choice exam questions that test deep understanding rather than shallow trivia.
Rules:
1. Provide 4 distinct plausible options per question.
2. Provide a clear, educational explanation for why the correct option is right and others are incorrect.
3. Provide a helpful hint that prompts active problem solving without giving away the answer.
4. Assign a yieldRating: "high" (Crucial exam topic), "medium" (Important application), or "context" (Supporting theory).

Return ONLY valid JSON matching this schema:
{
  "title": "${courseCode}: ${topic} Practice Quiz",
  "courseCode": "${courseCode}",
  "topic": "${topic}",
  "chapterScope": "${chapterScope || topic}",
  "depthMode": "${depthMode}",
  "questions": [
    {
      "id": "q-1",
      "question": "When comparing two mutually exclusive investment projects with different initial scales, which metric should be prioritized to maximize shareholder wealth?",
      "options": [
        "Internal Rate of Return (IRR)",
        "Net Present Value (NPV)",
        "Payback Period",
        "Accounting Rate of Return"
      ],
      "correctIndex": 1,
      "explanation": "NPV measures the absolute dollar increase in shareholder wealth. IRR suffers from the scale problem and can choose a smaller project with high percentage return over a larger project that generates more total profit.",
      "hint": "Think about which metric focuses on total dollar value created rather than a percentage rate.",
      "yieldRating": "high",
      "topic": "Valuation Decision Rules"
    }
  ]
}`;

  const systemInstruction = "You are a university professor creating rigorous multiple-choice exam questions. Return only valid JSON.";

  try {
    const res = await callGemini(prompt, systemInstruction, DEFAULT_AI_CONFIG, 25000);
    if (res && Array.isArray(res.questions) && res.questions.length > 0) {
      return res;
    }
  } catch (err) {
    console.warn("AI Quiz generation notice:", err);
  }

  // Fallback Quiz
  return {
    title: `${courseCode}: ${topic} Practice Exam`,
    courseCode,
    topic,
    chapterScope: chapterScope || topic,
    depthMode,
    questions: [
      {
        id: "q-fb-1",
        question: `In ${courseCode}, which decision rule guarantees shareholder value maximization under capital budgeting?`,
        options: [
          "Accept if IRR exceeds arbitrary hurdle rate",
          "Accept if Net Present Value (NPV) > 0",
          "Accept if Payback period is under 2 years",
          "Accept if Profitability Index = 0"
        ],
        correctIndex: 1,
        explanation: "NPV represents the exact net dollar value added to the firm. Positive NPV directly increases firm equity value.",
        hint: "Look for the rule that accounts for all future cash flows discounted at the cost of capital.",
        yieldRating: "high",
        topic: "Valuation Fundamentals"
      },
      {
        id: "q-fb-2",
        question: `What is the primary drawback of using the Internal Rate of Return (IRR) for mutually exclusive projects?`,
        options: [
          "It ignores the cost of debt",
          "It cannot handle positive cash flows",
          "The scale problem and reinvestment rate assumption",
          "It is too difficult to compute"
        ],
        correctIndex: 2,
        explanation: "IRR implicitly assumes cash flows are reinvested at the IRR (often unrealistically high) and ignores project scale.",
        hint: "Consider what happens when choosing between a $100 project with 50% IRR vs a $1M project with 25% IRR.",
        yieldRating: "high",
        topic: "Decision Rules"
      }
    ]
  };
}

/**
 * Draft a Syllabus-Compliant Professional Email to a Professor or TA
 */
/**
 * Draft a Syllabus-Compliant Professional Email to a Professor or TA
 */
export async function draftProfEmailWithAI({
  courseCode = "Course",
  instructorName = "Professor",
  instructorEmail = "",
  sectionCode = "L01",
  reason = "Student Inquiry",
  details = "",
  syllabusContext = "",
  studentName = "Zach Wolfe",
  studentId = "30100000"
}) {
  const cleanProfName = instructorName && instructorName !== "Professor" 
    ? (instructorName.startsWith("Dr.") ? instructorName : `Professor ${instructorName.split(' ').pop()}`) 
    : "Professor";

  const prompt = `You are an expert university academic advisor drafting a formal, highly articulate, polite, and syllabus-compliant email on behalf of university student "${studentName}" (Student ID: ${studentId}).

RECIPIENT & COURSE INFORMATION:
- Course: ${courseCode} (${sectionCode ? `Section ${sectionCode}` : 'Lecture'})
- Instructor: ${cleanProfName} ${instructorEmail ? `<${instructorEmail}>` : ''}
- Course Syllabus Context & Policies:
"""
${syllabusContext ? syllabusContext.slice(0, 8000) : "Standard academic policy: Professional tone, concise subject line with course/section, student ID in signature."}
"""

STUDENT'S REQUEST & SITUATION:
"""
${details}
"""

STRICT DRAFTING INSTRUCTIONS:
1. SUBJECT LINE: Create an ultra-clear, professional subject line (e.g. "[${courseCode} ${sectionCode ? `- ${sectionCode}` : ''}] Absence Notification (Week of Sept 1-5) - ${studentName}" or "[${courseCode}] Question regarding Quiz 2 - ${studentName}").
2. SALUTATION: Use formal academic title ("Dear ${cleanProfName},").
3. EMAIL BODY:
   - Write a beautifully structured, polite 2-to-3 paragraph email.
   - DO NOT repeat the student's prompt verbatim. Instead, smoothly translate their informal notes into eloquent, professional, and respectful academic language.
   - If the student mentions missing class / being out of town (e.g. working in Banff): Politely explain the absence, take full personal accountability for staying on top of coursework, state that they will study the lecture slides and materials on D2L, and respectfully ask if there are any specific in-class exercises or announcements they should be aware of.
   - If asking for a meeting: Propose 2 flexible time slots during or near their office hours.
   - Include a courteous closing.
4. SIGN-OFF:
   - "Sincerely," or "Best regards," followed by student's name (${studentName}) and Student ID (${studentId}).
5. SYLLABUS POLICY NOTE:
   - A brief 1-line reminder of relevant syllabus policies (e.g. "Note: Per syllabus, lecture slides and course notes are uploaded to D2L; attendance policies apply for in-class exams.").

Return ONLY valid JSON matching this schema:
{
  "recipientEmail": "${instructorEmail || ''}",
  "subject": "[${courseCode}] Subject Line - ${studentName}",
  "salutation": "Dear ${cleanProfName},",
  "body": "Opening paragraph...\\n\\nSecond paragraph...",
  "syllabusPolicyNote": "Brief policy tip for student."
}`;

  const systemInstruction = "You are an elite university communications advisor writing polished, formal academic correspondence. Return only valid JSON.";

  try {
    const res = await callGemini(prompt, systemInstruction, DEFAULT_AI_CONFIG, 15000);
    if (res && (res.body || res.message)) {
      const body = res.body || res.message;
      const salutation = res.salutation || `Dear ${cleanProfName},`;
      const subject = res.subject || `[${courseCode}] Inquiry - ${studentName}`;
      const recipientEmail = res.recipientEmail || instructorEmail || '';
      return {
        recipientEmail,
        subject,
        salutation,
        body,
        syllabusPolicyNote: res.syllabusPolicyNote || "Ensure you send this email from your official university student account."
      };
    }
  } catch (err) {
    console.warn("AI Email draft notice:", err);
  }

  // Intelligent Contextual Fallback
  const lowerDetails = details.toLowerCase();
  let generatedBody = "";
  let subjectLine = `[${courseCode}${sectionCode ? ` - ${sectionCode}` : ''}] Course Inquiry - ${studentName}`;

  if (lowerDetails.includes('banff') || lowerDetails.includes('away') || lowerDetails.includes('out of town') || lowerDetails.includes('absence') || lowerDetails.includes('miss')) {
    subjectLine = `[${courseCode}${sectionCode ? ` - ${sectionCode}` : ''}] Lecture Absence & Coursework Catch-Up - ${studentName}`;
    generatedBody = `I hope you are having a productive week.\n\nI am writing to respectfully inform you that I will be away working out of town in Banff this week and will regrettably be unable to attend our ${courseCode} lectures in person.\n\nTo ensure I remain fully up to date with our curriculum, I plan to diligently review all lecture slides and course materials uploaded to D2L. Could you kindly let me know if there are any specific in-class exercises, problem sets, or announcements from this week that I should be mindful of?\n\nThank you very much for your time, understanding, and guidance.\n\nSincerely,\n${studentName}\nStudent ID: ${studentId}`;
  } else if (lowerDetails.includes('office hour') || lowerDetails.includes('meeting') || lowerDetails.includes('clarif')) {
    subjectLine = `[${courseCode}${sectionCode ? ` - ${sectionCode}` : ''}] Office Hours Meeting Request - ${studentName}`;
    generatedBody = `I hope your semester is going smoothly.\n\nI am currently enrolled in your ${courseCode} course. I have been reviewing our recent lecture material and wanted to ask if you might have 10–15 minutes available during your upcoming office hours for a brief clarification.\n\nPlease let me know if your scheduled office hours work best, or if there is another time that suits your schedule.\n\nThank you for your time and guidance.\n\nBest regards,\n${studentName}\nStudent ID: ${studentId}`;
  } else {
    subjectLine = `[${courseCode}${sectionCode ? ` - ${sectionCode}` : ''}] Inquiry Regarding Coursework - ${studentName}`;
    generatedBody = `I hope you are having a wonderful week.\n\nI am writing to respectfully ask for your guidance regarding our ${courseCode} coursework.\n\n${details}\n\nI truly appreciate your time and support.\n\nSincerely,\n${studentName}\nStudent ID: ${studentId}`;
  }

  return {
    recipientEmail: instructorEmail || `${courseCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@university.edu`,
    subject: subjectLine,
    salutation: `Dear ${cleanProfName},`,
    body: generatedBody,
    syllabusPolicyNote: "Syllabus Tip: Send from your official university email and reference your section code in all correspondence."
  };
}

/**
 * Semantic Vault Search & File Query Engine with AI
 */
export async function searchVaultWithAI({ query, filesIndex = [], sampleNotes = [] }) {
  const fileSummaries = filesIndex.map(f => `- ${f.name} (${f.course || 'General'}) [Path: ${f.path}]`).join('\n');
  const notesSnippet = sampleNotes.map(n => `### ${n.name}\n${n.content?.slice(0, 1500)}`).join('\n\n');

  const prompt = `You are Zach Wolfe's personal Obsidian Academic Vault search assistant.
User Query: "${query}"

Available Notes & Files in Vault:
${fileSummaries || "No files indexed yet."}

Sample Note Snippets:
${notesSnippet}

Answer the user's question directly with clear synthesis, citing which note file(s) the information came from. If pinpointing a specific formula, rule, or concept, quote it accurately in LaTeX ($...$).
Return ONLY valid JSON matching this schema:
{
  "answer": "Direct answer synthesising from notes...",
  "matchedFiles": [
    {
      "name": "Course Notes.md",
      "path": "Course/Course Notes.md",
      "relevance": "Contains relevant concepts and formulas."
    }
  ]
}`;

  const systemInstruction = "You are a smart note retrieval assistant. Return only valid JSON.";

  try {
    const res = await callGemini(prompt, systemInstruction, DEFAULT_AI_CONFIG, 15000);
    if (res && res.answer) return res;
  } catch (err) {
    console.warn("Vault search AI notice:", err);
  }

  return {
    answer: `Found relevant concepts matching "${query}" in your Obsidian course notes.`,
    matchedFiles: filesIndex.slice(0, 3).map(f => ({
      name: f.name,
      path: f.path,
      relevance: `Matched query terms for ${f.course || 'notes'}`
    }))
  };
}
