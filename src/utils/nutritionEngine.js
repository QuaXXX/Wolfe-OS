/**
 * Wolfe OS — Nutrition & Fuel Engine
 * Handles precise macro calculations, daily aggregations, 7-day moving average weight tracking,
 * natural language ingredient breakdown parsing, adaptive surplus adjustments, and pantry presets.
 */

import { getTodayIso } from './calendarUtils.js';

// ---------------------------------------------------------------------------
// 1. DEFAULT NUTRITION TARGETS (High Carb, 180g Protein, 3,000-3,500 kcal)
// ---------------------------------------------------------------------------
export const DEFAULT_NUTRITION_TARGETS = {
  calories: 3250,      // Midpoint of 3,000 - 3,500 kcal target
  protein: 180,        // 180g Protein (720 kcal)
  carbs: 450,          // 450g Carbs (1,800 kcal) - fuels glycogen & high volume training
  fats: 80,            // 80g Fats (720 kcal) - hormonal health
  fiber: 38,           // grams
  waterMl: 3500,       // 3.5 Liters (~14 glasses)
  targetWeightGainLbsPerWeek: 0.75 // 0.5 - 1.0 lb/week target
};

// Backward compatibility alias
export const DEFAULT_BULKING_TARGETS = DEFAULT_NUTRITION_TARGETS;

