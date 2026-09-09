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
    name: "Milk",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      cup: { calories: 130, protein: 9, carbs: 12, fats: 5 },
      cups: { calories: 130, protein: 9, carbs: 12, fats: 5 },
      glass: { calories: 130, protein: 9, carbs: 12, fats: 5 },
      glasses: { calories: 130, protein: 9, carbs: 12, fats: 5 },
      oz: { calories: 16.25, protein: 1.125, carbs: 1.5, fats: 0.625 }
    }
  },
  {
    regex: /\b(?:canadian\s+protein(?:\s+vegan)?|vegan\s+protein(?:\s+powder)?)\b/i,
    name: "Canadian Protein Vegan Powder",
    defaultUnit: "cups",
    defaultQty: 1,
    perUnit: {
      scoop: { calories: 120, protein: 22, carbs: 2, fats: 2 },
      scoops: { calories: 120, protein: 22, carbs: 2, fats: 2 },
      cup: { calories: 390, protein: 72, carbs: 7, fats: 6.5 },
      cups: { calories: 390, protein: 72, carbs: 7, fats: 6.5 },
      g: { calories: 3.9, protein: 0.72, carbs: 0.07, fats: 0.065 }
    }
  },
  {
    regex: /\b(?:protein\s+(?:shake|smoothie)|smoothie)\b/i,
    name: "Protein Shake",
    defaultUnit: "shake",
    defaultQty: 1,
    perUnit: {
      shake: { calories: 755, protein: 91, carbs: 58, fats: 17 },
      shakes: { calories: 755, protein: 91, carbs: 58, fats: 17 },
      smoothie: { calories: 755, protein: 91, carbs: 58, fats: 17 },
      smoothies: { calories: 755, protein: 91, carbs: 58, fats: 17 }
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
    id: "staple-eggs",
    name: "Eggs",
    portion: "2 large eggs",
    calories: 144,
    protein: 13,
    carbs: 1,
    fats: 10,
    category: "Protein",
    icon: "🍳"
  },
  {
    id: "staple-protein-shake",
    name: "Protein Shake",
    portion: "2 cups milk, 1 cup Canadian Protein vegan powder, 1 banana",
    calories: 755,
    protein: 91,
    carbs: 58,
    fats: 17,
    category: "Protein",
    icon: "🥤"
  },
  {
    id: "staple-milk",
    name: "Milk",
    portion: "1 cup / glass (250 ml)",
    calories: 130,
    protein: 9,
    carbs: 12,
    fats: 5,
    category: "Dairy",
    icon: "🥛"
  },
  {
    id: "staple-banana",
    name: "Banana",
    portion: "1 banana (118g)",
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fats: 0.3,
    category: "Fruit",
    icon: "🍌"
  },
  {
    id: "staple-apple",
    name: "Apple",
    portion: "1 medium apple (182g)",
    calories: 95,
    protein: 0.5,
    carbs: 25,
    fats: 0.3,
    category: "Fruit",
    icon: "🍎"
  },
  {
    id: "staple-chicken",
    name: "Chicken Breast",
    portion: "200g cooked",
    calories: 330,
    protein: 62,
    carbs: 0,
    fats: 7,
    category: "Protein",
    icon: "🍗"
  },
  {
    id: "staple-ground-beef",
    name: "Ground Beef",
    portion: "200g cooked (90/10)",
    calories: 380,
    protein: 50,
    carbs: 0,
    fats: 20,
    category: "Protein",
    icon: "🥩"
  },
  {
    id: "staple-rice",
    name: "White Rice",
    portion: "1.5 cups cooked",
    calories: 310,
    protein: 6,
    carbs: 68,
    fats: 1,
    category: "Carbs",
    icon: "🍚"
  },
  {
    id: "staple-pb-toast",
    name: "PB Toast",
    portion: "1 slice + 1.5 tbsp PB",
    calories: 260,
    protein: 9,
    carbs: 24,
    fats: 14,
    category: "Carbs",
    icon: "🍞"
  },
  {
    id: "staple-oats",
    name: "Rolled Oats",
    portion: "1 cup dry (80g)",
    calories: 300,
    protein: 10,
    carbs: 54,
    fats: 5,
    category: "Carbs",
    icon: "🥣"
  },
  {
    id: "staple-greek-yogurt",
    name: "Greek Yogurt",
    portion: "1 cup (227g)",
    calories: 130,
    protein: 23,
    carbs: 9,
    fats: 0,
    category: "Dairy",
    icon: "🥣"
  },
  {
    id: "staple-granola-bar",
    name: "Granola Bar",
    portion: "1 bar / pouch (42g)",
    calories: 190,
    protein: 4,
    carbs: 29,
    fats: 7,
    category: "Snacks",
    icon: "🍫"
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
  date = null,
  name = "Meal",
  slot = "meal",
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
    date: date || getTodayIso(),
    slot: slot || "meal",
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
  // Essential Physical Hardware & Dishware Calibration (Vision AI Scale Rulers)
  // ---------------------------------------------------------------------------
  {
    id: "task-dinner-plate",
    category: "dishware",
    title: "Measure Main Dinner Plate",
    shortDesc: "Standard large flat plate used for main meals",
    icon: "🍽️",
    instruction: "Measure the outer rim diameter in inches (e.g. 10.5 inches) and the inner usable flat bed diameter (e.g. 8.5 inches). This provides Gemini Vision with an absolute physical ruler when estimating portions in plate photos.",
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
    shortDesc: "Everyday deep bowl for salads, grain bowls, pastas, large meals",
    icon: "🥣",
    instruction: "Measure top rim diameter (e.g. 8.0 inches), depth (e.g. 3.0 inches), and holding volume to your normal fill line in ml or oz (e.g. 750 ml / 25 fl oz). Eliminates 3D volumetric portion guessing.",
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
  }
];

export function getMergedCalibrationTasks(kitchenCalibration = {}) {
  const existingTasks = Array.isArray(kitchenCalibration)
    ? kitchenCalibration
    : (Array.isArray(kitchenCalibration?.tasks) ? kitchenCalibration.tasks : []);
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

export function getCalibrationProgress(input = {}) {
  const tasks = getMergedCalibrationTasks(input);

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
    "The user has physically measured their kitchenware. Use these exact measurements as an absolute physical ruler when analyzing photos:"
  ];

  for (const task of completedTasks) {
    const v = task.values || {};
    if (task.id === "task-dinner-plate") {
      lines.push(`- DINNER PLATE: "${v.name || 'Main Dinner Plate'}" | Outer Rim Diameter: ${v.diameterInches || 10.5}" | Flat Well: ${v.innerWellInches || 8.5}" ${v.tareWeightG ? `| Tare: ${v.tareWeightG}g` : ''}. (Use outer diameter as an absolute physical ruler in plate photos).`);
    } else if (task.id === "task-primary-bowl") {
      lines.push(`- PRIMARY LARGE BOWL: "${v.name || 'Primary Large Bowl'}" | Rim Diameter: ${v.diameterInches || 8.0}" | Depth: ${v.depthInches || 3.0}" | Usable Volume: ${v.volumeMl || '750 ml'} ${v.tareWeightG ? `| Tare: ${v.tareWeightG}g` : ''}. (Use this rim diameter to calibrate pixel scale and estimate food fill percentage).`);
    } else {
      lines.push(`- CUSTOM CALIBRATION ("${task.title}"): ${JSON.stringify(v)}`);
    }
  }

  lines.push("CONTAINERS, SNACK BOWLS & OTHER DISHES: If food is pictured in meal prep containers, small snack bowls, glass storage containers, or cups without custom calibration, dynamically estimate the vessel dimensions and portion volume from visual cues and context.");
  lines.push("CRITICAL: When the photo shows one of the user's calibrated primary vessels (plate or primary bowl), apply the measured diameter as the physical ground-truth scale ruler to calculate food volume rather than guessing generic portion sizes.");
  return lines.join("\n");
}


/**
 * Filter meals for a specific date (legacy entries without date default to today)
 */
export function filterMealsByDate(meals = [], dateIso = null) {
  if (!Array.isArray(meals)) return [];
  const targetIso = dateIso || getTodayIso();
  const todayIso = getTodayIso();
  return meals.filter(m => (m?.date || todayIso) === targetIso);
}

/**
 * Generates an N-day history of nutrition targets hit vs missed
 */
export function getDailyNutritionHistory(meals = [], targetCalories = 3250, targetProtein = 180, daysCount = 7) {
  if (!Array.isArray(meals)) meals = [];
  const today = new Date();
  const history = [];

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateIso = d.toISOString().split('T')[0];
    const dayMeals = filterMealsByDate(meals, dateIso);
    const totals = aggregateDailyNutrition(dayMeals);

    const isToday = i === 0;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    const hitCalories = totals.calories >= targetCalories;
    const hitProtein = totals.protein >= targetProtein;
    const pctCalories = Math.min(100, Math.round((totals.calories / targetCalories) * 100));

    history.push({
      dateIso,
      dateTitle: `${dayName}, ${monthDay}`,
      dayName,
      monthDay,
      isToday,
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fats: totals.fats,
      mealCount: totals.mealCount,
      targetCalories,
      targetProtein,
      hitCalories,
      hitProtein,
      pctCalories
    });
  }

  return history;
}


/**
 * Calculate multi-week weight trends across 7, 14, 30 days or all-time
 */
export function calculateWeightTrend(weightHistory = [], days = 14) {
  if (!Array.isArray(weightHistory) || weightHistory.length === 0) {
    return { changeLbs: 0, startWeight: null, endWeight: null, points: [], sampleCount: 0 };
  }

  const sorted = [...weightHistory]
    .filter(w => w && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length === 0) {
    return { changeLbs: 0, startWeight: null, endWeight: null, points: [], sampleCount: 0 };
  }

  const filtered = days === 'all' ? sorted : sorted.slice(-Number(days));
  const startWeight = filtered[0].weightLbs;
  const endWeight = filtered[filtered.length - 1].weightLbs;
  const changeLbs = Number((endWeight - startWeight).toFixed(1));

  return {
    changeLbs,
    startWeight,
    endWeight,
    points: filtered,
    sampleCount: filtered.length
  };
}
