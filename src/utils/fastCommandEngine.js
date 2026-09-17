import { getTodayIso, addDays } from './calendarUtils.js';
import { parseCalendarCommand } from './calendarParser.js';
import { 
  updateGoogleTaskStatus, 
  clearGoogleTasks,
  deleteGoogleCalendarEvent, 
  isGoogleCalendarConnected
} from './googleCalendarService.js';
import { parseMealDescription, createMealEntry, aggregateDailyNutrition, isFoodLogQuery } from './nutritionEngine.js';
import { recordAdditionOrUpdate, triggerImmediateCloudPush, markLocalMutation } from './cloudSyncEngine.js';

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
    .trim()
    .replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '')
    .toLowerCase()
    .replace(/^(hey|hi|yo|ok|okay|please|can you|could you|i want to|just|quick|wolfe|assistant)\s+/gi, '')
    .replace(/\s+(please|thanks|thank you)\s*$/gi, '')
    .replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '')
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
    onNavigate,
    onClearCalendar,
    onDeleteSpecificItem,
    onPurgeItems,
    onEventCreated,
    onLogMeal = ctx.onLogMeal || ctx.osData?.onLogMeal,
    todayIso = getTodayIso()
  } = ctx;

  // ==========================================
  // 1. NAVIGATION SHORTCUTS
  // ==========================================
  const navMatch = text.match(/^(?:go\s+to|open|show|switch\s+to|navigate\s+to|take\s+me\s+to)\s+(home|dashboard|calendar|schedule|timeline|nutrition|diet|food|meals?)$/i);
  if (navMatch) {
    const target = navMatch[1].toLowerCase();
    let view = 'home';
    if (target.includes('cal') || target.includes('sched') || target.includes('time')) view = 'calendar';
    else if (target.includes('nutri') || target.includes('diet') || target.includes('food') || target.includes('meal')) view = 'nutrition';

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



  // ==========================================
  // 3. PURGE COMMAND (Instant Full Clean Removal)
  // Matches: "purge timetable", "purge all", "purge FNCE", "purge OPMA", "purge schedule", "purge all events", "purge deadlines"
  // ==========================================
  const purgeMatch = text.match(/^purge(?:\s+(?:all\s+)?(.+))?$/i) || 
                     text.match(/\bpurge\s+(?:all\s+)?([a-z0-9\s_-]+)/i);
  if (purgeMatch) {
    const rawTarget = (purgeMatch[1] || 'all').trim();
    if (onPurgeItems) {
      onPurgeItems(rawTarget);
    } else if (osData?.onPurgeItems) {
      osData.onPurgeItems(rawTarget);
    } else if (onClearCalendar && (rawTarget === 'all' || rawTarget === 'calendar' || rawTarget === 'everything')) {
      onClearCalendar('ALL');
    }

    return {
      handled: true,
      title: "🗑️ Purge Executed",
      message: `Purged "${rawTarget}" events from Wolfe OS & Google Calendar. Tap Undo if needed.`,
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
    const rawTitle = completeTaskMatch[1].trim().replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '');
    const titleQuery = rawTitle.toLowerCase();
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
      message: `Marked "${rawTitle}" as completed.`,
      targetView: "calendar"
    };
  }

  // Fast Delete Specific Item by Name
  const deleteMatch = text.match(/^(?:delete|remove|cancel|drop)\s+(?:the\s+)?(?:task|event|item|deadline|reminder)?\s*(.+)$/i);
  if (deleteMatch && !text.includes('calendar') && !text.includes('all')) {
    const itemTitle = deleteMatch[1].trim().replace(/^["'`“‘\s]+|["'`”’\s]+$/g, '');
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
  // 3.5 CALENDAR SCHEDULING (Natural Language Event, Deadline, Task, Reminder)
  // ==========================================
  const parsedCalendarItem = parseCalendarCommand(rawText, todayIso);
  if (parsedCalendarItem) {
    const newItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ...parsedCalendarItem
    };

    if (onEventCreated) {
      onEventCreated(newItem);
    } else if (osData?.onEventCreated) {
      osData.onEventCreated(newItem);
    } else if (setCalendarData) {
      setCalendarData(prev => ({
        ...prev,
        items: [newItem, ...prev.items.filter(it => it.id !== newItem.id)]
      }));
      recordAdditionOrUpdate(newItem.id);
    }

    const timeLabel = newItem.isAllDay ? 'All Day' : newItem.time;
    const dateLabel = newItem.date === todayIso ? 'today' : (newItem.date === addDays(todayIso, 1) ? 'tomorrow' : newItem.date);
    const typeLabel = newItem.type === 'deadline' ? 'Deadline' : (newItem.type === 'task' ? 'Task' : (newItem.type === 'reminder' ? 'Reminder' : 'Event'));

    return {
      handled: true,
      title: `📅 ${typeLabel} Added`,
      message: `Added "${newItem.title}" for ${dateLabel} (${timeLabel}) to your calendar.`,
      targetView: "calendar",
      actionLabel: "View Calendar",
      actionType: "CREATE_CALENDAR_ITEM",
      calendarItem: newItem
    };
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

  // Natural Language Food Logging: "add 2 eggs and toast", "log 1 peanutbutter toast", "ate chicken and rice", "3 tacos"
  const isFoodIntent = isFoodLogQuery(text);
  const foodLogMatch = text.match(/^(?:log|add|record|track|ate|had|eating|eat)\s+(?:food|meal|breakfast|lunch|dinner|snack)?\s*[:\-]?\s*(.+)$/i);

  if (foodLogMatch || isFoodIntent) {
    const rawFoodPhrase = foodLogMatch 
      ? foodLogMatch[1].trim() 
      : text.replace(/^(?:log|add|record|track|ate|had|eating|eat|put)\s+(?:food|meal|breakfast|lunch|dinner|snack)?\s*[:\-]?\s*/i, '').trim();

    if (!rawFoodPhrase.match(/\b(?:task|todo|deadline|event|meeting|class|workout|gym|trade|stock)\b/i)) {
      const parsedMeal = parseMealDescription(rawFoodPhrase);
      if (parsedMeal && parsedMeal.items && parsedMeal.items.length > 0) {
        const todayIso = getTodayIso();
        let slot = 'meal';
        if (/\bbreakfast\b/i.test(text)) slot = 'breakfast';
        else if (/\blunch\b/i.test(text)) slot = 'lunch';
        else if (/\bdinner\b/i.test(text)) slot = 'dinner';
        else if (/\bsnack\b/i.test(text)) slot = 'snack';

        const mealEntry = createMealEntry({
          date: todayIso,
          name: parsedMeal.name,
          slot,
          calories: parsedMeal.calories,
          protein: parsedMeal.protein,
          carbs: parsedMeal.carbs,
          fats: parsedMeal.fats,
          items: parsedMeal.items
        });

        recordAdditionOrUpdate(mealEntry.id);
        markLocalMutation();

        if (onLogMeal) {
          onLogMeal(mealEntry);
        } else if (setNutritionData) {
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

          setNutritionData(nextData);
          triggerImmediateCloudPush(80);
        }

        return {
          handled: true,
          title: "🍽️ Meal Logged",
          message: `Logged ${parsedMeal.name}: ${parsedMeal.calories} kcal | ${parsedMeal.protein}g P | ${parsedMeal.carbs}g C | ${parsedMeal.fats}g F.`,
          targetView: "nutrition",
          actionLabel: "View Nutrition"
        };
      }
    }
  }

  // Direct food utterance without prefix: "1 peanutbutter toast", "quinoa, cottagecheese, kale, chickpea and sweet potato bowl"
  if (!text.match(/\b(?:task|todo|deadline|event|meeting|class|workout|gym|trade|stock|water|theme|color|accent|mode|screen|view|brief|position)\b/i)) {
    const directMeal = parseMealDescription(text);
    if (directMeal && directMeal.items && directMeal.items.length > 0 && directMeal.source === "ingredient_engine") {
      const todayIso = getTodayIso();
      const mealEntry = createMealEntry({
        date: todayIso,
        name: directMeal.name,
        slot: 'meal',
        calories: directMeal.calories,
        protein: directMeal.protein,
        carbs: directMeal.carbs,
        fats: directMeal.fats,
        items: directMeal.items
      });

      recordAdditionOrUpdate(mealEntry.id);
      markLocalMutation();

      if (onLogMeal) {
        onLogMeal(mealEntry);
      } else if (setNutritionData) {
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

        setNutritionData(nextData);
        triggerImmediateCloudPush(80);
      }

      return {
        handled: true,
        title: "🍽️ Meal Logged",
        message: `Logged ${directMeal.name}: ${directMeal.calories} kcal | ${directMeal.protein}g P | ${directMeal.carbs}g C | ${directMeal.fats}g F.`,
        targetView: "nutrition",
        actionLabel: "View Nutrition"
      };
    }
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
  // 5. SCHEDULE & AGENDA QUERY
  // ==========================================

  // Query Today's Schedule / Agenda
  if (text.match(/\b(?:what(?:'s|\s+is)\s+my\s+schedule|my\s+agenda|what\s+do\s+i\s+have\s+today|today(?:'s)?\s+schedule|my\s+deadlines\s+today|what\s+do\s+i\s+have\s+to\s+do)\b/i) || text === 'schedule' || text === 'agenda') {
    const calendarItems = osData?.calendarData?.items || [];
    const todayItems = calendarItems.filter(it => it.date === todayIso);
    const deadlines = todayItems.filter(it => it.type === 'deadline');
    const events = todayItems.filter(it => it.type === 'event');
    const tasks = todayItems.filter(it => it.type === 'task' && !it.completed);

    let parts = [];
    if (deadlines.length > 0) parts.push(`${deadlines.length} deadline${deadlines.length > 1 ? 's' : ''} (${deadlines.map(d => d.title).join(', ')})`);
    if (events.length > 0) parts.push(`${events.length} event${events.length > 1 ? 's' : ''} (${events.map(e => `${e.title} at ${e.time || 'scheduled'}`).join(', ')})`);
    if (tasks.length > 0) parts.push(`${tasks.length} task${tasks.length > 1 ? 's' : ''}`);

    if (parts.length > 0) {
      return {
        handled: true,
        title: "📅 Today's Agenda",
        message: `Today: ${parts.join('; ')}.`,
        targetView: "calendar",
        actionLabel: "Open Calendar"
      };
    } else {
      return {
        handled: true,
        title: "📅 Schedule Clear",
        message: "Your schedule is clear for today! No deadlines or scheduled events.",
        targetView: "calendar",
        actionLabel: "View Calendar"
      };
    }
  }

  // Query Nutrition / Calories
  if (text.match(/\b(?:how\s+many\s+calories\s+left|calories\s+left|nutrition\s+status|macro\s+status|how\s+much\s+protein)\b/i) || text === 'calories' || text === 'macros') {
    const consumed = osData?.nutritionData?.consumedCalories || 0;
    const target = osData?.nutritionData?.targetCalories || 2750;
    const remaining = Math.max(0, target - consumed);
    const protein = osData?.nutritionData?.consumedProtein || 0;
    const proteinTarget = osData?.nutritionData?.targetProtein || 180;
    return {
      handled: true,
      title: "🥗 Nutrition Tracker",
      message: `${consumed} / ${target} kcal (${remaining} kcal remaining). Protein: ${protein}g / ${proteinTarget}g.`,
      targetView: "nutrition",
      actionLabel: "View Nutrition"
    };
  }

  // Not a fast command -> Pass to Gemini AI
  return { handled: false };
}