// ---------------------------------------------------------------------------
// 2. VERIFIED SPORTS NUTRITION INGREDIENT DATABASE
// ---------------------------------------------------------------------------
export const INGREDIENT_DATABASE = [
  {
    regex: /\b(?:chicken\s+breasts?|chicken)\b/i,
    name: "Chicken Breast (Cooked)",
    defaultUnit: "g",
    defaultQty: 200,
    per100g: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
    perUnit: {
      oz: { calories: 47, protein: 8.8, carbs: 0, fats: 1 },
      g: { calories: 1.65, protein: 0.31, carbs: 0, fats: 0.036 },
      breast: { calories: 280, protein: 53, carbs: 0, fats: 6 },
      breasts: { calories: 280, protein: 53, carbs: 0, fats: 6 }
    }
  },
  {
    regex: /\b(?:chicken\s+thighs?)\b/i,
    name: "Chicken Thighs (Cooked)",
    defaultUnit: "g",
    defaultQty: 200,
    per100g: { calories: 209, protein: 26, carbs: 0, fats: 10.9 },
    perUnit: {
      oz: { calories: 59, protein: 7.4, carbs: 0, fats: 3.1 },
      g: { calories: 2.09, protein: 0.26, carbs: 0, fats: 0.109 },
      thigh: { calories: 180, protein: 22, carbs: 0, fats: 9 },
      thighs: { calories: 180, protein: 22, carbs: 0, fats: 9 }
    }
  },
  {
    regex: /\b(?:ground\s+beef|lean\s+beef|beef\s+patty|beef)\b/i,
    name: "Lean Ground Beef (90/10)",
    defaultUnit: "g",
    defaultQty: 200,
    per100g: { calories: 190, protein: 26, carbs: 0, fats: 9.5 },
    perUnit: {
      oz: { calories: 54, protein: 7.4, carbs: 0, fats: 2.7 },
      g: { calories: 1.9, protein: 0.26, carbs: 0, fats: 0.095 }
    }
  },
  {
    regex: /\b(?:steak|ribeye|sirloin|strip\s+steak)\b/i,
    name: "Steak (Cooked)",
    defaultUnit: "oz",
    defaultQty: 8,
    per100g: { calories: 240, protein: 27, carbs: 0, fats: 14 },
    perUnit: {
      oz: { calories: 68, protein: 7.7, carbs: 0, fats: 4.0 },
      g: { calories: 2.4, protein: 0.27, carbs: 0, fats: 0.14 }
    }
  },
  {
    regex: /\b(?:ground\s+turkey|turkey\s+breast|turkey)\b/i,
    name: "Turkey Breast (Cooked)",
    defaultUnit: "g",
    defaultQty: 180,
    per100g: { calories: 145, protein: 30, carbs: 0, fats: 2 },
    perUnit: {
      oz: { calories: 41, protein: 8.5, carbs: 0, fats: 0.6 },
      g: { calories: 1.45, protein: 0.30, carbs: 0, fats: 0.02 }
    }
  },
  {
    regex: /\b(?:salmon)\b/i,
    name: "Atlantic Salmon (Cooked)",
    defaultUnit: "oz",
    defaultQty: 6,
    per100g: { calories: 206, protein: 22, carbs: 0, fats: 12 },
    perUnit: {
      oz: { calories: 58, protein: 6.2, carbs: 0, fats: 3.4 },
      g: { calories: 2.06, protein: 0.22, carbs: 0, fats: 0.12 }
    }
  },
  {
    regex: /\b(?:tuna)\b/i,
    name: "Canned Tuna (in water)",
    defaultUnit: "can",
    defaultQty: 1,
    perUnit: {
      can: { calories: 190, protein: 42, carbs: 0, fats: 1.5 },
      cans: { calories: 190, protein: 42, carbs: 0, fats: 1.5 },
      g: { calories: 1.15, protein: 0.25, carbs: 0, fats: 0.01 },
      oz: { calories: 32, protein: 7, carbs: 0, fats: 0.25 }
    }
  },
  {
    regex: /\b(?:egg\s+whites?)\b/i,
    name: "Egg Whites",
    defaultUnit: "whites",
    defaultQty: 4,
    perUnit: {
      white: { calories: 17, protein: 3.6, carbs: 0.2, fats: 0.1 },
      whites: { calories: 17, protein: 3.6, carbs: 0.2, fats: 0.1 },
      'egg white': { calories: 17, protein: 3.6, carbs: 0.2, fats: 0.1 },
      'egg whites': { calories: 17, protein: 3.6, carbs: 0.2, fats: 0.1 },
      cup: { calories: 125, protein: 26, carbs: 2, fats: 0.4 },
      cups: { calories: 125, protein: 26, carbs: 2, fats: 0.4 },
      g: { calories: 0.52, protein: 0.11, carbs: 0.01, fats: 0.001 }
    }
  },
  {
    regex: /\b(?:whole\s+eggs?|eggs?)\b/i,
    name: "Whole Eggs",
    defaultUnit: "eggs",
    defaultQty: 3,
    perUnit: {
      egg: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
      eggs: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
      large: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 }
    }
  },
  {
    regex: /\b(?:whey(?:\s+protein)?|protein\s+powder|casein)\b/i,
    name: "Whey Protein Isolate",
    defaultUnit: "scoops",
    defaultQty: 1,
    perUnit: {
      scoop: { calories: 130, protein: 25, carbs: 3, fats: 2 },
      scoops: { calories: 130, protein: 25, carbs: 3, fats: 2 },
      g: { calories: 4.0, protein: 0.78, carbs: 0.09, fats: 0.06 }
    }
  },
  {
    regex: /\b(?:white\s+rice|jasmine\s+rice|basmati\s+rice|rice)\b/i,
    name: "White Rice (Cooked)",
    defaultUnit: "cups",
    defaultQty: 1.5,
    perUnit: {
      cup: { calories: 205, protein: 4.2, carbs: 45, fats: 0.4 },
      cups: { calories: 205, protein: 4.2, carbs: 45, fats: 0.4 },
      g: { calories: 1.3, protein: 0.027, carbs: 0.28, fats: 0.003 }
    }
  },
  {
    regex: /\b(?:brown\s+rice)\b/i,
    name: "Brown Rice (Cooked)",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 218, protein: 4.5, carbs: 46, fats: 1.6 },
      cups: { calories: 218, protein: 4.5, carbs: 46, fats: 1.6 }
    }
  },
  {
    regex: /\b(?:oats|rolled\s+oats|oatmeal)\b/i,
    name: "Rolled Oats (Dry)",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 300, protein: 10, carbs: 54, fats: 5 },
      cups: { calories: 300, protein: 10, carbs: 54, fats: 5 },
      g: { calories: 3.75, protein: 0.125, carbs: 0.675, fats: 0.062 }
    }
  },
  {
    regex: /\b(?:sweet\s+potatoes?|sweet\s+potato)\b/i,
    name: "Sweet Potato (Cooked)",
    defaultUnit: "potato",
    defaultQty: 1,
    perUnit: {
      potato: { calories: 135, protein: 3, carbs: 31, fats: 0.2 },
      potatoes: { calories: 135, protein: 3, carbs: 31, fats: 0.2 },
      g: { calories: 0.9, protein: 0.02, carbs: 0.21, fats: 0.001 },
      oz: { calories: 25.5, protein: 0.57, carbs: 5.9, fats: 0.04 }
    }
  },
  {
    regex: /\b(?:potatoes?|potato|russet\s+potatoes?|russet\s+potato|baked\s+potatoes?|baked\s+potato)\b/i,
    name: "Baked Potato",
    defaultUnit: "potato",
    defaultQty: 1,
    perUnit: {
      potato: { calories: 160, protein: 4.3, carbs: 37, fats: 0.2 },
      potatoes: { calories: 160, protein: 4.3, carbs: 37, fats: 0.2 },
      g: { calories: 0.92, protein: 0.025, carbs: 0.21, fats: 0.001 },
      oz: { calories: 26, protein: 0.7, carbs: 6.0, fats: 0.03 }
    }
  },
  {
    regex: /\b(?:peanut\s*butter\s+toasts?|pb\s+toasts?|toasts?\s+(?:with|w\/)?\s*peanut\s*butter)\b/i,
    name: "Peanut Butter Toast",
    defaultUnit: "slice",
    defaultQty: 1,
    perUnit: {
      slice: { calories: 260, protein: 9, carbs: 24, fats: 14 },
      slices: { calories: 260, protein: 9, carbs: 24, fats: 14 },
      toast: { calories: 260, protein: 9, carbs: 24, fats: 14 },
      toasts: { calories: 260, protein: 9, carbs: 24, fats: 14 },
      piece: { calories: 260, protein: 9, carbs: 24, fats: 14 },
      pieces: { calories: 260, protein: 9, carbs: 24, fats: 14 }
    }
  },
  {
    regex: /\b(?:bagels?)\b/i,
    name: "Plain Bagel",
    defaultUnit: "bagel",
    defaultQty: 1,
    perUnit: {
      bagel: { calories: 280, protein: 11, carbs: 56, fats: 1.5 },
      bagels: { calories: 280, protein: 11, carbs: 56, fats: 1.5 }
    }
  },
  {
    regex: /\b(?:bread|toast|sourdough)\b/i,
    name: "Bread / Toast",
    defaultUnit: "slices",
    defaultQty: 2,
    perUnit: {
      slice: { calories: 100, protein: 4, carbs: 19, fats: 1 },
      slices: { calories: 100, protein: 4, carbs: 19, fats: 1 }
    }
  },
  {
    regex: /\b(?:pasta|spaghetti|noodles)\b/i,
    name: "Pasta (Cooked)",
    defaultUnit: "cups",
    defaultQty: 1.5,
    perUnit: {
      cup: { calories: 220, protein: 8, carbs: 43, fats: 1.3 },
      cups: { calories: 220, protein: 8, carbs: 43, fats: 1.3 }
    }
  },
  {
    regex: /\b(?:peanut\s*butter|peanutbutter|pb)\b/i,
    name: "Peanut Butter",
    defaultUnit: "tbsp",
    defaultQty: 2,
    perUnit: {
      tbsp: { calories: 95, protein: 4, carbs: 3.5, fats: 8 },
      tablespoon: { calories: 95, protein: 4, carbs: 3.5, fats: 8 },
      tablespoons: { calories: 95, protein: 4, carbs: 3.5, fats: 8 },
      g: { calories: 5.9, protein: 0.25, carbs: 0.22, fats: 0.50 }
    }
  },
  {
    regex: /\b(?:olive\s+oil|oil)\b/i,
    name: "Olive Oil",
    defaultUnit: "tbsp",
    defaultQty: 1,
    perUnit: {
      tbsp: { calories: 120, protein: 0, carbs: 0, fats: 14 },
      tablespoon: { calories: 120, protein: 0, carbs: 0, fats: 14 },
      tablespoons: { calories: 120, protein: 0, carbs: 0, fats: 14 }
    }
  },
  {
    regex: /\b(?:butter)\b/i,
    name: "Butter",
    defaultUnit: "tbsp",
    defaultQty: 1,
    perUnit: {
      tbsp: { calories: 102, protein: 0.1, carbs: 0, fats: 11.5 },
      tablespoon: { calories: 102, protein: 0.1, carbs: 0, fats: 11.5 }
    }
  },
  {
    regex: /\b(?:whole\s+milk|milk)\b/i,
    name: "Whole Milk",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 150, protein: 8, carbs: 12, fats: 8 },
      cups: { calories: 150, protein: 8, carbs: 12, fats: 8 },
      glass: { calories: 150, protein: 8, carbs: 12, fats: 8 },
      glasses: { calories: 150, protein: 8, carbs: 12, fats: 8 },
      oz: { calories: 18.75, protein: 1, carbs: 1.5, fats: 1 }
    }
  },
  {
    regex: /\b(?:fairlife\s+milk|fairlife)\b/i,
    name: "Fairlife Milk",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 150, protein: 13, carbs: 6, fats: 8 },
      cups: { calories: 150, protein: 13, carbs: 6, fats: 8 },
      oz: { calories: 18.75, protein: 1.6, carbs: 0.75, fats: 1 }
    }
  },
  {
    regex: /\b(?:greek\s+yogurt|yogurt)\b/i,
    name: "Greek Yogurt (Non-fat)",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 130, protein: 23, carbs: 9, fats: 0 },
      cups: { calories: 130, protein: 23, carbs: 9, fats: 0 },
      g: { calories: 0.57, protein: 0.10, carbs: 0.04, fats: 0 }
    }
  },
  {
    regex: /\b(?:banana|bananas)\b/i,
    name: "Banana",
    defaultUnit: "banana",
    defaultQty: 1,
    perUnit: {
      banana: { calories: 105, protein: 1.3, carbs: 27, fats: 0.3 },
      bananas: { calories: 105, protein: 1.3, carbs: 27, fats: 0.3 }
    }
  },
  {
    regex: /\b(?:apple|apples)\b/i,
    name: "Apple",
    defaultUnit: "apple",
    defaultQty: 1,
    perUnit: {
      apple: { calories: 95, protein: 0.5, carbs: 25, fats: 0.3 },
      apples: { calories: 95, protein: 0.5, carbs: 25, fats: 0.3 }
    }
  },
  {
    regex: /\b(?:avocados?|avocado)\b/i,
    name: "Avocado",
    defaultUnit: "whole",
    defaultQty: 0.5,
    perUnit: {
      whole: { calories: 320, protein: 4, carbs: 17, fats: 30 },
      half: { calories: 160, protein: 2, carbs: 8.5, fats: 15 }
    }
  },
  {
    regex: /\b(?:broccoli)\b/i,
    name: "Broccoli (Steamed)",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 31, protein: 2.6, carbs: 6, fats: 0.3 },
      cups: { calories: 31, protein: 2.6, carbs: 6, fats: 0.3 },
      g: { calories: 0.34, protein: 0.028, carbs: 0.066, fats: 0.003 }
    }
  },
  {
    regex: /\b(?:granola\s+bars?|nature\s+valley|chewy\s+bars?|oats\s+(?:and|&)\s+honey\s+bars?)\b/i,
    name: "Granola Bar (Oats & Honey)",
    defaultUnit: "bar",
    defaultQty: 1,
    perUnit: {
      bar: { calories: 190, protein: 4, carbs: 29, fats: 7 },
      bars: { calories: 190, protein: 4, carbs: 29, fats: 7 },
      pouch: { calories: 190, protein: 4, carbs: 29, fats: 7 },
      pouches: { calories: 190, protein: 4, carbs: 29, fats: 7 },
      pack: { calories: 190, protein: 4, carbs: 29, fats: 7 },
      packs: { calories: 190, protein: 4, carbs: 29, fats: 7 },
      g: { calories: 4.52, protein: 0.095, carbs: 0.69, fats: 0.166 }
    }
  },
  {
    regex: /\b(?:protein\s+bars?|quest\s+bars?|pure\s+protein|kirkland\s+protein\s+bar|barebells)\b/i,
    name: "Protein Bar (20g Protein)",
    defaultUnit: "bar",
    defaultQty: 1,
    perUnit: {
      bar: { calories: 200, protein: 20, carbs: 22, fats: 7 },
      bars: { calories: 200, protein: 20, carbs: 22, fats: 7 },
      g: { calories: 3.33, protein: 0.33, carbs: 0.36, fats: 0.11 }
    }
  },
  {
    regex: /\b(?:almonds?|almond)\b/i,
    name: "Almonds",
    defaultUnit: "oz",
    defaultQty: 1,
    perUnit: {
      oz: { calories: 164, protein: 6, carbs: 6, fats: 14 },
      handful: { calories: 164, protein: 6, carbs: 6, fats: 14 },
      g: { calories: 5.8, protein: 0.21, carbs: 0.21, fats: 0.50 }
    }
  },
  {
    regex: /\b(?:blueberries|blueberry)\b/i,
    name: "Blueberries",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 84, protein: 1.1, carbs: 21, fats: 0.5 },
      cups: { calories: 84, protein: 1.1, carbs: 21, fats: 0.5 },
      g: { calories: 0.57, protein: 0.007, carbs: 0.14, fats: 0.003 }
    }
  },
  {
    regex: /\b(?:strawberries|strawberry)\b/i,
    name: "Strawberries",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 49, protein: 1, carbs: 12, fats: 0.5 },
      cups: { calories: 49, protein: 1, carbs: 12, fats: 0.5 },
      g: { calories: 0.32, protein: 0.007, carbs: 0.077, fats: 0.003 }
    }
  },
  {
    regex: /\b(?:cottage\s*cheese|cottagecheese)\b/i,
    name: "Cottage Cheese (Low-fat)",
    defaultUnit: "cup",
    defaultQty: 0.5,
    perUnit: {
      cup: { calories: 220, protein: 28, carbs: 8, fats: 5 },
      cups: { calories: 220, protein: 28, carbs: 8, fats: 5 },
      serving: { calories: 110, protein: 14, carbs: 4, fats: 2.5 },
      servings: { calories: 110, protein: 14, carbs: 4, fats: 2.5 },
      tub: { calories: 440, protein: 56, carbs: 16, fats: 10 },
      g: { calories: 0.97, protein: 0.12, carbs: 0.035, fats: 0.022 },
      oz: { calories: 27.5, protein: 3.5, carbs: 1.0, fats: 0.6 }
    }
  },
  {
    regex: /\b(?:quinoa|cooked\s+quinoa)\b/i,
    name: "Quinoa (Cooked)",
    defaultUnit: "cup",
    defaultQty: 1,
    per100g: { calories: 120, protein: 4.4, carbs: 21.3, fats: 1.9 },
    perUnit: {
      cup: { calories: 222, protein: 8.1, carbs: 39.4, fats: 3.6 },
      cups: { calories: 222, protein: 8.1, carbs: 39.4, fats: 3.6 },
      bowl: { calories: 222, protein: 8.1, carbs: 39.4, fats: 3.6 },
      serving: { calories: 222, protein: 8.1, carbs: 39.4, fats: 3.6 },
      g: { calories: 1.2, protein: 0.044, carbs: 0.213, fats: 0.019 },
      oz: { calories: 34, protein: 1.25, carbs: 6.0, fats: 0.54 }
    }
  },
  {
    regex: /\b(?:chickpeas?|chick\s+peas?|garbanzo(?:\s+beans?)?)\b/i,
    name: "Chickpeas (Cooked)",
    defaultUnit: "cup",
    defaultQty: 0.5,
    per100g: { calories: 164, protein: 8.9, carbs: 27.4, fats: 2.6 },
    perUnit: {
      cup: { calories: 269, protein: 14.5, carbs: 45, fats: 4.2 },
      cups: { calories: 269, protein: 14.5, carbs: 45, fats: 4.2 },
      can: { calories: 390, protein: 21, carbs: 65, fats: 6 },
      cans: { calories: 390, protein: 21, carbs: 65, fats: 6 },
      serving: { calories: 135, protein: 7.3, carbs: 22.5, fats: 2.1 },
      servings: { calories: 135, protein: 7.3, carbs: 22.5, fats: 2.1 },
      g: { calories: 1.64, protein: 0.089, carbs: 0.274, fats: 0.026 },
      oz: { calories: 46.5, protein: 2.5, carbs: 7.8, fats: 0.74 }
    }
  },
  {
    regex: /\b(?:kale|cooked\s+kale|steamed\s+kale|raw\s+kale)\b/i,
    name: "Kale",
    defaultUnit: "cup",
    defaultQty: 1,
    per100g: { calories: 28, protein: 1.9, carbs: 5.6, fats: 0.4 },
    perUnit: {
      cup: { calories: 33, protein: 2.5, carbs: 6, fats: 0.5 },
      cups: { calories: 33, protein: 2.5, carbs: 6, fats: 0.5 },
      bowl: { calories: 33, protein: 2.5, carbs: 6, fats: 0.5 },
      serving: { calories: 33, protein: 2.5, carbs: 6, fats: 0.5 },
      g: { calories: 0.33, protein: 0.025, carbs: 0.06, fats: 0.005 }
    }
  },
  {
    regex: /\b(?:black\s*beans?)\b/i,
    name: "Black Beans (Cooked)",
    defaultUnit: "cup",
    defaultQty: 0.5,
    per100g: { calories: 132, protein: 8.9, carbs: 23.7, fats: 0.5 },
    perUnit: {
      cup: { calories: 227, protein: 15, carbs: 41, fats: 0.9 },
      cups: { calories: 227, protein: 15, carbs: 41, fats: 0.9 },
      can: { calories: 380, protein: 25, carbs: 68, fats: 1.5 },
      cans: { calories: 380, protein: 25, carbs: 68, fats: 1.5 },
      serving: { calories: 114, protein: 7.6, carbs: 20.5, fats: 0.5 }
    }
  },
  {
    regex: /\b(?:lentils?)\b/i,
    name: "Lentils (Cooked)",
    defaultUnit: "cup",
    defaultQty: 0.5,
    per100g: { calories: 116, protein: 9, carbs: 20, fats: 0.4 },
    perUnit: {
      cup: { calories: 230, protein: 18, carbs: 40, fats: 0.8 },
      cups: { calories: 230, protein: 18, carbs: 40, fats: 0.8 },
      serving: { calories: 115, protein: 9, carbs: 20, fats: 0.4 }
    }
  }
];

