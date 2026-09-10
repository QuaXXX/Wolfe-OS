/**
 * Wolfe OS — Nutrition & Fuel Engine
 * Handles precise macro calculations, daily aggregations, 7-day moving average weight tracking,
 * natural language ingredient breakdown parsing, adaptive surplus adjustments, and pantry presets.
 */

import { getTodayIso, addDays } from './calendarUtils.js';

// ---------------------------------------------------------------------------
// 1. DEFAULT NUTRITION TARGETS (High Carb, 180g Protein, 3,000-3,500 kcal)
// ---------------------------------------------------------------------------
const DEFAULT_NUTRITION_TARGETS = {
  calories: 3250,      // Midpoint of 3,000 - 3,500 kcal target
  protein: 180,        // 180g Protein (720 kcal)
  carbs: 450,          // 450g Carbs (1,800 kcal) - fuels glycogen & high volume training
  fats: 80,            // 80g Fats (720 kcal) - hormonal health
  fiber: 38,           // grams
  waterMl: 3500,       // 3.5 Liters (~14 glasses)
  targetWeightGainLbsPerWeek: 0.75 // 0.5 - 1.0 lb/week target
};

// Backward compatibility alias (internal only)
const DEFAULT_BULKING_TARGETS = DEFAULT_NUTRITION_TARGETS;

/**
 * Utility: Clamps a numeric value between min and max bounds
 */
export function clamp(val, min, max) {
  const num = Number(val) || 0;
  return Math.min(Math.max(num, min), max);
}

