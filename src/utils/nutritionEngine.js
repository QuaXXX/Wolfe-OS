/**
 * Wolfe OS — Nutrition & Macro Bulking Engine
 * Handles macro calculations, daily aggregations, 7-day moving average weight tracking,
 * adaptive bulking caloric adjustments, and household kitchen staple presets.
 */

import { getTodayIso } from './calendarUtils.js';

// ---------------------------------------------------------------------------
// 1. DEFAULT BULKING TARGETS (High Carb, 180g Protein, 3,000-3,500 kcal)
// ---------------------------------------------------------------------------
export const DEFAULT_BULKING_TARGETS = {
  calories: 3250,      // Midpoint of 3,000 - 3,500 kcal target
  protein: 180,        // 180g Protein (720 kcal)
  carbs: 450,          // 450g Carbs (1,800 kcal) - fuels glycogen & high volume training
  fats: 80,            // 80g Fats (720 kcal) - hormonal health
  fiber: 38,           // grams
  waterMl: 3500,       // 3.5 Liters (~14 glasses)
  targetWeightGainLbsPerWeek: 0.75 // 0.5 - 1.0 lb/week clean bulk target
};

// ---------------------------------------------------------------------------
// 2. HOUSEHOLD PANTRY STAPLES (Instant 1-Tap Logging for Bulking in the House)
// ---------------------------------------------------------------------------
export const DEFAULT_HOUSEHOLD_PANTRY = [
  {
    id: "staple-whey",
    name: "Whey Protein (1 Scoop)",
    portion: "1 scoop (32g)",
    calories: 130,
    protein: 25,
    carbs: 3,
    fats: 2,
    category: "Protein",
    icon: "🥛"
  },
  {
    id: "staple-eggs",
    name: "3 Whole Eggs",
    portion: "3 large eggs",
    calories: 215,
    protein: 18,
    carbs: 1,
    fats: 15,
    category: "Protein",
    icon: "🍳"
  },
  {
    id: "staple-milk",
    name: "Whole Milk (1 Glass)",
    portion: "250 ml (1 cup)",
    calories: 150,
    protein: 8,
    carbs: 12,
    fats: 8,
    category: "Dairy",
    icon: "🥛"
  },
  {
    id: "staple-oats",
    name: "Rolled Oats (1 Cup)",
    portion: "80g dry (1 cup)",
    calories: 300,
    protein: 10,
    carbs: 54,
    fats: 5,
    category: "Carbs",
    icon: "🥣"
  },
  {
    id: "staple-rice",
    name: "Jasmine White Rice (1.5 Cups)",
    portion: "1.5 cups cooked",
    calories: 310,
    protein: 6,
    carbs: 68,
    fats: 1,
    category: "Carbs",
    icon: "🍚"
  },
  {
    id: "staple-chicken",
    name: "Chicken Breast (200g)",
    portion: "200g cooked",
    calories: 330,
    protein: 62,
    carbs: 0,
    fats: 7,
    category: "Protein",
    icon: "🍗"
  },
  {
    id: "staple-pb",
    name: "Peanut Butter (2 tbsp)",
    portion: "32g (2 tbsp)",
    calories: 190,
    protein: 8,
    carbs: 7,
    fats: 16,
    category: "Fats",
    icon: "🥜"
  },
  {
    id: "staple-banana",
    name: "Large Banana",
    portion: "1 large (135g)",
    calories: 120,
    protein: 1,
    carbs: 31,
    fats: 0,
    category: "Carbs",
    icon: "🍌"
  },
  {
    id: "staple-ground-beef",
    name: "Lean Ground Beef (200g)",
    portion: "200g (90/10)",
    calories: 380,
    protein: 50,
    carbs: 0,
    fats: 20,
    category: "Protein",
    icon: "🥩"
  },
  {
    id: "staple-bagel",
    name: "Plain Bagel with Butter",
    portion: "1 whole bagel + 1 tbsp",
    calories: 360,
    protein: 10,
    carbs: 56,
    fats: 11,
    category: "Carbs",
    icon: "🥯"
  }
];

// ---------------------------------------------------------------------------
// 3. MEAL SLOTS FOR DAILY BULK
// ---------------------------------------------------------------------------
export const MEAL_SLOTS = [
  { id: "breakfast", name: "Breakfast", icon: "🍳", targetPct: 0.25 },
  { id: "lunch", name: "Lunch", icon: "🥗", targetPct: 0.25 },
  { id: "dinner", name: "Dinner", icon: "🥩", targetPct: 0.30 },
  { id: "post_workout", name: "Post-Workout Fuel", icon: "⚡", targetPct: 0.15 },
  { id: "snacks", name: "Snacks & Evening", icon: "🥜", targetPct: 0.05 }
];

// ---------------------------------------------------------------------------
// 4. CORE MACRO & CALORIE CALCULATIONS
// ---------------------------------------------------------------------------

/**
 * Calculate expected calories based on macro grams (4 kcal/g P, 4 kcal/g C, 9 kcal/g F)
 */
export function calculateCaloriesFromMacros(protein = 0, carbs = 0, fats = 0) {
  const p = Math.max(0, Number(protein) || 0);
  const c = Math.max(0, Number(carbs) || 0);
  const f = Math.max(0, Number(fats) || 0);
  return Math.round((p * 4) + (c * 4) + (f * 9));
}

/**
 * Aggregate daily macro totals from an array of logged meals
 */