// ---------------------------------------------------------------------------
// 3. HOUSEHOLD PANTRY STAPLES (Instant 1-Tap Fast Logging)
// ---------------------------------------------------------------------------
export const DEFAULT_HOUSEHOLD_PANTRY = [
  {
    id: "staple-eggs-2",
    name: "2 Whole Eggs",
    portion: "2 large eggs",
    calories: 144,
    protein: 13,
    carbs: 1,
    fats: 10,
    category: "Protein",
    icon: "🍳"
  },
  {
    id: "staple-eggs",
    name: "3 Whole Eggs",
    portion: "3 large eggs",
    calories: 215,
    protein: 19,
    carbs: 1,
    fats: 15,
    category: "Protein",
    icon: "🍳"
  },
  {
    id: "staple-apple",
    name: "Medium Apple",
    portion: "1 medium (182g)",
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fats: 0.3,
    category: "Fruit",
    icon: "🍎"
  },
  {
    id: "staple-granola-bar",
    name: "Granola Bar (Oats & Honey)",
    portion: "1 bar / pouch (42g)",
    calories: 190,
    protein: 4,
    carbs: 29,
    fats: 7,
    category: "Snacks",
    icon: "🍫"
  },
  {
    id: "staple-protein-bar",
    name: "Protein Bar (20g Protein)",
    portion: "1 bar (60g)",
    calories: 200,
    protein: 20,
    carbs: 22,
    fats: 7,
    category: "Protein",
    icon: "🍫"
  },
  {
    id: "staple-banana",
    name: "Large Banana",
    portion: "1 large (135g)",
    calories: 120,
    protein: 1,
    carbs: 31,
    fats: 0,
    category: "Fruit",
    icon: "🍌"
  },
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
    id: "staple-greek-yogurt",
    name: "Greek Yogurt (1 Cup)",
    portion: "1 cup (227g)",
    calories: 130,
    protein: 23,
    carbs: 9,
    fats: 0,
    category: "Dairy",
    icon: "🥣"
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
    id: "staple-ground-beef",
    name: "Ground Beef (200g 90/10)",
    portion: "200g cooked",
    calories: 380,
    protein: 50,
    carbs: 0,
    fats: 20,
    category: "Protein",
    icon: "🥩"
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
    id: "staple-bagel",
    name: "Plain Bagel w/ Butter",
    portion: "1 whole + 1 tbsp",
    calories: 360,
    protein: 10,
    carbs: 56,
    fats: 11,
    category: "Carbs",
    icon: "🥯"
  },
  {
    id: "staple-almonds",
    name: "Almonds (1 oz / 28g)",
    portion: "1 oz (~23 nuts)",
    calories: 164,
    protein: 6,
    carbs: 6,
    fats: 14,
    category: "Snacks",
    icon: "🌰"
  },
  {
    id: "staple-pb-toast",
    name: "Peanut Butter Toast",
    portion: "1 slice + 1.5 tbsp PB",
    calories: 260,
    protein: 9,
    carbs: 24,
    fats: 14,
    category: "Carbs",
    icon: "🍞"
  },
  {
    id: "staple-quinoa-bowl",
    name: "Quinoa & Chickpea Bowl",
    portion: "1 cup quinoa, 0.5 cup chickpeas, kale, sweet potato",
    calories: 620,
    protein: 21,
    carbs: 110,
    fats: 8,
    category: "Common",
    icon: "🥗"
  }
];

