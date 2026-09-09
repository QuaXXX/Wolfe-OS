/**
 * Clean Blank Data Store for Wolfe OS
 */

import { getTodayIso, formatDateTitle } from './calendarUtils';
import { DEFAULT_HOUSEHOLD_PANTRY } from './nutritionEngine';

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
    { id: "w-01", date: "2026-08-18", weightLbs: 183.0, time: "7:15 AM", notes: "3-week baseline" },
    { id: "w-02", date: "2026-08-21", weightLbs: 183.2, time: "7:20 AM", notes: "Post-training" },
    { id: "w-03", date: "2026-08-25", weightLbs: 183.6, time: "7:10 AM", notes: "Fasted" },
    { id: "w-04", date: "2026-08-28", weightLbs: 183.8, time: "7:30 AM", notes: "2-week checkpoint" },
    { id: "w-05", date: "2026-08-31", weightLbs: 184.0, time: "7:15 AM", notes: "Refeed day" },
    { id: "w-1", date: "2026-09-02", weightLbs: 184.2, time: "7:15 AM", notes: "Fasted morning weight" },
    { id: "w-2", date: "2026-09-03", weightLbs: 184.4, time: "7:20 AM", notes: "Post-rest day" },
    { id: "w-3", date: "2026-09-04", weightLbs: 184.1, time: "7:10 AM", notes: "Fasted" },
    { id: "w-4", date: "2026-09-05", weightLbs: 184.6, time: "7:30 AM", notes: "Leg day yesterday" },
    { id: "w-5", date: "2026-09-06", weightLbs: 184.8, time: "7:15 AM", notes: "High carb refeed" },
    { id: "w-6", date: "2026-09-07", weightLbs: 185.0, time: "7:25 AM", notes: "Fasted" },
    { id: "w-7", date: "2026-09-08", weightLbs: 185.2, time: "7:15 AM", notes: "Morning baseline" }
  ],
  householdPantry: DEFAULT_HOUSEHOLD_PANTRY,
  kitchenCalibration: {
    tasks: DEFAULT_CALIBRATION_TASKS
  },
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
