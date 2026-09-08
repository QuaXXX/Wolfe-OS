/**
 * Clean Blank Data Store for Wolfe OS
 */

import { getTodayIso, formatDateTitle } from './calendarUtils';

export const INITIAL_USER = {
  name: "Zach Wolfe",
  handle: "@zachwolfe",
  avatar: "",
  bio: "Founder, Quantitative Trader, CS & Finance Major",
  status: "In Deep Flow",
  focusMode: false,
};

export const INITIAL_SCHOOL_DATA = {
  gpa: "—",
  term: "Fall 2026",
  studyHoursThisWeek: 0.0,
  targetHours: 30.0,
  courses: [],
  assignments: []
};

export const INITIAL_WORKOUT_DATA = {
  split: "No Split Active",
  todayWorkout: "Rest / No Workout Scheduled",
  completedDaysThisWeek: 0,
  targetDaysThisWeek: 5,
  weeklyVolumeLbs: "0 lbs",
  prs: [],
  todayExercises: []
};

export const INITIAL_NUTRITION_DATA = {
  targetCalories: 3250,
  consumedCalories: 0,
  protein: { current: 0, target: 180, unit: "g", color: "#6366f1" },
  carbs: { current: 0, target: 450, unit: "g", color: "#06b6d4" },
  fats: { current: 0, target: 80, unit: "g", color: "#f59e0b" },
  waterGlasses: 0,
  targetGlasses: 14,
  waterMl: 0,
  targetWaterMl: 3500,
  currentDate: getTodayIso(),
  weightHistory: [
    { id: "w-1", date: "2026-09-02", weightLbs: 184.2, time: "7:15 AM", notes: "Fasted morning weight" },
    { id: "w-2", date: "2026-09-03", weightLbs: 184.4, time: "7:20 AM", notes: "Post-rest day" },
    { id: "w-3", date: "2026-09-04", weightLbs: 184.1, time: "7:10 AM", notes: "Fasted" },
    { id: "w-4", date: "2026-09-05", weightLbs: 184.6, time: "7:30 AM", notes: "Leg day yesterday" },
    { id: "w-5", date: "2026-09-06", weightLbs: 184.8, time: "7:15 AM", notes: "High carb refeed" },
    { id: "w-6", date: "2026-09-07", weightLbs: 185.0, time: "7:25 AM", notes: "Fasted" },
    { id: "w-7", date: "2026-09-08", weightLbs: 185.2, time: "7:15 AM", notes: "Morning baseline" }
  ],
  householdPantry: [
    { id: "staple-whey", name: "Whey Protein", portion: "1 scoop (32g)", calories: 130, protein: 25, carbs: 3, fats: 2, icon: "🥛" },
    { id: "staple-eggs", name: "3 Whole Eggs", portion: "3 large eggs", calories: 215, protein: 18, carbs: 1, fats: 15, icon: "🍳" },
    { id: "staple-milk", name: "Whole Milk", portion: "250 ml (1 glass)", calories: 150, protein: 8, carbs: 12, fats: 8, icon: "🥛" },
    { id: "staple-oats", name: "Rolled Oats", portion: "80g (1 cup)", calories: 300, protein: 10, carbs: 54, fats: 5, icon: "🥣" },
    { id: "staple-rice", name: "White Rice", portion: "1.5 cups cooked", calories: 310, protein: 6, carbs: 68, fats: 1, icon: "🍚" },
    { id: "staple-chicken", name: "Chicken Breast", portion: "200g cooked", calories: 330, protein: 62, carbs: 0, fats: 7, icon: "🍗" },
    { id: "staple-pb", name: "Peanut Butter", portion: "2 tbsp (32g)", calories: 190, protein: 8, carbs: 7, fats: 16, icon: "🥜" },
    { id: "staple-banana", name: "Large Banana", portion: "1 large (135g)", calories: 120, protein: 1, carbs: 31, fats: 0, icon: "🍌" },
    { id: "staple-ground-beef", name: "Ground Beef", portion: "200g (90/10)", calories: 380, protein: 50, carbs: 0, fats: 20, icon: "🥩" },
    { id: "staple-bagel", name: "Bagel w/ Butter", portion: "1 whole + 1 tbsp", calories: 360, protein: 10, carbs: 56, fats: 11, icon: "🥯" }
  ],
  meals: []
};

export const INITIAL_TRADING_DATA = {
  dayPnl: 0.00,
  dayPnlPercent: 0.00,
  weekPnl: 0.00,
  winRate: "—",
  tradesToday: 0,
  winningTrades: 0,
  accountBalance: "$0.00",
  watchlist: [],
  todayTrades: []
};

// FULLY INTEGRATED CALENDAR DATA MODEL
export const INITIAL_CALENDAR_DATA = {
  currentDate: formatDateTitle(getTodayIso()),
  selectedDate: getTodayIso(),
  items: []
};

export const VOICE_SUGGESTIONS = [
  { text: "What's on my schedule for today?", category: "Calendar" },
  { text: "Add deadline: CS 301 project due Friday", category: "Calendar" },
  { text: "Log 650 calories and 48g protein for lunch", category: "Nutrition" },
  { text: "Log trade: NVDA Long calls +$850 profit", category: "Trading" },
  { text: "Log 4 sets of 8 reps Bench Press at 225 lbs", category: "Workouts" },
  { text: "Schedule deep study block today at 2:00 PM", category: "Calendar" },
];