// ---------------------------------------------------------------------------
// 4. MEAL SLOTS
// ---------------------------------------------------------------------------
export const MEAL_SLOTS = [
  { id: "breakfast", label: "Breakfast", name: "Breakfast", icon: "🍳" },
  { id: "lunch", label: "Lunch", name: "Lunch", icon: "🥗" },
  { id: "dinner", label: "Dinner", name: "Dinner", icon: "🥩" },
  { id: "post_workout", label: "Post-Workout", name: "Post-Workout", icon: "⚡" },
  { id: "snack", label: "Snacks", name: "Snacks", icon: "🍎" }
];

// ---------------------------------------------------------------------------
// 5. CORE MATHEMATICS & EQUATIONS
// ---------------------------------------------------------------------------

/**
 * Standard Atwater Energy Equivalence: 4P + 4C + 9F = Calories
 */
export function calculateCaloriesFromMacros(protein = 0, carbs = 0, fats = 0) {
  const p = Math.max(0, Number(protein) || 0);
  const c = Math.max(0, Number(carbs) || 0);
  const f = Math.max(0, Number(fats) || 0);
  return Math.round((p * 4) + (c * 4) + (f * 9));
}

/**
 * Aggregates all meals consumed during the day
 */
export function aggregateDailyNutrition(meals = []) {
  if (!Array.isArray(meals)) {
    return { calories: 0, protein: 0, carbs: 0, fats: 0, mealCount: 0 };
  }

  return meals.reduce((acc, meal) => {
    const p = Number(meal?.protein) || 0;
    const c = Number(meal?.carbs) || 0;
    const f = Number(meal?.fats) || 0;
    const rawCal = Number(meal?.calories);
    const calories = !isNaN(rawCal) && rawCal > 0 ? rawCal : calculateCaloriesFromMacros(p, c, f);

    return {
      calories: acc.calories + calories,
      protein: acc.protein + p,
      carbs: acc.carbs + c,
      fats: acc.fats + f,
      mealCount: acc.mealCount + 1
    };
  }, { calories: 0, protein: 0, carbs: 0, fats: 0, mealCount: 0 });
}

/**
 * Calculate 7-day smoothed moving average of morning bodyweight
 */
export function calculateMovingAverageWeight(weightHistory = [], daysWindow = 7) {
  if (!Array.isArray(weightHistory) || weightHistory.length === 0) {
    return null;
  }

  const sorted = [...weightHistory]
    .filter(w => w && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) return null;

  const windowSlice = sorted.slice(-daysWindow);
  const sum = windowSlice.reduce((acc, entry) => acc + entry.weightLbs, 0);
  const avg = sum / windowSlice.length;

  return Math.round(avg * 10) / 10;
}

/**
 * Calculate rate of weight velocity in lbs per week
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
  let message = "Weight progress on pace (+0.5 to 1.0 lb/wk)";

  if (velocity < 0.1) {
    status = "stalled";
    message = "Weight gain stalled. Consider adjusting calories.";
  } else if (velocity > 1.3) {
    status = "fast";
    message = "Gaining rapidly (>1.3 lbs/wk). Monitor body composition.";
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

  if (delta < 0.2) {
    const recommendedNewTarget = Math.min(4500, currentCalorieTarget + 250);
    return {
      needsSurplus: true,
      currentWeight: newestRecent,
      daysObserved: recent.length,
      stalledDeltaLbs: Number(delta.toFixed(1)),
      suggestedAddition: 250,
      newCalorieTarget: recommendedNewTarget,
      title: "Scale Stalled — Calorie Adjustment Available",
      description: `Your morning weight is flat over the last ${recent.length} days (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} lbs). Add +250 kcal to push progress.`
    };
  }

  return {
    needsSurplus: false,
    currentWeight: newestRecent,
    reason: `Great momentum: +${delta.toFixed(1)} lbs over recent weigh-ins.`
  };
}

// ---------------------------------------------------------------------------
// 6. NATURAL LANGUAGE MEAL PARSER
// ---------------------------------------------------------------------------

/**
 * Parses free-form meal descriptions into an itemized macro breakdown.
 * Returns null if no food items could be identified.
 */
export function parseMealDescription(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return null;
  }

  // 1. Direct macro pattern: "650 calories, 45g protein, 60g carbs, 15g fats"
  const calMatch = text.match(/(\d+)\s*(?:cals?|calories|kcal)\b/i);
  const protMatch = text.match(/(\d+)\s*g?\s*(?:protein|p)\b/i);
  const carbMatch = text.match(/(\d+)\s*g?\s*(?:carbs?|c)\b/i);
  const fatMatch = text.match(/(\d+)\s*g?\s*(?:fats?|f)\b/i);

  if (calMatch && (protMatch || carbMatch || fatMatch)) {
    const cals = parseInt(calMatch[1], 10);
    const p = protMatch ? parseInt(protMatch[1], 10) : 0;
    const c = carbMatch ? parseInt(carbMatch[1], 10) : 0;
    const f = fatMatch ? parseInt(fatMatch[1], 10) : 0;
    return {
      name: "Custom Macro Log",
      items: [
        {
          name: "Direct Macro Entry",
          portion: "1 serving",
          calories: cals,
          protein: p,
          carbs: c,
          fats: f
        }
      ],
      calories: cals,
      protein: p,
      carbs: c,
      fats: f,
      source: "manual_macro"
    };
  }

  // 2. Split clauses by comma, "and", "&", "+", "with", "plus", "w/", newline, or unpunctuated quantity boundaries (e.g. "2 eggs 1 banana")
  const clauses = text
    .replace(/(?<=[a-zA-Z])\s+(?=\d+(?:\.\d+)?|\d+\/\d+)/g, ', ')
    .split(/[,+&\n]|\band\b|\bwith\b|\bplus\b|\bw\//i)
    .map(c => c.trim())
    .filter(Boolean);

  const matchedItems = [];

  for (const clause of clauses) {
    const qtyRegex = /(?:^|\s)(\d+(?:\.\d+)?|\d+\/\d+)\s*(egg\s+whites?|whole\s+eggs?|bars?|pouches?|packs?|scoops?|slices?|toasts?|pieces?|bowls?|servings?|cups?|tbsp|tablespoons?|whites?|eggs?|bananas?|apples?|potatoes?|cans?|glass(?:es)?|oz|ounces|grams?|g\b)?/i;
    const qtyMatch = clause.match(qtyRegex);

    let quantity = null;
    let unit = null;

    if (qtyMatch) {
      const rawQty = qtyMatch[1];
      if (rawQty.includes('/')) {
        const [num, den] = rawQty.split('/').map(Number);
        quantity = den ? num / den : 1;
      } else {
        quantity = parseFloat(rawQty);
      }
      unit = (qtyMatch[2] || '').toLowerCase();
    }

    for (const food of INGREDIENT_DATABASE) {
      if (food.regex.test(clause)) {
        const usedUnit = unit || food.defaultUnit;
        const usedQty = quantity !== null && !isNaN(quantity) ? quantity : food.defaultQty;

        let itemCals = 0;
        let itemP = 0;
        let itemC = 0;
        let itemF = 0;

        if (food.perUnit && food.perUnit[usedUnit]) {
          const rates = food.perUnit[usedUnit];
          itemCals = Math.round(rates.calories * usedQty);
          itemP = Math.round(rates.protein * usedQty);
          itemC = Math.round(rates.carbs * usedQty);
          itemF = Math.round(rates.fats * usedQty);
        } else if (food.per100g && (usedUnit === 'g' || usedUnit === 'grams')) {
          const factor = usedQty / 100;
          itemCals = Math.round(food.per100g.calories * factor);
          itemP = Math.round(food.per100g.protein * factor);
          itemC = Math.round(food.per100g.carbs * factor);
          itemF = Math.round(food.per100g.fats * factor);
        } else if (food.perUnit && food.perUnit[food.defaultUnit]) {
          const rates = food.perUnit[food.defaultUnit];
          itemCals = Math.round(rates.calories * usedQty);
          itemP = Math.round(rates.protein * usedQty);
          itemC = Math.round(rates.carbs * usedQty);
          itemF = Math.round(rates.fats * usedQty);
        }

        matchedItems.push({
          name: food.name,
          portion: `${usedQty} ${usedUnit || food.defaultUnit}`,
          calories: itemCals,
          protein: itemP,
          carbs: itemC,
          fats: itemF
        });
        break;
      }
    }
  }

  if (matchedItems.length === 0) {
    return null;
  }

  const totalCalories = matchedItems.reduce((acc, it) => acc + it.calories, 0);
  const totalProtein = matchedItems.reduce((acc, it) => acc + it.protein, 0);
  const totalCarbs = matchedItems.reduce((acc, it) => acc + it.carbs, 0);
  const totalFats = matchedItems.reduce((acc, it) => acc + it.fats, 0);

  const title = matchedItems.length <= 2 
    ? matchedItems.map(m => m.name.replace(/\s*\([^)]*\)/, '')).join(' & ')
    : `${matchedItems[0].name.replace(/\s*\([^)]*\)/, '')} & Plate Bowl`;

  return {
    name: title,
    items: matchedItems,
    calories: totalCalories,
    protein: totalProtein,
    carbs: totalCarbs,
    fats: totalFats,
    source: "ingredient_engine"
  };
}

