import { getTodayIso, addDays } from './calendarUtils.js';
import { 
  updateGoogleTaskStatus, 
  clearGoogleTasks,
  deleteGoogleCalendarEvent, 
  isGoogleCalendarConnected,
  purgeGoogleCalendarEntriesByKeywords
} from './googleCalendarService.js';

// Color theme hue mappings
const THEME_COLOR_MAP = {
  blue: 222,
  'cyber blue': 222,
  cyan: 190,
  teal: 170,
  emerald: 155,
  green: 145,
  lime: 95,
  yellow: 50,
  gold: 42,
  amber: 38,
  orange: 25,
  red: 0,
  crimson: 350,
  rose: 340,
  pink: 320,
  purple: 275,
  violet: 265,
  indigo: 245
};

/**
 * Clean voice/text conversational buffer junk
 */
function cleanSpeechBuffer(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/^(hey|hi|yo|ok|okay|please|can you|could you|i want to|just|quick|wolfe|assistant)\s+/gi, '')
    .replace(/\s+(please|thanks|thank you)\s*$/gi, '')
    .trim();
}

/**
 * Try to execute command locally with buffered pattern matching.
 * Returns { handled: true, title, message, targetView, actionLabel, undoData, ... } if executed,
 * or { handled: false } if it should proceed to Gemini AI.
 */
