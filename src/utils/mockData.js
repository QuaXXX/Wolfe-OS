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
  targetCalories: 2500,
  consumedCalories: 0,
  protein: { current: 0, target: 180, unit: "g", color: "#6366f1" },
  carbs: { current: 0, target: 250, unit: "g", color: "#06b6d4" },
  fats: { current: 0, target: 70, unit: "g", color: "#f59e0b" },
  waterGlasses: 0,
  targetGlasses: 8,
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
