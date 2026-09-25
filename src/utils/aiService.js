/**
 * Wolfe OS — Core Intelligence Engine
 */

import { 
  isGoogleCalendarConnected, 
  createGoogleCalendarEvent, 
  deleteGoogleCalendarEvent, 
  clearGoogleCalendarEventsForDate,
  getGoogleAccount
} from './googleCalendarService.js';
import { getTodayIso, addDays, formatDateTitle } from './calendarUtils.js';
import { 
  parseCalendarCommand, 
  parseTargetDate, 
  normalizeCalendarDate, 
  extractCleanTitle,
  parseTimeToMinutes,
  normalizeSpokenTimes
} from './calendarParser.js';
import { 
  parseMealDescription, 
  calculateCaloriesFromMacros, 
  buildAiCalibrationPrompt, 
  buildAiPantryPrompt, 
  calibrateBoneInMeats, 
  calibrateMealItems,
  isPureMilkItem,
  isFoodLogQuery,
  isFoodRemovalQuery,
  createMealEntry,
  aggregateDailyNutrition
} from './nutritionEngine.js';
import { recordAdditionOrUpdate, recordDeletion, markLocalMutation, triggerImmediateCloudPush } from './cloudSyncEngine.js';
import { getVaultMetadata, getCachedVaultFiles } from './obsidianService.js';

const API_KEY = import.meta.env?.VITE_GEMINI_API_KEY || '';

export const DEFAULT_AI_CONFIG = {
  provider: 'gemini',
  apiKey: API_KEY,
  model: 'gemini-3.5-flash-lite',
  voiceResponse: false,
};

/**
 * System prompt
 */