export function aggregateDailyNutrition(meals = []) {
  const safeMeals = Array.isArray(meals) ? meals : [];
  return safeMeals.reduce(
    (acc, meal) => {
      acc.calories += Math.max(0, Number(meal.calories) || 0);
      acc.protein += Math.max(0, Number(meal.protein) || 0);
      acc.carbs += Math.max(0, Number(meal.carbs) || 0);
      acc.fats += Math.max(0, Number(meal.fats) || 0);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
}

// ---------------------------------------------------------------------------
// 5. WEIGHT TRACKING & ADAPTIVE SURPLUS ENGINE
// ---------------------------------------------------------------------------

/**
 * Calculate 7-day smoothed moving average weight to eliminate daily water fluctuations
 */
export function calculateMovingAverageWeight(weightHistory = [], windowDays = 7) {
  if (!Array.isArray(weightHistory) || weightHistory.length === 0) return null;

  const sorted = [...weightHistory]
    .filter(w => w && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) return null;

  const recent = sorted.slice(-windowDays);
  const sum = recent.reduce((acc, curr) => acc + curr.weightLbs, 0);
  return Number((sum / recent.length).toFixed(1));
}

/**
 * Calculate rate of weight gain in lbs per week based on recent weigh-ins
 */
export function calculateWeightVelocity(weightHistory = []) {
  if (!Array.isArray(weightHistory) || weightHistory.length < 2) {
    return { velocityLbsPerWeek: 0, status: "insufficient_data", message: "Log 2+ days of morning weight" };
  }

  const sorted = [...weightHistory]
    .filter(w => w && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length < 2) {
    return { velocityLbsPerWeek: 0, status: "insufficient_data", message: "Log 2+ days of morning weight" };
  }

  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  const daysElapsed = Math.max(1, (new Date(newest.date) - new Date(oldest.date)) / (1000 * 60 * 60 * 24));
  const weightDiff = newest.weightLbs - oldest.weightLbs;
  const velocity = Number(((weightDiff / daysElapsed) * 7).toFixed(2));

  let status = "optimal";
  let message = "Bulking on pace (+0.5 to 1.0 lb/wk)";

  if (velocity < 0.1) {
    status = "stalled";
    message = "Weight gain stalled. Consider bumping calories.";
  } else if (velocity > 1.3) {
    status = "fast";
    message = "Gaining rapidly (>1.3 lbs/wk). Monitor fat accumulation.";
  }

  return { velocityLbsPerWeek: velocity, status, message, daysObserved: Math.round(daysElapsed) };
}

/**
 * Adaptive Surplus Advisor: Suggests increasing daily calories if scale weight hasn't moved
 */
export function getAdaptiveSurplusRecommendation(weightHistory = [], currentCalorieTarget = 3250) {
  if (!Array.isArray(weightHistory) || weightHistory.length < 5) {
    return { needsSurplus: false, reason: "Logging baseline. Continue current targets for 5+ days." };
  }

  const recent = [...weightHistory]
    .filter(w => w && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-7);

  if (recent.length < 5) {
    return { needsSurplus: false, reason: "Need 5 consecutive weigh-ins to confirm weight trend." };
  }

  const oldestRecent = recent[0].weightLbs;
  const newestRecent = recent[recent.length - 1].weightLbs;
  const delta = newestRecent - oldestRecent;

  // If gained less than 0.2 lbs over 5-7 days, weight is stalled
  if (delta < 0.2) {
    const recommendedNewTarget = Math.min(4200, currentCalorieTarget + 250);
    return {
      needsSurplus: true,
      currentWeight: newestRecent,
      daysObserved: recent.length,
      stalledDeltaLbs: Number(delta.toFixed(1)),
      suggestedAddition: 250,
      newCalorieTarget: recommendedNewTarget,
      title: "Scale Stalled — Adaptive Surplus Available",
      description: `Your morning weight is flat over the last ${recent.length} days (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} lbs). Add +250 kcal to push into growth.`
    };
  }

  return {
    needsSurplus: false,
    currentWeight: newestRecent,
    reason: `Great momentum: +${delta.toFixed(1)} lbs over recent weigh-ins.`
  };
}

// ---------------------------------------------------------------------------
// 6. SANITIZATION & LOGGING HELPERS
// ---------------------------------------------------------------------------

/**
 * Create a validated meal entry from manual or pantry inputs
 */
export function createMealEntry({
  name = "Meal",
  slot = "lunch",
  time = "",
  calories = 0,
  protein = 0,
  carbs = 0,
  fats = 0,
  items = []
}) {
  const p = Math.max(0, Math.round(Number(protein) || 0));
  const c = Math.max(0, Math.round(Number(carbs) || 0));
  const f = Math.max(0, Math.round(Number(fats) || 0));
  
  const calculatedCals = calculateCaloriesFromMacros(p, c, f);
  const rawCals = Math.max(0, Math.round(Number(calories) || 0));
  const finalCals = rawCals > 0 ? rawCals : calculatedCals;

  return {
    id: `meal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    slot: slot || "lunch",
    name: (name || "Logged Meal").trim(),
    time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    calories: finalCals,
    protein: p,
    carbs: c,
    fats: f,
    items: Array.isArray(items) ? items : [items].filter(Boolean)
  };
}

/**
 * Create a validated morning weight log entry
 */
export function createWeightLogEntry(weightLbs, dateIso = null, notes = "") {
  const parsed = parseFloat(weightLbs);
  if (isNaN(parsed) || parsed <= 50 || parsed >= 600) {
    throw new Error("Please enter a realistic weight in lbs (e.g. 185.4)");
  }
  const weight = Math.round(parsed * 10) / 10;

  return {
    id: `weight-${Date.now()}`,
    date: dateIso || getTodayIso(),
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    weightLbs: weight,
    notes: (notes || "").trim()
  };
}