// ---------------------------------------------------------------------------
// 2. VERIFIED SPORTS NUTRITION INGREDIENT DATABASE
// ---------------------------------------------------------------------------
const INGREDIENT_DATABASE = [
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
    regex: /\b(?:canned\s+salmon|can\s+of\s+salmon|salmon\s+can|wild\s+salmon\s+can)\b/i,
    name: "Canned Salmon",
    defaultUnit: "can",
    defaultQty: 1,
    perUnit: {
      can: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      cans: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      tin: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      tins: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      serving: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      servings: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      g: { calories: 1.33, protein: 0.267, carbs: 0, fats: 0.027 },
      oz: { calories: 38, protein: 7.6, carbs: 0, fats: 0.76 }
    }
  },
  {
    regex: /\b(?:salmon)\b/i,
    name: "Atlantic Salmon (Cooked)",
    defaultUnit: "oz",
    defaultQty: 6,
    per100g: { calories: 206, protein: 22, carbs: 0, fats: 12 },
    perUnit: {
      can: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      cans: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      tin: { calories: 200, protein: 40, carbs: 0, fats: 4 },
      tins: { calories: 200, protein: 40, carbs: 0, fats: 4 },
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
    regex: /\b(?:canadian\s+protein(?:\s+vegan)?|vegan\s+protein(?:\s+powder)?|plant\s+protein(?:\s+powder)?)\b/i,
    name: "Canadian Protein Vegan Powder",
    defaultUnit: "scoop",
    defaultQty: 1,
    perUnit: {
      scoop: { calories: 120, protein: 20, carbs: 3, fats: 2 },
      scoops: { calories: 120, protein: 20, carbs: 3, fats: 2 },
      cup: { calories: 390, protein: 65, carbs: 10, fats: 6.5 },
      cups: { calories: 390, protein: 65, carbs: 10, fats: 6.5 },
      g: { calories: 3.9, protein: 0.67, carbs: 0.1, fats: 0.067 }
    }
  },
  {
    regex: /\b(?:whey(?:\s+protein)?|casein|protein\s+powder)\b/i,
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
    per100g: { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 },
    perUnit: {
      cup: { calories: 205, protein: 4.2, carbs: 45, fats: 0.4 },
      cups: { calories: 205, protein: 4.2, carbs: 45, fats: 0.4 },
      bowl: { calories: 410, protein: 8.4, carbs: 90, fats: 0.8 },
      bowls: { calories: 410, protein: 8.4, carbs: 90, fats: 0.8 },
      g: { calories: 1.3, protein: 0.027, carbs: 0.28, fats: 0.003 }
    }
  },
  {
    regex: /\b(?:brown\s+rice)\b/i,
    name: "Brown Rice (Cooked)",
    defaultUnit: "cups",
    defaultQty: 1,
    per100g: { calories: 110, protein: 2.5, carbs: 23, fats: 0.9 },
    perUnit: {
      cup: { calories: 218, protein: 4.5, carbs: 46, fats: 1.6 },
      cups: { calories: 218, protein: 4.5, carbs: 46, fats: 1.6 },
      bowl: { calories: 436, protein: 9, carbs: 92, fats: 3.2 },
      bowls: { calories: 436, protein: 9, carbs: 92, fats: 3.2 },
      g: { calories: 1.1, protein: 0.025, carbs: 0.23, fats: 0.009 }
    }
  },
  {
    regex: /\b(?:rolled\s+oats|oatmeal|oats(?!\s*(?:and|&)?\s*honey)(?!\s*bar))\b/i,
    name: "Rolled Oats (Dry)",
    defaultUnit: "cups",
    defaultQty: 1,
    per100g: { calories: 375, protein: 12.5, carbs: 67.5, fats: 6.2 },
    perUnit: {
      cup: { calories: 300, protein: 10, carbs: 54, fats: 5 },
      cups: { calories: 300, protein: 10, carbs: 54, fats: 5 },
      bowl: { calories: 450, protein: 15, carbs: 81, fats: 7.5 },
      bowls: { calories: 450, protein: 15, carbs: 81, fats: 7.5 },
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
    regex: /\b(?:bread|toast|sourdough|white\s+bread|whole\s+wheat\s+bread|sandwiches?)\b/i,
    name: "Bread / Toast",
    defaultUnit: "slices",
    defaultQty: 2,
    perUnit: {
      slice: { calories: 80, protein: 3, carbs: 15, fats: 1 },
      slices: { calories: 80, protein: 3, carbs: 15, fats: 1 },
      sandwich: { calories: 160, protein: 6, carbs: 30, fats: 2 }
    }
  },
  {
    regex: /\b(?:buns?|burger\s+buns?|bao\s+buns?|brioche\s+buns?|dinner\s+rolls?|hot\s+dog\s+buns?|rolls?)\b/i,
    name: "Bun / Roll",
    defaultUnit: "bun",
    defaultQty: 1,
    per100g: { calories: 260, protein: 8, carbs: 48, fats: 3 },
    perUnit: {
      bun: { calories: 130, protein: 4, carbs: 24, fats: 1.5 },
      buns: { calories: 130, protein: 4, carbs: 24, fats: 1.5 },
      roll: { calories: 130, protein: 4, carbs: 24, fats: 1.5 },
      rolls: { calories: 130, protein: 4, carbs: 24, fats: 1.5 },
      g: { calories: 2.6, protein: 0.08, carbs: 0.48, fats: 0.03 },
      oz: { calories: 74, protein: 2.3, carbs: 13.6, fats: 0.85 }
    }
  },
  {
    regex: /\b(?:pasta|spaghetti|noodles)\b/i,
    name: "Pasta (Cooked)",
    defaultUnit: "cups",
    defaultQty: 1.5,
    per100g: { calories: 158, protein: 5.8, carbs: 31, fats: 0.9 },
    perUnit: {
      cup: { calories: 220, protein: 8, carbs: 43, fats: 1.3 },
      cups: { calories: 220, protein: 8, carbs: 43, fats: 1.3 },
      bowl: { calories: 440, protein: 16, carbs: 86, fats: 2.6 },
      bowls: { calories: 440, protein: 16, carbs: 86, fats: 2.6 },
      g: { calories: 1.58, protein: 0.058, carbs: 0.31, fats: 0.009 }
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
    regex: /\b(?:protein\s+(?:shake|smoothie)|smoothie)\b/i,
    name: "Protein Smoothie",
    defaultUnit: "smoothie",
    defaultQty: 1,
    perUnit: {
      shake: { calories: 485, protein: 39, carbs: 54, fats: 12 },
      shakes: { calories: 485, protein: 39, carbs: 54, fats: 12 },
      smoothie: { calories: 485, protein: 39, carbs: 54, fats: 12 },
      smoothies: { calories: 485, protein: 39, carbs: 54, fats: 12 }
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
    per100g: { calories: 59, protein: 10.3, carbs: 3.6, fats: 0.4 },
    perUnit: {
      cup: { calories: 130, protein: 23, carbs: 9, fats: 0 },
      cups: { calories: 130, protein: 23, carbs: 9, fats: 0 },
      bowl: { calories: 260, protein: 46, carbs: 18, fats: 0 },
      bowls: { calories: 260, protein: 46, carbs: 18, fats: 0 },
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
    regex: /\b(?:nature\s+valley(?:[\s_]+(?:granola\s+)?bars?)?|nature\s+valley[\s_]+(?:oats[\s_]+(?:and|&)?[\s_]*honey|sweet[\s_]+(?:and|&)?[\s_]*salty|crunchy)|oats[_\s]+(?:and|&)[_\s]+honey(?:\s+granola)?\s+bars?)\b/i,
    name: "Nature Valley Bar",
    defaultUnit: "bar",
    defaultQty: 1,
    perUnit: {
      bar: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      bars: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      pouch: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      pouches: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      pack: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      packs: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      g: { calories: 4.85, protein: 0.1, carbs: 0.66, fats: 0.21 }
    }
  },
  {
    regex: /\b(?:granola\s+bars?|chewy\s+bars?|oats\s+(?:and|&)\s+honey\s+bars?)\b/i,
    name: "Granola Bar (Oats & Honey)",
    defaultUnit: "bar",
    defaultQty: 1,
    perUnit: {
      bar: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      bars: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      pouch: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      pouches: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      pack: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      packs: { calories: 170, protein: 3.5, carbs: 23, fats: 7.5 },
      g: { calories: 4.85, protein: 0.1, carbs: 0.66, fats: 0.21 }
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
    per100g: { calories: 86, protein: 11, carbs: 3.4, fats: 2.3 },
    perUnit: {
      cup: { calories: 220, protein: 28, carbs: 8, fats: 5 },
      cups: { calories: 220, protein: 28, carbs: 8, fats: 5 },
      bowl: { calories: 330, protein: 42, carbs: 12, fats: 7.5 },
      bowls: { calories: 330, protein: 42, carbs: 12, fats: 7.5 },
      serving: { calories: 110, protein: 14, carbs: 4, fats: 2.5 },
      servings: { calories: 110, protein: 14, carbs: 4, fats: 2.5 },
      tub: { calories: 440, protein: 56, carbs: 16, fats: 10 },
      g: { calories: 0.97, protein: 0.12, carbs: 0.035, fats: 0.022 },
      oz: { calories: 27.5, protein: 3.5, carbs: 1.0, fats: 0.6 }
    }
  },
  {
    regex: /\b(?:cheese|cheddar|swiss|mozzarella|parmesan|gouda|provolone|cheese\s+slice)\b/i,
    name: "Cheese (Slice / Shredded)",
    defaultUnit: "slice",
    defaultQty: 1,
    per100g: { calories: 380, protein: 25, carbs: 1.3, fats: 31 },
    perUnit: {
      slice: { calories: 95, protein: 6.3, carbs: 0.3, fats: 7.8 },
      slices: { calories: 95, protein: 6.3, carbs: 0.3, fats: 7.8 },
      oz: { calories: 108, protein: 7.1, carbs: 0.4, fats: 8.8 },
      g: { calories: 3.8, protein: 0.25, carbs: 0.013, fats: 0.31 }
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
    regex: /\b(?:veggies?|vegetables?|mixed\s+veggies?|mixed\s+vegetables?|greens|stir\s*fry\s+veggies?)\b/i,
    name: "Veggies / Mixed Vegetables",
    defaultUnit: "cup",
    defaultQty: 1,
    per100g: { calories: 35, protein: 2.0, carbs: 7.0, fats: 0.2 },
    perUnit: {
      cup: { calories: 35, protein: 2.0, carbs: 7.0, fats: 0.2 },
      cups: { calories: 35, protein: 2.0, carbs: 7.0, fats: 0.2 },
      serving: { calories: 35, protein: 2.0, carbs: 7.0, fats: 0.2 },
      servings: { calories: 35, protein: 2.0, carbs: 7.0, fats: 0.2 },
      bowl: { calories: 70, protein: 4.0, carbs: 14.0, fats: 0.4 },
      bowls: { calories: 70, protein: 4.0, carbs: 14.0, fats: 0.4 },
      g: { calories: 0.35, protein: 0.02, carbs: 0.07, fats: 0.002 },
      oz: { calories: 10, protein: 0.6, carbs: 2.0, fats: 0.06 }
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
  },
  {
    regex: /\b(?:cereal|cheerios|corn\s*flakes|special\s*k|granola\s+cereal)\b/i,
    name: "Cereal",
    defaultUnit: "cup",
    defaultQty: 1,
    per100g: { calories: 380, protein: 8, carbs: 83, fats: 3 },
    perUnit: {
      cup: { calories: 110, protein: 2.5, carbs: 24, fats: 1 },
      cups: { calories: 110, protein: 2.5, carbs: 24, fats: 1 },
      bowl: { calories: 220, protein: 5, carbs: 48, fats: 2 },
      bowls: { calories: 220, protein: 5, carbs: 48, fats: 2 },
      g: { calories: 3.8, protein: 0.08, carbs: 0.83, fats: 0.03 }
    }
  },
  {
    regex: /\b(?:chili|beef\s+chili|turkey\s+chili)\b/i,
    name: "Chili",
    defaultUnit: "bowl",
    defaultQty: 1,
    per100g: { calories: 125, protein: 9, carbs: 12, fats: 4.5 },
    perUnit: {
      cup: { calories: 280, protein: 22, carbs: 23, fats: 12 },
      cups: { calories: 280, protein: 22, carbs: 23, fats: 12 },
      bowl: { calories: 560, protein: 44, carbs: 46, fats: 24 },
      bowls: { calories: 560, protein: 44, carbs: 46, fats: 24 },
      g: { calories: 1.25, protein: 0.09, carbs: 0.12, fats: 0.045 }
    }
  },
  {
    regex: /\b(?:soup|chicken\s+soup|vegetable\s+soup)\b/i,
    name: "Soup",
    defaultUnit: "bowl",
    defaultQty: 1,
    per100g: { calories: 60, protein: 3.5, carbs: 7.5, fats: 1.8 },
    perUnit: {
      cup: { calories: 150, protein: 8, carbs: 18, fats: 5 },
      cups: { calories: 150, protein: 8, carbs: 18, fats: 5 },
      bowl: { calories: 300, protein: 16, carbs: 36, fats: 10 },
      bowls: { calories: 300, protein: 16, carbs: 36, fats: 10 },
      g: { calories: 0.6, protein: 0.035, carbs: 0.075, fats: 0.018 }
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
    portion: "2 cups milk, 1 scoop Canadian Protein vegan powder, 1 banana",
    calories: 485,
    protein: 39,
    carbs: 54,
    fats: 12,
    category: "Protein",
    icon: "🥤",
    items: [
      { name: "Milk", portion: "2 cups (500ml)", calories: 260, protein: 18, carbs: 24, fats: 10 },
      { name: "Canadian Protein Vegan Powder", portion: "1 scoop", calories: 120, protein: 20, carbs: 3, fats: 2 },
      { name: "Banana", portion: "1 medium (118g)", calories: 105, protein: 1.3, carbs: 27, fats: 0.3 }
    ]
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
    id: "staple-canned-salmon",
    name: "Canned Salmon",
    portion: "1 can (150g)",
    calories: 200,
    protein: 40,
    carbs: 0,
    fats: 4,
    category: "Protein",
    icon: "🐟"
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
    name: "Nature Valley Bar",
    portion: "1 bar / pouch (35g)",
    calories: 170,
    protein: 3.5,
    carbs: 23,
    fats: 7.5,
    category: "Snacks",
    icon: "🍫"
  }
];

/**
 * Validates and sanitizes household pantry staples against calibrated ground truth.
 * Ensures the household protein shake is strictly 485 kcal / 39g P (1 scoop vegan powder, 2 cups milk, 1 banana).
 * Ensures Nature Valley bar is calibrated to 170 kcal / 3.5g P.
 */
export function sanitizeHouseholdPantry(householdPantry = []) {
  if (!Array.isArray(householdPantry) || householdPantry.length === 0) {
    return DEFAULT_HOUSEHOLD_PANTRY;
  }
  return householdPantry.map(s => {
    if (s && (s.id === 'staple-protein-shake' || /protein\s*(?:shake|smoothie)|smoothie/i.test(s.name || ''))) {
      if (s.protein > 50 || s.calories > 600 || /1\s*cup/i.test(s.portion || '') || !Array.isArray(s.items) || s.items.length === 0) {
        return {
          ...s,
          id: s.id || 'staple-protein-shake',
          name: "Protein Shake",
          portion: "2 cups milk, 1 scoop Canadian Protein vegan powder, 1 banana",
          calories: 485,
          protein: 39,
          carbs: 54,
          fats: 12,
          category: "Protein",
          icon: "🥤",
          items: [
            { name: "Milk", portion: "2 cups (500ml)", calories: 260, protein: 18, carbs: 24, fats: 10 },
            { name: "Canadian Protein Vegan Powder", portion: "1 scoop", calories: 120, protein: 20, carbs: 3, fats: 2 },
            { name: "Banana", portion: "1 medium (118g)", calories: 105, protein: 1.3, carbs: 27, fats: 0.3 }
          ]
        };
      }
    }
    if (s && (s.id === 'staple-canned-salmon' || /canned\s+salmon|can\s+of\s+salmon/i.test(s.name || ''))) {
      if (s.protein !== 40 || s.calories !== 200) {
        return {
          ...s,
          id: s.id || 'staple-canned-salmon',
          name: "Canned Salmon",
          portion: "1 can (150g)",
          calories: 200,
          protein: 40,
          carbs: 0,
          fats: 4,
          category: "Protein",
          icon: "🐟"
        };
      }
    }
    if (s && (s.id === 'staple-granola-bar' || /nature\s*valley|granola\s*bar/i.test(s.name || ''))) {
      if (s.calories === 190 || s.protein === 4 || /190/i.test(s.portion || '') || /42g/i.test(s.portion || '')) {
        return {
          ...s,
          id: s.id || 'staple-granola-bar',
          name: "Nature Valley Bar",
          portion: "1 bar / pouch (35g)",
          calories: 170,
          protein: 3.5,
          carbs: 23,
          fats: 7.5,
          category: "Snacks",
          icon: "🍫"
        };
      }
    }
    return s;
  });
}

// ---------------------------------------------------------------------------
// 4. MEAL SLOTS
// ---------------------------------------------------------------------------
const MEAL_SLOTS = [
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
    .sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
    });

  if (sorted.length < 2) {
    return { velocityLbsPerWeek: 0, status: "insufficient_data", message: "Log 2+ days of morning weight" };
  }

  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];

  const tOld = new Date(oldest.date).getTime();
  const tNew = new Date(newest.date).getTime();
  const daysElapsed = (!isNaN(tOld) && !isNaN(tNew) && tNew > tOld)
    ? Math.max(1, (tNew - tOld) / (1000 * 60 * 60 * 24))
    : 1;

  const weightDiff = (newest.weightLbs || 0) - (oldest.weightLbs || 0);
  const rawVel = (weightDiff / daysElapsed) * 7;
  const velocity = isNaN(rawVel) ? 0 : Number(rawVel.toFixed(2));

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
    const recommendedNewTarget = clamp(currentCalorieTarget + 250, 2000, 4500);
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
// 6. NATURAL LANGUAGE MEAL PARSER (HARDWARE-AWARE & PANTRY-GROUNDED)
// ---------------------------------------------------------------------------

function getFoodPerGramRates(food) {
  if (!food) return null;
  if (food.perUnit && food.perUnit.g) {
    return food.perUnit.g;
  }
  if (food.per100g) {
    return {
      calories: food.per100g.calories / 100,
      protein: food.per100g.protein / 100,
      carbs: food.per100g.carbs / 100,
      fats: food.per100g.fats / 100
    };
  }
  return null;
}

export function parseMealDescription(text, options = {}) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;
  const cleanText = text.trim();

  const dishware = options.dishware || getCalibratedDishware(options.kitchenCalibration);
  const pantry = (Array.isArray(options.householdPantry) && options.householdPantry.length > 0)
    ? options.householdPantry
    : DEFAULT_HOUSEHOLD_PANTRY;

  const matchedVessel = dishware.findVessel(cleanText);
  const isPlate = matchedVessel ? matchedVessel.type === 'plate' : /plate/i.test(cleanText);
  const isBowl = matchedVessel ? matchedVessel.type === 'bowl' : /bowl/i.test(cleanText);
  const activeVessel = matchedVessel || (isPlate ? dishware.plate : isBowl ? dishware.bowl : null);

  // 1. Direct macro check
  const calMatch = cleanText.match(/(\d+)\s*(?:cals?|calories|kcal)\b/i);
  const protMatch = cleanText.match(/(\d+)\s*g?\s*(?:protein|p)\b/i);
  const carbMatch = cleanText.match(/(\d+)\s*g?\s*(?:carbs?|c)\b/i);
  const fatMatch = cleanText.match(/(\d+)\s*g?\s*(?:fats?|f)\b/i);
  if (calMatch && (protMatch || carbMatch || fatMatch)) {
    const c = parseInt(calMatch[1], 10);
    const p = protMatch ? parseInt(protMatch[1], 10) : 0;
    const cb = carbMatch ? parseInt(carbMatch[1], 10) : 0;
    const f = fatMatch ? parseInt(fatMatch[1], 10) : 0;
    return {
      name: 'Custom Macro Log',
      items: [{ name: 'Direct Macro Entry', portion: '1 serving', calories: c, protein: p, carbs: cb, fats: f }],
      calories: c, protein: p, carbs: cb, fats: f,
      source: 'manual_macro'
    };
  }

  // 2. Tare & Scale Gross Deduction
  let tareAdjustedWeightG = null;
  let tareVessel = activeVessel || dishware.bowl;
  const scaleGrossMatch = cleanText.match(/(?:scale\s+(?:reads?|says?)?|weighs?|weighing|total\s+weight\s+is?|gross)?\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:with|in|on)?\s*(?:my\s+|the\s+)?(?:primary\s+|large\s+|main\s+|dinner\s+)?(bowl|plate)/i)
    || cleanText.match(/(?:my\s+|the\s+)?(?:primary\s+|large\s+|main\s+|dinner\s+)?(bowl|plate)\s*(?:with|on|at)?\s*(?:scale\s+(?:reads?|says?)?)?\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)/i);

  if (scaleGrossMatch) {
    let grossG = 0;
    let vesselWord = '';
    if (!isNaN(parseFloat(scaleGrossMatch[1]))) {
      grossG = parseFloat(scaleGrossMatch[1]);
      vesselWord = (scaleGrossMatch[2] || '').toLowerCase();
    } else {
      vesselWord = (scaleGrossMatch[1] || '').toLowerCase();
      grossG = parseFloat(scaleGrossMatch[2]);
    }
    tareVessel = vesselWord.includes('plate') ? dishware.plate : dishware.bowl;
    const tareG = tareVessel.tareWeightG;
    if (grossG > tareG) {
      tareAdjustedWeightG = Math.round(grossG - tareG);
    } else {
      tareAdjustedWeightG = Math.round(grossG);
    }
  }

  // ---------------------------------------------------------------------------
  // 2B. Dedicated Compound "Insides / Filling" Partitioning
  // ---------------------------------------------------------------------------
  // Fixes the issue where an item with a specified filling weight (e.g. "bun with 70g insides of beef and veggies")
  // previously doubled the components to 70g beef AND 70g veggies (= 140g).
  // The specified weight is the TOTAL filling weight distributed across the inner ingredients.
  const compoundInsidesRegexA = /(?:(?:a|one)?\s*(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s+(?:with|w\/)?\s*)?(?:total\s+)?(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s+)?(?:the\s+)?(?:insides?|fillings?|stuffing)\s*(?:of|with|containing)?\s*(.+)/i;
  const compoundInsidesRegexB = /(?:(?:a|one)?\s*(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s+(?:with|w\/)?\s*)?(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s+)?(.+?)\s+(?:insides?|inside|as\s+filling|filling|stuffing)/i;
  const compoundInsidesRegexC = /(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s+(?:with|w\/)?\s*(?:insides?|fillings?|stuffing)\s*(?:of|weighing|at)?\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s+)?(.+)/i;
  const compoundInsidesRegexD = /(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s+(?:with|w\/)?\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:insides?|filling|stuffing)\b/i;
  const compoundInsidesRegexE = /(?:(?:a|one)?\s*(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s+(?:with|w\/)?\s*)?(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s+)?(.+?)\s+in(?:side)?\s+(?:the\s+)?(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)/i;
  const compoundInsidesRegexF = /(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s+(?:with|w\/)?\s*(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s+)?(.+?)\s+inside\b/i;

  const mInsides = cleanText.match(compoundInsidesRegexA) 
    || cleanText.match(compoundInsidesRegexB)
    || cleanText.match(compoundInsidesRegexC)
    || cleanText.match(compoundInsidesRegexD)
    || cleanText.match(compoundInsidesRegexE)
    || cleanText.match(compoundInsidesRegexF);

  if (mInsides) {
    let containerType = (mInsides[1] || mInsides[4] || '').toLowerCase().trim();
    if (!containerType) {
      const cMatch = cleanText.match(/\b(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\b/i);
      if (cMatch) containerType = cMatch[1].toLowerCase();
    }
    const totalG = parseFloat(mInsides[2]);
    let insideContentRaw = (mInsides[3] || '').trim();

    // If insideContentRaw has trailing container like "in a bun" or "in sandwich", strip it and capture container
    const trailingContainerMatch = insideContentRaw.match(/\s+(?:in|inside)\s+(?:a\s+|an\s+|the\s+)?(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s*$/i);
    if (trailingContainerMatch) {
      if (!containerType) {
        containerType = trailingContainerMatch[1].toLowerCase();
      }
      insideContentRaw = insideContentRaw.replace(/\s+(?:in|inside)\s+(?:a\s+|an\s+|the\s+)?(bun|sandwich|wrap|roll|bao|taco|burrito|pastry|dumpling|bread)\s*$/i, '').trim();
    }

    if (!isNaN(totalG) && totalG > 0) {
      const insidesItems = [];
      
      // If specific filling ingredients are described (e.g. "beef and veggies")
      if (insideContentRaw) {
        const subParts = insideContentRaw
          .replace(/(?:insides?|inside|filling|stuffing)\b/gi, '')
          .split(/[,+;&]|\band\b|\bwith\b/i)
          .map(s => s.trim())
          .filter(Boolean);

        const identified = [];
        for (const part of subParts) {
          let found = null;
          for (const food of INGREDIENT_DATABASE) {
            if (food.regex.test(part)) {
              found = food;
              break;
            }
          }
          if (found) {
            identified.push({ part, food: found });
          }
        }

        if (identified.length > 0) {
          // If we have meat + veggies, allocate 60% to meat, 40% to veggies (conservative underestimation)
          const hasMeat = identified.some(i => /chicken|beef|steak|turkey|salmon|tuna|pork|meat/i.test(i.food.name));
          const hasVeg = identified.some(i => /veggie|vegetable|greens|broccoli|kale|carrot|cabbage|onion/i.test(i.food.name));

          if (identified.length === 2 && hasMeat && hasVeg) {
            const meatItem = identified.find(i => /chicken|beef|steak|turkey|salmon|tuna|pork|meat/i.test(i.food.name));
            const vegItem = identified.find(i => /veggie|vegetable|greens|broccoli|kale|carrot|cabbage|onion/i.test(i.food.name));

            const meatG = Math.round(totalG * 0.60);
            const vegG = totalG - meatG;

            const meatRates = getFoodPerGramRates(meatItem.food);
            const vegRates = getFoodPerGramRates(vegItem.food);

            insidesItems.push({
              name: meatItem.food.name,
              portion: `${meatG}g inside filling (60%)`,
              calories: Math.round(meatRates.calories * meatG),
              protein: Math.round(meatRates.protein * meatG),
              carbs: Math.round(meatRates.carbs * meatG),
              fats: Math.round(meatRates.fats * meatG)
            });

            insidesItems.push({
              name: vegItem.food.name,
              portion: `${vegG}g inside filling (40%)`,
              calories: Math.round(vegRates.calories * vegG),
              protein: Math.round(vegRates.protein * vegG),
              carbs: Math.round(vegRates.carbs * vegG),
              fats: Math.round(vegRates.fats * vegG)
            });
          } else {
            // Distribute totalG evenly across identified items
            const perItemG = Math.round(totalG / identified.length);
            identified.forEach((item, idx) => {
              const itemG = (idx === identified.length - 1) ? (totalG - (perItemG * (identified.length - 1))) : perItemG;
              const rates = getFoodPerGramRates(item.food);
              insidesItems.push({
                name: item.food.name,
                portion: `${itemG}g inside filling`,
                calories: Math.round(rates.calories * itemG),
                protein: Math.round(rates.protein * itemG),
                carbs: Math.round(rates.carbs * itemG),
                fats: Math.round(rates.fats * itemG)
              });
            });
          }
        }
      }

      // If no specific ingredients recognized inside, create a conservative generic filling entry
      if (insidesItems.length === 0) {
        // Conservative filling standard: 1.2 kcal/g, 0.12g protein/g
        insidesItems.push({
          name: "Savory Filling (Insides)",
          portion: `${Math.round(totalG)}g total insides`,
          calories: Math.round(totalG * 1.2),
          protein: Math.round(totalG * 0.12),
          carbs: Math.round(totalG * 0.05),
          fats: Math.round(totalG * 0.05)
        });
      }

      // If container was specified (e.g. bun, sandwich bread, wrap)
      if (containerType) {
        let containerFood = null;
        for (const food of INGREDIENT_DATABASE) {
          if (food.regex.test(containerType)) {
            containerFood = food;
            break;
          }
        }
        if (containerFood) {
          const r = containerFood.perUnit[containerFood.defaultUnit] || containerFood.perUnit.bun || containerFood.perUnit.slice || containerFood.perUnit.sandwich;
          const isSandwich = containerType === 'sandwich' || containerFood.name.includes('Bread');
          const mult = (isSandwich && containerFood.defaultUnit === 'slices') ? 1 : (isSandwich && containerFood.defaultUnit === 'slice') ? 2 : 1;
          const portionText = isSandwich ? '2 slices bread (~60g)' : `1 ${containerFood.defaultUnit} (~50g)`;
          insidesItems.unshift({
            name: containerFood.name,
            portion: portionText,
            calories: r.calories * mult,
            protein: r.protein * mult,
            carbs: r.carbs * mult,
            fats: r.fats * mult
          });
        }
      }

      const totalCals = insidesItems.reduce((acc, it) => acc + it.calories, 0);
      const totalP = insidesItems.reduce((acc, it) => acc + it.protein, 0);
      const totalC = insidesItems.reduce((acc, it) => acc + it.carbs, 0);
      const totalF = insidesItems.reduce((acc, it) => acc + it.fats, 0);

      const titleName = containerType 
        ? `${containerType.charAt(0).toUpperCase() + containerType.slice(1)} with ${Math.round(totalG)}g Insides`
        : `${Math.round(totalG)}g Insides Filling`;

      return {
        name: titleName,
        items: insidesItems,
        calories: totalCals,
        protein: totalP,
        carbs: totalC,
        fats: totalF,
        source: "compound_filling_engine"
      };
    }
  }

  // 3. Clause extraction & Context Intelligence
  let detectedSlot = 'meal';
  if (/\b(?:breakfast|morning\s+meal|pre-workout)\b/i.test(cleanText)) {
    detectedSlot = 'breakfast';
  } else if (/\b(?:lunch|midday\s+meal)\b/i.test(cleanText)) {
    detectedSlot = 'lunch';
  } else if (/\b(?:dinner|supper|evening\s+meal)\b/i.test(cleanText)) {
    detectedSlot = 'dinner';
  } else if (/\b(?:snack|post-workout|postworkout|shake|dessert)\b/i.test(cleanText)) {
    detectedSlot = 'snack';
  }

  // Pre-process exclusions: e.g. "no cheese", "without sour cream", "hold the dressing", "skip mayo"
  const excludedIngredients = [];
  const exclusionRegex = /\b(?:no|without|hold\s+(?:the\s+)?|skip\s+(?:the\s+)?|omit\s+(?:the\s+)?)\s*([a-zA-Z\s]+?)(?=[,+;\n]|\band\b|\bplus\b|\bwith\b|\bw\/|$)/gi;
  let exclMatch;
  while ((exclMatch = exclusionRegex.exec(cleanText)) !== null) {
    const rawWord = exclMatch[1].trim().toLowerCase();
    if (rawWord && !['a', 'an', 'the', 'my', 'some'].includes(rawWord)) {
      excludedIngredients.push(rawWord);
    }
  }

  // Global consumption scaling (e.g. "only ate half", "left a third")
  let globalPortionScale = 1.0;
  let scalingNote = null;
  if (/\b(?:only\s+(?:ate|had|finished)\s+half|ate\s+half\s+of\s+it|finished\s+half|half\s+of\s+it|ate\s+1\/2)\b/i.test(cleanText)) {
    globalPortionScale = 0.5;
    scalingNote = "Scaled to 50% consumed per note";
  } else if (/\b(?:left\s+a\s+third|left\s+1\/3)\b/i.test(cleanText)) {
    globalPortionScale = 0.67;
    scalingNote = "Scaled to 67% consumed per note";
  } else if (/\b(?:left\s+(?:a\s+)?quarter|left\s+1\/4|ate\s+3\/4)\b/i.test(cleanText)) {
    globalPortionScale = 0.75;
    scalingNote = "Scaled to 75% consumed per note";
  } else if (/\b(?:double\s+portion|double\s+serving|2x\s+portion)\b/i.test(cleanText)) {
    globalPortionScale = 2.0;
    scalingNote = "Scaled to double portion";
  }

  // Added cooking fat / oil detection (e.g. "cooked in 1 tbsp olive oil", "fried in 1 tbsp butter")
  const cookingFatMatch = cleanText.match(/(?:cooked|fried|saut[eé]ed|prepared)\s+in\s+(\d+(?:\.\d+)?|\d+\/\d+|a|one|half)?\s*(tbsp|tablespoons?|tsp|teaspoons?)\s+(olive\s+oil|butter|oil)/i);
  let extraCookingFatItem = null;
  if (cookingFatMatch) {
    const rawAmt = (cookingFatMatch[1] || '1').toLowerCase();
    const num = rawAmt === 'half' ? 0.5 : parseFloat(rawAmt) || 1;
    const fatUnit = cookingFatMatch[2].toLowerCase();
    const fatType = cookingFatMatch[3].toLowerCase();
    const isButter = fatType.includes('butter');
    const isTsp = fatUnit.startsWith('tsp');
    const unitScale = isTsp ? (1 / 3) : 1;
    const totalTbsp = num * unitScale;

    if (isButter) {
      extraCookingFatItem = {
        name: "Butter",
        portion: `${num} ${fatUnit} (Cooking Fat)`,
        calories: Math.round(102 * totalTbsp),
        protein: 0,
        carbs: 0,
        fats: Math.round(11.5 * totalTbsp)
      };
    } else {
      extraCookingFatItem = {
        name: "Olive Oil",
        portion: `${num} ${fatUnit} (Cooking Oil)`,
        calories: Math.round(120 * totalTbsp),
        protein: 0,
        carbs: 0,
        fats: Math.round(14 * totalTbsp)
      };
    }
  }

  let stripped = cleanText
    .replace(/^(?:i\s+)?(?:had|ate|eating|logged?|drank|consumed)\s+/i, '')
    .replace(/\s+(?:for\s+(?:breakfast|lunch|dinner|snack|post-workout|meal))\b/i, '')
    .replace(/(?:scale\s+(?:reads?|says?)?|weighs?|total\s+weight\s+is?|gross)?\s*\d+(?:\.\d+)?\s*(?:g|grams?)\s*(?:with|in|on)?\s*(?:my\s+|the\s+)?(?:primary\s+|large\s+|main\s+|dinner\s+)?(?:bowl|plate)\s*(?:with|and|of)?/i, '')
    .replace(/\boats\s+and\s+honey\b/gi, 'oats_and_honey')
    .replace(/\bsweet\s+and\s+salty\b/gi, 'sweet_and_salty')
    .replace(/\bmac(?:aroni)?\s+and\s+cheese\b/gi, 'mac_and_cheese')
    .replace(/\bpeanut\s+butter\s+and\s+jelly\b/gi, 'peanut_butter_and_jelly')
    .trim();

  // Extract carrier dish if user used "with", "containing", or "made with" (e.g. "protein smoothie with 2 cups of milk, 1 banana and 1 scoop of vegan protein powder")
  let dishCarrierTitle = null;
  const carrierMatch = stripped.match(/^(.+?)\s+(?:with|w\/|containing|made\s+with)\s+(.+)$/i);
  if (carrierMatch && /\b(?:protein\s+(?:shake|smoothie)|smoothie|shake|salad|sandwich|bowl)\b/i.test(carrierMatch[1])) {
    dishCarrierTitle = carrierMatch[1].trim();
    stripped = carrierMatch[2].trim();
  }

  // Composite meal weight (e.g. "400g chicken and rice in bowl")
  let compositeMealTotalWeightG = tareAdjustedWeightG;
  const compositeWeightMatch = stripped.match(/^(\d+(?:\.\d+)?)\s*(?:g|grams?)\s+(?:of\s+)?(.+?\s+(?:and|&)\s+.+)/i)
    || stripped.match(/(.+?\s+(?:and|&)\s+.+?)[,\s]+(?:total\s+(?:weight\s+)?|weighing\s+|net\s+)?(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/i);

  let isCompositeSplit = false;
  if (compositeWeightMatch && !cleanText.match(/\d+\s*(?:g|grams?)\s+[a-zA-Z]+.+\d+\s*(?:g|grams?)/i)) {
    if (compositeWeightMatch[1] && !isNaN(parseFloat(compositeWeightMatch[1]))) {
      compositeMealTotalWeightG = parseFloat(compositeWeightMatch[1]);
      stripped = compositeWeightMatch[2];
      isCompositeSplit = true;
    } else if (compositeWeightMatch[2] && !isNaN(parseFloat(compositeWeightMatch[2]))) {
      compositeMealTotalWeightG = parseFloat(compositeWeightMatch[2]);
      stripped = compositeWeightMatch[1];
      isCompositeSplit = true;
    }
  }

  const rawClauses = stripped
    .replace(/(?<=[a-zA-Z])\s+(?=\d+(?:\.\d+)?|\d+\/\d+)/g, ', ')
    .split(/[,+;\n]|\band\b|\bplus\b|\bwith\b|\bw\//i)
    .map(c => c.trim())
    .filter(c => {
      if (!c) return false;
      if (c.match(/^(?:my|the)?\s*(?:primary\s+|large\s+|main\s+|dinner\s+)?(?:bowl|plate)$/i)) return false;
      if (/^(?:no|without|hold|omit|skip)\b/i.test(c)) return false;
      return true;
    });

  const matchedItems = [];

  for (const rawClause of rawClauses) {
    const clause = rawClause.replace(/_/g, ' ');
    // Custom smoothie / shake
    if (/\b(?:protein\s+(?:shake|smoothie)|smoothie|my\s+shake|canadian\s+protein\s+shake)\b/i.test(clause)) {
      let mult = 1;
      const qm = clause.match(/(\d+(?:\.\d+)?|\d+\/\d+|half|two|three|four|2|3|4)\s*(?:shakes?|smoothies?)?/i);
      if (qm) {
        const w = qm[1].toLowerCase();
        if (w === 'half') mult = 0.5;
        else if (w === 'two' || w === '2') mult = 2;
        else if (w === 'three' || w === '3') mult = 3;
        else if (w === 'four' || w === '4') mult = 4;
        else if (parseFloat(w)) mult = parseFloat(w);
      }
      dishCarrierTitle = 'Protein Smoothie';
      // Expand into the 3 constituent items so individual ingredients & accurate macros are preserved
      matchedItems.push(
        {
          name: 'Milk (User Calibrated)',
          portion: mult === 1 ? '2 cups / glasses (250ml)' : `${2 * mult} cups`,
          calories: Math.round(260 * mult),
          protein: Math.round(18 * mult),
          carbs: Math.round(24 * mult),
          fats: Math.round(10 * mult)
        },
        {
          name: 'Canadian Protein Vegan Powder',
          portion: mult === 1 ? '1 scoop' : `${mult} scoops`,
          calories: Math.round(120 * mult),
          protein: Math.round(20 * mult),
          carbs: Math.round(3 * mult),
          fats: Math.round(2 * mult)
        },
        {
          name: 'Banana',
          portion: mult === 1 ? '1 banana (118g)' : `${mult} bananas`,
          calories: Math.round(105 * mult),
          protein: Math.round(1.3 * mult),
          carbs: Math.round(27 * mult),
          fats: Math.round(0.3 * mult)
        }
      );
      continue;
    }

    let qty = null;
    let unit = null;

    const numWordMap = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5, '1/2': 0.5 };
    const qRegex = /(?:^|\s)(\d+(?:\.\d+)?|\d+\/\d+|half|a|an|one|two|three|four|five|six)\s*(egg\s+whites?|whole\s+eggs?|bars?|pouches?|packs?|scoops?|slices?|toasts?|pieces?|bowls?|plates?|servings?|cups?|glasses?|glass|tbsp|tablespoons?|tsp|teaspoons?|whites?|eggs?|bananas?|apples?|potatoes?|cans?|oz|ounces|grams?|g\b)?/i;
    const qm = clause.match(qRegex);

    if (qm) {
      const rawNum = qm[1].toLowerCase();
      if (numWordMap[rawNum] !== undefined) {
        qty = numWordMap[rawNum];
      } else if (rawNum.includes('/')) {
        const [n, d] = rawNum.split('/').map(Number);
        qty = d ? n / d : 1;
      } else {
        qty = parseFloat(rawNum);
      }
      unit = (qm[2] || '').toLowerCase().trim();
    }

    const directGramMatch = clause.match(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\b/i);
    if (directGramMatch) {
      qty = parseFloat(directGramMatch[1]);
      unit = 'g';
    }

    const directOzMatch = clause.match(/(\d+(?:\.\d+)?)\s*(?:oz|ounces?)\b/i);
    if (directOzMatch) {
      qty = parseFloat(directOzMatch[1]);
      unit = 'oz';
    }

    if (/\bbowls?\b/i.test(clause) && !unit) unit = 'bowl';
    if (/\bplates?\b/i.test(clause) && !unit) unit = 'plate';
    if (!unit && /\b(?:can|tin)\s+of\b/i.test(clause)) {
      unit = 'can';
      if (qty === null) qty = 1;
    }

    // User calibrated milk
    if (/\b(?:milk|glass\s+of\s+milk|cup\s+of\s+milk)\b/i.test(clause) && !/\b(?:fairlife|soy|almond|oat\s+milk)\b/i.test(clause)) {
      const usedQty = (qty !== null && !isNaN(qty)) ? qty : 1;
      matchedItems.push({
        name: 'Milk (User Calibrated)',
        portion: `${usedQty} ${usedQty === 1 ? 'cup / glass' : 'cups / glasses'} (250ml)`,
        calories: Math.round(130 * usedQty),
        protein: Math.round(9 * usedQty),
        carbs: Math.round(12 * usedQty),
        fats: Math.round(5 * usedQty)
      });
      continue;
    }

    // Custom pantry staples
    let matchedPantryItem = null;
    if (unit !== 'g' && unit !== 'oz') {
      for (const staple of pantry) {
        if (!staple || !staple.name) continue;
        const cleanStapleName = staple.name.toLowerCase().trim();
        if (['milk', 'eggs', 'egg', 'protein shake'].includes(cleanStapleName)) continue;
        const escaped = cleanStapleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const stapleRegex = new RegExp(`(?:^|\\s)${escaped}s?(?:\\s|$)`, 'i');
        if (stapleRegex.test(clause)) {
          matchedPantryItem = staple;
          break;
        }
      }
    }

    if (matchedPantryItem) {
      const usedQty = (qty !== null && !isNaN(qty)) ? qty : 1;
      matchedItems.push({
        name: matchedPantryItem.name,
        portion: usedQty === 1 ? (matchedPantryItem.portion || '1 serving') : `${usedQty} servings`,
        calories: Math.round((matchedPantryItem.calories || 0) * usedQty),
        protein: Number(((matchedPantryItem.protein || 0) * usedQty).toFixed(1)),
        carbs: Number(((matchedPantryItem.carbs || 0) * usedQty).toFixed(1)),
        fats: Number(((matchedPantryItem.fats || 0) * usedQty).toFixed(1))
      });
      continue;
    }

    // INGREDIENT_DATABASE
    let matchedFood = null;
    for (const food of INGREDIENT_DATABASE) {
      if (food.regex.test(clause)) {
        matchedFood = food;
        break;
      }
    }

    if (matchedFood) {
      // Check if food was marked as excluded
      const isExcluded = excludedIngredients.some(excl => 
        matchedFood.name.toLowerCase().includes(excl) || 
        (matchedFood.regex && matchedFood.regex.test(excl))
      );
      if (isExcluded) continue;

      let usedQty = (qty !== null && !isNaN(qty)) ? qty : matchedFood.defaultQty;
      let usedUnit = unit || matchedFood.defaultUnit;

      let itemCals = 0;
      let itemP = 0;
      let itemC = 0;
      let itemF = 0;
      let portionLabel = `${usedQty} ${usedUnit}`;

      const perGramRates = getFoodPerGramRates(matchedFood);

      // If food is in a calibrated vessel (Bowl or Plate)
      if (usedUnit === 'bowl' || usedUnit === 'bowls' || (isBowl && !unit)) {
        const vBowl = activeVessel?.type === 'bowl' ? activeVessel : dishware.bowl;
        const bowlVol = vBowl.volumeMl || 750;
        const volScale = bowlVol / 750;
        const bowlCount = (unit === 'bowl' || unit === 'bowls') ? ((qty !== null && !isNaN(qty)) ? qty : 1) : 1;
        portionLabel = `${bowlCount === 1 ? '1' : bowlCount} ${vBowl.name} (${bowlVol}ml capacity)`;

        if (matchedFood.name === 'Cereal') {
          // A full bowl of cereal incorporates 2 cups cereal + 1 cup calibrated milk
          itemCals = Math.round(350 * bowlCount * volScale);
          itemP = Math.round(14 * bowlCount * volScale);
          itemC = Math.round(60 * bowlCount * volScale);
          itemF = Math.round(7 * bowlCount * volScale);
          portionLabel = `${bowlCount === 1 ? '1' : bowlCount} ${vBowl.name} (Cereal + Calibrated Milk)`;
        } else if (matchedFood.perUnit && matchedFood.perUnit.bowl) {
          const r = matchedFood.perUnit.bowl;
          itemCals = Math.round(r.calories * bowlCount * volScale);
          itemP = Math.round(r.protein * bowlCount * volScale);
          itemC = Math.round(r.carbs * bowlCount * volScale);
          itemF = Math.round(r.fats * bowlCount * volScale);
        } else if (perGramRates) {
          const netG = 300 * volScale * bowlCount;
          itemCals = Math.round(perGramRates.calories * netG);
          itemP = Math.round(perGramRates.protein * netG);
          itemC = Math.round(perGramRates.carbs * netG);
          itemF = Math.round(perGramRates.fats * netG);
        }
      } else if (usedUnit === 'plate' || usedUnit === 'plates' || (isPlate && !unit)) {
        const vPlate = activeVessel?.type === 'plate' ? activeVessel : dishware.plate;
        const plateScale = vPlate.servingFactor || 1.0;
        portionLabel = `Plated portion on ${vPlate.name} (${vPlate.innerWellInches}" well)`;

        if (matchedFood.per100g) {
          // Plate main portion: protein ~220g, carbs ~250g
          const isMeat = /chicken|beef|steak|turkey|salmon|tuna/i.test(matchedFood.name);
          const platedGrams = isMeat ? 220 * plateScale : 250 * plateScale;
          itemCals = Math.round(perGramRates.calories * platedGrams);
          itemP = Math.round(perGramRates.protein * platedGrams);
          itemC = Math.round(perGramRates.carbs * platedGrams);
          itemF = Math.round(perGramRates.fats * platedGrams);
          portionLabel = `${Math.round(platedGrams)}g on ${vPlate.name}`;
        } else if (matchedFood.perUnit && matchedFood.perUnit[matchedFood.defaultUnit]) {
          const r = matchedFood.perUnit[matchedFood.defaultUnit];
          itemCals = Math.round(r.calories * usedQty * plateScale);
          itemP = Math.round(r.protein * usedQty * plateScale);
          itemC = Math.round(r.carbs * usedQty * plateScale);
          itemF = Math.round(r.fats * usedQty * plateScale);
        }
      } else if ((usedUnit === 'g' || usedUnit === 'grams') && perGramRates) {
        itemCals = Math.round(perGramRates.calories * usedQty);
        itemP = Math.round(perGramRates.protein * usedQty);
        itemC = Math.round(perGramRates.carbs * usedQty);
        itemF = Math.round(perGramRates.fats * usedQty);
        portionLabel = `${usedQty}g`;
      } else if (matchedFood.perUnit && matchedFood.perUnit[usedUnit]) {
        const r = matchedFood.perUnit[usedUnit];
        itemCals = Math.round(r.calories * usedQty);
        itemP = Number((r.protein * usedQty).toFixed(1));
        itemC = Number((r.carbs * usedQty).toFixed(1));
        itemF = Number((r.fats * usedQty).toFixed(1));
      } else if (matchedFood.perUnit && matchedFood.perUnit[matchedFood.defaultUnit]) {
        const r = matchedFood.perUnit[matchedFood.defaultUnit];
        itemCals = Math.round(r.calories * usedQty);
        itemP = Number((r.protein * usedQty).toFixed(1));
        itemC = Number((r.carbs * usedQty).toFixed(1));
        itemF = Number((r.fats * usedQty).toFixed(1));
      }

      matchedItems.push({
        name: matchedFood.name,
        portion: portionLabel,
        calories: itemCals,
        protein: itemP,
        carbs: itemC,
        fats: itemF
      });
    }
  }

  // Append cooking fat / oil if detected and not already in items
  if (extraCookingFatItem && !matchedItems.some(it => it.name.toLowerCase().includes(extraCookingFatItem.name.toLowerCase()))) {
    matchedItems.push(extraCookingFatItem);
  }

  if (matchedItems.length === 0) return null;

  // 4. Tare Deduction Application
  if (tareAdjustedWeightG && matchedItems.length === 1) {
    const it = matchedItems[0];
    const dbFood = INGREDIENT_DATABASE.find(f => f.name.toLowerCase().includes(it.name.toLowerCase()) || it.name.toLowerCase().includes(f.name.toLowerCase().replace(/\s*\(.*\)/, '')));
    const perGram = dbFood ? getFoodPerGramRates(dbFood) : null;
    if (perGram) {
      const netG = tareAdjustedWeightG;
      it.name = dbFood.name;
      it.calories = Math.round(perGram.calories * netG);
      it.protein = Math.round(perGram.protein * netG);
      it.carbs = Math.round(perGram.carbs * netG);
      it.fats = Math.round(perGram.fats * netG);
      it.portion = `${netG}g on ${tareVessel.name} (net from scale: ${tareAdjustedWeightG + tareVessel.tareWeightG}g - ${tareVessel.tareWeightG}g tare)`;
    }
  } else if (compositeMealTotalWeightG && matchedItems.length > 1) {
    const splitGrams = Math.round(compositeMealTotalWeightG / matchedItems.length);
    for (const it of matchedItems) {
      const dbFood = INGREDIENT_DATABASE.find(f => f.name === it.name || it.name.toLowerCase().includes(f.name.toLowerCase().replace(/\s*\(.*\)/, '')));
      const perGram = dbFood ? getFoodPerGramRates(dbFood) : null;
      if (perGram) {
        it.calories = Math.round(perGram.calories * splitGrams);
        it.protein = Math.round(perGram.protein * splitGrams);
        it.carbs = Math.round(perGram.carbs * splitGrams);
        it.fats = Math.round(perGram.fats * splitGrams);
        it.portion = `${splitGrams}g (${Math.round(compositeMealTotalWeightG)}g total in ${tareVessel.name})`;
      }
    }
  }

  // 5. Apply global portion / consumption scaling (e.g. "only ate half")
  if (globalPortionScale !== 1.0) {
    for (const it of matchedItems) {
      it.calories = Math.round(it.calories * globalPortionScale);
      it.protein = Math.round(it.protein * globalPortionScale);
      it.carbs = Math.round(it.carbs * globalPortionScale);
      it.fats = Math.round(it.fats * globalPortionScale);
      it.portion = `${it.portion} (${Math.round(globalPortionScale * 100)}% consumed)`;
    }
  }

  const totalCalories = Math.round(matchedItems.reduce((acc, it) => acc + (it.calories || 0), 0));
  const totalProtein = Number(matchedItems.reduce((acc, it) => acc + (it.protein || 0), 0).toFixed(1));
  const totalCarbs = Number(matchedItems.reduce((acc, it) => acc + (it.carbs || 0), 0).toFixed(1));
  const totalFats = Number(matchedItems.reduce((acc, it) => acc + (it.fats || 0), 0).toFixed(1));

  const cleanItemNames = matchedItems.map(m => m.name.replace(/\s*\([^)]*\)/, ''));
  let title = '';
  if (dishCarrierTitle) {
    const isSmoothieOrShake = /smoothie|shake/i.test(dishCarrierTitle);
    title = isSmoothieOrShake ? 'Protein Smoothie' : (dishCarrierTitle.charAt(0).toUpperCase() + dishCarrierTitle.slice(1));
  } else if (cleanItemNames.length === 1) {
    title = cleanItemNames[0];
  } else if (cleanItemNames.length === 2) {
    title = cleanItemNames.join(' & ');
  } else if (cleanItemNames.length === 3) {
    title = `${cleanItemNames[0]}, ${cleanItemNames[1]} & ${cleanItemNames[2]}`;
  } else {
    title = cleanItemNames.slice(0, -1).join(', ') + ' & ' + cleanItemNames[cleanItemNames.length - 1];
  }

  if (activeVessel && !title.toLowerCase().includes('bowl') && !title.toLowerCase().includes('plate') && !title.toLowerCase().includes('smoothie')) {
    title += activeVessel.type === 'plate' ? ` on ${activeVessel.name} (${activeVessel.diameterInches}")` : ` in ${activeVessel.name} (${activeVessel.volumeMl}ml)`;
  }

  return {
    name: title,
    slot: detectedSlot,
    items: matchedItems,
    calories: totalCalories,
    protein: totalProtein,
    carbs: totalCarbs,
    fats: totalFats,
    notes: scalingNote || "Calculated from verified sports nutrition database",
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
  let p = Math.max(0, Math.round(Number(protein) || 0));
  let c = Math.max(0, Math.round(Number(carbs) || 0));
  let f = Math.max(0, Math.round(Number(fats) || 0));
  
  const calculatedCals = calculateCaloriesFromMacros(p, c, f);
  const rawCals = Math.max(0, Math.round(Number(calories) || 0));
  let finalCals = rawCals > 0 ? rawCals : calculatedCals;
  let finalName = (name || "Logged Meal").trim();
  let finalItems = Array.isArray(items) ? items : [items].filter(Boolean);

  // Safety calibration: a single household protein shake / smoothie with Canadian Protein vegan powder is ~39g P / 485 kcal, never 91g
  const isSmoothie = /protein\s*(?:shake|smoothie)|smoothie/i.test(finalName) ||
    finalItems.some(it => {
      const itName = typeof it === 'string' ? it : it?.name || '';
      return /protein\s*(?:shake|smoothie)|smoothie/i.test(itName) || (/vegan.*protein/i.test(itName) && (it?.protein >= 60));
    });

  if (isSmoothie && (p >= 60 || finalCals >= 650)) {
    finalName = "Protein Shake (Milk, Banana & Vegan Protein Powder)";
    finalCals = 485;
    p = 39;
    c = 54;
    f = 12;
    finalItems = [
      { name: "Milk", portion: "2 cups (500ml)", calories: 260, protein: 18, carbs: 24, fats: 10 },
      { name: "Canadian Protein Vegan Powder", portion: "1 scoop", calories: 120, protein: 20, carbs: 3, fats: 2 },
      { name: "Banana", portion: "1 medium (118g)", calories: 105, protein: 1.3, carbs: 27, fats: 0.3 }
    ];
  }

  // Safety calibration: a single can of salmon is strictly 200 cals / 40g protein
  const isCannedSalmon = /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(finalName) ||
    (finalItems.length === 1 && finalItems.some(it => {
      const itName = typeof it === 'string' ? it : it?.name || '';
      return /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(itName);
    }));

  if (isCannedSalmon && (p !== 40 || finalCals !== 200) && finalItems.length <= 1) {
    finalName = "Canned Salmon";
    finalCals = 200;
    p = 40;
    c = 0;
    f = 4;
    finalItems = [
      { name: "Canned Salmon", portion: "1 can", calories: 200, protein: 40, carbs: 0, fats: 4 }
    ];
  }

  // Safety calibration: a single Nature Valley bar / granola bar is strictly 170 cals / 3.5g protein
  const isNatureValleyBar = /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(finalName) ||
    (finalItems.length === 1 && finalItems.some(it => {
      const itName = typeof it === 'string' ? it : it?.name || '';
      return /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(itName);
    }));

  if (isNatureValleyBar && (finalCals === 190 || finalCals === 0 || !finalCals) && finalItems.length <= 1) {
    finalName = finalName.includes("Nature Valley") ? finalName : "Nature Valley Bar";
    finalCals = 170;
    p = 3.5;
    c = 23;
    f = 7.5;
    finalItems = [
      { name: "Nature Valley Bar", portion: "1 bar / pouch (35g)", calories: 170, protein: 3.5, carbs: 23, fats: 7.5 }
    ];
  }

  return {
    id: `meal-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    date: date || getTodayIso(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    slot: slot || "meal",
    name: finalName,
    time: time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    calories: finalCals,
    protein: p,
    carbs: c,
    fats: f,
    items: finalItems
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
    completed: true,
    completedAt: "2026-09-08T20:00:00.000Z",
    values: {
      name: "Main Dinner Plate",
      diameterInches: 10.5,
      innerWellInches: 8.5,
      tareWeightG: 550
    }
  },
  {
    id: "task-primary-bowl",
    category: "dishware",
    title: "Measure Primary Large Bowl",
    shortDesc: "Everyday deep bowl for salads, grain bowls, pastas, large meals",
    icon: "🥣",
    instruction: "Measure top rim diameter (e.g. 8.0 inches), depth (e.g. 3.0 inches), and holding volume to your normal fill line in ml or oz (e.g. 750 ml / 25 fl oz). Eliminates 3D volumetric portion guessing.",
    fields: [
      { key: "name", label: "Bowl Description", placeholder: "e.g. Matte Black Ceramic Bowl", type: "text", default: "Primary Large Bowl" },
      { key: "diameterInches", label: "Top Rim Diameter (inches)", placeholder: "e.g. 8.0", type: "number", step: "0.1" },
      { key: "depthInches", label: "Bowl Depth / Height (inches)", placeholder: "e.g. 3.0", type: "number", step: "0.1" },
      { key: "volumeMl", label: "Usable Volume (ml or fl oz)", placeholder: "e.g. 750 ml or 25 fl oz", type: "text" },
      { key: "tareWeightG", label: "Empty Tare Weight (grams, optional)", placeholder: "e.g. 420", type: "number" }
    ],
    completed: true,
    completedAt: "2026-09-08T20:00:00.000Z",
    values: {
      name: "Primary Large Bowl",
      diameterInches: 8.0,
      depthInches: 3.0,
      volumeMl: "750 ml",
      tareWeightG: 420
    }
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

function getCalibratedDishware(kitchenCalibration = {}) {
  const tasks = getMergedCalibrationTasks(kitchenCalibration);
  const dishwareTasks = tasks.filter(t => t.category === 'dishware' || t.id.includes('bowl') || t.id.includes('plate'));

  const vessels = [];

  for (const t of dishwareTasks) {
    const v = t.values || {};
    const name = v.name || t.title || (t.id.includes('plate') ? 'Main Dinner Plate' : 'Primary Large Bowl');
    const isPlate = t.id.includes('plate') || /plate/i.test(name);
    
    let volMl = 750;
    if (v.volumeMl) {
      const parsed = parseFloat(String(v.volumeMl).replace(/[^\d.]/g, ''));
      if (!isNaN(parsed) && parsed > 0) volMl = parsed;
    } else if (isPlate) {
      volMl = 850;
    }

    let tareG = isPlate ? 550 : 420;
    if (v.tareWeightG) {
      const parsed = parseFloat(v.tareWeightG);
      if (!isNaN(parsed) && parsed > 0) tareG = parsed;
    }

    const diameter = parseFloat(v.diameterInches) || (isPlate ? 10.5 : 8.0);
    const depth = parseFloat(v.depthInches) || (isPlate ? 1.0 : 3.0);
    const innerWell = parseFloat(v.innerWellInches) || (isPlate ? 8.5 : diameter);

    const servingFactor = isPlate
      ? Math.round(Math.pow(innerWell / 8.5, 2) * 10) / 10 || 1.0
      : Math.round((volMl / 375) * 10) / 10 || 2.0;

    vessels.push({
      id: t.id,
      name,
      type: isPlate ? 'plate' : 'bowl',
      diameterInches: diameter,
      depthInches: depth,
      innerWellInches: innerWell,
      volumeMl: volMl,
      tareWeightG: tareG,
      servingFactor
    });
  }

  const primaryBowl = vessels.find(v => v.type === 'bowl') || {
    id: 'task-primary-bowl',
    name: 'Primary Large Bowl',
    type: 'bowl',
    diameterInches: 8.0,
    depthInches: 3.0,
    volumeMl: 750,
    tareWeightG: 420,
    servingFactor: 2.0
  };

  const primaryPlate = vessels.find(v => v.type === 'plate') || {
    id: 'task-dinner-plate',
    name: 'Main Dinner Plate',
    type: 'plate',
    diameterInches: 10.5,
    innerWellInches: 8.5,
    volumeMl: 850,
    tareWeightG: 550,
    servingFactor: 1.0
  };

  return {
    bowl: primaryBowl,
    plate: primaryPlate,
    vessels,
    findVessel: (text = '') => {
      const lower = text.toLowerCase();
      for (const v of vessels) {
        if (lower.includes(v.name.toLowerCase())) return v;
      }
      if (lower.includes('plate')) return primaryPlate;
      if (lower.includes('bowl')) return primaryBowl;
      return null;
    }
  };
}

/**
 * Builds AI system instruction prompt grounding custom household pantry staples
 */
export function buildAiPantryPrompt(householdPantry = []) {
  const rawPantry = (Array.isArray(householdPantry) && householdPantry.length > 0)
    ? householdPantry
    : DEFAULT_HOUSEHOLD_PANTRY;
  const pantry = sanitizeHouseholdPantry(rawPantry);

  const lines = [
    "USER PANTRY & STAPLE MEAL DEFINITIONS (HOUSEHOLD GROUND TRUTH):",
    "The user has specific staples and customized recipes. Use these exact macros when the user mentions these items:"
  ];

  for (const item of pantry) {
    if (!item || !item.name) continue;
    lines.push(`- "${item.name}": Portion "${item.portion || '1 serving'}" -> ${item.calories} kcal, ${item.protein}g P, ${item.carbs}g C, ${item.fats}g F.`);
  }

  return lines.join("\n");
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
 * Filter meals for a specific date strictly by dateIso (no dynamic fallback to today)
 */
export function filterMealsByDate(meals = [], dateIso = null) {
  if (!Array.isArray(meals)) return [];
  const targetIso = dateIso || getTodayIso();
  return meals.filter(m => m?.date === targetIso);
}

/**
 * Generates an N-day history of nutrition targets hit vs missed without timezone skew
 * Respects per-date historical targets from dailyTargets to prevent retroactive alterations.
 */
export function getDailyNutritionHistory(meals = [], defaultTargetCalories = 3250, defaultTargetProtein = 180, daysCount = 7, dailyTargets = {}) {
  if (!Array.isArray(meals)) meals = [];
  const history = [];
  const todayIso = getTodayIso();

  for (let i = daysCount - 1; i >= 0; i--) {
    const dateIso = addDays(todayIso, -i);
    const dayMeals = filterMealsByDate(meals, dateIso);
    const totals = aggregateDailyNutrition(dayMeals);

    // Look up historical target for this specific day, falling back to default target
    const dayTarget = (dailyTargets && typeof dailyTargets === 'object') ? dailyTargets[dateIso] : null;
    const dayCals = typeof dayTarget === 'number' ? dayTarget : (typeof dayTarget === 'object' && dayTarget !== null ? dayTarget.calories : null);
    const dayProtein = typeof dayTarget === 'object' && dayTarget !== null ? dayTarget.protein : null;
    const dayCarbs = typeof dayTarget === 'object' && dayTarget !== null ? dayTarget.carbs : null;
    const dayFats = typeof dayTarget === 'object' && dayTarget !== null ? dayTarget.fats : null;

    const targetCalories = Number(dayCals) || Number(defaultTargetCalories) || 3250;
    const targetProtein = Number(dayProtein) || Number(defaultTargetProtein) || 180;
    const targetCarbs = Number(dayCarbs) || 450;
    const targetFats = Number(dayFats) || 80;

    const isToday = i === 0;
    let dayName = 'Day';
    let monthDay = dateIso || '';
    try {
      const parts = (dateIso || '').split('-');
      if (parts.length >= 3) {
        const [y, m, d] = parts.map(Number);
        const dObj = new Date(y, m - 1, d);
        if (!isNaN(dObj.getTime())) {
          dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
          monthDay = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      }
    } catch (e) {}
    
    const totalsCals = Number(totals?.calories) || 0;
    const totalsP = Number(totals?.protein) || 0;
    const totalsC = Number(totals?.carbs) || 0;
    const totalsF = Number(totals?.fats) || 0;
    const totalsCount = Number(totals?.mealCount) || 0;

    const hitCalories = totalsCals >= targetCalories;
    const hitProtein = totalsP >= targetProtein;
    const pctCalories = targetCalories > 0 ? clamp(Math.round((totalsCals / targetCalories) * 100), 0, 100) : 0;

    history.push({
      dateIso: dateIso || '',
      dateTitle: `${dayName}, ${monthDay}`,
      dayName: dayName || 'Day',
      monthDay: monthDay || '',
      isToday,
      calories: totalsCals,
      protein: totalsP,
      carbs: totalsC,
      fats: totalsF,
      mealCount: totalsCount,
      targetCalories,
      targetProtein,
      targetCarbs,
      targetFats,
      hitCalories,
      hitProtein,
      pctCalories
    });
  }

  return history;
}

/**
 * Get target macros for a specific date (date-specific target if set, else fallback to global target)
 */
export function getTargetForDate(nutritionData, dateIso) {
  const targetIso = dateIso || getTodayIso();
  const specific = (nutritionData?.dailyTargets && typeof nutritionData.dailyTargets === 'object')
    ? nutritionData.dailyTargets[targetIso]
    : null;

  const specificCals = typeof specific === 'number' 
    ? specific 
    : (typeof specific === 'object' && specific !== null ? specific.calories : null);
  const specificProtein = typeof specific === 'object' && specific !== null ? specific.protein : null;
  const specificCarbs = typeof specific === 'object' && specific !== null ? specific.carbs : null;
  const specificFats = typeof specific === 'object' && specific !== null ? specific.fats : null;

  return {
    calories: Number(specificCals) || Number(nutritionData?.targetCalories) || 3250,
    protein: Number(specificProtein) || Number(nutritionData?.protein?.target) || 180,
    carbs: Number(specificCarbs) || Number(nutritionData?.carbs?.target) || 450,
    fats: Number(specificFats) || Number(nutritionData?.fats?.target) || 80
  };
}

/**
 * Synchronizes nutrition data across day boundaries, repairs legacy/misdated meals,
 * moves yesterday's 3,173 kcal back to yesterday, and guarantees a new day begins at 0 consumed calories.
 */
export function synchronizeNutritionData(nutritionData, activeDateIso = null) {
  if (!nutritionData || typeof nutritionData !== 'object') {
    nutritionData = {};
  }

  const todayIso = activeDateIso || getTodayIso();
  const yesterdayIso = addDays(todayIso, -1);
  // Ensure meals array only contains valid non-null objects
  let meals = Array.isArray(nutritionData.meals) 
    ? nutritionData.meals.filter(m => m && typeof m === 'object')
    : [];
  let wasModified = false;

  // 1. One-time legacy flag preservation (ensure migration is marked completed so it never touches data)
  nutritionData._migration3173Applied = true;

  // If meals array was completely empty but legacy consumedCalories was stuck at 3,173 from 2026-09-08, synthesize it for 2026-09-08
  if (nutritionData.consumedCalories === 3173 && meals.length === 0) {
    const syntheticMeal = {
      id: `meal-1788900000000-yesterday-3173`,
      date: "2026-09-08",
      name: "Logged Daily Meals (Historical)",
      calories: 3173,
      protein: nutritionData.protein?.current || 180,
      carbs: nutritionData.carbs?.current || 450,
      fats: nutritionData.fats?.current || 80,
      time: "8:00 PM",
      items: ["Daily Meal Log (3,173 kcal)"],
      createdAt: 1788900000000
    };
    meals = [syntheticMeal];
    wasModified = true;
  }

  // 2. Permanent Invariant: Deeply sanitize every meal into primitive strings and finite numbers
  meals = meals.map((m, idx) => {
    if (!m || typeof m !== 'object') return null;

    // Sanitize ID
    let id = m.id;
    if (!id || typeof id !== 'string') {
      id = `meal-${Date.now()}-${idx}`;
      wasModified = true;
    }

    // Sanitize date string YYYY-MM-DD
    let dateStr = m.date;
    if (!dateStr || typeof dateStr !== 'string') {
      wasModified = true;
      let derivedDate = null;
      if (typeof id === 'string' && id.startsWith('meal-')) {
        const parts = id.split('-');
        const ts = parseInt(parts[1], 10);
        if (!isNaN(ts) && ts > 1600000000000) {
          const d = new Date(ts);
          const y = d.getFullYear();
          const mo = String(d.getMonth() + 1).padStart(2, '0');
          const dy = String(d.getDate()).padStart(2, '0');
          derivedDate = `${y}-${mo}-${dy}`;
        }
      }
      dateStr = derivedDate || yesterdayIso;
    }

    // Sanitize meal name (MUST be a string primitive, never an object)
    let mealName = m.name;
    if (typeof mealName === 'object' && mealName !== null) {
      wasModified = true;
      mealName = mealName.name || mealName.title || mealName.text || 'Logged Meal';
    } else if (typeof mealName !== 'string' || !mealName.trim()) {
      wasModified = true;
      mealName = 'Logged Meal';
    } else {
      mealName = mealName.trim();
    }

    // Sanitize meal macros (MUST be finite numeric primitives)
    const extractNum = (val) => {
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      if (typeof val === 'object' && val !== null) {
        wasModified = true;
        const sub = val.current ?? val.value ?? val.val ?? val.target ?? 0;
        return typeof sub === 'number' && !isNaN(sub) ? sub : (Number(sub) || 0);
      }
      const parsed = Number(val);
      return isNaN(parsed) ? 0 : parsed;
    };

    const protein = Math.max(0, Math.round(extractNum(m.protein)));
    const carbs = Math.max(0, Math.round(extractNum(m.carbs)));
    const fats = Math.max(0, Math.round(extractNum(m.fats)));
    let calories = Math.max(0, Math.round(extractNum(m.calories)));
    if (calories === 0 && (protein > 0 || carbs > 0 || fats > 0)) {
      calories = calculateCaloriesFromMacros(protein, carbs, fats);
      wasModified = true;
    }

    // Sanitize items array
    let rawItems = Array.isArray(m.items) ? m.items : (m.items ? [m.items] : []);
    let cleanItems = rawItems.map(it => {
      if (!it) return null;
      if (typeof it === 'string') return it.trim();
      if (typeof it === 'object') {
        let itName = it.name;
        if (typeof itName === 'object' && itName !== null) {
          itName = itName.name || itName.title || itName.text || 'Item';
        } else if (typeof itName !== 'string' || !itName.trim()) {
          itName = 'Item';
        }
        return {
          name: itName.trim(),
          portion: typeof it.portion === 'string' ? it.portion : (it.portion ? String(it.portion) : null),
          calories: typeof it.calories !== 'undefined' ? extractNum(it.calories) : null,
          protein: typeof it.protein !== 'undefined' ? extractNum(it.protein) : null,
          carbs: typeof it.carbs !== 'undefined' ? extractNum(it.carbs) : null,
          fats: typeof it.fats !== 'undefined' ? extractNum(it.fats) : null
        };
      }
      return String(it);
    }).filter(Boolean);

    if (
      m.id !== id ||
      m.date !== dateStr ||
      m.name !== mealName ||
      typeof m.calories !== 'number' ||
      typeof m.protein !== 'number' ||
      typeof m.carbs !== 'number' ||
      typeof m.fats !== 'number'
    ) {
      wasModified = true;
    }

    return {
      ...m,
      id,
      date: dateStr,
      name: mealName,
      calories,
      protein,
      carbs,
      fats,
      items: cleanItems
    };
  }).filter(Boolean);

  // 2.5 Reconcile any past bun meals that were overestimated due to non-partitioned fillings
  meals = meals.map(m => {
    if (!m) return null;
    const isSuspectBun = 
      (m.name && /bun/i.test(m.name) && (/beef/i.test(m.name) || /veggie/i.test(m.name) || /70g/i.test(m.name) || /insides?/i.test(m.name))) ||
      (Array.isArray(m.items) && m.items.some(it => {
        const itName = typeof it === 'string' ? it : it?.name || '';
        return /bun/i.test(itName) || (/beef/i.test(itName) && /70g/i.test(itName));
      }));

    if (isSuspectBun && m.calories > 290) {
      wasModified = true;
      return {
        ...m,
        name: "Bun with 70g Insides (Beef & Veggies)",
        calories: 220,
        protein: 16,
        carbs: 26,
        fats: 6,
        items: [
          { name: "Bun / Roll (~50g)", portion: "1 bun", calories: 130, protein: 4, carbs: 24, fats: 1.5 },
          { name: "Lean Ground Beef (90/10)", portion: "42g inside filling (60%)", calories: 80, protein: 11, carbs: 0, fats: 4 },
          { name: "Veggies / Mixed Vegetables", portion: "28g inside filling (40%)", calories: 10, protein: 1, carbs: 2, fats: 0.1 }
        ],
        notes: "Calibrated accurate filling partition (42g beef + 28g veggies = 70g insides)"
      };
    }

    // 2.6 Reconcile past overestimated protein smoothie meals (e.g. 91g protein / 755 kcal or >50g protein from a single smoothie)
    const isSuspectSmoothie = 
      (m.name && /smoothie|shake/i.test(m.name)) ||
      (Array.isArray(m.items) && m.items.some(it => {
        const itName = typeof it === 'string' ? it : it?.name || '';
        return /smoothie|shake/i.test(itName) || (/vegan.*protein/i.test(itName) && (it?.protein >= 50));
      }));

    if (isSuspectSmoothie && (m.protein >= 55 || m.calories >= 650)) {
      wasModified = true;
      return {
        ...m,
        name: "Protein Shake (Milk, Banana & Canadian Protein Vegan Powder)",
        calories: 485,
        protein: 39,
        carbs: 54,
        fats: 12,
        items: [
          { name: "Milk (User Calibrated)", portion: "2 cups / glasses (250ml)", calories: 260, protein: 18, carbs: 24, fats: 10 },
          { name: "Canadian Protein Vegan Powder", portion: "1 scoop", calories: 120, protein: 20, carbs: 3, fats: 2 },
          { name: "Banana", portion: "1 banana (118g)", calories: 105, protein: 1.3, carbs: 27, fats: 0.3 }
        ],
        notes: "Calibrated accurate smoothie macros (2c milk [18g P] + 1 scoop vegan powder [20g P] + 1 banana [1.3g P] = ~39g protein)"
      };
    }

    // 2.65 Reconcile past canned salmon meals to 200 cals / 40g P
    const isCannedSalmonMeal = (m.name && /^(?:1\s+)?(?:can\s+of\s+salmon|canned\s+salmon|salmon\s+can)$/i.test(m.name)) ||
      (Array.isArray(m.items) && m.items.length === 1 && m.items.some(it => {
        const itName = typeof it === 'string' ? it : it?.name || '';
        return /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(itName);
      }));

    if (isCannedSalmonMeal && (m.protein !== 40 || m.calories !== 200)) {
      wasModified = true;
      return {
        ...m,
        name: "Canned Salmon",
        calories: 200,
        protein: 40,
        carbs: 0,
        fats: 4,
        items: [
          { name: "Canned Salmon", portion: "1 can (150g)", calories: 200, protein: 40, carbs: 0, fats: 4 }
        ],
        notes: "Calibrated accurate canned salmon macros (200 kcal, 40g protein per can)"
      };
    }

    // 2.66 Reconcile past Nature Valley bar meals to 170 cals / 3.5g P
    const isNatureValleyMeal = (m.name && /^(?:1\s+)?(?:nature\s*valley|granola\s*bar|oats\s*(?:and|&)\s*honey\s*bar)(?:\s+bar)?$/i.test(m.name)) ||
      (Array.isArray(m.items) && m.items.length === 1 && m.items.some(it => {
        const itName = typeof it === 'string' ? it : it?.name || '';
        return /nature\s*valley|granola\s*bar|oats\s*(?:and|&)\s*honey\s*bar/i.test(itName);
      }));

    if (isNatureValleyMeal && m.calories === 190) {
      wasModified = true;
      return {
        ...m,
        name: m.name.includes("Nature Valley") ? m.name : "Nature Valley Bar",
        calories: 170,
        protein: 3.5,
        carbs: 23,
        fats: 7.5,
        items: [
          { name: "Nature Valley Bar", portion: "1 bar / pouch (35g)", calories: 170, protein: 3.5, carbs: 23, fats: 7.5 }
        ],
        notes: "Calibrated accurate Nature Valley bar macros (170 kcal, 3.5g protein, 23g carbs, 7.5g fats)"
      };
    }

    return m;
  }).filter(Boolean);

  // Sanitize weightHistory if present
  let cleanWeight = [];
  if (Array.isArray(nutritionData.weightHistory)) {
    cleanWeight = nutritionData.weightHistory.filter(w => w && typeof w === 'object' && typeof w.date === 'string' && typeof w.weightLbs === 'number' && !isNaN(w.weightLbs));
    if (cleanWeight.length !== nutritionData.weightHistory.length) {
      nutritionData.weightHistory = cleanWeight;
      wasModified = true;
    }
  }

  // 2.7 Ensure householdPantry is fully sanitized and calibrated (e.g. 485 kcal / 39g P)
  let householdPantry = nutritionData.householdPantry;
  if (Array.isArray(householdPantry)) {
    const cleanPantry = sanitizeHouseholdPantry(householdPantry);
    if (JSON.stringify(cleanPantry) !== JSON.stringify(householdPantry)) {
      wasModified = true;
      householdPantry = cleanPantry;
      nutritionData.householdPantry = cleanPantry;
    }
  } else {
    householdPantry = DEFAULT_HOUSEHOLD_PANTRY;
  }

  // 2.8 Ensure dailyTargets is a valid dictionary object
  let dailyTargets = nutritionData.dailyTargets;
  if (!dailyTargets || typeof dailyTargets !== 'object' || Array.isArray(dailyTargets)) {
    dailyTargets = {};
    nutritionData.dailyTargets = {};
    wasModified = true;
  }

  // 2.9 Ensure macro targets are positive numbers
  const targetCalories = typeof nutritionData.targetCalories === 'number' && !isNaN(nutritionData.targetCalories) && nutritionData.targetCalories > 0
    ? nutritionData.targetCalories
    : (Number(nutritionData.targetCalories) || 3250);

  const targetProtein = typeof nutritionData.protein?.target === 'number' && !isNaN(nutritionData.protein?.target)
    ? nutritionData.protein.target
    : (Number(nutritionData.protein?.target) || 180);

  const targetCarbs = typeof nutritionData.carbs?.target === 'number' && !isNaN(nutritionData.carbs?.target)
    ? nutritionData.carbs.target
    : (Number(nutritionData.carbs?.target) || 450);

  const targetFats = typeof nutritionData.fats?.target === 'number' && !isNaN(nutritionData.fats?.target)
    ? nutritionData.fats.target
    : (Number(nutritionData.fats?.target) || 80);

  // 3. Calculate consumption strictly from meals logged for TODAY (todayIso)
  const todayMeals = meals.filter(m => m && m.date === todayIso);
  const todayTotals = aggregateDailyNutrition(todayMeals);

  // 4. Daily Water Reset: Reset water on new day
  const lastWaterDate = nutritionData.waterDate || nutritionData.currentDate;
  const isNewDayForWater = lastWaterDate && lastWaterDate !== todayIso;
  const waterMl = isNewDayForWater ? 0 : (nutritionData.waterMl || 0);
  const waterGlasses = isNewDayForWater ? 0 : (nutritionData.waterGlasses || 0);

  // Check if state needs updating
  const needsUpdate = 
    wasModified ||
    nutritionData.targetCalories !== targetCalories ||
    nutritionData.consumedCalories !== todayTotals.calories ||
    nutritionData.protein?.current !== todayTotals.protein ||
    nutritionData.protein?.target !== targetProtein ||
    nutritionData.carbs?.current !== todayTotals.carbs ||
    nutritionData.carbs?.target !== targetCarbs ||
    nutritionData.fats?.current !== todayTotals.fats ||
    nutritionData.fats?.target !== targetFats ||
    nutritionData.currentDate !== todayIso ||
    nutritionData.waterMl !== waterMl;

  if (needsUpdate) {
    const syncedResult = {
      ...nutritionData,
      currentDate: todayIso,
      waterDate: todayIso,
      targetCalories,
      consumedCalories: todayTotals.calories,
      protein: {
        ...(nutritionData.protein || { unit: "g", color: "#6366f1" }),
        target: targetProtein,
        current: todayTotals.protein
      },
      carbs: {
        ...(nutritionData.carbs || { unit: "g", color: "#06b6d4" }),
        target: targetCarbs,
        current: todayTotals.carbs
      },
      fats: {
        ...(nutritionData.fats || { unit: "g", color: "#f59e0b" }),
        target: targetFats,
        current: todayTotals.fats
      },
      waterMl,
      waterGlasses,
      meals,
      dailyTargets,
      ...(cleanWeight.length > 0 ? { weightHistory: cleanWeight } : {}),
      ...(householdPantry ? { householdPantry } : {})
    };

    if (wasModified && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('wolfe_nutrition_data', JSON.stringify(syncedResult));
      } catch (e) {}
    }

    return syncedResult;
  }

  return nutritionData;
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
    .sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
    });

  if (sorted.length === 0) {
    return { changeLbs: 0, startWeight: null, endWeight: null, points: [], sampleCount: 0 };
  }

  const filtered = days === 'all' ? sorted : sorted.slice(-Number(days));
  if (filtered.length === 0) {
    return { changeLbs: 0, startWeight: null, endWeight: null, points: [], sampleCount: 0 };
  }
  const startWeight = filtered[0]?.weightLbs;
  const endWeight = filtered[filtered.length - 1]?.weightLbs;
  const rawDiff = (typeof endWeight === 'number' && typeof startWeight === 'number') ? (endWeight - startWeight) : 0;
  const changeLbs = Number(rawDiff.toFixed(1)) || 0;

  return {
    changeLbs,
    startWeight: startWeight ?? null,
    endWeight: endWeight ?? null,
    points: filtered,
    sampleCount: filtered.length
  };
}