// ---------------------------------------------------------------------------
// 7. SANITIZATION & LOGGING HELPERS
// ---------------------------------------------------------------------------

/**
 * Create a validated meal entry from manual, pantry, or parsed inputs
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

// ---------------------------------------------------------------------------
// 8. KITCHEN HARDWARE CALIBRATION TASKS & GROUND TRUTH GENERATOR
// ---------------------------------------------------------------------------
export const DEFAULT_CALIBRATION_TASKS = [
  // ---------------------------------------------------------------------------
  // Category 1: Dishware & Kitchen Hardware (Scale Rulers)
  // ---------------------------------------------------------------------------
  {
    id: "task-dinner-plate",
    category: "dishware",
    title: "Measure Main Dinner Plate",
    shortDesc: "Standard large flat plate used for main meals",
    icon: "🍽️",
    instruction: "Measure the outer rim diameter in inches (e.g. 10.5 inches) and the inner usable flat bed diameter (e.g. 8.5 inches). Enter color or pattern so vision AI can recognize it immediately.",
    fields: [
      { key: "name", label: "Plate Description", placeholder: "e.g. White Porcelain Dinner Plate", type: "text", default: "Main Dinner Plate" },
      { key: "diameterInches", label: "Outer Rim Diameter (inches)", placeholder: "e.g. 10.5", type: "number", step: "0.1" },
      { key: "innerWellInches", label: "Inner Flat Bed (inches)", placeholder: "e.g. 8.5", type: "number", step: "0.1" },
      { key: "tareWeightG", label: "Empty Tare Weight (grams, optional)", placeholder: "e.g. 550", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-primary-bowl",
    category: "dishware",
    title: "Measure Primary Large Bowl",
    shortDesc: "Everyday deep bowl for grain bowls, salads, large meals",
    icon: "🥣",
    instruction: "Grab a ruler and measure the top rim diameter across the bowl (e.g. 8.0 inches). Next, fill it with water to your normal eating line and measure holding volume in ml or fl oz (e.g. 750 ml / 25 fl oz). Optional: weigh the empty bowl on your kitchen scale to record tare weight.",
    fields: [
      { key: "name", label: "Bowl Description", placeholder: "e.g. Matte Black Ceramic Bowl", type: "text", default: "Everyday Primary Bowl" },
      { key: "diameterInches", label: "Top Rim Diameter (inches)", placeholder: "e.g. 8.0", type: "number", step: "0.1" },
      { key: "depthInches", label: "Bowl Depth / Height (inches)", placeholder: "e.g. 3.0", type: "number", step: "0.1" },
      { key: "volumeMl", label: "Usable Volume (ml or fl oz)", placeholder: "e.g. 750 ml or 25 fl oz", type: "text" },
      { key: "tareWeightG", label: "Empty Tare Weight (grams, optional)", placeholder: "e.g. 420", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-small-bowl",
    category: "dishware",
    title: "Measure Small / Snack Bowl",
    shortDesc: "For oatmeal, greek yogurt, cereal, berries, & desserts",
    icon: "🍧",
    instruction: "Measure the rim diameter of your smaller snack or cereal bowl (typically 5.0\" to 6.5\"). Note depth and capacity in ml/oz (typically 350-450 ml).",
    fields: [
      { key: "name", label: "Bowl Description", placeholder: "e.g. Small Cereal & Yogurt Bowl", type: "text", default: "Snack & Yogurt Bowl" },
      { key: "diameterInches", label: "Top Rim Diameter (inches)", placeholder: "e.g. 5.5", type: "number", step: "0.1" },
      { key: "depthInches", label: "Depth (inches)", placeholder: "e.g. 2.2", type: "number", step: "0.1" },
      { key: "volumeMl", label: "Usable Volume (ml or oz)", placeholder: "e.g. 400 ml or 14 fl oz", type: "text" },
      { key: "tareWeightG", label: "Empty Tare Weight (grams, optional)", placeholder: "e.g. 280", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-meal-prep-container",
    category: "dishware",
    title: "Measure Glass Meal Prep Container",
    shortDesc: "Pyrex or glass containers used for batch cooked food",
    icon: "🍱",
    instruction: "Measure length, width, and depth of your standard rectangular or square glass prep container (e.g. 7.5\" x 5.5\" x 2.5\"). Enter volume in cups or ml (e.g. 3.5 cups / 850 ml).",
    fields: [
      { key: "name", label: "Container Type", placeholder: "e.g. Pyrex Glass 4-Cup Rectangular", type: "text", default: "Glass Meal Prep Container" },
      { key: "lengthInches", label: "Length (inches)", placeholder: "e.g. 7.5", type: "number", step: "0.1" },
      { key: "widthInches", label: "Width (inches)", placeholder: "e.g. 5.5", type: "number", step: "0.1" },
      { key: "depthInches", label: "Depth (inches)", placeholder: "e.g. 2.5", type: "number", step: "0.1" },
      { key: "volumeMl", label: "Total Volume", placeholder: "e.g. 850 ml or 3.5 cups", type: "text" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-shaker-bottle",
    category: "dishware",
    title: "Calibrate Shaker Bottle / Blender Cup",
    shortDesc: "BlenderBottle or NutriBullet cup for shakes",
    icon: "🥤",
    instruction: "Record the total capacity of your shaker bottle (e.g. BlenderBottle Classic 28 oz, Yeti 26 oz, NutriBullet 24 oz) and your typical liquid fill line (e.g. 12 oz or 16 oz).",
    fields: [
      { key: "name", label: "Bottle Brand / Model", placeholder: "e.g. BlenderBottle Pro 28 oz", type: "text", default: "28 oz Shaker Bottle" },
      { key: "capacityOz", label: "Total Capacity (oz or ml)", placeholder: "e.g. 28 oz / 800 ml", type: "text" },
      { key: "typicalFillOz", label: "Typical Liquid Fill Line", placeholder: "e.g. 12 oz or 16 oz", type: "text" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-drink-glass",
    category: "dishware",
    title: "Measure Everyday Drinking Glass / Mug",
    shortDesc: "For coffee, milk, hydration, or electrolyte drinks",
    icon: "☕",
    instruction: "Fill your everyday drinking glass or coffee mug with water and measure how much liquid it holds (e.g. 16 fl oz pint glass, 12 oz mug). This lets the AI verify exact beverage volumes.",
    fields: [
      { key: "name", label: "Glass / Mug Description", placeholder: "e.g. Pint Glass / Ceramic Mug", type: "text", default: "Everyday Drinking Glass" },
      { key: "volumeOz", label: "Liquid Capacity (oz or ml)", placeholder: "e.g. 16 fl oz / 470 ml", type: "text" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },

  // ---------------------------------------------------------------------------
  // Category 2: Everyday Proteins & Pantry Staples
  // ---------------------------------------------------------------------------
  {
    id: "task-protein-powder",
    category: "staples",
    title: "Log Your Protein Powder Brand & Scoop",
    shortDesc: "Exact grams & protein per scoop",
    icon: "💪",
    instruction: "Check your protein powder tub. Enter brand, flavor, scoop weight in grams (usually 30g-35g), and protein per scoop (usually 24g-27g).",
    fields: [
      { key: "brand", label: "Brand & Flavor", placeholder: "e.g. Optimum Nutrition Gold Standard Whey, Ghost, Dymatize", type: "text" },
      { key: "scoopGrams", label: "Grams per Scoop", placeholder: "e.g. 31g", type: "text" },
      { key: "proteinPerScoop", label: "Protein per Scoop (grams)", placeholder: "e.g. 24", type: "number" },
      { key: "calsPerScoop", label: "Calories per Scoop", placeholder: "e.g. 120", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-greek-yogurt",
    category: "staples",
    title: "Specify Greek Yogurt Brand & Fat %",
    shortDesc: "0% Nonfat vs 2% Low-Fat vs 5% Whole Milk",
    icon: "🍦",
    instruction: "Check your greek yogurt tub. Enter the brand and fat percentage (e.g. Fage Total 0% Nonfat, Fage 2%, Oikos Pro, Chobani). Record protein and calories per 3/4 cup (170g).",
    fields: [
      { key: "brand", label: "Brand Name & Fat %", placeholder: "e.g. Fage Total 0% Nonfat", type: "text" },
      { key: "proteinPerServing", label: "Protein per 3/4 cup (170g) (grams)", placeholder: "e.g. 18", type: "number" },
      { key: "calsPerServing", label: "Calories per 3/4 cup", placeholder: "e.g. 90", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-eggs-style",
    category: "staples",
    title: "Log Your Eggs & Egg Whites Setup",
    shortDesc: "Egg size (Large vs XL) & liquid egg white carton",
    icon: "🥚",
    instruction: "Select your standard carton egg size (Large = ~72 kcal, 6.3g P; XL = ~80 kcal, 7g P). If you use carton liquid egg whites (e.g. Kirkland Liquid Egg Whites), enter the brand and protein.",
    fields: [
      { key: "eggSize", label: "Whole Egg Size", placeholder: "e.g. Large (USDA Standard 50g, 72 kcal, 6.3g P)", type: "text", default: "Large Eggs (72 kcal, 6g P)" },
      { key: "liquidWhiteBrand", label: "Liquid Egg White Brand (optional)", placeholder: "e.g. Kirkland Signature Liquid Egg Whites (5g P / 3 tbsp)", type: "text" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-meats-prep",
    category: "staples",
    title: "Tune Your Everyday Meat & Poultry Cuts",
    shortDesc: "Chicken breast, 90/10 beef, steak, salmon",
    icon: "🥩",
    instruction: "Enter the primary meat cuts in your fridge/freezer and your standard cooked portion (e.g. 6 oz or 8 oz cooked). Note: meat loses ~25% weight when cooked due to water loss (8 oz raw = ~6 oz cooked).",
    fields: [
      { key: "favoriteCuts", label: "Primary Meat Cuts", placeholder: "e.g. Chicken Breast, 90/10 Lean Ground Beef, Flank Steak, Salmon", type: "text" },
      { key: "typicalServingOz", label: "Standard Cooked Serving", placeholder: "e.g. 6 to 8 oz cooked (~170-225g)", type: "text" },
      { key: "cookedYieldPct", label: "Cooked Yield Factor", placeholder: "75% (8 oz raw = 6 oz cooked)", type: "text", default: "75% (cooked weight is 25% less than raw)" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-rice-grains",
    category: "staples",
    title: "Log Your Everyday Rice & Grains",
    shortDesc: "Jasmine, Basmati, Oats, Brown Rice, Sweet Potato",
    icon: "🍚",
    instruction: "Enter your staple grain (e.g. Jasmine Rice, Basmati, Rolled Oats, Sweet Potato). Record standard cooked cup metrics so vision AI doesn't confuse dry vs cooked weights.",
    fields: [
      { key: "stapleGrain", label: "Primary Grain / Carb", placeholder: "e.g. Jasmine Rice, Rolled Oats, Sweet Potato", type: "text" },
      { key: "calsPerCup", label: "Calories per 1 cup cooked", placeholder: "e.g. 205 kcal (Jasmine Rice)", type: "number", default: 205 },
      { key: "carbsPerCup", label: "Carbs per 1 cup cooked (grams)", placeholder: "e.g. 45", type: "number", default: 45 },
      { key: "proteinPerCup", label: "Protein per 1 cup cooked (grams)", placeholder: "e.g. 4", type: "number", default: 4 }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-bread-slice-weight",
    category: "staples",
    title: "Weigh 1 Slice of Your Bread",
    shortDesc: "Exact gram weight of your everyday bread slice",
    icon: "🍞",
    instruction: "Place 1 typical slice of your everyday bread on your kitchen scale. Grocery bread slices typically range from 32g to 60g. Enter brand and exact weight.",
    fields: [
      { key: "brand", label: "Bread Brand & Style", placeholder: "e.g. Dave's Killer Bread, Sourdough, Ezekiel", type: "text" },
      { key: "sliceWeightG", label: "Weight per Slice (grams)", placeholder: "e.g. 45", type: "number" },
      { key: "calsPerSlice", label: "Calories per Slice (optional)", placeholder: "e.g. 110", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-bagels-wraps",
    category: "staples",
    title: "Log Your Bagels, Tortillas, or Wraps",
    shortDesc: "Tortillas, wraps, pita, or bagels",
    icon: "🌯",
    instruction: "Enter the brand and style of wraps, bagels, or tortillas in your pantry (e.g. Mission Carb Balance 70 kcal / 19g fiber, Dave's Epic Bagel 260 kcal / 11g P, Ezekiel Sprouted Tortillas).",
    fields: [
      { key: "brand", label: "Brand & Product Name", placeholder: "e.g. Mission Carb Balance Flour Soft Taco", type: "text" },
      { key: "calsPerUnit", label: "Calories per piece", placeholder: "e.g. 70", type: "number" },
      { key: "carbsPerUnit", label: "Carbs per piece", placeholder: "e.g. 19g (15g fiber)", type: "text" },
      { key: "proteinPerUnit", label: "Protein per piece (grams)", placeholder: "e.g. 5", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-cottage-cheese-brand",
    category: "staples",
    title: "Specify Cottage Cheese Brand & %",
    shortDesc: "Target your exact protein and moisture density",
    icon: "🥛",
    instruction: "Enter the brand and fat percentage you buy (e.g. Good Culture 2% Low-Fat, Daisy 4% Whole Milk, Lucerne). Different brands vary significantly in moisture, curds, and protein density.",
    fields: [
      { key: "brand", label: "Brand Name & Fat %", placeholder: "e.g. Good Culture 2% Low-Fat", type: "text" },
      { key: "proteinPerHalfCup", label: "Protein per 1/2 cup (grams)", placeholder: "e.g. 14", type: "number" },
      { key: "calsPerHalfCup", label: "Calories per 1/2 cup", placeholder: "e.g. 100", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-peanut-butter-brand",
    category: "staples",
    title: "Log Your Peanut Butter / Nut Butter",
    shortDesc: "Natural vs standard peanut butter profile",
    icon: "🥜",
    instruction: "Enter your brand (e.g. Kirkland Organic Creamy, Jif, Smucker's Natural, Skippy, Almond Butter). Natural nut butters without hydrogenated oil have distinct macro density.",
    fields: [
      { key: "brand", label: "Brand Name", placeholder: "e.g. Kirkland Organic Creamy", type: "text" },
      { key: "servingGrams", label: "Grams per 2 tbsp", placeholder: "e.g. 32g", type: "text", default: "32g" },
      { key: "cals", label: "Calories per 2 tbsp", placeholder: "e.g. 190", type: "number", default: 190 },
      { key: "protein", label: "Protein per 2 tbsp (grams)", placeholder: "e.g. 8", type: "number", default: 8 }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-milk-staple",
    category: "staples",
    title: "Log Your Everyday Milk or Plant Milk",
    shortDesc: "Fairlife, whole milk, almond milk, oat milk",
    icon: "🧃",
    instruction: "Enter the brand and type of milk you pour into shakes, coffee, or cereal (e.g. Fairlife 2% Ultra-Filtered 120 kcal / 13g P, Whole Milk 150 kcal / 8g P, Almond Breeze Unsweetened 30 kcal).",
    fields: [
      { key: "brand", label: "Brand & Milk Type", placeholder: "e.g. Fairlife 2% Ultra-Filtered", type: "text" },
      { key: "calsPerCup", label: "Calories per 1 cup (240ml)", placeholder: "e.g. 120", type: "number" },
      { key: "proteinPerCup", label: "Protein per 1 cup (grams)", placeholder: "e.g. 13", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-bars-staple",
    category: "staples",
    title: "Log Your Go-To Protein & Granola Bars",
    shortDesc: "Pantry snack bars you grab on the go",
    icon: "🍫",
    instruction: "Enter the brand of protein or snack bars in your pantry (e.g. Barebells Caramel Cashew, Kirkland Signature Protein Bar, Nature Valley Crunchy, Clif Bar, Pure Protein).",
    fields: [
      { key: "brand", label: "Brand & Bar Name", placeholder: "e.g. Barebells Protein Bar / Kirkland Signature", type: "text" },
      { key: "calsPerBar", label: "Calories per bar", placeholder: "e.g. 200", type: "number" },
      { key: "proteinPerBar", label: "Protein per bar (grams)", placeholder: "e.g. 20", type: "number" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-cooking-oils",
    category: "staples",
    title: "Log Your Cooking Oils & Butter Habits",
    shortDesc: "Olive oil, butter, avocado spray cooking fats",
    icon: "🫒",
    instruction: "Enter what cooking fat you use when cooking meals (e.g. Extra Virgin Olive Oil, Kerrygold Butter, Avocado Oil Spray). Note your typical amount per pan (1 tbsp oil = 120 kcal / 14g fats; 1 tbsp butter = 100 kcal / 11g fats; 1-sec spray = ~10 kcal).",
    fields: [
      { key: "oilType", label: "Primary Cooking Fat", placeholder: "e.g. Extra Virgin Olive Oil, Kerrygold Butter, Avocado Spray", type: "text" },
      { key: "typicalAmount", label: "Typical Amount per Meal", placeholder: "e.g. 0.5 to 1 tbsp (~60-120 kcal)", type: "text" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },

  // ---------------------------------------------------------------------------
  // Category 3: Everyday Meal Builds & Templates
  // ---------------------------------------------------------------------------
  {
    id: "task-meat-carb-plate",
    category: "recipes",
    title: "Tune Your Standard Meat & Carb Dinner",
    shortDesc: "Baseline chicken/beef + rice/potatoes dinner",
    icon: "🍛",
    instruction: "Enter your standard dinner baseline when you eat meat, a carb, and veggies. This allows Gemini Vision to immediately recognize your staple dinner layout.",
    fields: [
      { key: "proteinPortion", label: "Cooked Meat Portion", placeholder: "e.g. 7 oz cooked chicken breast / 90/10 beef", type: "text", default: "7 oz cooked chicken breast / 90/10 beef" },
      { key: "carbPortion", label: "Carb Portion", placeholder: "e.g. 1.5 cups cooked jasmine rice or potatoes", type: "text", default: "1.5 cups cooked jasmine rice or potatoes" },
      { key: "veggiePortion", label: "Veggie Portion", placeholder: "e.g. 1 cup steamed broccoli or asparagus", type: "text", default: "1 cup steamed broccoli or asparagus" },
      { key: "fatsNote", label: "Cooking Fat", placeholder: "e.g. 1 tbsp olive oil", type: "text", default: "1 tbsp olive oil" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-breakfast-build",
    category: "recipes",
    title: "Tune Your Daily Breakfast Plate",
    shortDesc: "Baseline eggs, toast, butter, PB, or fruit",
    icon: "🍳",
    instruction: "Enter your standard morning breakfast template. Vision AI anchors to these numbers whenever you snap a photo of breakfast.",
    fields: [
      { key: "eggPortion", label: "Egg Setup", placeholder: "e.g. 3 whole eggs + 0.5 cup egg whites", type: "text", default: "3 whole eggs + 0.5 cup egg whites" },
      { key: "carbPortion", label: "Toast / Carb", placeholder: "e.g. 2 slices toast with 1 tbsp butter or PB", type: "text", default: "2 slices toast with 1 tbsp butter or PB" },
      { key: "fruitPortion", label: "Fruit / Side", placeholder: "e.g. 1 banana or apple", type: "text", default: "1 banana or apple" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-shake-build",
    category: "recipes",
    title: "Tune Your Post-Workout Shake / Smoothie",
    shortDesc: "Baseline whey, milk, PB, banana, oats",
    icon: "🥤",
    instruction: "Enter your standard shake recipe in your shaker or blender. Whenever you snap a shake, the AI knows the exact liquid and powder foundation.",
    fields: [
      { key: "liquidBase", label: "Liquid Base", placeholder: "e.g. 12 oz Fairlife 2% or almond milk", type: "text", default: "12 oz Fairlife 2% or almond milk" },
      { key: "proteinScoops", label: "Whey Scoops", placeholder: "e.g. 1.5 scoops whey (~36g protein)", type: "text", default: "1.5 scoops whey (~36g protein)" },
      { key: "addIns", label: "Add-ins", placeholder: "e.g. 1 medium banana, 2 tbsp peanut butter", type: "text", default: "1 medium banana, 2 tbsp peanut butter" }
    ],
    completed: false,
    completedAt: null,
    values: null
  },
  {
    id: "task-power-bowl-build",
    category: "recipes",
    title: "Tune Your Flexible Grain, Salad & Protein Bowl",
    shortDesc: "Versatile bowl baseline (grains, protein, greens)",
    icon: "🥗",
    instruction: "Enter your standard bowl layout when making salads or grain bowls (quinoa, rice, chickpeas, cottage cheese, sweet potato, kale, etc.). Vision AI uses this as a reference baseline.",
    fields: [
      { key: "quinoaPortion", label: "Grain Base", placeholder: "e.g. 1 cup cooked rice or quinoa (~185g)", type: "text", default: "1 cup cooked rice or quinoa (~185g)" },
      { key: "chickpeaPortion", label: "Legume / Topper", placeholder: "e.g. 0.5 cup chickpeas or beans (~82g)", type: "text", default: "0.5 cup chickpeas or beans (~82g)" },
      { key: "cottageCheesePortion", label: "Cheese / Protein", placeholder: "e.g. 0.5 cup cottage cheese or feta (~113g)", type: "text", default: "0.5 cup cottage cheese or feta (~113g)" },
      { key: "sweetPotatoPortion", label: "Roasted Vegetable", placeholder: "e.g. 1 medium sweet potato (~130g)", type: "text", default: "1 medium sweet potato (~130g)" },
      { key: "kalePortion", label: "Greens / Salad", placeholder: "e.g. 1 cup kale or spinach (~130g)", type: "text", default: "1 cup kale or spinach (~130g)" }
    ],
    completed: false,
    completedAt: null,
    values: null
  }
];

export function getMergedCalibrationTasks(kitchenCalibration = {}) {
  const existingTasks = Array.isArray(kitchenCalibration?.tasks) ? kitchenCalibration.tasks : [];
  const existingMap = new Map();
  const customTasks = [];

  for (const t of existingTasks) {
    if (!t || !t.id) continue;
    if (t.id.startsWith('task-custom-')) {
      customTasks.push(t);
    } else {
      existingMap.set(t.id, t);
    }
  }

  const merged = DEFAULT_CALIBRATION_TASKS.map(defaultTask => {
    const existing = existingMap.get(defaultTask.id);
    if (existing) {
      return {
        ...defaultTask,
        completed: existing.completed ?? defaultTask.completed,
        completedAt: existing.completedAt ?? defaultTask.completedAt,
        values: existing.values ?? defaultTask.values
      };
    }
    return defaultTask;
  });

  return [...merged, ...customTasks];
}

export function getCalibrationProgress(input = []) {
  const tasks = Array.isArray(input)
    ? input
    : (Array.isArray(input?.tasks) ? getMergedCalibrationTasks(input) : DEFAULT_CALIBRATION_TASKS);

  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { total: DEFAULT_CALIBRATION_TASKS.length, completed: 0, percentage: 0, isAllCompleted: false };
  }
  const completed = tasks.filter(t => t.completed).length;
  const total = tasks.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return {
    total,
    completed,
    percentage,
    isAllCompleted: completed === total && total > 0
  };
}

export function buildAiCalibrationPrompt(kitchenCalibration = {}) {
  const tasks = getMergedCalibrationTasks(kitchenCalibration);
  const completedTasks = tasks.filter(t => t.completed && t.values);
  if (completedTasks.length === 0) return "";

  const lines = [
    "USER PHYSICAL HARDWARE & KITCHEN CALIBRATION MANIFEST (GROUND TRUTH):",
    "The user has physically measured their kitchenware, staple brands, and everyday meal builds. Use these exact measurements as an absolute physical ruler when analyzing photos:"
  ];

  for (const task of completedTasks) {
    const v = task.values || {};
    if (task.id === "task-dinner-plate") {
      lines.push(`- DINNER PLATE: "${v.name || 'Main Dinner Plate'}" | Outer Rim Diameter: ${v.diameterInches || 10.5}" | Flat Well: ${v.innerWellInches || 8.5}" ${v.tareWeightG ? `| Tare: ${v.tareWeightG}g` : ''}. (Use outer diameter as an absolute physical ruler in plate photos).`);
    } else if (task.id === "task-primary-bowl") {
      lines.push(`- PRIMARY LARGE BOWL: "${v.name || 'Primary Large Bowl'}" | Rim Diameter: ${v.diameterInches || 8.0}" | Depth: ${v.depthInches || 3.0}" | Usable Volume: ${v.volumeMl || '750 ml'} ${v.tareWeightG ? `| Tare: ${v.tareWeightG}g` : ''}. (Use this rim diameter to calibrate pixel scale and estimate food fill percentage).`);
    } else if (task.id === "task-small-bowl") {
      lines.push(`- SMALL / SNACK BOWL: "${v.name || 'Small Bowl'}" | Rim Diameter: ${v.diameterInches || 5.5}" | Depth: ${v.depthInches || 2.2}" | Volume: ${v.volumeMl || '400 ml'}. Use for yogurt, oats, fruit, and snacks.`);
    } else if (task.id === "task-meal-prep-container") {
      lines.push(`- MEAL PREP CONTAINER: "${v.name || 'Glass Prep Container'}" | Dimensions: ${v.lengthInches || 7.5}" x ${v.widthInches || 5.5}" x ${v.depthInches || 2.5}" | Volume: ${v.volumeMl || '850 ml'}. Use to calculate volume of batch cooked meals.`);
    } else if (task.id === "task-shaker-bottle") {
      lines.push(`- SHAKER BOTTLE / BLENDER CUP: "${v.name || 'Shaker Bottle'}" | Total Capacity: ${v.capacityOz || '28 oz'} | Typical Liquid Fill: ${v.typicalFillOz || '12-16 oz'}.`);
    } else if (task.id === "task-drink-glass") {
      lines.push(`- DRINKING CUP / MUG: "${v.name || 'Everyday Tumbler/Mug'}" | Usable Volume: ${v.volumeOz || '16 oz'}.`);
    } else if (task.id === "task-protein-powder") {
      lines.push(`- PROTEIN POWDER: Brand: "${v.brand || 'Whey'}" | Scoop Size: ${v.scoopGrams || '31g'} | Protein: ${v.proteinPerScoop || 24}g | Calories: ${v.calsPerScoop || 120} kcal.`);
    } else if (task.id === "task-greek-yogurt") {
      lines.push(`- GREEK YOGURT: Brand: "${v.brand || 'Greek Yogurt'}" | Protein per 3/4 cup (170g): ${v.proteinPerServing || 18}g | Calories: ${v.calsPerServing || 90} kcal.`);
    } else if (task.id === "task-eggs-style") {
      lines.push(`- EGGS & EGG WHITES: Standard Size: "${v.eggSize || 'Large (50g, 72 kcal, 6.3g P)'}" ${v.liquidWhiteBrand ? `| Liquid Whites Brand: "${v.liquidWhiteBrand}"` : ''}.`);
    } else if (task.id === "task-meats-prep") {
      lines.push(`- MEATS & POULTRY BASELINE: Standard Cuts: "${v.favoriteCuts || 'Chicken Breast, 90/10 Beef'}" | Cooked-to-Raw Ratio: ${v.cookedYieldPct || '75%'} | Standard Serving: ${v.typicalServingOz || '6-8 oz cooked'}.`);
    } else if (task.id === "task-rice-grains") {
      lines.push(`- RICE & GRAINS: Staple: "${v.stapleGrain || 'Jasmine Rice'}" | 1 cup cooked = ${v.calsPerCup || 205} kcal, ${v.carbsPerCup || 45}g carbs, ${v.proteinPerCup || 4}g protein.`);
    } else if (task.id === "task-bread-slice-weight") {
      lines.push(`- BREAD STAPLE: Brand: "${v.brand || 'Everyday Bread'}" | Weight per slice: ${v.sliceWeightG || 45}g | Calories: ${v.calsPerSlice || 110} kcal.`);
    } else if (task.id === "task-bagels-wraps") {
      lines.push(`- BAGELS, TORTILLAS & WRAPS: Brand: "${v.brand || 'Wrap/Bagel'}" | Calories per unit: ${v.calsPerUnit || 70} kcal | Carbs: ${v.carbsPerUnit || '19g'} | Protein: ${v.proteinPerUnit || 5}g.`);
    } else if (task.id === "task-cottage-cheese-brand") {
      lines.push(`- COTTAGE CHEESE: Brand: "${v.brand || 'Good Culture 2%'}" | Protein per 1/2 cup: ${v.proteinPerHalfCup || 14}g | Calories: ${v.calsPerHalfCup || 100} kcal.`);
    } else if (task.id === "task-peanut-butter-brand") {
      lines.push(`- PEANUT BUTTER: Brand: "${v.brand || 'Natural PB'}" | Serving: ${v.servingGrams || '32g (2 tbsp)'} | Calories: ${v.cals || 190} kcal | Protein: ${v.protein || 8}g.`);
    } else if (task.id === "task-milk-staple") {
      lines.push(`- MILK / PLANT MILK: Brand: "${v.brand || 'Fairlife 2%'}" | Calories per 1 cup (240ml): ${v.calsPerCup || 120} kcal | Protein: ${v.proteinPerCup || 13}g.`);
    } else if (task.id === "task-bars-staple") {
      lines.push(`- SNACK & PROTEIN BARS: Go-to Brands: "${v.brand || 'Kirkland / Barebells'}" | Per bar: ${v.calsPerBar || 200} kcal | Protein: ${v.proteinPerBar || 20}g.`);
    } else if (task.id === "task-cooking-oils") {
      lines.push(`- COOKING OILS & BUTTER: Habits: "${v.oilType || 'Olive Oil / Butter'}" | Typical cooking fat per meal: ${v.typicalAmount || '0.5 to 1 tbsp (~60-120 kcal)'}.`);
    } else if (task.id === "task-meat-carb-plate") {
      lines.push(`- MEAT & CARB DINNER TEMPLATE: Standard Dinner: Protein (${v.proteinPortion || '7 oz cooked meat'}), Carbs (${v.carbPortion || '1.5 cups rice/potatoes'}), Veggies (${v.veggiePortion || '1 cup veggies'}), Cooking Fat (${v.fatsNote || '1 tbsp olive oil'}). Anchor dinner photos to this baseline.`);
    } else if (task.id === "task-breakfast-build") {
      lines.push(`- BREAKFAST BUILD TEMPLATE: Standard Morning: Eggs (${v.eggPortion || '3 whole eggs + 0.5 cup egg whites'}), Toast/Carb (${v.carbPortion || '2 slices toast with PB/butter'}), Fruit/Side (${v.fruitPortion || '1 banana or apple'}). Anchor breakfast photos to this baseline.`);
    } else if (task.id === "task-shake-build") {
      lines.push(`- POST-WORKOUT SHAKE TEMPLATE: Liquid (${v.liquidBase || '12 oz milk'}), Whey (${v.proteinScoops || '1.5 scoops whey'}), Add-ins (${v.addIns || 'banana, peanut butter'}). Anchor shake photos to this baseline.`);
    } else if (task.id === "task-power-bowl-build") {
      lines.push(`- FLEXIBLE GRAIN & SALAD BOWL: Base (${v.quinoaPortion || '1 cup cooked rice/grains'}), Protein/Legumes (${v.chickpeaPortion || '0.5 cup beans/meat'}), Cheese/Topper (${v.cottageCheesePortion || '0.5 cup cheese'}), Veggies (${v.sweetPotatoPortion || 'sweet potato/greens'}).`);
    } else {
      lines.push(`- CUSTOM CALIBRATION ("${task.title}"): ${JSON.stringify(v)}`);
    }
  }

  lines.push("CRITICAL: When the photo shows one of these known vessels, apply the known diameter as the physical ground-truth scale ruler to calculate food volume rather than guessing generic portion sizes.");
  return lines.join("\n");
}