export const buildSystemPrompt = (osData) => {
  const todayIso = getTodayIso();
  const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  // 1. Calendar & Schedule Snapshot
  const calendarItems = osData?.calendarData?.items || [];
  const todayItems = calendarItems.filter(it => it.date === todayIso);
  const todayDeadlines = todayItems.filter(it => it.type === 'deadline');
  const todayEvents = todayItems.filter(it => it.type === 'event');
  const todayTasks = todayItems.filter(it => it.type === 'task');
  const upcomingDeadlines = calendarItems
    .filter(it => it.type === 'deadline' && it.date > todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  // 2. Nutrition Snapshot
  const consumedCal = osData?.nutritionData?.consumedCalories || 0;
  const targetCal = osData?.nutritionData?.targetCalories || 3000;
  const proteinConsumed = osData?.nutritionData?.consumedProtein || 0;
  const proteinTarget = osData?.nutritionData?.targetProtein || 180;
  const carbsConsumed = osData?.nutritionData?.consumedCarbs || 0;
  const carbsTarget = osData?.nutritionData?.targetCarbs || 300;
  const fatConsumed = osData?.nutritionData?.consumedFat || 0;
  const fatTarget = osData?.nutritionData?.targetFats || osData?.nutritionData?.fats?.target || 80;
  const todayIsoBrief = getTodayIso();
  const loggedMeals = (osData?.nutritionData?.meals || []).filter(m => m?.date === todayIsoBrief);

  // 3. Obsidian Vault & Networked Thought Knowledge Base Snapshot
  let vaultMeta = { connected: false, totalNotes: 0, folderName: null, courses: [] };
  let vaultFiles = [];
  try {
    vaultMeta = getVaultMetadata();
    const cached = getCachedVaultFiles();
    vaultFiles = cached.files || [];
  } catch (e) {}

  const account = typeof getGoogleAccount === 'function' ? getGoogleAccount() : null;
  const userName = account?.name || "User";
  const userFirst = userName.split(' ')[0];

  return `You are Wolfe OS, the private, high-performance executive intelligence engine.

USER PROFILE:
- Name: ${userName} (address as ${userFirst}).
- Role: Executive, student, and operator.
- Operating Style: Values efficiency, precision, clear actionability, zero fluff, and high intellectual rigor.
- Tone: Sharp, proactive, articulate, supportive, and executive-level customized.

CURRENT TIME & DATE:
- Date: ${todayIso} (${formatDateTitle(todayIso)})
- Day: ${dayOfWeek}
- Local Time: ${timeStr}

LIVE SYSTEM STATE & OPERATIONAL AWARENESS ACROSS ALL 3 COMMAND HUBS:

1. SCHEDULE & TIMELINE (TODAY & UPCOMING):
- Hard Deadlines Today:
${todayDeadlines.map(d => `  • 🚨 [DEADLINE] ${d.title} (${d.time || 'End of Day'})`).join('\n') || '  • No hard deadlines today.'}
- Events & Scheduled Blocks Today:
${todayEvents.map(e => `  • 🕒 [EVENT] ${e.title} (${e.time || 'Scheduled'})`).join('\n') || '  • No scheduled events today.'}
- Tasks Today:
${todayTasks.map(t => `  • [${t.completed ? 'COMPLETED' : 'TODO'}] ${t.title}`).join('\n') || '  • No pending tasks today.'}
- Upcoming Deadlines (Next 7 Days):
${upcomingDeadlines.map(u => `  • ${u.date}: ${u.title}`).join('\n') || '  • No upcoming deadlines in the next week.'}

2. NUTRITION & MACROS:
- Daily Calorie Budget: ${consumedCal} / ${targetCal} kcal (${Math.max(0, targetCal - consumedCal)} kcal remaining)
- Protein: ${proteinConsumed}g / ${proteinTarget}g (${Math.max(0, proteinTarget - proteinConsumed)}g remaining)
- Carbohydrates: ${carbsConsumed}g / ${carbsTarget}g | Fats: ${fatConsumed}g / ${fatTarget}g
- Today's Logged Meals: ${loggedMeals.map(m => `${m.name} (${m.calories} kcal)`).join(', ') || 'No meals logged yet today'}

SYSTEM INTERACTION DIRECTIVES:
- You have 100% full situational awareness of the user's operational cockpit across all 3 hubs: Home Hub, Calendar & Timeline, and Nutrition.
- When asked about schedule, tasks, or nutrition, provide direct executive answers with exact numbers, timestamps, and actionable clarity.
- CALENDAR & SCHEDULING MANDATE:
  • When asked to add, create, schedule, or log an event, deadline, task, reminder, exam, meeting, or workout, ALWAYS set "actionType": "CREATE_CALENDAR_ITEM" (or "BATCH_CREATE_CALENDAR_ITEMS" for multiple).
  • Set "date" strictly to "YYYY-MM-DD" formatted string (Today is ${todayIso}, tomorrow is ${addDays(todayIso, 1)}).
  • HIGH-PRECISION TIMING & CONTEXT INTELLIGENCE:
    - Conversational & unpunctuated number pairs like "6 30", "8 49", "10 15", "12 30", "2 15" are ALWAYS clock times (e.g. 06:30, 08:49, 10:15, 12:30, 02:15). They are NEVER course numbers or title artifacts!
    - Speech-to-text pauses like "6 for finance 30" or "finance 6 30" mean the subject is "Finance" scheduled at 6:30.
    - AM vs PM contextual resolution:
      * Academic classes, lectures, exams (Finance, FNCE, Econ, Stat, Math, Accounting, Chemistry, etc.) between 8:00 and 11:59 default to AM (e.g. "finance at 9 30" -> 09:30 AM). Afternoon classes between 1:00 and 6:59 default to PM (e.g. "finance at 6 30" -> 06:30 PM).
      * Athletic training, gym, workouts, lifting, cardio between 4:00 and 9:00 default to PM (e.g. "gym at 6 30" -> 06:30 PM).
      * Meals: Dinner, drinks, evening hangouts default to PM. Breakfast, morning coffee default to AM.
      * Standard waking hours: 1:00-6:59 default to PM; 8:00-11:59 default to AM; 7:00 defaults to PM unless "morning" or "breakfast" is stated.
  • Clean Entity Title: Strip all command verbs ("add", "schedule", "create"), relative dates ("today", "tomorrow", "next Monday"), prepositions ("at", "for", "on", "from", "to"), and time markers ("at 5pm", "6 30", "6:30", "from 2 to 4pm"). NEVER include time digits in the title (e.g. "Finance 30" or "6 for finance 30" -> title MUST BE "Finance"). Example: "Add finance 6 30" -> title: "Finance", startTime: "06:30 PM", endTime: "07:30 PM", category: "School".
  • For deadlines/exams: type: "deadline", isAllDay: true, priority: "urgent" (exams, midterms, finals, project submissions, assignment due dates).
  • For timed events: type: "event", startTime: "HH:MM AM/PM", endTime: "HH:MM AM/PM", isAllDay: false (meetings, classes, workouts, dinners, doctor appointments).
  • For tasks/reminders: type: "task" or "reminder", isAllDay: true.
- FOOD & NUTRITION LOGGING MANDATE (CRITICAL):
  • When the user asks to "add ____" (or "log ____", "had ____", "ate ____") and it refers to food, meals, ingredients, drinks, protein shakes, or calories (e.g. "add 2 eggs and toast", "add chicken and rice", "add a protein shake", "add 500 cals", "add chipotle bowl", "add an apple", "add lunch: turkey sandwich"):
    - THIS IS STRICTLY A NUTRITION FOOD LOG, NEVER A CALENDAR EVENT OR SCHEDULE ITEM!
    - DO NOT create a calendarItem or use CREATE_CALENDAR_ITEM.
    - Set "actionType": "LOG_MEAL".
    - Set "targetView": "nutrition".
    - Set "actionLabel": "View Nutrition".
    - Provide a "meal" object with:
      {
        "name": "Concise Descriptive Title (e.g. 2 Eggs & Whole Wheat Toast)",
        "slot": "breakfast" | "lunch" | "dinner" | "snack" | "meal",
        "calories": number (total kcal),
        "protein": number (grams),
        "carbs": number (grams),
        "fats": number (grams),
        "items": [
          { "name": "Item Name", "portion": "portion description", "calories": number, "protein": number, "carbs": number, "fats": number }
        ]
      }
    - Set "message": e.g. "Logged 2 Eggs & Toast: 304 kcal | 18.6g P | 30.8g C | 11.6g F to your daily nutrition."
- FORMATTING MANDATE: Present responses with executive polish. Never output escaped or doubled quote artifacts (avoid \"\" or \"\"\"). Never wrap your whole message in outer quotes. Use clean bullet points and bold headers (**Heading:**) for multi-point answers.
- WIKILINK & NETWORKED THOUGHT MANDATE: When referencing courses, study notes, formula sheets, or calendar dates, use Obsidian [[wikilink]] syntax (e.g. [[FNCE 317]], [[WACC]], [[Daily/${todayIso}]]). Wolfe OS converts these into interactive clickable buttons.

ACTIONS:
1. "CREATE_CALENDAR_ITEM": For adding a single deadline (red all-day), timed event, task, or reminder.
2. "BATCH_CREATE_CALENDAR_ITEMS": For adding multiple deadlines, events, tasks, exam schedules, or course milestones at once. Provide "calendarItems" array.
3. "CLEAR_CALENDAR_ITEMS": When asked to clear or wipe the calendar for today, tomorrow, all days, or a specific date. Provide "targetDate": "YYYY-MM-DD" or "ALL".
4. "DELETE_SPECIFIC_ITEM": For deleting a specific item by name/title. Provide "itemTitle" and optional "targetDate".
5. "LOG_MEAL": For logging food, meals, ingredients, drinks, snacks, or calories/macros to daily nutrition. Provide "meal" object.
6. "ASK_CLARIFICATION": When time/date is missing.

RESPOND ONLY IN VALID JSON:
{
  "title": "Short 2-3 word topic title",
  "message": "Direct executive response text",
  "targetView": "home" | "calendar" | "nutrition",
  "actionLabel": "Button Label",
  "actionType": "CREATE_CALENDAR_ITEM" | "BATCH_CREATE_CALENDAR_ITEMS" | "CLEAR_CALENDAR_ITEMS" | "DELETE_SPECIFIC_ITEM" | "LOG_MEAL" | "ASK_CLARIFICATION",
  "targetDate": "YYYY-MM-DD" (or "ALL"),
  "itemTitle": "Title to delete if actionType is DELETE_SPECIFIC_ITEM",
  "calendarItem": {
    "type": "deadline" | "event" | "task" | "reminder",
    "title": "Clean Entity Title",
    "date": "YYYY-MM-DD",
    "startTime": "HH:MM AM/PM",
    "endTime": "HH:MM AM/PM",
    "isAllDay": true/false,
    "category": "School" | "Fitness" | "Nutrition" | "General",
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
      "category": "School" | "Fitness" | "Nutrition" | "General",
      "priority": "urgent" | "normal",
      "weight": "30%" (optional)
    }
  ],
  "meal": {
    "name": "Meal Title",
    "slot": "breakfast" | "lunch" | "dinner" | "snack" | "meal",
    "calories": 340,
    "protein": 32,
    "carbs": 38,
    "fats": 7,
    "items": [
      { "name": "Grilled Chicken Breast", "portion": "100g (3.5 oz)", "calories": 165, "protein": 31, "carbs": 0, "fats": 3.6 },
      { "name": "Steamed White Rice", "portion": "120g (0.75 cup)", "calories": 155, "protein": 3.2, "carbs": 34, "fats": 0.4 },
      { "name": "Steamed Broccoli", "portion": "60g", "calories": 20, "protein": 1.5, "carbs": 4, "fats": 0.2 }
    ]
  }
}
`;
};

/**
 * Normalizes AI output text to remove duplicate quotes, escaped quotes, and empty artifacts
 */
export function cleanAiMessage(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();

  // 1. Strip outermost redundant surrounding quotes (single or doubled): e.g. ""Text"" -> Text or "Text" -> Text
  text = text.replace(/^["'`“‘]{1,2}([\s\S]*?)["'`”’]{1,2}$/, '$1').trim();

  // 2. Fix duplicated/nested quotes: ""Text"" -> "Text", \"\" -> "
  text = text.replace(/""([^"]+?)""/g, '"$1"');
  text = text.replace(/\\"+/g, '"');
  text = text.replace(/""+/g, '"');

  // 3. Fix empty quotes artifact: e.g. 'at "" for today' or 'purge ""'
  text = text.replace(/\s*""\s*/g, ' ');

  // 4. Fix accidental quotes before/after punctuation: e.g. " ," -> ","
  text = text.replace(/"\s+([,.?!])/g, '$1');

  return text.trim();
}

function cleanTitleString(raw) {
  return extractCleanTitle(raw);
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
  return parseTargetDate(text, todayIso);
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
export async function callGemini(prompt, systemInstruction, config, timeoutMs = 12000) {
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
          if (parsed.message) parsed.message = cleanAiMessage(parsed.message);
          return parsed;
        }
        return {
          title: "Wolfe Assistant",
          message: cleanAiMessage(rawText),
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
export function directFallbackAnswer(prompt, osData, history = []) {
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

  // Food & Nutrition Removal Fallback
  if (isFoodRemovalQuery(lower)) {
    const cleanFoodQuery = lower
      .replace(/^(?:remove|delete|cancel|drop|clear|purge|undo|subtract|-)\s+/i, '')
      .replace(/\s+(?:from\s+(?:my\s+)?(?:nutrition|food|diet|meals?|log|today))$/i, '')
      .trim();
    const calTargetMatch = lower.match(/\b(\d{2,4})\s*(?:cal|calories|kcal)\b/i);
    const targetCal = calTargetMatch ? parseInt(calTargetMatch[1], 10) : null;
    return {
      title: "🍽️ Nutrition Adjustment",
      message: targetCal ? `Subtracted ${targetCal} kcal from today's nutrition total.` : `Removed "${cleanFoodQuery}" from today's nutrition.`,
      targetView: "nutrition",
      actionLabel: "View Nutrition",
      actionType: "REMOVE_NUTRITION_ITEM",
      targetCal,
      cleanFoodQuery
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

  // Food & Nutrition Fallback (Guarantees food is logged and never scheduled as a calendar event)
  if (isFoodLogQuery(lower)) {
    const cleanFoodQuery = lower.replace(/^(?:log|add|record|track|ate|had|eating|eat)\s+(?:food|meal|breakfast|lunch|dinner|snack)?\s*[:\-]?\s*/i, '').trim();
    let slot = 'meal';
    if (/\bbreakfast\b/i.test(lower)) slot = 'breakfast';
    else if (/\blunch\b/i.test(lower)) slot = 'lunch';
    else if (/\bdinner\b/i.test(lower)) slot = 'dinner';
    else if (/\bsnack\b/i.test(lower)) slot = 'snack';

    const parsedMeal = parseMealDescription(cleanFoodQuery || lower, {
      kitchenCalibration: osData?.nutritionData?.kitchenCalibration,
      householdPantry: osData?.nutritionData?.householdPantry
    });

    if (parsedMeal && parsedMeal.items && parsedMeal.items.length > 0) {
      return {
        title: "🍽️ Meal Logged",
        message: `Logged ${parsedMeal.name}: ${parsedMeal.calories} kcal | ${parsedMeal.protein}g P | ${parsedMeal.carbs}g C | ${parsedMeal.fats}g F.`,
        targetView: "nutrition",
        actionLabel: "View Nutrition",
        actionType: "LOG_MEAL",
        meal: {
          name: parsedMeal.name,
          slot,
          calories: parsedMeal.calories,
          protein: parsedMeal.protein,
          carbs: parsedMeal.carbs,
          fats: parsedMeal.fats,
          items: parsedMeal.items
        }
      };
    }
  }

  // Calendar Scheduling / Add Command Fallback
  const calCmd = parseCalendarCommand(prompt, todayIso);
  if (calCmd && calCmd.isCalendarCommand) {
    const isDeadline = calCmd.type === 'deadline';
    const isTaskOrReminder = calCmd.type === 'task' || calCmd.type === 'reminder';
    const timeLabel = calCmd.isAllDay ? 'All Day' : calCmd.time;
    const dateLabel = calCmd.date === todayIso ? 'today' : (calCmd.date === addDays(todayIso, 1) ? 'tomorrow' : calCmd.date);

    return {
      title: isDeadline ? "🚨 Deadline Added" : (calCmd.type === 'task' ? "📋 Task Created" : (calCmd.type === 'reminder' ? "⏰ Reminder Set" : "📅 Event Scheduled")),
      message: isDeadline 
        ? `Added hard deadline: "${calCmd.title}" on ${calCmd.date}. (Pinned in red at the top of your day).`
        : isTaskOrReminder
          ? `Added ${calCmd.type}: "${calCmd.title}" for ${dateLabel}.`
          : `Added event "${calCmd.title}" on ${dateLabel} (${timeLabel}).`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "CREATE_CALENDAR_ITEM",
      calendarItem: {
        type: calCmd.type,
        title: calCmd.title,
        date: calCmd.date,
        startTime: calCmd.startTime,
        endTime: calCmd.endTime,
        time: calCmd.time,
        isAllDay: calCmd.isAllDay,
        category: calCmd.category,
        priority: calCmd.priority,
        completed: false
      }
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
    const account = typeof getGoogleAccount === 'function' ? getGoogleAccount() : null;
    const userFirst = account?.name ? account.name.split(' ')[0] : 'there';
    return {
      title: "Wolfe OS",
      message: `Hey ${userFirst}! All 3 command hubs (Home Hub, Calendar, Nutrition) are in sync. What are we tackling today?`,
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

  // 6. SCHEDULE & AGENDA INQUIRIES
  if (lower.includes('schedule') || lower.includes('agenda') || lower.includes('what do i have') || lower.includes('my day') || (lower.includes('today') && !lower.includes('eat'))) {
    const calendarItems = osData?.calendarData?.items || [];
    const todayItems = calendarItems.filter(it => it.date === todayIso);
    const deadlines = todayItems.filter(it => it.type === 'deadline');
    const events = todayItems.filter(it => it.type === 'event');
    const tasks = todayItems.filter(it => it.type === 'task' && !it.completed);

    let summaryParts = [];
    if (deadlines.length > 0) summaryParts.push(`${deadlines.length} hard deadline${deadlines.length > 1 ? 's' : ''} (${deadlines.map(d => d.title).join(', ')})`);
    if (events.length > 0) summaryParts.push(`${events.length} event${events.length > 1 ? 's' : ''} (${events.map(e => `${e.title} at ${e.time || 'scheduled'}`).join(', ')})`);
    if (tasks.length > 0) summaryParts.push(`${tasks.length} pending task${tasks.length > 1 ? 's' : ''}`);

    if (summaryParts.length > 0) {
      return {
        title: "📅 Today's Schedule",
        message: `Today you have ${summaryParts.join('; ')}. Stay locked in.`,
        targetView: "calendar",
        actionLabel: "Open Calendar"
      };
    } else {
      return {
        title: "📅 Schedule Clear",
        message: "Your schedule is clear for today! No hard deadlines or timed events on the calendar.",
        targetView: "calendar",
        actionLabel: "View Calendar"
      };
    }
  }

  // 7. NUTRITION & CALORIE INQUIRIES
  if (lower.includes('calorie') || lower.includes('calories') || lower.includes('macro') || lower.includes('nutrition') || lower.includes('protein') || lower.includes('carbs') || lower.includes('food') || lower.includes('eat')) {
    const consumed = osData?.nutritionData?.consumedCalories || 0;
    const target = osData?.nutritionData?.targetCalories || 3000;
    const remaining = Math.max(0, target - consumed);
    const protein = osData?.nutritionData?.consumedProtein || 0;
    const proteinTarget = osData?.nutritionData?.targetProtein || 180;
    return {
      title: "🥗 Nutrition Tracker",
      message: `You've consumed ${consumed} of ${target} kcal (${remaining} kcal remaining). Protein is at ${protein}g / ${proteinTarget}g.`,
      targetView: "nutrition",
      actionLabel: "Log Food"
    };
  }

  // General Questions
  return {
    title: "Wolfe OS",
    message: `All 3 command hubs are synchronized: Schedule: Active | Nutrition: ${osData?.nutritionData?.consumedCalories || 0} / ${osData?.nutritionData?.targetCalories || 3000} kcal.`,
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
      message: "I'm listening. How can I assist with your schedule, tasks, or nutrition?",
      targetView: "home",
      actionLabel: "View Dashboard"
    };
  }

  // Pre-process prompt to normalize spoken times and unpunctuated number pairs (e.g. "finance 6 30" -> "finance at 6:30")
  const normalizedPrompt = normalizeSpokenTimes(prompt);
  const todayIso = getTodayIso();
  const lower = normalizedPrompt.toLowerCase().trim();

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

  // Instant local catch for food logging commands (e.g. "add 2 eggs and toast", "add chicken and rice")
  if (isFoodLogQuery(lower)) {
    const cleanFoodQuery = lower.replace(/^(?:log|add|record|track|ate|had|eating|eat)\s+(?:food|meal|breakfast|lunch|dinner|snack)?\s*[:\-]?\s*/i, '').trim();
    let slot = 'meal';
    if (/\bbreakfast\b/i.test(lower)) slot = 'breakfast';
    else if (/\blunch\b/i.test(lower)) slot = 'lunch';
    else if (/\bdinner\b/i.test(lower)) slot = 'dinner';
    else if (/\bsnack\b/i.test(lower)) slot = 'snack';

    const localMeal = parseMealDescription(cleanFoodQuery || lower, {
      kitchenCalibration: osData?.nutritionData?.kitchenCalibration,
      householdPantry: osData?.nutritionData?.householdPantry
    });

    if (localMeal && localMeal.items && localMeal.items.length > 0) {
      const mealEntry = createMealEntry({
        date: todayIso,
        name: localMeal.name,
        slot,
        calories: localMeal.calories,
        protein: localMeal.protein,
        carbs: localMeal.carbs,
        fats: localMeal.fats,
        items: localMeal.items
      });

      recordAdditionOrUpdate(mealEntry.id);
      markLocalMutation();

      if (osData?.onLogMeal) {
        osData.onLogMeal(mealEntry);
      } else if (osData?.setNutritionData) {
        let currentNut = {};
        try {
          const raw = localStorage.getItem('wolfe_nutrition_data');
          if (raw) currentNut = JSON.parse(raw);
        } catch (e) {}

        const nextMeals = [mealEntry, ...(currentNut.meals || [])];
        const todayMeals = nextMeals.filter(m => m.date === todayIso);
        const totals = aggregateDailyNutrition(todayMeals);
        const nextData = {
          ...currentNut,
          currentDate: todayIso,
          consumedCalories: totals.calories,
          protein: { ...(currentNut.protein || {}), current: totals.protein },
          carbs: { ...(currentNut.carbs || {}), current: totals.carbs },
          fats: { ...(currentNut.fats || {}), current: totals.fats },
          meals: nextMeals,
          updatedAt: Date.now()
        };

        try {
          localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
        } catch (e) {}

        osData.setNutritionData(nextData);
        triggerImmediateCloudPush(80);
      }

      return {
        title: "🍽️ Meal Logged",
        message: `Logged ${localMeal.name}: ${localMeal.calories} kcal | ${localMeal.protein}g P | ${localMeal.carbs}g C | ${localMeal.fats}g F.`,
        targetView: "nutrition",
        actionLabel: "View Nutrition",
        actionType: "LOG_MEAL",
        meal: mealEntry
      };
    }
  }

  const systemInstruction = buildSystemPrompt(osData);
  let response = null;

  try {
    response = await callGemini(normalizedPrompt, systemInstruction, aiConfig);
  } catch (err) {
    response = directFallbackAnswer(normalizedPrompt, osData, history);
  }

  if (!response || !response.message) {
    response = directFallbackAnswer(normalizedPrompt, osData, history);
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
      const delResult = await onDeleteSpecificItem(itemTitle, targetDate);
      if (delResult && delResult.success && delResult.item) {
        response.message = `Removed "${delResult.item.title}" from calendar.`;
      } else if (delResult && delResult.success === false) {
        response.message = `Couldn't find "${itemTitle}" in calendar.`;
      }
    }
  }

  // 3.1 Handle REMOVE_NUTRITION_ITEM
  else if (response.actionType === 'REMOVE_NUTRITION_ITEM') {
    let currentNut = osData?.nutritionData;
    if (!currentNut || !Array.isArray(currentNut.meals)) {
      try {
        const raw = localStorage.getItem('wolfe_nutrition_data');
        if (raw) currentNut = JSON.parse(raw);
      } catch (e) {}
    }
    currentNut = (currentNut && typeof currentNut === 'object') ? currentNut : {};
    const mealsList = Array.isArray(currentNut.meals) ? currentNut.meals : [];
    const todayMeals = mealsList.filter(m => m && m.date === todayIso);
    const targetCal = response.targetCal;
    const cleanFoodQuery = (response.cleanFoodQuery || '').toLowerCase();

    let mealToRemove = null;
    if (targetCal !== null && todayMeals.length > 0) {
      mealToRemove = todayMeals.find(m => Math.abs((Number(m.calories) || 0) - targetCal) <= 5);
    }
    if (!mealToRemove && cleanFoodQuery && todayMeals.length > 0) {
      mealToRemove = todayMeals.find(m => (m.name || '').toLowerCase().includes(cleanFoodQuery) || cleanFoodQuery.includes((m.name || '').toLowerCase()));
    }

    if (mealToRemove) {
      const nextMeals = mealsList.filter(m => m.id !== mealToRemove.id);
      const remainingToday = nextMeals.filter(m => m.date === todayIso);
      const totals = aggregateDailyNutrition(remainingToday);
      const nextData = {
        ...currentNut,
        currentDate: todayIso,
        consumedCalories: totals.calories,
        protein: { ...(currentNut.protein || {}), current: totals.protein },
        carbs: { ...(currentNut.carbs || {}), current: totals.carbs },
        fats: { ...(currentNut.fats || {}), current: totals.fats },
        meals: nextMeals,
        updatedAt: Date.now()
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      if (osData?.setNutritionData) osData.setNutritionData(nextData);
      if (mealToRemove.id) recordDeletion(mealToRemove.id);
      markLocalMutation();
      triggerImmediateCloudPush(80);
      response.message = `Removed "${mealToRemove.name}" (${mealToRemove.calories} kcal) from today's nutrition.`;
    } else if (targetCal !== null && (currentNut.consumedCalories || 0) > 0) {
      const newCalories = Math.max(0, (currentNut.consumedCalories || 0) - targetCal);
      const nextData = {
        ...currentNut,
        currentDate: todayIso,
        consumedCalories: newCalories,
        updatedAt: Date.now()
      };
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}
      if (osData?.setNutritionData) osData.setNutritionData(nextData);
      markLocalMutation();
      triggerImmediateCloudPush(80);
      response.message = `Subtracted ${targetCal} kcal from today's nutrition total.`;
    } else {
      response.message = `Couldn't find "${response.cleanFoodQuery || 'item'}" in today's nutrition log.`;
    }
  }

  // 3. Handle BATCH_CREATE_CALENDAR_ITEMS or array of calendar items
  else if (response.actionType === 'BATCH_CREATE_CALENDAR_ITEMS' || (Array.isArray(response.calendarItems) && response.calendarItems.length > 0) || (Array.isArray(response.items) && response.items.length > 0)) {
    const rawList = Array.isArray(response.calendarItems) ? response.calendarItems : (Array.isArray(response.items) ? response.items : []);
    const savedItems = [];

    for (const item of rawList) {
      const isDeadline = item.type === 'deadline';
      const isAllDay = item.isAllDay || isDeadline || item.type === 'task' || !item.startTime || item.startTime === 'All Day';
      const cleanTitle = extractCleanTitle(item.title || prompt);
      const normalizedDate = normalizeCalendarDate(item.date, todayIso);

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
        date: normalizedDate,
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
    const cleanTitle = extractCleanTitle(item.title || prompt);
    const normalizedDate = normalizeCalendarDate(item.date, todayIso);

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
      date: normalizedDate,
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

  // 5. Handle LOG_MEAL from Gemini AI
  else if (response.actionType === 'LOG_MEAL' && response.meal) {
    const meal = response.meal;
    let slot = meal.slot || 'meal';
    if (/\bbreakfast\b/i.test(prompt)) slot = 'breakfast';
    else if (/\blunch\b/i.test(prompt)) slot = 'lunch';
    else if (/\bdinner\b/i.test(prompt)) slot = 'dinner';
    else if (/\bsnack\b/i.test(prompt)) slot = 'snack';

    const mealEntry = createMealEntry({
      date: meal.date || todayIso,
      name: meal.name || 'Logged Meal',
      slot,
      calories: Number(meal.calories) || 0,
      protein: Number(meal.protein) || 0,
      carbs: Number(meal.carbs) || 0,
      fats: Number(meal.fats) || 0,
      items: Array.isArray(meal.items) ? meal.items : []
    });

    recordAdditionOrUpdate(mealEntry.id);
    markLocalMutation();

    if (osData?.onLogMeal) {
      osData.onLogMeal(mealEntry);
    } else if (osData?.setNutritionData) {
      let currentNut = {};
      try {
        const raw = localStorage.getItem('wolfe_nutrition_data');
        if (raw) currentNut = JSON.parse(raw);
      } catch (e) {}

      const nextMeals = [mealEntry, ...(currentNut.meals || [])];
      const todayMeals = nextMeals.filter(m => m.date === todayIso);
      const totals = aggregateDailyNutrition(todayMeals);
      const nextData = {
        ...currentNut,
        currentDate: todayIso,
        consumedCalories: totals.calories,
        protein: { ...(currentNut.protein || {}), current: totals.protein },
        carbs: { ...(currentNut.carbs || {}), current: totals.carbs },
        fats: { ...(currentNut.fats || {}), current: totals.fats },
        meals: nextMeals,
        updatedAt: Date.now()
      };

      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(nextData));
      } catch (e) {}

      osData.setNutritionData(nextData);
      triggerImmediateCloudPush(80);
    }
  }

  if (response && response.message) {
    response.message = cleanAiMessage(response.message);
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

  const prompt = `You are an elite university professor and exam tutor creating high-yield active recall flashcards for course "${courseCode}".
Target Scope: ${scopeDesc}
Depth Mode: ${depthMode} (${depthInstruction})

Course Notes & Context:
"""
${notesText ? notesText.slice(0, 30000) : `Core concepts, definitions, formulas, and high-frequency exam questions for ${courseCode} on: ${scopeDesc}.`}
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
      if (!res.sourcesUsed || res.sourcesUsed.length === 0) {
        const docMatches = [...(notesText || '').matchAll(/(?:\[Document:\s*|Document:\s*)([^\]\n]+)/gi)].map(m => m[1].trim());
        res.sourcesUsed = Array.from(new Set(docMatches));
      }
      return res;
    }
  } catch (err) {
    console.warn("AI Flashcard generation notice:", err);
  }

  // Robust Fallback Deck if offline
  const fallbackSources = Array.from(new Set([...(notesText || '').matchAll(/(?:\[Document:\s*|Document:\s*)([^\]\n]+)/gi)].map(m => m[1].trim())));
  return {
    title: `${courseCode}: ${topic} Deck`,
    courseCode,
    topic,
    chapterScope: chapterScope || topic,
    depthMode,
    sourcesUsed: fallbackSources,
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

  const prompt = `You are a university professor constructing a realistic midterm/final exam quiz for course "${courseCode}".
Target Scope: ${scopeDesc}
Depth Mode: ${depthMode} (${depthInstruction})

Course Notes, Lecture Slides & Documents:
"""
${notesText ? notesText.slice(0, 30000) : `Key exam problems, calculation scenarios, and conceptual definitions for ${courseCode} on: ${scopeDesc}.`}
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
      if (!res.sourcesUsed || res.sourcesUsed.length === 0) {
        const docMatches = [...(notesText || '').matchAll(/(?:\[Document:\s*|Document:\s*)([^\]\n]+)/gi)].map(m => m[1].trim());
        res.sourcesUsed = Array.from(new Set(docMatches));
      }
      return res;
    }
  } catch (err) {
    console.warn("AI Quiz generation notice:", err);
  }

  // Fallback Quiz
  const fallbackSources = Array.from(new Set([...(notesText || '').matchAll(/(?:\[Document:\s*|Document:\s*)([^\]\n]+)/gi)].map(m => m[1].trim())));
  return {
    title: `${courseCode}: ${topic} Practice Exam`,
    courseCode,
    topic,
    chapterScope: chapterScope || topic,
    depthMode,
    sourcesUsed: fallbackSources,
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
 * Generate a Comprehensive, Highly Dense Exam Formula & Cheat Sheet with AI
 */
export async function generateCheatSheetWithAI({
  courseCode = "Course",
  title = "",
  chapterScope = "All Chapters & Outlines",
  modules = ['formulas', 'definitions', 'rules', 'traps'],
  notesText = ""
}) {
  const prompt = `You are an elite university professor and exam prep author creating the ultimate, high-density Formula & Exam Cheat Sheet for "${courseCode}".

CUSTOM SCOPE & TOPICS REQUESTED:
- Course: ${courseCode}
- Focus Scope / Chapters: ${chapterScope}
- Requested Modules: ${modules.join(', ')}

COURSE NOTES, LECTURE SLIDES & STUDY MATERIAL:
"""
${notesText ? notesText.slice(0, 35000) : `Standard ${courseCode} curriculum: Core formulas, definitions, decision frameworks, calculation steps, and exam traps.`}
"""

STRICT INSTRUCTIONS:
1. Extract and synthesize all critical formulas, variable breakdowns, decision rules, definitions, and tricky exam traps directly from the lecture slides, course materials, and the scope "${chapterScope}".
2. Include exact mathematical formulas (clean mathematical notation or LaTeX e.g. "$$ROE = \\frac{\\text{Net Income}}{\\text{Sales}} \\times \\dots$$"), clearly defining every single variable (e.g. "E = Market Value of Equity, Rd = Pre-tax Cost of Debt").
3. Include critical decision criteria (e.g. "Accept project if NPV > 0", "Choose supplier with lowest Total Cost of Ownership").
4. Highlight common student exam mistakes and how to avoid them.
5. Organize into clear, logical sections.

Return ONLY valid JSON matching this schema:
{
  "title": "${title || `${courseCode} Formula & Cheat Sheet`}",
  "courseCode": "${courseCode}",
  "chapterScope": "${chapterScope}",
  "sections": [
    {
      "category": "Key Formulas & Equations",
      "items": [
        {
          "name": "Weighted Average Cost of Capital (WACC)",
          "formula": "WACC = (E/V * Re) + (D/V * Rd * (1 - Tc))",
          "variables": "E = Equity, D = Debt, V = E + D, Re = Cost of Equity, Rd = Cost of Debt, Tc = Tax Rate",
          "notes": "Use market values, not book values. Tax shield applies only to debt."
        }
      ]
    },
    {
      "category": "Decision Rules & Frameworks",
      "items": [
        {
          "name": "NPV vs. IRR Decision Rule",
          "rule": "Accept if NPV > 0. If ranking mutually exclusive projects, prioritize NPV over IRR.",
          "notes": "IRR assumes reinvestment at IRR; NPV assumes reinvestment at the cost of capital."
        }
      ]
    },
    {
      "category": "Core Definitions & Terms",
      "items": [
        {
          "term": "Systematic Risk (Beta)",
          "definition": "Non-diversifiable market-wide risk. Compensated under CAPM."
        }
      ]
    },
    {
      "category": "Common Exam Traps & Pitfalls",
      "items": [
        {
          "trap": "APR to EAR Conversion",
          "correction": "Always convert nominal rates before discounting periodic cash flows: EAR = (1 + APR/m)^m - 1."
        }
      ]
    }
  ]
}`;

  const systemInstruction = "You are a university academic master generating dense, accurate, exam-grade formula and cheat sheets. Return only valid JSON.";

  try {
    const res = await callGemini(prompt, systemInstruction, DEFAULT_AI_CONFIG, 30000);
    if (res && Array.isArray(res.sections) && res.sections.length > 0) {
      if (!res.sourcesUsed || res.sourcesUsed.length === 0) {
        const docMatches = [...(notesText || '').matchAll(/(?:\[Document:\s*|Document:\s*)([^\]\n]+)/gi)].map(m => m[1].trim());
        res.sourcesUsed = Array.from(new Set(docMatches));
      }
      return res;
    }
  } catch (err) {
    console.warn("AI Cheat Sheet generation notice:", err);
  }

  // Fallback Cheat Sheet
  const fallbackSources = Array.from(new Set([...(notesText || '').matchAll(/(?:\[Document:\s*|Document:\s*)([^\]\n]+)/gi)].map(m => m[1].trim())));
  return {
    title: title || `${courseCode} Formula & Quick Reference Sheet`,
    courseCode,
    chapterScope: chapterScope || "Core Principles",
    sourcesUsed: fallbackSources,
    sections: [
      {
        category: "Key Formulas & Equations",
        items: [
          {
            name: `${courseCode} Core Valuation Formula`,
            formula: "PV = FV / (1 + r)^t",
            variables: "PV = Present Value, FV = Future Value, r = Discount Rate, t = Time Periods",
            notes: "Fundamental equation for discounting future cash flows."
          }
        ]
      },
      {
        category: "Decision Rules & Frameworks",
        items: [
          {
            name: "Value Maximization Principle",
            rule: "Select investments that generate positive economic value added (EVA) and exceed hurdle rate.",
            notes: "Always account for opportunity costs and time value of money."
          }
        ]
      },
      {
        category: "Core Definitions & Terms",
        items: [
          {
            term: "Opportunity Cost of Capital",
            definition: "The expected return foregone by investing in a project rather than comparable financial securities with equal risk."
          }
        ]
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
  studentName = "Student",
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
 * Helper to parse YAML frontmatter and embedded [[wikilinks]] from a note's text
 */
export function parseNoteMetadataAndLinks(rawContent = '') {
  const frontmatter = {};
  let body = rawContent || '';

  // Only parse YAML frontmatter if it begins strictly with --- on its own line
  if (rawContent && /^---\s*\r?\n/.test(rawContent)) {
    const endMatch = rawContent.slice(3).match(/\r?\n---\s*(\r?\n|$)/);
    if (endMatch && endMatch.index !== undefined) {
      const endIdx = 3 + endMatch.index;
      const yamlChunk = rawContent.slice(3, endIdx).trim();
      body = rawContent.slice(endIdx + endMatch[0].length).trim();
      yamlChunk.split(/\r?\n/).forEach(line => {
        const colonIdx = line.indexOf(':');
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim();
          const val = line.slice(colonIdx + 1).trim();
          frontmatter[key] = val.replace(/^["']|["']$/g, '');
        }
      });
    }
  }

  // Extract [[Wikilinks]]
  const outlinks = [];
  const linkMatches = body.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g);
  for (const m of linkMatches) {
    outlinks.push(m[1].trim());
  }

  return { frontmatter, body, outlinks };
}

/**
 * Rank and connect vault notes based on query relevance and 1-hop graph traversal
 */
export function rankAndConnectVaultFiles(allFiles = [], query = '', targetCourse = null, maxFiles = 8) {
  if (!allFiles || allFiles.length === 0) return [];

  const stopWords = new Set(['what', 'is', 'the', 'in', 'my', 'how', 'to', 'for', 'a', 'an', 'and', 'of', 'on', 'with', 'about', 'find', 'show', 'tell', 'me', 'where', 'are', 'does', 'can', 'you']);
  const queryTokens = query
    .toLowerCase()
    .replace(/\[course:[^\]]+\]/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !stopWords.has(t));

  const parsedFiles = allFiles.map(file => {
    const rawText = file.content || file.cachedContent || file.sampleContent || '';
    const { frontmatter, body, outlinks } = parseNoteMetadataAndLinks(rawText);
    return {
      ...file,
      rawText,
      frontmatter,
      body,
      outlinks,
      score: 0
    };
  });

  // 1. Initial relevance scoring
  parsedFiles.forEach(file => {
    const lowerName = (file.name || '').toLowerCase();
    const lowerPath = (file.path || '').toLowerCase();
    const lowerCourse = (file.course || '').toLowerCase();
    const lowerBody = (file.body || '').toLowerCase();
    const lowerTopic = (file.frontmatter?.topic || '').toLowerCase();
    const lowerTags = (file.frontmatter?.tags || '').toLowerCase();

    // Target Course filter match (handles variations e.g. "FNCE 317" vs "FNCE317")
    if (targetCourse) {
      const cleanTarget = targetCourse.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const cleanCourse = lowerCourse.replace(/[^a-z0-9]/gi, '');
      const cleanPath = lowerPath.replace(/[^a-z0-9]/gi, '');
      if (cleanCourse.includes(cleanTarget) || cleanPath.includes(cleanTarget) || cleanCourse === '' || cleanCourse === 'course' || cleanCourse === 'coursematerial') {
        file.score += 30;
      }
    }

    // Presentation / Slide deck boost for study/conceptual queries
    const isSlides = lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt') || 
                    lowerPath.includes('/slides') || lowerPath.includes('\\slides') ||
                    lowerName.includes('lecture') || lowerName.includes('slide') || 
                    lowerName.includes('deck') || lowerName.includes('chapter');
    if (isSlides) {
      file.score += 25; // Prioritize actual lecture slide presentations over administrative syllabus
    }

    // De-prioritize course outlines / syllabi on conceptual study questions
    const isOutline = lowerName.includes('outline') || lowerName.includes('syllabus');
    const isConceptualQuery = queryTokens.some(t => 
      ['concept', 'formula', 'ratio', 'dupont', 'npv', 'irr', 'wacc', 'capm', 'valuation', 'exam', 'quiz', 'definition', 'chapter', 'lecture', 'problem', 'solve', 'how', 'why', 'what', 'rule'].includes(t)
    );
    if (isConceptualQuery && isOutline) {
      file.score -= 8;
    }

    // Query token matches
    queryTokens.forEach(token => {
      if (lowerName.includes(token)) file.score += 18;
      if (lowerTopic.includes(token)) file.score += 15;
      if (lowerTags.includes(token)) file.score += 12;
      if (lowerPath.includes(token)) file.score += 10;

      // Count occurrences in body (up to 12 points)
      let count = 0;
      let pos = lowerBody.indexOf(token);
      while (pos !== -1 && count < 12) {
        count++;
        pos = lowerBody.indexOf(token, pos + token.length);
      }
      file.score += count;
    });
  });

  // Sort candidate files by score descending
  parsedFiles.sort((a, b) => b.score - a.score);

  // 2. 1-Hop Graph traversal: Boost notes linked to/from top matches
  const topSeeds = parsedFiles.slice(0, Math.min(3, parsedFiles.length));
  topSeeds.forEach(seed => {
    (seed.outlinks || []).forEach(linkTarget => {
      const match = parsedFiles.find(f => 
        f.name.toLowerCase().includes(linkTarget.toLowerCase()) || 
        f.path.toLowerCase().includes(linkTarget.toLowerCase())
      );
      if (match && match !== seed) {
        match.score += 8; // Graph connectivity boost
        match.linkedFrom = seed.name;
      }
    });
  });

  parsedFiles.sort((a, b) => b.score - a.score);
  return parsedFiles.slice(0, maxFiles);
}

export function formatMatchedFilesList(files = []) {
  return files.map(f => {
    const ext = (f.extension || '').toLowerCase();
    const isPptx = ext.includes('ppt') || (f.name || '').toLowerCase().endsWith('.pptx') || (f.name || '').toLowerCase().endsWith('.ppt');
    const isPdf = ext.includes('pdf') || (f.name || '').toLowerCase().endsWith('.pdf');
    const text = f.cachedContent || f.content || f.rawText || '';
    const slideMatch = text.match(/(?:===|---) Slide \d+ (?:===|---)/g);
    const slideCount = slideMatch ? slideMatch.length : null;

    return {
      name: f.name,
      path: f.path || f.name,
      course: f.course,
      fileType: isPptx ? 'pptx' : (isPdf ? 'pdf' : 'note'),
      slideCount,
      relevance: f.linkedFrom ? `Connected via ${f.linkedFrom}` : (isPptx ? 'Lecture Slides' : (isPdf ? 'Course Document' : 'Notes'))
    };
  });
}

export async function searchVaultWithAI({ query, filesIndex = [], sampleNotes = [] }) {
  const allFiles = (sampleNotes && sampleNotes.length > 0 ? sampleNotes : filesIndex) || [];
  
  // 1. Detect target course from query
  const courseMatch = query.match(/\[Course:\s*([A-Za-z0-9\s]+)\]/i);
  const targetCourse = courseMatch ? courseMatch[1].trim().toUpperCase() : null;

  // 2. Rank notes with Graph Connectivity & Token Scoring
  const rankedFiles = rankAndConnectVaultFiles(allFiles, query, targetCourse, 8);
  const filesToScan = rankedFiles.length > 0 ? rankedFiles : allFiles.slice(0, 6);

  // Build Networked Thought snippets with graph relationship metadata
  const notesSnippet = filesToScan.map(n => {
    const rawText = n.body || n.content || n.cachedContent || '';
    const snippet = rawText.length > 4500 ? rawText.slice(0, 4500) + "\n...[truncated]" : rawText;
    const isPptx = (n.name || '').toLowerCase().endsWith('.pptx') || (n.name || '').toLowerCase().endsWith('.ppt');
    const isPdf = (n.name || '').toLowerCase().endsWith('.pdf');
    let header = `### [[${n.course || 'Course'}/${n.name}]] (Type: ${isPptx ? 'PowerPoint Lecture Slides' : (isPdf ? 'PDF Course Document' : 'Lecture Notes')})`;
    if (n.frontmatter?.type) header += ` (Category: ${n.frontmatter.type})`;
    if (n.linkedFrom) header += ` [🔗 Graph Link: Referenced by ${n.linkedFrom}]`;
    const linksNote = n.outlinks && n.outlinks.length > 0 ? `\n*Connected Links:* ${n.outlinks.slice(0, 5).map(l => `[[${l}]]`).join(', ')}` : '';
    return `${header}${linksNote}\n${snippet || '(Document content attached)'}`;
  }).join('\n\n---\n\n');

  const cleanUserQuery = query.replace(/\[Course:\s*[^\]]+\]/gi, '').trim();

  const prompt = `You are a university academic assistant in Wolfe OS.
The student has connected course lecture slides, PowerPoint decks, and syllabus materials.

Question:
"${cleanUserQuery}"

Relevant Course Materials, Lecture Slides & Documents:
${notesSnippet || "No document text available."}

Guidelines for Response:
1. Be direct, concise, and punchy. Answer EXACTLY what was asked in clean, structured bullet points.
2. CITATIONS & SOURCES: You MUST explicitly mention and cite the specific materials and lecture slide decks you used (e.g., "From **Lecture 03 - Financial Ratios & DuPont.pptx (Slide 2)**..." or "According to the **Course Outline**..."). The student needs to know which lecture presentations and documents were referenced!
3. Networked Thought Citing: Connect related concepts across notes. When referencing courses, study guides, formulas, or notes, ALWAYS format them as Obsidian [[wikilinks]] (e.g. [[FNCE 317]], [[Capital Budgeting]], [[Daily/2026-09-09]]). Wolfe OS converts these into interactive buttons.
4. If formatting formulas or calculations, use crisp LaTeX ($...$).
5. Keep the response clean, readable, and easy to skim.

Return ONLY valid JSON matching this schema:
{
  "answer": "Concise, structured answer citing specific slides and documents...",
  "matchedFiles": [
    {
      "name": "Lecture 03.pptx",
      "path": "FNCE 317/Slides/Lecture 03.pptx"
    }
  ]
}`;

  const systemInstruction = "You are a concise, high-speed university academic assistant equipped with course lecture slides and outlines. Provide direct, structured answers with explicit citations of lecture slide decks and documents. Return only valid JSON.";

  try {
    const fastConfig = {
      ...DEFAULT_AI_CONFIG,
      temperature: 0.1,
      maxOutputTokens: 1024
    };
    const res = await callGemini(prompt, systemInstruction, fastConfig, 18000);
    if (res && (res.answer || res.message)) {
      return {
        answer: cleanAiMessage(res.answer || res.message),
        matchedFiles: formatMatchedFilesList(filesToScan.slice(0, 6))
      };
    }
  } catch (err) {
    console.warn("Vault search AI error:", err);
  }

  return {
    answer: `Analyzed notes for ${targetCourse || 'your classes'}.`,
    matchedFiles: formatMatchedFilesList(filesToScan.slice(0, 6))
  };
}

/**
 * Ultra-Fast Real-Time Streaming Search Engine for Course AI Chat
 */
export async function streamSearchVaultWithAI({ query, filesIndex = [], sampleNotes = [], onChunk }) {
  const allFiles = (sampleNotes && sampleNotes.length > 0 ? sampleNotes : filesIndex) || [];
  
  const courseMatch = query.match(/\[Course:\s*([A-Za-z0-9\s]+)\]/i);
  const targetCourse = courseMatch ? courseMatch[1].trim().toUpperCase() : null;

  // Rank notes with Graph Connectivity & Token Scoring
  const rankedFiles = rankAndConnectVaultFiles(allFiles, query, targetCourse, 8);
  const filesToScan = rankedFiles.length > 0 ? rankedFiles : allFiles.slice(0, 6);
  
  const notesSnippet = filesToScan.map(n => {
    const rawText = n.body || n.content || n.cachedContent || '';
    const snippet = rawText.length > 4500 ? rawText.slice(0, 4500) + "\n...[truncated]" : rawText;
    const isPptx = (n.name || '').toLowerCase().endsWith('.pptx') || (n.name || '').toLowerCase().endsWith('.ppt');
    const isPdf = (n.name || '').toLowerCase().endsWith('.pdf');
    let header = `### [[${n.course || 'Course'}/${n.name}]] (Type: ${isPptx ? 'PowerPoint Lecture Slides' : (isPdf ? 'PDF Course Document' : 'Lecture Notes')})`;
    if (n.frontmatter?.type) header += ` (Category: ${n.frontmatter.type})`;
    if (n.linkedFrom) header += ` [🔗 Graph Link: Referenced by ${n.linkedFrom}]`;
    const linksNote = n.outlinks && n.outlinks.length > 0 ? `\n*Connected Links:* ${n.outlinks.slice(0, 5).map(l => `[[${l}]]`).join(', ')}` : '';
    return `${header}${linksNote}\n${snippet || '(Document content attached)'}`;
  }).join('\n\n---\n\n');

  const cleanUserQuery = query.replace(/\[Course:\s*[^\]]+\]/gi, '').trim();

  const prompt = `You are a university academic study partner in Wolfe OS.
The student has connected course lecture slides, PowerPoint decks, and syllabus materials.

Question:
"${cleanUserQuery}"

Relevant Course Materials, Lecture Slides & Documents:
${notesSnippet || "No document text available."}

Guidelines for Response:
1. Be direct, concise, and punchy. Answer EXACTLY what was asked in clean, structured bullet points or brief summary.
2. CITATIONS & SOURCES: You MUST explicitly mention and cite the specific materials and lecture slide decks you used (e.g., "From **Lecture 03 - Financial Ratios & DuPont.pptx (Slide 2)**..." or "According to the **Course Outline**..."). The student needs to know which lecture presentations and documents were referenced!
3. Networked Thought Citing: Connect related concepts across notes. When referencing courses, study guides, formulas, or notes, ALWAYS format them as Obsidian [[wikilinks]] (e.g. [[FNCE 317]], [[Capital Budgeting]], [[Daily/2026-09-09]]). Wolfe OS converts these into interactive buttons.
4. If formatting formulas or calculations, use crisp LaTeX ($...$).
5. Keep the response clean, readable, and easy to skim.`;

  const systemInstruction = "You are a concise, high-speed university academic assistant equipped with course lecture slides and outlines. Provide direct, structured, factual answers with explicit citations of lecture slide decks and documents, with LaTeX math and [[wikilinks]].";

  const apiKey = DEFAULT_AI_CONFIG.apiKey || API_KEY;
  if (!apiKey) {
    const fallback = await searchVaultWithAI({ query, filesIndex, sampleNotes });
    if (onChunk) onChunk(fallback.answer);
    return fallback;
  }

  const modelsToTry = [
    'gemini-2.5-flash',
    'gemini-flash-lite-latest',
    'gemini-2.0-flash',
    'gemini-3.5-flash-lite',
    'gemini-1.5-flash'
  ];

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 16000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          }
        })
      });

      clearTimeout(timeoutId);
      if (!response.ok || !response.body) continue;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                accumulatedText += text;
                if (onChunk) onChunk(accumulatedText);
              }
            } catch (e) {}
          }
        }
      }

      if (accumulatedText.trim()) {
        return {
          answer: cleanAiMessage(accumulatedText.trim()),
          matchedFiles: formatMatchedFilesList(filesToScan.slice(0, 6))
        };
      }
    } catch (err) {
      // Try next model
    }
  }

  // Fallback if streaming failed
  return await searchVaultWithAI({ query, filesIndex, sampleNotes });
}

/**
 * Synthesize a comprehensive NotebookLM Executive Study Briefing for a specific university course
 */
export async function generateCourseBriefingWithAI({ courseCode, courseName = '', syllabusText = '' }) {
  const cleanCode = courseCode || "Course";
  const snippet = (syllabusText || '').slice(0, 35000);

  const prompt = `You are a personal university study assistant (NotebookLM engine).
Synthesize a comprehensive, high-yield academic briefing for the course "${cleanCode} ${courseName}" from the following course lecture slides, PowerPoint decks, study notes, and syllabus materials.

Course Lecture Slides, Notes & Documents:
${snippet || "No course document text available."}

Extract and structure the following details accurately:
1. "instructor": { "name": "...", "email": "...", "officeHours": "...", "section": "..." }
2. "gradeBreakdown": array of grading components with percentage weights, e.g. [ { "item": "Midterm Exam 1", "weight": "25%", "details": "Covers chapters 1-4" }, { "item": "Final Exam", "weight": "40%", "details": "Registrar scheduled, cumulative" } ]
3. "keyDates": array of important deadlines/exams, e.g. [ { "title": "Midterm 1", "date": "Oct 18", "type": "Exam" } ]
4. "highYieldConcepts": array of 4-6 essential exam topics/formulas drawn directly from the lecture slides and course notes (include clean LaTeX formulas for quantitative concepts), e.g. [ { "topic": "Time Value of Money", "summary": "Discounting future cash flows", "formula": "$$PV = \\frac{FV}{(1+r)^n}$$" } ]
5. "examTraps": array of 3 critical tips or common mistakes emphasized in lecture slides or course policy
7. "sourcesUsed": array of specific document, lecture slide, or PowerPoint filenames identified and used in the briefing, e.g. ["Lecture 03 - DuPont.pptx", "FNCE 317 Course Outline.pdf"]

Return ONLY valid JSON matching this schema:
{
  "overview": "...",
  "instructor": { "name": "...", "email": "...", "officeHours": "...", "section": "..." },
  "gradeBreakdown": [ { "item": "...", "weight": "...", "details": "..." } ],
  "keyDates": [ { "title": "...", "date": "...", "type": "..." } ],
  "highYieldConcepts": [ { "topic": "...", "summary": "...", "formula": "..." } ],
  "examTraps": [ "...", "..." ],
  "sourcesUsed": [ "Lecture 03 - Financial Ratios.pptx", "Course Outline.pdf" ]
}`;

  const systemInstruction = "You are a university academic analysis engine. Extract course details, grade breakdowns, slide concepts, and high-yield formulas from the course materials and lecture slides accurately. Explicitly list the sources and slide decks used. Return only valid JSON.";

  try {
    const res = await callGemini(prompt, systemInstruction, DEFAULT_AI_CONFIG, 25000);
    if (res && res.gradeBreakdown) {
      if (!res.sourcesUsed || res.sourcesUsed.length === 0) {
        const docMatches = [...snippet.matchAll(/(?:\[Document:\s*|Document:\s*)([^\]\n]+)/gi)].map(m => m[1].trim());
        res.sourcesUsed = Array.from(new Set(docMatches));
      }
      return res;
    }
  } catch (err) {
    console.warn("Course briefing AI error:", err);
  }

  // Smart Contextual Fallback
  return {
    overview: `${cleanCode} focuses on core academic principles, high-yield conceptual mastery, and practical analytical problem-solving.`,
    instructor: {
      name: "Professor",
      email: `${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '')}@university.edu`,
      officeHours: "Check syllabus / by appointment",
      section: "L01"
    },
    gradeBreakdown: [
      { item: "Midterm Examination", weight: "30%", details: "In-class evaluation" },
      { item: "Assignments & Projects", weight: "25%", details: "Regular deliverables" },
      { item: "Final Examination", weight: "35%", details: "Comprehensive registrar scheduled" },
      { item: "Participation / Quizzes", weight: "10%", details: "Ongoing semester engagement" }
    ],
    keyDates: [
      { title: "Midterm Assessment", date: "Mid-Semester", type: "Exam" },
      { title: "Final Examination", date: "Registrar Scheduled", type: "Final" }
    ],
    highYieldConcepts: [
      { topic: "Foundational Frameworks", summary: "Core conceptual terminology and problem-solving methodologies.", formula: "" },
      { topic: "Applied Analytical Models", summary: "Quantitative analysis and case evaluations.", formula: "" },
      { topic: "Final Synthesis", summary: "Cross-topic integration for comprehensive mastery.", formula: "" }
    ],
    examTraps: [
      "Review all lecture slides and D2L announcements weekly.",
      "Practice end-of-chapter calculations without formula sheets."
    ]
  };
}

/**
 * Analyze a meal from photo (via Gemini Vision) and/or natural language description.
 * If photo contains no food, returns hasFood: false with clear warning.
 */
export async function analyzeMealWithAI({ imageBase64, mimeType = 'image/jpeg', description = '', aiConfig = DEFAULT_AI_CONFIG, kitchenCalibration = null, householdPantry = null }) {
  const apiKey = aiConfig?.apiKey || API_KEY;
  const cleanDesc = (description || '').trim();

  // Extract user's hardware & kitchen calibration if available
  let calibPrompt = "";
  let pantryPrompt = "";
  try {
    const rawCalib = kitchenCalibration || aiConfig?.kitchenCalibration || (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('wolfe_nutrition_data') || '{}')?.kitchenCalibration : null);
    if (rawCalib) {
      calibPrompt = buildAiCalibrationPrompt(rawCalib);
    }
    const rawPantry = householdPantry || aiConfig?.householdPantry || (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('wolfe_nutrition_data') || '{}')?.householdPantry : null);
    if (rawPantry) {
      pantryPrompt = buildAiPantryPrompt(rawPantry);
    }
  } catch (e) {}

  // 1. If we have an API key and image, call Gemini Vision
  if (apiKey && imageBase64) {
    const rawBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const visionModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.7-flash'
    ];

    const systemInstruction = `You are a clinical sports dietitian, USDA nutritional database authority, and high-precision computer vision intelligence engine for Wolfe OS (engineered to Cal AI and MacroFactor standards).

CRITICAL ACCURACY & PERSPECTIVE-INVARIANCE MANDATES:
1. FIRST, inspect the image to determine if edible food, beverage, food packaging, or a Nutrition Facts label / barcode is present.
2. If the image shows a person (face, body, selfie, hands without food), an empty room, furniture, an empty desk/plate, pets, electronics, or no recognizable food/packaging, you MUST NEVER GUESS OR FABRICATE FOOD. In that case, return strictly:
   { "hasFood": false, "errorMessage": "No food or nutrition label detected. Please take a clear photo of your meal or packaging." }

3. CAMERA PERSPECTIVE & SCALE NORMALIZATION (ELIMINATE THE 500-CALORIE ANCHOR & ANGLE SKEW):
   - PROBLEM: Close-up photos or angled shots make a small 200g portion occupy 80%+ of the camera frame. NEVER treat frame fill percentage as portion size! A 150-calorie muffin or single fried egg can fill the frame in a close-up photo.
   - SPATIAL CALIBRATION STEP:
     a. Identify the containment vessel:
        * Standard Dinner Plate: ~10.5 inches (26.7 cm) outer diameter.
        * Salad / Dessert Plate: ~8.0 inches (20.3 cm).
        * Cereal / Soup Bowl: ~6.0 inches (15.2 cm) diameter, ~2.5-3.0 inches deep (~500-750 ml usable volume).
        * Mug / Tumbler: ~3.25 inches (8.3 cm) diameter (~250-350 ml).
        * Meal Prep Container (Rectangular): ~8 x 5.5 x 2 inches (~800-950 ml).
        * Utensil Scale: Standard table fork or spoon is ~7.0-7.5 inches (18-19 cm).
        * Hand / Handheld Scale: Adult palm width is ~3.2 inches (8.0 cm); adult finger width is ~0.75 inch (1.9 cm).
        * Natural Grain Scale: If no vessel or reference is present, use natural grain size (e.g. grain of rice ~6mm, blueberry ~1.5cm, standard bread slice ~11x11cm and ~1.2cm thick).
     b. Estimate Camera Angle:
        * Top-Down / Bird's Eye (75°-90°): Full 2D surface area is visible. Infer mound height / thickness from shadows, rim depth, and food pile curvature.
        * Angled / Oblique (35°-65°): Both surface area and vertical profile (height of piles) are visible. Compensate for perspective foreshortening (food closer to lens appears larger).
        * Low-Angle / Close-Up (<35°): High distortion risk. Use vessel rim curvature radius to determine true scale, not foreground pixel size.
     c. Measure Plate Coverage Fraction & Vertical Mound Depth:
        * Food Coverage: What % of the plate surface is covered? (e.g., a small piece of chicken covers only 20-30% of a 10.5" plate).
        * Mound Height: Is it flat (single layer ~1cm, e.g. pancake or toast) or heaped (mound of rice/pasta ~3-5cm)?
   - USER WEIGHT PROTOCOL (ZERO TARE DEDUCTION): If the user states a weight in grams (e.g. "350g steak on plate", "400g chicken and rice"), that weight is ALREADY 100% TOTAL NET FOOD VOLUME WEIGHT (user pre-subtracted the plate weight). NEVER deduct plate weight or vessel tare from stated grams!

${calibPrompt ? `\n${calibPrompt}\n` : ''}
${pantryPrompt ? `\n${pantryPrompt}\n` : ''}

4. DECOMPOSITION & 3D VOLUME-TO-MASS IN GRAMS:
   - MacroFactor & Cal AI Rule: Never guess total calories directly!
   - Every identified item MUST have an explicit estimated weight in GRAMS (estimatedGrams) derived from its 3D volume (length x width x height in cm) multiplied by food density:
     * Cooked Meats / Poultry / Fish: ~1.05 g/cm³
     * Cooked Grains / White Rice / Jasmine Rice: ~0.80 g/cm³ (1 standard cup cooked ≈ 160g)
     * Cooked Pasta: ~0.72 g/cm³ (1 standard cup cooked ≈ 140g)
     * Cooked Legumes / Chickpeas: ~0.85 g/cm³ (1 cup ≈ 170g)
     * Raw Leafy Greens (Spinach, Lettuce): ~0.20 g/cm³ (1 cup ≈ 30-40g)
     * Steamed Dense Veggies (Broccoli, Carrots): ~0.55 g/cm³ (1 cup ≈ 90-110g)
     * Whole Potatoes (Baked/Cooked): ~0.90 g/cm³ (1 medium potato ≈ 150g)
     * Bread / Rolls: ~0.30 g/cm³ (1 standard slice ≈ 30g, thick artisan slice ≈ 45-50g)
     * Cheese / Dairy Solids: ~0.95 g/cm³
     * Cooking Oils: 0.92 g/ml (1 tsp ≈ 4.5g / 40 kcal; 1 tbsp ≈ 14g / 120 kcal)

5. CLINICAL USDA FOODDATA CENTRAL BENCHMARKS (PER 100G EDIBLE PORTION):
   - Calculate each item's calories and macros strictly from: (estimatedGrams / 100) * USDA_per_100g.
   - Key Reference Standards:
     * Cooked Skinless Chicken Breast: 165 kcal, 31.0g P, 0.0g C, 3.6g F per 100g.
     * Cooked Chicken Thigh (Skinless): 209 kcal, 26.0g P, 0.0g C, 11.0g F per 100g.
     * Cooked Lean Ground Beef (90/10): 190 kcal, 26.0g P, 0.0g C, 9.5g F per 100g.
     * Cooked Salmon Fillet: 206 kcal, 22.0g P, 0.0g C, 12.0g F per 100g.
     * Canned Salmon: Exactly 200 kcal, 40g P, 0g C, 4g F per can (150g).
     * Canned Tuna (in water, drained): 116 kcal, 25.5g P, 0g C, 0.8g F per 100g (1 standard can ~120g drained = 140 kcal, 30g P).
     * Whole Large Egg (Cooked/Poached/Boiled): 72 kcal, 6.3g P, 0.4g C, 4.8g F per egg (~50g).
     * Large Egg White: 17 kcal, 3.6g P, 0.2g C, 0.1g F per white (~33g).
     * Cooked White/Jasmine Rice: 130 kcal, 2.7g P, 28.0g C, 0.3g F per 100g (~205 kcal per 1 cup cooked / 160g).
     * Cooked Brown Rice: 123 kcal, 2.7g P, 26.0g C, 1.0g F per 100g.
     * Cooked Quinoa: 120 kcal, 4.4g P, 21.3g C, 1.9g F per 100g (~222 kcal, 8.1g P per 1 cup cooked / 185g). NEVER assign >10g protein to 1 cup quinoa!
     * Cooked Chickpeas / Garbanzo: 164 kcal, 8.9g P, 27.4g C, 2.6g F per 100g.
     * Cooked Rolled Oats (Oatmeal in water): 71 kcal, 2.5g P, 12.0g C, 1.5g F per 100g (~165 kcal per 1 cup cooked / 234g).
     * Bread (White / Wheat): ~265 kcal, 9.0g P, 49.0g C, 3.2g F per 100g (1 slice ~30g = ~80 kcal, 2.7g P, 15g C, 1g F).
     * Steamed Mixed Vegetables (Broccoli, Cauliflower, Zucchini): ~35 kcal, 2.0g P, 7.0g C, 0.4g F per 100g (~35 kcal per cup).
     * Low-Fat Cottage Cheese (2%): 81 kcal, 11.0g P, 4.0g C, 2.3g F per 100g (~90 kcal, 12.5g P per 0.5 cup / 113g).
     * Plain Nonfat Greek Yogurt: 59 kcal, 10.0g P, 3.6g C, 0.4g F per 100g (~145 kcal, 25g P per 1 cup / 245g).
     * Standard / Normal Milk (2% reduced fat): 50 kcal, 3.3g P, 4.8g C, 2.0g F per 100ml (~120 kcal, 8g P, 11.5g C, 4.8g F per 1 cup / 240ml). DEFAULT TO 2% NORMAL MILK when milk is mentioned/shown.
     * Peanut Butter / Almond Butter: 588 kcal, 25.0g P, 20.0g C, 50.0g F per 100g (1 level tbsp ~16g = 94 kcal, 4g P, 3.2g C, 8g F).
     * Nature Valley Bar: Exactly 170 kcal, 3.5g P, 23g C, 7.5g F per 1 pouch / 2 bars (35g).
     * Surface Cooking Oil / Dressing: Visually check for gloss/sheen. If matte/dry, do NOT add phantom oils. If visibly glistening, add 0.5-1.0 tsp olive/cooking oil (20-40 kcal, 2.5-4.5g F).
     * BONE-IN REFUSE RULE: Gross as-served weight of chicken drumsticks has ~40% bone refuse; wings have ~46% bone refuse. Calculate calories and protein STRICTLY on the edible meat (~60%), never on the bone!
     * ATWATER ENERGY LAW: For every item and the meal sum: Calories ≈ (Protein * 4) + (Carbs * 4) + (Fats * 9) within ±5%.

6. STRICT MATHEMATICAL SUMMATION:
   - The meal total calories, protein, carbs, and fats MUST equal the exact sum of the individual items.

Return ONLY valid JSON matching this schema:
{
  "hasFood": true,
  "name": "Concise Descriptive Meal Title",
  "visualAnalysis": {
    "cameraPerspective": "top_down_overhead" | "angled_45_deg" | "close_up_macro",
    "scaleReference": "Detected 10.5-inch ceramic dinner plate rim",
    "vesselType": "dinner_plate" | "salad_plate" | "bowl" | "container" | "handheld" | "none",
    "plateCoveragePercent": 40,
    "estimatedDepthCm": 2.5,
    "estimatedTotalGrams": 240
  },
  "items": [
    {
      "name": "Item Name",
      "portion": "120g (4.2 oz)",
      "estimatedGrams": 120,
      "calories": 198,
      "protein": 37,
      "carbs": 0,
      "fats": 4
    }
  ],
  "calories": 198,
  "protein": 37,
  "carbs": 0,
  "fats": 4,
  "notes": "Verified against vessel scale & USDA ground truth"
}`;

    const prompt = cleanDesc 
      ? `Analyze this meal photo (and any visible nutrition label/barcode). The user notes: "${cleanDesc}". Identify every ingredient/product, estimate accurate portions, and calculate macro breakdown using clinical USDA benchmarks.`
      : `Analyze this meal photo (and any visible nutrition label/barcode). Identify every visible ingredient or package, estimate accurate portions, and calculate macro breakdown using clinical USDA benchmarks. If no food or label is present, set hasFood to false.`;

    for (const model of visionModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 22000);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: mimeType || 'image/jpeg',
                      data: rawBase64
                    }
                  }
                ]
              }
            ],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              maxOutputTokens: 2048,
            }
          })
        });

        clearTimeout(timeoutId);
        if (!response.ok) continue;

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find(p => p.text && !p.thought) || parts[0];
        const rawText = textPart?.text || '';

        if (rawText) {
          const parsed = safeParseJson(rawText);
          if (parsed) {
            if (parsed.hasFood === false) {
              return {
                hasFood: false,
                errorMessage: parsed.errorMessage || "No food detected in image. Please take a clear photo of your meal or describe what you are eating."
              };
            }
            if (Array.isArray(parsed.items) && parsed.items.length > 0) {
              const isCannedSalmon = /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(it.name || '')));

              if (isCannedSalmon && parsed.items.length <= 1) {
                parsed.name = "Canned Salmon";
                parsed.items = [
                  { name: "Canned Salmon", portion: "1 can (150g)", estimatedGrams: 150, calories: 200, protein: 40, carbs: 0, fats: 4 }
                ];
                parsed.notes = "Calibrated to verified sports nutrition ground truth (200 kcal, 40g protein per can)";
              }

              const isNatureValley = /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(it.name || '')));

              if (isNatureValley && parsed.items.length <= 1 && (parsed.calories === 190 || parsed.calories === 0 || !parsed.calories)) {
                parsed.name = parsed.name || "Nature Valley Bar";
                parsed.items = [
                  { name: "Nature Valley Bar", portion: "1 bar / pouch (35g)", estimatedGrams: 35, calories: 170, protein: 3.5, carbs: 23, fats: 7.5 }
                ];
                parsed.notes = "Calibrated to verified nutrition facts (170 kcal, 3.5g protein, 23g carbs, 7.5g fats per bar/pouch)";
              }

              parsed.items = (parsed.items || []).map(it => {
                const itName = typeof it === 'string' ? it : it?.name || '';
                if (/nature\s*valley/i.test(itName) && it && typeof it === 'object' && it.calories === 190) {
                  return { ...it, calories: 170, protein: 3.5, carbs: 23, fats: 7.5, estimatedGrams: 35 };
                }
                return it;
              });

              parsed.items = calibrateMealItems(parsed.items || []);

              // STRICT MATHEMATICAL SUMMATION LAW (Cal AI & MacroFactor Standard):
              // Recalculate total calories and macros strictly as the sum of verified parsed.items.
              // This permanently prevents arbitrary model hallucinations (like defaulting to ~500 kcal)
              // from overriding the verified itemized components.
              const itemsSumCalories = parsed.items.reduce((s, it) => s + (Number(it.calories) || 0), 0);
              const itemsSumProtein = parsed.items.reduce((s, it) => s + (Number(it.protein) || 0), 0);
              const itemsSumCarbs = parsed.items.reduce((s, it) => s + (Number(it.carbs) || 0), 0);
              const itemsSumFats = parsed.items.reduce((s, it) => s + (Number(it.fats) || 0), 0);

              const totalCalories = Math.round(itemsSumCalories);
              const totalProtein = Math.round(itemsSumProtein * 10) / 10;
              const totalCarbs = Math.round(itemsSumCarbs * 10) / 10;
              const totalFats = Math.round(itemsSumFats * 10) / 10;

              return {
                hasFood: true,
                name: parsed.name || "Analyzed Meal",
                visualAnalysis: parsed.visualAnalysis || null,
                items: parsed.items,
                calories: totalCalories > 0 ? totalCalories : (parsed.calories || calculateCaloriesFromMacros(totalProtein, totalCarbs, totalFats)),
                protein: totalProtein,
                carbs: totalCarbs,
                fats: totalFats,
                notes: parsed.notes || "Calculated via vessel scale ruler and USDA ground truth"
              };
            }
          }
        }
      } catch (err) {
        // continue to next vision model
      }
    }
  }

  // 2. Fallback / Description-based Engine:
  // If description is provided, analyze with the dedicated Quick Log AI Engine
  if (cleanDesc) {
    return await analyzeQuickLogWithAI({
      query: cleanDesc,
      aiConfig,
      kitchenCalibration,
      householdPantry
    });
  }

  // 3. If only an image was submitted without description and no vision API could process it:
  return {
    hasFood: false,
    errorMessage: "Please describe what is on your plate (e.g. '8 oz chicken with rice') so we can calculate exact macros."
  };
}

/**
 * Context-Aware Natural Language Quick Log AI Engine
 * Decomposes multi-item meals, resolves extra context, modifiers, preparation methods,
 * cooking fats, exclusions, restaurant dishes, and hardware calibrations.
 */
export async function analyzeQuickLogWithAI({
  query,
  aiConfig = DEFAULT_AI_CONFIG,
  kitchenCalibration = null,
  householdPantry = null
}) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return {
      hasFood: false,
      errorMessage: "Please enter or speak a meal description."
    };
  }

  const apiKey = aiConfig?.apiKey || API_KEY;

  // 1. If API key is available, call Gemini Language Models
  if (apiKey) {
    let calibPrompt = "";
    let pantryPrompt = "";
    try {
      const rawCalib = kitchenCalibration || aiConfig?.kitchenCalibration || (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('wolfe_nutrition_data') || '{}')?.kitchenCalibration : null);
      if (rawCalib) {
        calibPrompt = buildAiCalibrationPrompt(rawCalib);
      }
      const rawPantry = householdPantry || aiConfig?.householdPantry || (typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem('wolfe_nutrition_data') || '{}')?.householdPantry : null);
      if (rawPantry) {
        pantryPrompt = buildAiPantryPrompt(rawPantry);
      }
    } catch (e) {}

    const textModels = [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-3.7-flash'
    ];

    const systemInstruction = `You are the elite clinical sports dietitian, USDA nutritional authority, and Quick Log AI Engine for Wolfe OS.
Your task is to parse natural language food logs and voice transcripts with 100% precision.

KEY INTELLIGENCE RULES:
1. MULTIPLE ITEMS & SIDES:
   - Identify EVERY distinct item mentioned in the meal (mains, sides, beverages, sauces, toppings, dressings, snacks).
   - Each item must have its own accurate macro breakdown (calories, protein, carbs, fats) based on clinical USDA benchmarks.
   - Example: "200g chicken breast, 1.2 cups white rice, 0.8 cup steamed broccoli, and 1 tbsp olive oil" -> 4 distinct items.

2. EXTRA INFORMATION, MODIFIERS & PARTIAL CONSUMPTION:
   - Partial Consumption & Fractions: If the user indicates they did not finish everything (e.g. "only ate half", "left a third of the rice", "ate 3/4 of the burger"):
     Scale the portions, calories, and macros for that specific item accordingly.
   - Preparation & Added Fats: If cooking fats or oils are mentioned (e.g. "cooked in 1 tbsp butter", "grilled with 1 tbsp olive oil", "deep fried"):
     Include the oil or butter as an explicit item.
   - Exclusions & Customizations: If the user says "no cheese", "without dressing", "hold the mayo", "skip the sour cream":
     STRICTLY DO NOT include those items.
   - Brand & Restaurant Menus: Understand menu items from Chipotle, Starbucks, Subway, Chick-fil-A, In-N-Out, etc., using true menu nutrition facts.

3. HARDWARE & USER WEIGHT PROTOCOL (ZERO TARE DEDUCTION):
${calibPrompt ? `${calibPrompt}\n` : `   - Primary Large Bowl: 750ml capacity.\n   - Main Dinner Plate: 10.5" outer diameter.\n`}
${pantryPrompt ? `${pantryPrompt}\n` : ''}
   - ZERO TARE DEDUCTION RULE (CRITICAL): The user ALWAYS tares the scale or subtracts plate/bowl weight beforehand!
     Whenever the user specifies a weight in grams (e.g. "400g chicken and rice", "300g food on plate", "250g steak"), that weight is ALREADY 100% TOTAL NET FOOD VOLUME WEIGHT.
     NEVER subtract plate weight (550g) or bowl weight (420g) or any tare deduction from the user's stated grams!
   - When a compound filling is mentioned (e.g. "bun with 70g insides of beef and veggies"):
     Distribute the 70g total filling across the inner ingredients (e.g. 42g beef [80 kcal, 11g P] + 28g veggies [10 kcal, 1g P] = 70g) plus 1 bun (~130 kcal) = 220 kcal, NEVER doubling the filling.

4. CONSERVATIVE UNDERESTIMATION & GROUND-TRUTH MACROS:
   - Wolfe OS Principle: Never over-inflate numbers for protein or calories. When estimating calories, protein, or portion sizes, ALWAYS ROUND DOWN if uncertain so the user never overestimates their nutritional intake.
   - Milk (Standard / Normal Household Milk):
     * DEFAULT TO NORMAL MILK: When the user mentions "milk" (e.g. "milk", "glass of milk", "cup of milk", "milk in coffee/cereal"), treat it as STANDARD / NORMAL MILK (2% reduced fat: ~120 kcal, 8g protein, 11.5g carbs, ~4.8g fats per 1 cup / 240-250ml).
     * NEVER assume whole milk (~150 kcal) unless explicitly specified ("whole milk", "3.25%").
     * NEVER assign 9g, 10g, or more protein to 1 cup of standard milk (it is strictly 8g protein).
   - Cereal with Milk (Cheerios, Multigrain Cheerios, Corn Flakes, etc.):
     * When cereal with milk or a bowl of cereal is mentioned (e.g. "bowl of multigrain cheerios", "cereal with milk"):
       ALWAYS itemize the cereal and the milk as TWO distinct items:
       1) The Cereal (e.g. 1 cup Multigrain Cheerios: ~110 kcal, ~2.5-3g protein, ~24g carbs, ~1.5g fats)
       2) The Milk (e.g. 1 cup or 3/4 cup 2% milk: ~110-120 kcal, ~7-8g protein, ~10-11.5g carbs, ~4-4.8g fats)
       Total meal: ~220-230 kcal, ~10-11g protein, ~34-36g carbs, ~5.5-6.3g fats.
       NEVER omit the cereal or replace the meal with just milk!
   - Canned Salmon / Can of Salmon: Exactly 200 kcal, 40g protein, 0g carbs, 4g fats per can (1 can = 200 cals, 40g protein).
   - Household Protein Shake / Smoothie: A standard shake with 2 cups milk (240-260 kcal, 16-18g P), 1 scoop Canadian Protein vegan powder (120 kcal, 20g P), and 1 banana (105 kcal, 1.3g P) is ~465-485 kcal, ~37-39g protein, ~54g carbs, ~12g fats. (1 scoop vegan powder is 20g P, NEVER 1 cup or 65g P). If the user mentions 'protein shake', 'smoothie', or 'protein smoothie', default to 1 scoop vegan powder + 2 cups milk + 1 banana = ~37-39g protein, NEVER 91g protein!
   - Nature Valley Bar / Granola Bar: Exactly 170 kcal, ~3.5g protein, 23g carbs, 7.5g fats per bar / pouch. Calibrate strictly to 170 kcal (NEVER default to 190 kcal).
   - Bone-In Meats (Chicken Drumsticks, Wings, Bone-in Thighs, Ribs, T-Bone):
     * CRITICAL BONE REFUSE RULE: Gross / as-served weight includes inedible bones and cartilage which provide ZERO calories and ZERO protein.
     * Chicken Drumsticks: ~40% bone refuse (only ~60% is edible meat + skin). A 70g drumstick (as served with bone) has only ~42g edible meat = ~78 kcal, ~10.5g protein, ~3.8g fats. NEVER assign 15g protein to a 70g bone-in drumstick (that mistakenly counts the bone weight as meat)!
     * Chicken Wings: ~46% bone refuse (only ~54% is edible meat + skin). A 48g wing as served has ~26g edible meat = ~65 kcal, ~6.5g protein, ~4.2g fats.
     * Chicken Thigh (Bone-in): ~30% bone refuse. A 130g bone-in thigh has ~91g edible meat = ~180 kcal, ~22g protein, ~10g fats.
     * Label portion clearly: e.g. "1 drumstick (~70g gross, ~42g edible meat)" or "70g bone-in drumstick (~42g meat)".
   - Atwater energy consistency: Calories ≈ (Protein * 4) + (Carbs * 4) + (Fats * 9) within ±5%.

5b. HIGH-PRECISION VOLUME ESTIMATION (0.1 CUP INTERVALS):
    - AVOID coarse rounding to 0.5, 1.0, or 1.5 cups! Real food servings are rarely exact half or whole cups.
    - Measure and state cup volumes at granular 0.1 cup precision (e.g. "0.3 cup", "0.6 cup", "0.7 cup", "0.8 cup", "1.1 cups", "1.2 cups", "1.3 cups", "1.4 cups").
    - CONSERVATIVE ROUND-DOWN MANDATE: If uncertain between intervals or volume, ALWAYS round down to the nearest lower 0.1 interval or nearest 1 (e.g., if visually between 1.2 and 1.3 cups, choose 1.2 cups; if uncertain between a fraction and a whole amount, round down to the lower tenth or nearest 1). Never overestimate volume.

5c. LIQUID VOLUME & LITRE (L) CONVERSIONS:
    - 1L = 1 Litre = 1000ml = strictly 4 standard cups (250ml each).
    - When the user specifies litres or 'L' (e.g. "1L milk", "1.5L water", "2L milk", "500ml"):
      * RECOGNIZE LITRES DIRECTLY: DO NOT automatically collapse or truncate 1L down to 1 cup! 1L is exactly 4 cups (1000ml).
      * When the user specifies "1L milk", preserve the unit as Litres in the portion label (e.g. "1L (1000ml / 4 cups)").
      * Normal milk (2% reduced fat) at 1L is 4 cups = 480 kcal, 32g protein, 46g carbs, ~19.2g fats (strictly 4x the 1-cup benchmark of 120 kcal / 8g P).

OUTPUT FORMAT (STRICT JSON ONLY, NO MARKDOWN OUTSIDE THE JSON):
{
  "hasFood": true,
  "name": "Concise Descriptive Title (e.g. Grilled Chicken, White Rice & Steamed Broccoli)",
  "slot": "meal",
  "items": [
    {
      "name": "Clean Ingredient Name",
      "portion": "Explicit Portion (e.g. 180g, 1.2 cups, 0.8 cup, 1 drumstick (~70g gross, ~42g meat))",
      "calories": 330,
      "protein": 62,
      "carbs": 0,
      "fats": 7
    }
  ],
  "calories": 555,
  "protein": 67,
  "carbs": 40,
  "fats": 12,
  "notes": "Brief summary of applied modifiers or tare deductions"
}`;

    const prompt = `Parse this food log entry accurately into itemized ingredients and calculate strict macros: "${cleanQuery}"`;

    for (const model of textModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

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
              maxOutputTokens: 2048,
            }
          })
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const parsed = safeParseJson(rawText);
            if (parsed && parsed.hasFood !== false && Array.isArray(parsed.items) && parsed.items.length > 0) {
              const isCannedSalmon = /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(it.name || '')));

              if (isCannedSalmon && parsed.items.length <= 1 && (parsed.protein !== 40 || parsed.calories !== 200)) {
                parsed.name = "Canned Salmon";
                parsed.calories = 200;
                parsed.protein = 40;
                parsed.carbs = 0;
                parsed.fats = 4;
                parsed.items = [
                  { name: "Canned Salmon", portion: "1 can (150g)", calories: 200, protein: 40, carbs: 0, fats: 4 }
                ];
                parsed.notes = "Calibrated to verified sports nutrition ground truth (200 kcal, 40g protein per can)";
              }

              const isNatureValley = /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(it.name || '')));

              if (isNatureValley && parsed.items.length <= 1 && (parsed.calories === 190 || parsed.calories === 0 || !parsed.calories)) {
                parsed.name = parsed.name || "Nature Valley Bar";
                parsed.calories = 170;
                parsed.protein = 3.5;
                parsed.carbs = 23;
                parsed.fats = 7.5;
                parsed.items = [
                  { name: "Nature Valley Bar", portion: "1 bar / pouch (35g)", calories: 170, protein: 3.5, carbs: 23, fats: 7.5 }
                ];
                parsed.notes = "Calibrated to verified nutrition facts (170 kcal, 3.5g protein, 23g carbs, 7.5g fats per bar/pouch)";
              }

              parsed.items = (parsed.items || []).map(it => {
                const itName = typeof it === 'string' ? it : it?.name || '';
                if (/nature\s*valley/i.test(itName) && it && typeof it === 'object' && it.calories === 190) {
                  return { ...it, calories: 170, protein: 3.5, carbs: 23, fats: 7.5 };
                }
                return it;
              });

              parsed.items = calibrateMealItems(parsed.items || []);

              // STRICT MATHEMATICAL SUMMATION LAW (Cal AI & MacroFactor Standard):
              // Recalculate total calories and macros strictly as the sum of verified parsed.items.
              // This permanently prevents arbitrary model hallucinations or item drift from overriding verified components.
              const itemsSumCalories = parsed.items.reduce((s, it) => s + (Number(it.calories) || 0), 0);
              const itemsSumProtein = parsed.items.reduce((s, it) => s + (Number(it.protein) || 0), 0);
              const itemsSumCarbs = parsed.items.reduce((s, it) => s + (Number(it.carbs) || 0), 0);
              const itemsSumFats = parsed.items.reduce((s, it) => s + (Number(it.fats) || 0), 0);

              const totalCalories = itemsSumCalories > 0
                ? Math.round(itemsSumCalories)
                : (parsed.calories || calculateCaloriesFromMacros(itemsSumProtein, itemsSumCarbs, itemsSumFats));
              const totalProtein = Math.round(itemsSumProtein * 10) / 10;
              const totalCarbs = Math.round(itemsSumCarbs * 10) / 10;
              const totalFats = Math.round(itemsSumFats * 10) / 10;

              return {
                hasFood: true,
                name: parsed.name || "Analyzed Meal",
                slot: parsed.slot || "meal",
                items: parsed.items,
                calories: totalCalories,
                protein: totalProtein,
                carbs: totalCarbs,
                fats: totalFats,
                notes: parsed.notes || "Verified by Wolfe Quick Log AI"
              };
            }
          }
        }
      } catch (err) {
        // Fall to next model
      }
    }
  }

  // 2. Offline / Fallback Local Engine
  const localParsed = parseMealDescription(cleanQuery, { kitchenCalibration, householdPantry });
  if (localParsed && localParsed.items && localParsed.items.length > 0) {
    return {
      hasFood: true,
      name: localParsed.name,
      slot: localParsed.slot || 'meal',
      items: localParsed.items,
      calories: localParsed.calories,
      protein: localParsed.protein,
      carbs: localParsed.carbs,
      fats: localParsed.fats,
      notes: localParsed.notes || "Calculated from verified sports nutrition ingredient database"
    };
  }

  return {
    hasFood: false,
    errorMessage: `Could not identify foods in "${cleanQuery}". Try e.g. "200g chicken, 1 cup rice, 1 cup broccoli" or "2 eggs on toast with butter".`
  };
}

/**
 * Scans a Nutrition Facts label, packaging text, or barcode from a food product image using Gemini Vision
 */
export async function scanNutritionLabelWithAI({ imageBase64, mimeType = 'image/jpeg', aiConfig = DEFAULT_AI_CONFIG }) {
  const apiKey = aiConfig?.apiKey || API_KEY;
  if (!apiKey || !imageBase64) {
    return {
      hasLabel: false,
      errorMessage: "No API key configured or no image provided."
    };
  }

  const rawBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const visionModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-flash-lite-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite'
  ];

  const systemInstruction = `You are an OCR nutrition facts label reader and barcode scanner for Wolfe OS.
Inspect the food label, nutrition facts table, packaging, or barcode in the image.
Extract exact printed nutrition facts:
- "productName": Clean name of the product or item (e.g. "Nature Valley Oats & Honey Granola Bar", "Pure Protein Chocolate Peanut Butter Bar", "Chobani Plain Greek Yogurt")
- "brand": Brand name if visible
- "servingSize": Printed serving size (e.g. "1 bar (42g)", "2 scoops (64g)", "1 cup (240ml)")
- "servingsPerContainer": Number or string if visible
- "calories": Number of calories per serving
- "protein": Grams of protein per serving (number)
- "carbs": Grams of total carbohydrates per serving (number)
- "fats": Grams of total fat per serving (number)
- "fiber": Grams of dietary fiber per serving (number or null)
- "sugar": Grams of total sugars per serving (number or null)
- "barcodeNumber": Numeric barcode (UPC / EAN) digits if visible in image, else null
- "hasLabel": Set to false ONLY if the image does not contain any readable food label, package, barcode, or nutritional info.
- "errorMessage": String explanation if hasLabel is false.

Return ONLY valid JSON matching this schema:
{
  "hasLabel": true,
  "productName": "Nature Valley Bar",
  "brand": "Nature Valley",
  "servingSize": "1 bar / pouch (35g)",
  "servingsPerContainer": 1,
  "calories": 170,
  "protein": 3.5,
  "carbs": 23,
  "fats": 7.5,
  "fiber": 2,
  "sugar": 11,
  "barcodeNumber": null,
  "notes": "Exact values read from Nutrition Facts label"
}`;

  const prompt = "Read the Nutrition Facts label, product title, and barcode from this food package.";

  for (const model of visionModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: rawBase64
                  }
                }
              ]
            }
          ],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 2048
          }
        })
      });

      clearTimeout(timeoutId);
      if (!response.ok) continue;

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => p.text && !p.thought) || parts[0];
      const rawText = textPart?.text || '';

      if (rawText) {
        const parsed = safeParseJson(rawText);
        if (parsed) {
          if (parsed.hasLabel === false) {
            return {
              hasLabel: false,
              errorMessage: parsed.errorMessage || "Could not read Nutrition Facts label. Please ensure the label is well-lit and clear."
            };
          }
          let itemCals = Number(parsed.calories) || calculateCaloriesFromMacros(parsed.protein, parsed.carbs, parsed.fats);
          let itemP = Number(parsed.protein) || 0;
          let itemC = Number(parsed.carbs) || 0;
          let itemF = Number(parsed.fats) || 0;

          if (/nature\s*valley/i.test(`${parsed.brand || ''} ${parsed.productName || ''}`) && (itemCals === 190 || itemCals === 0 || !itemCals)) {
            itemCals = 170;
            itemP = 3.5;
            itemC = 23;
            itemF = 7.5;
          }

          return {
            hasLabel: true,
            productName: parsed.productName || "Packaged Food Item",
            brand: parsed.brand || "",
            servingSize: parsed.servingSize || "1 serving",
            servingsPerContainer: parsed.servingsPerContainer || 1,
            calories: itemCals,
            protein: itemP,
            carbs: itemC,
            fats: itemF,
            fiber: parsed.fiber != null ? Number(parsed.fiber) : null,
            sugar: parsed.sugar != null ? Number(parsed.sugar) : null,
            barcodeNumber: parsed.barcodeNumber || null,
            notes: parsed.notes || "Read from Nutrition Facts label"
          };
        }
      }
    } catch (err) {
      // try next model
    }
  }

  return {
    hasLabel: false,
    errorMessage: "Could not read label. Please take a clearer, closer photo of the Nutrition Facts panel or barcode."
  };
}

/**
 * Lookup barcode directly from Open Food Facts API
 */
export async function lookupBarcodeOpenFoodFacts(barcode) {
  const cleanBarcode = (barcode || '').replace(/\D/g, '');
  if (!cleanBarcode || cleanBarcode.length < 8) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const nutriments = p.nutriments || {};
    
    // Check serving first, else 100g
    const cals = Math.round(Number(nutriments['energy-kcal_serving'] || nutriments['energy-kcal_100g'] || 0));
    const protein = Math.round(Number(nutriments['proteins_serving'] || nutriments['proteins_100g'] || 0));
    const carbs = Math.round(Number(nutriments['carbohydrates_serving'] || nutriments['carbohydrates_100g'] || 0));
    const fats = Math.round(Number(nutriments['fat_serving'] || nutriments['fat_100g'] || 0));
    const fiber = nutriments['fiber_serving'] != null ? Math.round(Number(nutriments['fiber_serving'])) : null;
    const sugar = nutriments['sugars_serving'] != null ? Math.round(Number(nutriments['sugars_serving'])) : null;

    return {
      hasLabel: true,
      productName: p.product_name || p.generic_name || `Barcode Item (${cleanBarcode})`,
      brand: p.brands || '',
      servingSize: p.serving_size || '1 serving',
      calories: cals || calculateCaloriesFromMacros(protein, carbs, fats),
      protein,
      carbs,
      fats,
      fiber,
      sugar,
      barcodeNumber: cleanBarcode,
      notes: "Verified via Open Food Facts database"
    };
  } catch (e) {
    return null;
  }
}

/**
 * Search branded foods and products via Open Food Facts and Gemini FDA/Nutrition database
 */
export async function searchBrandedFoodDatabase({ query, aiConfig = DEFAULT_AI_CONFIG }) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  const apiKey = aiConfig?.apiKey || API_KEY || (typeof localStorage !== 'undefined' ? (JSON.parse(localStorage.getItem('wolfe_os_settings') || '{}')?.aiConfig?.apiKey || JSON.parse(localStorage.getItem('wolfe_settings') || '{}')?.aiConfig?.apiKey) : '');
  const results = [];
  const seenNames = new Set();

  // 1. Query Open Food Facts search API (Fast global database with barcodes)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanQuery)}&search_simple=1&action=process&json=true&page_size=6`, {
      headers: { 'User-Agent': 'WolfeOS/1.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && Array.isArray(data.products)) {
        for (const p of data.products) {
          if (!p.product_name) continue;
          const nutriments = p.nutriments || {};
          const cals = Math.round(Number(nutriments['energy-kcal_serving'] || nutriments['energy-kcal_100g'] || 0));
          const protein = Math.round(Number(nutriments['proteins_serving'] || nutriments['proteins_100g'] || 0));
          const carbs = Math.round(Number(nutriments['carbohydrates_serving'] || nutriments['carbohydrates_100g'] || 0));
          const fats = Math.round(Number(nutriments['fat_serving'] || nutriments['fat_100g'] || 0));

          if (cals > 0 || protein > 0) {
            const key = (p.product_name + (p.brands || '')).toLowerCase();
            if (!seenNames.has(key)) {
              seenNames.add(key);
              results.push({
                id: p.code || `off-${Math.random().toString(36).substr(2, 9)}`,
                name: p.product_name,
                brand: p.brands || '',
                servingSize: p.serving_size || '1 serving',
                calories: cals,
                protein,
                carbs,
                fats,
                fiber: nutriments['fiber_serving'] != null ? Math.round(Number(nutriments['fiber_serving'])) : null,
                sugar: nutriments['sugars_serving'] != null ? Math.round(Number(nutriments['sugars_serving'])) : null,
                source: 'Open Food Facts'
              });
            }
          }
        }
      }
    }
  } catch (err) {}

  // 2. Gemini fallback / enhancer: precise FDA/USDA manufacturer label data
  if (results.length < 3 && apiKey) {
    const models = [
      'gemini-3.5-flash-lite',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-flash-lite-latest',
      'gemini-1.5-flash'
    ];

    const prompt = `Search the verified food and nutrition database for the branded food: "${cleanQuery}".
Return up to 4 exact or closely matching branded food items with exact manufacturer Nutrition Facts label data.`;

    const systemInstruction = `You are a clinical sports dietitian and precise FDA & USDA branded food label authority.
For the user's food/brand search query, return exact manufacturer Nutrition Facts label values.
Return ONLY valid JSON matching this schema:
[
  {
    "id": "item-id",
    "name": "Full Product Name (e.g. Good Culture 2% Low-Fat Classic Cottage Cheese)",
    "brand": "Brand Name (e.g. Good Culture)",
    "servingSize": "Exact Serving Size (e.g. 1/2 cup (110g))",
    "calories": 100,
    "protein": 14,
    "carbs": 3,
    "fats": 2.5,
    "fiber": 0,
    "sugar": 3
  }
]`;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

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
              maxOutputTokens: 1024
            }
          })
        });

        clearTimeout(timeoutId);
        if (!response.ok) continue;

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find(p => p.text && !p.thought) || parts[0];
        const rawText = textPart?.text || '';

        if (rawText) {
          const parsed = safeParseJson(rawText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const item of parsed) {
              const key = (item.name + (item.brand || '')).toLowerCase();
              if (!seenNames.has(key)) {
                seenNames.add(key);
                results.push({
                  id: item.id || `ai-${Math.random().toString(36).substr(2, 9)}`,
                  name: item.name,
                  brand: item.brand || '',
                  servingSize: item.servingSize || '1 serving',
                  calories: Number(item.calories) || calculateCaloriesFromMacros(item.protein, item.carbs, item.fats),
                  protein: Number(item.protein) || 0,
                  carbs: Number(item.carbs) || 0,
                  fats: Number(item.fats) || 0,
                  fiber: item.fiber != null ? Number(item.fiber) : null,
                  sugar: item.sugar != null ? Number(item.sugar) : null,
                  source: 'FDA / Manufacturer Label'
                });
              }
            }
            break;
          }
        }
      } catch (e) {
        // Try next model
      }
    }
  }

  return results;
}



