/**
 * Clean Blank Data Store for Wolfe OS
 */

import { getTodayIso, formatDateTitle } from './calendarUtils.js';
import { DEFAULT_HOUSEHOLD_PANTRY, DEFAULT_CALIBRATION_TASKS } from './nutritionEngine.js';

export const INITIAL_USER = {
  name: "Guest",
  handle: "@guest",
  avatar: "",
  bio: "Personal Executive Dashboard",
  status: "Online",
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
  targetCalories: 2000,
  consumedCalories: 0,
  protein: { current: 0, target: 150, unit: "g", color: "#6366f1" },
  carbs: { current: 0, target: 200, unit: "g", color: "#06b6d4" },
  fats: { current: 0, target: 65, unit: "g", color: "#f59e0b" },
  waterGlasses: 0,
  targetGlasses: 8,
  waterMl: 0,
  targetWaterMl: 2500,
  currentDate: getTodayIso(),
  weightHistory: [],
  householdPantry: DEFAULT_HOUSEHOLD_PANTRY,
  kitchenCalibration: {
    tasks: DEFAULT_CALIBRATION_TASKS
  },
  dailyTargets: {},
  meals: []
};

// FULLY INTEGRATED CALENDAR DATA MODEL
export const INITIAL_CALENDAR_DATA = {
  currentDate: formatDateTitle(getTodayIso()),
  selectedDate: getTodayIso(),
  items: []
};