export function tryExecuteFastCommand(rawText, ctx = {}) {
  const text = cleanSpeechBuffer(rawText);
  if (!text) return { handled: false };

  const {
    osData = {},
    setSettings,
    setCalendarData,
    setNutritionData,
    setWorkoutData,
    setTradingData,
    setSchoolData,
    onNavigate,
    onClearCalendar,
    onDeleteSpecificItem,
    onEventCreated,
    todayIso = getTodayIso()
  } = ctx;

  // ==========================================
  // 1. NAVIGATION SHORTCUTS
  // ==========================================
  const navMatch = text.match(/^(?:go\s+to|open|show|switch\s+to|navigate\s+to|take\s+me\s+to)\s+(home|dashboard|calendar|schedule|timeline|school|academics|workouts?|gym|fitness|nutrition|diet|food|meals?|trading|stocks?|markets?)$/i);
  if (navMatch) {
    const target = navMatch[1].toLowerCase();
    let view = 'home';
    if (target.includes('cal') || target.includes('sched') || target.includes('time')) view = 'calendar';
    else if (target.includes('school') || target.includes('acad')) view = 'school';
    else if (target.includes('work') || target.includes('gym') || target.includes('fit')) view = 'workouts';
    else if (target.includes('nutri') || target.includes('diet') || target.includes('food') || target.includes('meal')) view = 'nutrition';
    else if (target.includes('trad') || target.includes('stock') || target.includes('market')) view = 'trading';

    if (onNavigate) onNavigate(view);
    return {
      handled: true,
      title: `Navigated to ${view.charAt(0).toUpperCase() + view.slice(1)}`,
      message: `Switched to ${view.toUpperCase()} view.`,
      targetView: view,
      actionLabel: "View"
    };
  }

  // ==========================================
  // 2. THEME & DISPLAY SETTINGS
  // ==========================================
  // Theme Color Change
  const themeMatch = text.match(/\b(?:theme|color|accent)\b.*?\b([a-z\s]+)\b/i) ||
                     text.match(/\b(?:change|set|switch|make|update)\s+(?:the\s+)?(?:theme|accent|color)\s+(?:to\s+)?([a-z\s]+)/i) ||
                     text.match(/^theme\s+([a-z\s]+)$/i) ||
                     text.match(/^([a-z\s]+)\s+theme$/i) ||
                     text.match(/^(purple|violet|indigo|blue|cyan|teal|green|emerald|lime|yellow|gold|amber|orange|red|crimson|rose|pink)$/i);
  if (themeMatch) {
    const rawTarget = (themeMatch[1] || text).toLowerCase().trim();
    for (const [name, hue] of Object.entries(THEME_COLOR_MAP)) {
      if (rawTarget.includes(name) || name.includes(rawTarget)) {
        if (setSettings) {
          setSettings(prev => ({ ...prev, accentHue: hue }));
        }
        if (typeof document !== 'undefined') {
          document.documentElement.style.setProperty('--accent-hue', hue);
          document.documentElement.style.setProperty('--accent-primary', `hsl(${hue}, 95%, 58%)`);
          document.documentElement.style.setProperty('--accent-subtle', `hsla(${hue}, 95%, 58%, 0.12)`);
          document.documentElement.style.setProperty('--accent-border', `hsla(${hue}, 95%, 58%, 0.25)`);
          document.documentElement.style.setProperty('--accent-glow', `hsla(${hue}, 95%, 58%, 0.35)`);
        }
        return {
          handled: true,
          title: "🎨 Theme Updated",
          message: `Accent color set to ${name.toUpperCase()} (${hue}° hue).`,
          targetView: "home"
        };
      }
    }
  }

  // Toggle Compact Mode
  if (text.match(/\b(?:compact\s+mode|compact\s+dashboard|toggle\s+compact)\b/i) || text.match(/\b(?:make|set)\s+(?:dashboard|it)\s+compact\b/i)) {
    const isOff = text.includes('off') || text.includes('disable');
    const isOn = text.includes('on') || text.includes('enable');
    if (setSettings) {
      setSettings(prev => ({
        ...prev,
        compactMode: isOn ? true : isOff ? false : !prev.compactMode
      }));
    }
    return {
      handled: true,
      title: "📐 Dashboard Density",
      message: `Switched compact dashboard layout.`,
      targetView: "home"
    };
  }

  // Toggle Sound
  if (text.match(/\b(?:mute|unmute|sound\s+on|sound\s+off|toggle\s+sound|audio\s+on|audio\s+off)\b/i)) {
    const isMute = text.includes('mute') || text.includes('off');
    if (setSettings) {
      setSettings(prev => ({ ...prev, soundEnabled: !isMute }));
    }
    return {
      handled: true,
      title: isMute ? "🔇 Audio Muted" : "🔊 Audio Enabled",
      message: `Sound effects are now ${isMute ? 'muted' : 'enabled'}.`,
      targetView: "home"
    };
  }

  // Purge / Remove Specific Course (e.g. "remove all FNCE", "clear OPMA", "purge FNCE and OPMA")
  const purgeCourseMatch = text.match(/\b(?:clear|remove|delete|purge|wipe|erase)\b.*\b([a-z]{2,6}\s*\d{0,4})\b/i);
  if (purgeCourseMatch || (text.match(/\b(?:clear|remove|delete|purge|wipe|erase)\b/) && (text.includes('fnce') || text.includes('opma')))) {
    const courseCode = purgeCourseMatch ? purgeCourseMatch[1].toUpperCase().trim() : (text.includes('fnce') ? 'FNCE' : 'OPMA');
    const keywords = (text.includes('fnce') && text.includes('opma')) ? ['FNCE', 'OPMA'] : [courseCode];

    if (setCalendarData) {
      setCalendarData(prev => ({
        ...prev,
        items: prev.items.filter(it => !keywords.some(kw => it.title?.toUpperCase().includes(kw)))
      }));
    }

    if (isGoogleCalendarConnected()) {
      purgeGoogleCalendarEntriesByKeywords(keywords).catch(console.warn);
    }

    return {
      handled: true,
      title: `🧹 ${keywords.join(' & ')} Purged`,
      message: `Deleted all ${keywords.join(' & ')} events and deadlines from Wolfe OS & Google Calendar.`,
      targetView: "calendar"
    };
  }

  // Clear / Remove All Deadlines
  if (text.match(/\b(?:clear|remove|delete|purge|wipe)\b.*\b(?:all\s+)?deadlines?\b/i)) {
    let targetDate = 'ALL';
    if (text.includes('today')) targetDate = todayIso;
    else if (text.includes('tomorrow')) targetDate = addDays(todayIso, 1);

    if (osData?.onClearDeadlines) {
      osData.onClearDeadlines(targetDate);
    } else if (setCalendarData) {
      setCalendarData(prev => {
        const toRemove = prev.items.filter(it => it.type === 'deadline' && (targetDate === 'ALL' || it.date === targetDate));
        if (isGoogleCalendarConnected()) {
          for (const dl of toRemove) {
            deleteGoogleCalendarEvent(dl.id, false).catch(console.warn);
          }
        }
        return {
          ...prev,
          items: prev.items.filter(it => !(it.type === 'deadline' && (targetDate === 'ALL' || it.date === targetDate)))
        };
      });
    }

    return {
      handled: true,
      title: "🗑️ Deadlines Removed",
      message: `Removed ${targetDate === 'ALL' ? 'all deadlines' : `deadlines for ${targetDate}`} from Wolfe OS & Google Calendar.`,
      targetView: "calendar"
    };
  }

  // Clear Calendar / Wipe Schedule
  if (text.match(/\b(?:clear|wipe|empty|reset|erase)\b.*\b(?:calendar|schedule|timeline|day|today|tomorrow|events)\b/i)) {
    let targetDate = todayIso;
    if (text.includes('tomorrow')) targetDate = addDays(todayIso, 1);
    else if (text.includes('all') && (text.includes('days') || text.includes('everything') || text.includes('events'))) targetDate = 'ALL';

    if (onClearCalendar) {
      onClearCalendar(targetDate);
    }
    return {
      handled: true,
      title: "🧹 Calendar Cleared",
      message: `Cleared all events and deadlines for ${targetDate === 'ALL' ? 'all days' : targetDate}.`,
      targetView: "calendar"
    };
  }

  // Clear Completed Tasks
  if (text.match(/\b(?:clear|remove|delete|purge|clean\s*up)\b.*\b(?:completed|done|finished|checked)\b.*\btasks?\b/i) || text.match(/\b(?:clear|purge)\s+done\s+tasks?\b/i)) {
    if (setCalendarData) {
      setCalendarData(prev => {
        const completedTasks = prev.items.filter(it => (it.type === 'task' || it.type === 'reminder') && it.completed);
        if (isGoogleCalendarConnected()) {
          for (const t of completedTasks) {
            deleteGoogleCalendarEvent(t.id, true).catch(console.warn);
          }
        }
        const toDeleteIds = new Set(completedTasks.map(t => t.id));
        const remaining = prev.items.filter(it => !toDeleteIds.has(it.id));
        return { ...prev, items: remaining };
      });
    }
    return {
      handled: true,
      title: "🧹 Cleaned Up Tasks",
      message: "Removed all completed tasks from Wolfe OS & Google.",
      targetView: "calendar"
    };
  }

  // Clear Tasks for Today / Clear All Tasks
  if (text.match(/\b(?:clear|remove|delete|purge|wipe)\b.*\btasks?\b/i)) {
    const isAll = text.includes('all') || text.includes('everything');
    const targetDate = isAll ? 'ALL' : todayIso;

    if (isGoogleCalendarConnected()) {
      clearGoogleTasks(targetDate).catch(console.warn);
    }

    if (setCalendarData) {
      setCalendarData(prev => {
        const tasksToDelete = prev.items.filter(it => (it.type === 'task' || it.type === 'reminder') && (isAll || it.date === todayIso));
        if (isGoogleCalendarConnected()) {
          for (const t of tasksToDelete) {
            deleteGoogleCalendarEvent(t.id, true).catch(console.warn);
          }
        }
        const toDeleteIds = new Set(tasksToDelete.map(t => t.id));
        return {
          ...prev,
          items: prev.items.filter(it => !toDeleteIds.has(it.id))
        };
      });
    }
    return {
      handled: true,
      title: "🧹 Tasks Cleared",
      message: isAll ? "Cleared all tasks from Wolfe OS & Google." : "Cleared today's tasks from Wolfe OS & Google.",
      targetView: "calendar"
    };
  }

  // Mark All Tasks Done
  if (text.match(/\b(?:mark|check|complete|finish|set)\b.*\b(?:all|every)\b.*\btasks?\b.*(?:done|completed|finished)?/i) || text.match(/^all tasks done$/i)) {
    if (setCalendarData) {
      setCalendarData(prev => {
        const todayTasks = prev.items.filter(it => it.type === 'task' || it.type === 'reminder');
        if (isGoogleCalendarConnected()) {
          for (const t of todayTasks) {
            updateGoogleTaskStatus(t.id, true).catch(console.warn);
          }
        }
        return {
          ...prev,
          items: prev.items.map(it => (it.type === 'task' || it.type === 'reminder') ? { ...it, completed: true } : it)
        };
      });
    }
    return {
      handled: true,
      title: "✅ All Tasks Completed",
      message: "Marked all tasks as completed and synced to Google Tasks!",
      targetView: "calendar"
    };
  }

  // Reset / Uncheck All Tasks
  if (text.match(/\b(?:uncheck|reset|unmark|clear\s+check)\b.*\b(?:all|every)?\b.*\btasks?\b/i)) {
    if (setCalendarData) {
      setCalendarData(prev => {
        const todayTasks = prev.items.filter(it => it.type === 'task' || it.type === 'reminder');
        if (isGoogleCalendarConnected()) {
          for (const t of todayTasks) {
            updateGoogleTaskStatus(t.id, false).catch(console.warn);
          }
        }
        return {
          ...prev,
          items: prev.items.map(it => (it.type === 'task' || it.type === 'reminder') ? { ...it, completed: false } : it)
        };
      });
    }
    return {
      handled: true,
      title: "🔄 Tasks Reset",
      message: "Unchecked all tasks for a fresh start.",
      targetView: "calendar"
    };
  }

  // Complete Specific Task by Name
  const completeTaskMatch = text.match(/\b(?:complete|check\s*off|finish|done\s+with)\s+(?:the\s+)?(?:task\s+)?(.+)/i);
  if (completeTaskMatch && !text.includes('workout') && !text.includes('all') && !text.includes('gym')) {
    const titleQuery = completeTaskMatch[1].trim().toLowerCase();
    if (setCalendarData) {
      setCalendarData(prev => {
        const target = prev.items.find(it => (it.type === 'task' || it.type === 'reminder') && it.title.toLowerCase().includes(titleQuery));
        if (target) {
          if (isGoogleCalendarConnected()) {
            updateGoogleTaskStatus(target.id, true).catch(console.warn);
          }
          return {
            ...prev,
            items: prev.items.map(it => it.id === target.id ? { ...it, completed: true } : it)
          };
        }
        return prev;
      });
    }
    return {
      handled: true,
      title: "✅ Task Completed",
      message: `Marked "${completeTaskMatch[1].trim()}" as completed.`,
      targetView: "calendar"
    };
  }

  // Fast Delete Specific Item by Name
  const deleteMatch = text.match(/^(?:delete|remove|cancel|drop)\s+(?:the\s+)?(?:task|event|item|deadline|reminder)?\s*(.+)$/i);
  if (deleteMatch && !text.includes('calendar') && !text.includes('all')) {
    const itemTitle = deleteMatch[1].trim();
    if (itemTitle && itemTitle.length > 1) {
      if (onDeleteSpecificItem) {
        onDeleteSpecificItem(itemTitle, 'ANY');
      }
      return {
        handled: true,
        title: "🗑️ Item Deleted",
        message: `Removed "${itemTitle}" from your schedule.`,
        targetView: "calendar"
      };
    }
  }

  // ==========================================
  // 4. NUTRITION & WATER FAST-LOGS
  // ==========================================
  // Log Water / Drink Water
  if (text.match(/\b(?:drink|drank|log|add|had|\+)\s*(\d+)?\s*(?:glass(?:es)?|cups?|bottles?)?\s*(?:of\s+)?water\b/i) || text.match(/^water\s*\+\s*(\d+)?$/i)) {
    const countMatch = text.match(/\b(\d+)\b/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 1;
    if (setNutritionData) {
      setNutritionData(prev => ({
        ...prev,
        waterGlasses: Math.min(20, (prev?.waterGlasses || 6) + count)
      }));
    }
    return {
      handled: true,
      title: "💧 Water Logged",
      message: `Added +${count} glass${count > 1 ? 'es' : ''} of water. Hydration on point!`,
      targetView: "nutrition"
    };
  }

  // Reset Water
  if (text.match(/\b(?:reset|clear|zero)\s+water\b/i)) {
    if (setNutritionData) {
      setNutritionData(prev => ({ ...prev, waterGlasses: 0 }));
    }
    return {
      handled: true,
      title: "💧 Water Reset",
      message: "Reset daily water tracker to 0/10 glasses.",
      targetView: "nutrition"
    };
  }

  // Quick Log Meal / Calories & Protein
  // Matches: "log 650 calories 40g protein", "add 500 kcal", "log lunch 700 cals 50 protein"
  const calMatch = text.match(/\b(?:log|add|ate|had)\s*(?:meal|lunch|dinner|breakfast|snack|food)?\s*(\d{2,4})\s*(?:cal|calories|kcal)\b/i) ||
                   text.match(/\b(\d{2,4})\s*(?:cal|calories|kcal)\b/i);
  if (calMatch) {
    const cals = parseInt(calMatch[1], 10);
    const proteinMatch = text.match(/\b(\d{1,3})\s*(?:g|grams?)?\s*(?:of\s+)?protein\b/i);
    const protein = proteinMatch ? parseInt(proteinMatch[1], 10) : 0;

    if (setNutritionData) {
      setNutritionData(prev => ({
        ...prev,
        consumedCalories: (prev?.consumedCalories || 1840) + cals,
        protein: {
          ...prev?.protein,
          current: (prev?.protein?.current || 140) + protein,
          target: prev?.protein?.target || 195
        }
      }));
    }
    return {
      handled: true,
      title: "🥩 Nutrition Logged",
      message: `Added +${cals} kcal${protein > 0 ? ` and +${protein}g protein` : ''}.`,
      targetView: "nutrition"
    };
  }

  // Reset Calories
  if (text.match(/\b(?:reset|clear|zero)\s+(?:calories|cals|nutrition|food)\b/i)) {
    if (setNutritionData) {
      setNutritionData(prev => ({
        ...prev,
        consumedCalories: 0,
        protein: { ...prev.protein, current: 0 }
      }));
    }
    return {
      handled: true,
      title: "🔄 Calories Reset",
      message: "Reset daily consumed calories and protein to 0.",
      targetView: "nutrition"
    };
  }

  // ==========================================
  // 5. WORKOUTS & PRs
  // ==========================================
  // Complete Workout / Finish Gym
  if (text.match(/\b(?:finish|finished|complete|completed|done\s+with)\s+(?:today'?s?\s+)?(?:workout|gym|session|training|lifting|push\s+day|pull\s+day|leg\s+day)\b/i) || text.match(/^workout\s+done$/i)) {
    if (setWorkoutData) {
      setWorkoutData(prev => ({
        ...prev,
        completedDaysThisWeek: Math.min(prev?.targetDaysThisWeek || 5, (prev?.completedDaysThisWeek || 4) + 1)
      }));
    }
    return {
      handled: true,
      confetti: true,
      title: "🏋️ Workout Completed",
      message: "Logged workout completed! Target week progress updated. Great effort!",
      targetView: "workouts"
    };
  }

  // Log PR (Personal Record)
  // Matches: "log pr bench 255 lbs", "new pr squat 315", "hit a pr on deadlift 405 lbs"
  const prMatch = text.match(/\b(?:log|new|hit|set)\s*(?:a\s+)?pr\s*(?:on|for)?\s*([a-z\s]+?)\s*(\d{2,4})\s*(?:lbs?|kg|pounds?)?\b/i);
  if (prMatch) {
    const exercise = prMatch[1].trim();
    const weight = prMatch[2];
    const prStr = `${exercise.charAt(0).toUpperCase() + exercise.slice(1)} ${weight} lbs`;

    return {
      handled: true,
      confetti: true,
      title: "🏆 New PR Logged!",
      message: `Boom! Logged new PR: ${prStr}. Keep pushing!`,
      targetView: "workouts"
    };
  }

  // ==========================================
  // 6. DAY TRADING QUICK LOGS
  // ==========================================
  // Log Trade Win/Loss
  // Matches: "log trade +350", "log win 400", "log loss 150", "made $500 on trade", "lost $120"
  const tradeWinMatch = text.match(/\b(?:log\s+trade|log\s+win|made|gain)\s*\+?\$?(\d+(?:\.\d{1,2})?)\b/i);
  const tradeLossMatch = text.match(/\b(?:log\s+loss|lost)\s*\-?\$?(\d+(?:\.\d{1,2})?)\b/i);

  if (tradeWinMatch || tradeLossMatch) {
    const isLoss = !!tradeLossMatch;
    const amount = parseFloat(isLoss ? tradeLossMatch[1] : tradeWinMatch[1]);
    const delta = isLoss ? -amount : amount;

    if (setTradingData) {
      setTradingData(prev => ({
        ...prev,
        dayPnl: Math.round(((prev?.dayPnl || 1420.50) + delta) * 100) / 100,
        dayPnlPercent: Math.round((((prev?.dayPnl || 1420.50) + delta) / 50000 * 100) * 100) / 100
      }));
    }
    return {
      handled: true,
      confetti: !isLoss,
      title: isLoss ? "📉 Trade Logged" : "📈 Trade Win Logged",
      message: `Logged trade ${isLoss ? `-$${amount}` : `+$${amount}`}. Day P&L updated.`,
      targetView: "trading"
    };
  }

  // Reset Day Trading
  if (text.match(/\b(?:reset|clear)\s+(?:trading|pnl|day\s+trades?|trades?)\b/i)) {
    if (setTradingData) {
      setTradingData(prev => ({
        ...prev,
        dayPnl: 0,
        dayPnlPercent: 0
      }));
    }
    return {
      handled: true,
      title: "📈 Trading P&L Reset",
      message: "Reset day trading session P&L to $0.00 for market open.",
      targetView: "trading"
    };
  }

  // ==========================================
  // 7. ACADEMICS / STUDY LOGS
  // ==========================================
  // Log Study Time
  const studyMatch = text.match(/\b(?:log|studied|add)\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?)\s*(?:of\s+)?(?:study|studying)?\b/i) ||
                     text.match(/\b(?:log|studied|add)\s*(\d+)\s*(?:min|mins|minutes)\s*(?:of\s+)?(?:study|studying)?\b/i);
  if (studyMatch) {
    const isMinutes = text.includes('min');
    const val = parseFloat(studyMatch[1]);
    const hoursAdded = isMinutes ? Math.round((val / 60) * 10) / 10 : val;

    if (setSchoolData) {
      setSchoolData(prev => ({
        ...prev,
        studyHoursThisWeek: (prev?.studyHoursThisWeek || 14) + hoursAdded
      }));
    }
    return {
      handled: true,
      title: "🎓 Study Session Logged",
      message: `Logged +${hoursAdded}h of study time. Academic momentum!`,
      targetView: "school"
    };
  }

  // Active Recall Flashcards Shortcut
  if (text.match(/\b(?:flashcards?|study\s+cards?|make\s+flashcards?|anki)\b/i)) {
    if (onNavigate) onNavigate('school');
    return {
      handled: true,
      title: "⚡ Active Recall Flashcards",
      message: "Opening Flashcard Deck simulator in School Hub.",
      targetView: "school"
    };
  }

  // Practice Quiz / Exam Simulator Shortcut
  if (text.match(/\b(?:quiz|practice\s+quiz|quiz\s+me|practice\s+exam|mock\s+exam|test\s+me)\b/i)) {
    if (onNavigate) onNavigate('school');
    return {
      handled: true,
      title: "📝 Practice Exam Simulator",
      message: "Opening Practice Quiz in School Hub.",
      targetView: "school"
    };
  }

  // Prof Email Drafter Shortcut
  if (text.match(/\b(?:email\s+(?:prof|professor|instructor|ta)|draft\s+email|contact\s+prof)\b/i)) {
    if (onNavigate) onNavigate('school');
    return {
      handled: true,
      title: "📧 Prof Email Drafter",
      message: "Opening Syllabus-Compliant Email Drafter in School Hub.",
      targetView: "school"
    };
  }

  // Obsidian Vault Search Shortcut
  if (text.match(/\b(?:search\s+vault|ask\s+vault|find\s+in\s+notes|obsidian\s+search)\b/i)) {
    if (onNavigate) onNavigate('school');
    return {
      handled: true,
      title: "🔍 Ask My Obsidian Vault",
      message: "Opening Semantic Vault Search in School Hub.",
      targetView: "school"
    };
  }

  // Not a fast command -> Pass to Gemini AI
  return { handled: false };
}
