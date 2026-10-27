/**
 * Wolfe OS — Nutrition & Vision Intelligence Engine
 */

import {
  parseMealDescription,
  findQuickStapleMatch,
  calculateCaloriesFromMacros,
  buildAiCalibrationPrompt,
  buildAiPantryPrompt,
  calibrateMealItems,
  reconcileVisionMealItems
} from './nutritionEngine.js';

const API_KEY = import.meta.env?.VITE_GEMINI_API_KEY || '';

export const DEFAULT_AI_CONFIG = {
  provider: 'gemini',
  apiKey: API_KEY,
  model: 'gemini-3.6-flash',
  voiceResponse: false,
};

/**
 * Resilient JSON Parser that auto-repairs truncated responses from Gemini
 */
export function safeParseJson(rawText) {
  if (!rawText) return null;
  let text = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

  // 1. Direct parse
  try {
    return JSON.parse(text);
  } catch (e) {}

  // 2. Extract JSON object or array substring
  const objStart = text.indexOf('{');
  const arrStart = text.indexOf('[');
  const isArrayFirst = arrStart !== -1 && (objStart === -1 || arrStart < objStart);

  if (isArrayFirst) {
    const arrEnd = text.lastIndexOf(']');
    if (arrEnd > arrStart) {
      try {
        return JSON.parse(text.slice(arrStart, arrEnd + 1));
      } catch (e) {}
    }
  }

  if (objStart !== -1) {
    const lastIdx = text.lastIndexOf('}');
    if (lastIdx !== -1 && lastIdx > objStart) {
      try {
        return JSON.parse(text.slice(objStart, lastIdx + 1));
      } catch (e) {}
    }

    // 3. Auto-close truncated JSON
    let partial = text.slice(objStart).replace(/,\s*$/, '');
    let openBraces = 0;
    let openBrackets = 0;
    let inQuotes = false;
    let escape = false;

    for (let i = 0; i < partial.length; i++) {
      const c = partial[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (c === '\\') {
        escape = true;
        continue;
      }
      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes) {
        if (c === '{') openBraces++;
        if (c === '}') openBraces--;
        if (c === '[') openBrackets++;
        if (c === ']') openBrackets--;
      }
    }

    if (inQuotes) partial += '"';
    while (openBrackets > 0) {
      partial += ']';
      openBrackets--;
    }
    while (openBraces > 0) {
      partial += '}';
      openBraces--;
    }

    try {
      return JSON.parse(partial);
    } catch (e) {}
  }

  return null;
}

/**
 * Helper to read cached nutrition state only once when props are omitted
 */
function getStoredNutritionContext(kitchenCalibration, householdPantry) {
  let rawCalib = kitchenCalibration;
  let rawPantry = householdPantry;
  let storedMeals = [];
  if ((!rawCalib || !rawPantry) && typeof localStorage !== 'undefined') {
    try {
      const parsed = JSON.parse(localStorage.getItem('wolfe_nutrition_data') || '{}');
      if (!rawCalib) rawCalib = parsed?.kitchenCalibration || null;
      if (!rawPantry) rawPantry = parsed?.householdPantry || null;
      if (Array.isArray(parsed?.meals)) storedMeals = parsed.meals;
    } catch (e) {}
  }
  return {
    calibPrompt: rawCalib ? buildAiCalibrationPrompt(rawCalib) : '',
    pantryPrompt: rawPantry ? buildAiPantryPrompt(rawPantry) : '',
    storedMeals
  };
}

/**
 * Analyze a meal from photo (via Gemini Multimodal Vision) and/or natural language description.
 * Uses the 4-Archetype Visual Portion Estimation System + Post-Vision USDA Density Reconciliation.
 */
export async function analyzeMealWithAI({
  imageBase64,
  mimeType = 'image/jpeg',
  description = '',
  aiConfig = DEFAULT_AI_CONFIG,
  kitchenCalibration = null,
  householdPantry = null
}) {
  const apiKey = aiConfig?.apiKey || API_KEY;
  const cleanDesc = (description || '').trim();
  const { calibPrompt, pantryPrompt } = getStoredNutritionContext(kitchenCalibration, householdPantry);

  // 1. If we have an API key and image, call Full Multimodal Gemini Vision
  if (apiKey && imageBase64) {
    const rawBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    // Full multimodal spatial-reasoning models first; lite models only as fallback
    const visionModels = [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest'
    ];

    const systemInstruction = `You are a clinical sports dietitian, USDA nutritional database authority, and 3D photogrammetry portion estimator for Wolfe OS.

CRITICAL ACCURACY & PERSPECTIVE-INVARIANCE MANDATES:
1. FIRST, inspect the image to determine if edible food, beverage, food packaging, or a Nutrition Facts label / barcode is present.
2. If the image shows a person (face, body, selfie, hands without food), an empty room, furniture, an empty desk/plate, pets, electronics, or no recognizable food/packaging, NEVER GUESS OR FABRICATE FOOD. Return strictly:
   { "hasFood": false, "errorMessage": "No food or nutrition label detected. Please take a clear photo of your meal or packaging." }

3. CAMERA PERSPECTIVE & VESSEL RULER CALIBRATION (NEVER USE FRAME-FILL % AS PORTION SIZE):
   - Close-up photos make a small 150g snack fill 80% of the image frame. Anchor strictly to physical reference objects visible in the scene:
     * Standard Dinner Plate: 10.5 in (26.7 cm) outer rim diameter; **20.0 cm inner flat eating well diameter** (~314 cm² inner well area).
     * Salad / Side Plate: 8.0 in (20.3 cm) outer diameter; **15.0 cm inner well diameter**.
     * Standard Cereal / Soup Bowl: 6.0 in (15.2 cm) rim diameter, ~7 cm deep (~500 ml normal capacity to inner rim; typical meal fill is 55-65% = 275-350 ml).
     * Mug / Drinking Glass: ~250-300 ml typical fill (1 cup = 250 ml).
     * Standard Table Fork / Spoon: ~18-19 cm total length; fork tine head is ~4.5 cm long x 2.4 cm wide.
     * Adult Hand / Finger: Palm width ~8.0 cm; index finger width ~1.8 cm.
     * Intrinsic Food Units: Egg (~5.5 cm long, 50g), standard bread slice (~10.5 x 10.5 cm, 35-40g), cooked rice grain (~7 mm), blueberry (~1.4 cm).
   - USER WEIGHT OVERRIDE (ZERO TARE DEDUCTION): If the user notes any gram/oz/cup weight in text (e.g. "250g chicken", "400g total"), that weight is ALREADY 100% NET FOOD WEIGHT (plate weight is already subtracted). Use their stated weight directly and NEVER subtract plate/bowl weight!

${calibPrompt ? `\n${calibPrompt}\n` : ''}
${pantryPrompt ? `\n${pantryPrompt}\n` : ''}

4. THE 4-ARCHETYPE VISUAL VOLUME & MASS PROTOCOL (ELIMINATES 2X OVER/UNDER GUESSING):
   - NEVER multiply (Length × Width × Height) as a rectangular box for plated food! Food mounds taper like paraboloids/cones ($V \\approx 0.45 \\times \\text{Base Area} \\times \\text{Peak Height}$), so a rectangular box calculation overestimates by 2.2x!
   - Classify EVERY visible food item into one of these 4 physical archetypes (` + '`portionArchetype`' + `) to determine its exact ` + '`estimatedGrams`' + `:

   ARCHETYPE A — "DISCRETE_UNIT" (Countable Whole Items):
   * Applies to: Eggs, bread/toast slices, tortillas, bacon strips, sausages, pancakes/waffles, whole/halved fruit (banana, apple, orange, avocado), granola/protein bars, burger patties, pizza slices, tacos, chicken drumsticks/wings/thighs.
   * Estimation Method: Count the exact visible units (or fraction) and multiply by canonical USDA unit weight:
     - 1 Large Egg = 50g (72 kcal, 6.3g P, 0.4g C, 4.8g F)
     - 1 Standard Slice Bread/Toast = 38g (100 kcal, 4g P, 19g C, 1.2g F)
     - 1 Medium Banana = 118g (105 kcal, 1.3g P, 27g C, 0.3g F)
     - 1 Medium Apple = 182g (95 kcal, 0.5g P, 25g C, 0.3g F)
     - 1 Medium Orange = 131g (62 kcal, 1.2g P, 15.4g C, 0.2g F)
     - 1 Half Medium Avocado = 75g edible (120 kcal, 1.5g P, 6.4g C, 11g F)
     - 1 Chicken Drumstick (Bone-In) = ~70g gross / 42g edible meat (78 kcal, 10.5g P, 0g C, 3.8g F)
     - 1 Chicken Wing (Bone-In) = ~48g gross / 26g edible meat (65 kcal, 6.5g P, 0g C, 4.2g F)
     - 1 Boneless Cooked Chicken Thigh = 85g (178 kcal, 22g P, 0g C, 9.3g F)

   ARCHETYPE B — "CONTAINED_VESSEL" (Bowls, Cups, Glasses, Shakers):
   * Applies to: Cereal + milk, oatmeal/porridge, soup, chili, stew, yogurt bowls, cottage cheese, smoothies, glasses of milk/juice.
   * Estimation Method: Estimate the fill fraction up the vessel's inner wall:
     - 1/3 full standard bowl ≈ 175 ml (0.7 cup)
     - Normal 1/2 to 2/3 full bowl (2 cm below rim) ≈ 300-350 ml (1.2-1.4 cups)
     - Rim-full bowl ≈ 450 ml (1.8 cups)
     - For Cereal with Milk in a bowl: ALWAYS itemize the Cereal (~1.2-1.5 cups dry = 40-50g) and the Milk (~0.75-1.0 cup 2% milk = 180-250ml) as two separate items!

   ARCHETYPE C — "AMORPHOUS_MOUND" (Plated Rice, Pasta, Quinoa, Potatoes, Loose Veggies, Scrambled Eggs, Ground Meat):
   * Applies to: Any heaped or spread pile on a flat plate or container.
   * Estimation Method: Anchor to the **Fraction of the 20cm Inner Plate Well Covered** + **Mound Height Profile** (paraboloid dome $V = 0.45 \\times \\text{Area} \\times \\text{Height}$):
     - **Covers ~1/4 of inner plate well (25%)**:
       * Flat/thin layer (~1 cm): 85g cooked rice/pasta/potatoes (~0.55 cup) | 55g veggies
       * Normal mound (~2-2.5 cm peak): **130g cooked rice/pasta/potatoes** (~0.8 cup) | **85g steamed veggies** | **115g ground meat**
       * Tall heaped mound (~3.5 cm+ peak): 175g cooked rice/pasta/potatoes (~1.1 cups) | 115g veggies
     - **Covers ~1/3 of inner plate well (33%)**:
       * Normal mound (~2.5 cm peak): **175g cooked rice/pasta/potatoes** (~1.1 cups) | **115g veggies** | **150g ground meat**
       * Tall heaped mound (~3.5 cm+ peak): 230g cooked rice/pasta/potatoes (~1.45 cups)
     - **Covers ~1/2 of inner plate well (50%)**:
       * Normal mound (~2.5-3 cm peak): **250g cooked rice/pasta/potatoes** (~1.6 cups) | **160g veggies**
       * Tall heaped mound (~4 cm peak): 320g cooked rice/pasta/potatoes (~2.0 cups)

   ARCHETYPE D — "INTACT_SLAB" (Whole Protein Cuts: Chicken Breast, Steak, Salmon/Fish Fillet, Pork Chop):
   * Applies to: Intact cooked meat or fish cuts on a plate (tapered slab volume $V = 0.78 \\times L \\times W \\times H \\times 1.05\\text{ g/cm}^3$):
     - Small cut / thin fillet (covers ~15-20% of plate well, <1.5 cm thick): **95-120g cooked**
     - Standard single chicken breast / salmon fillet / sirloin steak (covers ~25-33% of plate well, ~2.0-2.5 cm center thickness): **145-180g cooked**
     - Large double-lobe breast / thick 8-9 oz steak (covers 40%+ of plate well or 2 pieces): **210-260g cooked**

5. CLINICAL USDA FOODDATA CENTRAL BENCHMARKS (PER 100G EDIBLE PORTION):
   - Compute macros strictly from: (estimatedGrams / 100) * USDA_per_100g:
     * Cooked Skinless Chicken Breast: 165 kcal, 31.0g P, 0.0g C, 3.6g F per 100g.
     * Cooked Skinless Chicken Thigh: 209 kcal, 26.0g P, 0.0g C, 10.9g F per 100g.
     * Cooked Beef Steak (Sirloin/Strip trimmed): 242 kcal, 27.0g P, 0.0g C, 14.0g F per 100g.
     * Cooked Lean Ground Beef (90/10): 215 kcal, 26.0g P, 0.0g C, 11.5g F per 100g.
     * Cooked Salmon Fillet: 208 kcal, 20.4g P, 0.0g C, 13.4g F per 100g.
     * Canned Salmon: 200 kcal, 40.0g P, 0.0g C, 4.0g F per can (150g).
     * Cooked White / Jasmine / Basmati Rice: 130 kcal, 2.7g P, 28.2g C, 0.3g F per 100g (1 cup cooked ≈ 158g = 205 kcal).
     * Cooked Brown Rice: 112 kcal, 2.6g P, 23.5g C, 0.9g F per 100g.
     * Cooked Quinoa: 120 kcal, 4.4g P, 21.3g C, 1.9g F per 100g.
     * Cooked Plain Pasta: 158 kcal, 5.8g P, 30.9g C, 0.9g F per 100g (1 cup cooked ≈ 140g = 221 kcal).
     * Cooked Plain Potato (Baked/Boiled/Roasted without heavy oil): 93 kcal, 2.5g P, 21.2g C, 0.1g F per 100g.
     * Cooked Sweet Potato: 86 kcal, 1.6g P, 20.1g C, 0.1g F per 100g.
     * Steamed Broccoli / Mixed Veggies: 35 kcal, 2.4g P, 7.2g C, 0.4g F per 100g.
     * Raw Avocado (Edible flesh): 160 kcal, 2.0g P, 8.5g C, 14.7g F per 100g.
     * Standard / Normal Milk (2% reduced fat): 120 kcal, 8.0g P, 11.5g C, 4.8g F per 1 cup (250ml). Default to 2% milk.
     * Custom Iced Tea Hydration Mix: 1 tbsp Good Host powder + 5g creatine + pink salt + lemon juice in 1L water = 60 kcal, 0g P, 15g C, 0g F per 1L.
     * Surface Cooking Oil / Sheen: Only add cooking oil if food is visibly glistening with oil/butter (0.5-1 tsp = 20-40 kcal, 2.2-4.5g F). Do not add phantom oil to dry-grilled or steamed food.
     * ATWATER ENERGY EQUIVALENCE: Calories ≈ (Protein * 4) + (Carbs * 4) + (Fats * 9).

Return ONLY valid JSON matching this schema:
{
  "hasFood": true,
  "name": "Concise Descriptive Meal Title",
  "visualAnalysis": {
    "cameraPerspective": "top_down_overhead" | "angled_45_deg" | "close_up_macro",
    "scaleReference": "10.5-inch dinner plate (20cm inner eating well)",
    "vesselType": "dinner_plate" | "salad_plate" | "bowl" | "container" | "handheld" | "none",
    "plateCoveragePercent": 55,
    "estimatedDepthCm": 2.2,
    "estimatedTotalGrams": 385
  },
  "items": [
    {
      "name": "Grilled Chicken Breast",
      "portionArchetype": "INTACT_SLAB" | "AMORPHOUS_MOUND" | "DISCRETE_UNIT" | "CONTAINED_VESSEL",
      "visualAnchor": "Covers ~28% of 20cm plate well, ~2.2cm center thickness",
      "portion": "165g (5.8 oz)",
      "estimatedGrams": 165,
      "calories": 272,
      "protein": 51.2,
      "carbs": 0,
      "fats": 5.9
    }
  ],
  "calories": 272,
  "protein": 51.2,
  "carbs": 0,
  "fats": 5.9,
  "notes": "Anchored to 20cm plate well coverage and USDA per-100g densities"
}`;

    const prompt = cleanDesc
      ? `Analyze this meal photo. User context: "${cleanDesc}". Classify each visible food item using the 4-Archetype Visual Volume Protocol, determine realistic estimatedGrams, and calculate exact USDA macros.`
      : `Analyze this meal photo. Classify each visible food item using the 4-Archetype Visual Volume Protocol (DISCRETE_UNIT, CONTAINED_VESSEL, AMORPHOUS_MOUND, or INTACT_SLAB), determine realistic estimatedGrams anchored to the vessel scale, and calculate exact USDA macros. If no food or label is present, set hasFood to false.`;

    for (const model of visionModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: mimeType || 'image/jpeg',
                      data: rawBase64
                    }
                  }
                ]
              }
            ],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              maxOutputTokens: 2048,
            }
          })
        });

        clearTimeout(timeoutId);
        if (!response.ok) continue;

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find(p => p.text && !p.thought) || parts[0];
        const rawText = textPart?.text || '';

        if (rawText) {
          const parsed = safeParseJson(rawText);
          if (parsed) {
            if (parsed.hasFood === false) {
              return {
                hasFood: false,
                errorMessage: parsed.errorMessage || "No food detected in image. Please take a clear photo of your meal or describe what you are eating."
              };
            }
            if (Array.isArray(parsed.items) && parsed.items.length > 0) {
              const isCannedSalmon = /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(it.name || '')));

              if (isCannedSalmon && parsed.items.length <= 1) {
                parsed.name = "Canned Salmon";
                parsed.items = [
                  { name: "Canned Salmon", portion: "1 can (150g)", estimatedGrams: 150, calories: 200, protein: 40, carbs: 0, fats: 4 }
                ];
                parsed.notes = "Calibrated to verified sports nutrition ground truth (200 kcal, 40g protein per can)";
              }

              const isNatureValley = /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(it.name || '')));

              if (isNatureValley && parsed.items.length <= 1 && (parsed.calories === 190 || parsed.calories === 0 || !parsed.calories)) {
                parsed.name = parsed.name || "Nature Valley Bar";
                parsed.items = [
                  { name: "Nature Valley Bar", portion: "1 bar / pouch (35g)", estimatedGrams: 35, calories: 170, protein: 3.5, carbs: 23, fats: 7.5 }
                ];
                parsed.notes = "Calibrated to verified nutrition facts (170 kcal, 3.5g protein, 23g carbs, 7.5g fats per bar/pouch)";
              }

              parsed.items = (parsed.items || []).map(it => {
                const itName = typeof it === 'string' ? it : it?.name || '';
                if (/nature\s*valley/i.test(itName) && it && typeof it === 'object' && it.calories === 190) {
                  return { ...it, calories: 170, protein: 3.5, carbs: 23, fats: 7.5, estimatedGrams: 35 };
                }
                return it;
              });

              // Reconcile photo items against USDA per-100g densities, single-plate plausibility bounds, and Atwater math
              parsed.items = reconcileVisionMealItems(parsed.items || [], cleanDesc);

              const itemsSumCalories = parsed.items.reduce((s, it) => s + (Number(it.calories) || 0), 0);
              const itemsSumProtein = parsed.items.reduce((s, it) => s + (Number(it.protein) || 0), 0);
              const itemsSumCarbs = parsed.items.reduce((s, it) => s + (Number(it.carbs) || 0), 0);
              const itemsSumFats = parsed.items.reduce((s, it) => s + (Number(it.fats) || 0), 0);

              const totalCalories = Math.round(itemsSumCalories);
              const totalProtein = Math.round(itemsSumProtein * 10) / 10;
              const totalCarbs = Math.round(itemsSumCarbs * 10) / 10;
              const totalFats = Math.round(itemsSumFats * 10) / 10;

              return {
                hasFood: true,
                name: parsed.name || "Analyzed Meal",
                visualAnalysis: parsed.visualAnalysis || null,
                items: parsed.items,
                calories: totalCalories > 0 ? totalCalories : (parsed.calories || calculateCaloriesFromMacros(totalProtein, totalCarbs, totalFats)),
                protein: totalProtein,
                carbs: totalCarbs,
                fats: totalFats,
                notes: parsed.notes || "Anchored via 4-Archetype visual scale & USDA ground truth"
              };
            }
          }
        }
      } catch (err) {
        // continue to next vision model
      }
    }
  }

  // 2. Fallback / Description-based Engine
  if (cleanDesc) {
    return await analyzeQuickLogWithAI({
      query: cleanDesc,
      aiConfig,
      kitchenCalibration,
      householdPantry
    });
  }

  // 3. If only an image was submitted without description and no vision API could process it
  return {
    hasFood: false,
    errorMessage: "Please describe what is on your plate (e.g. '8 oz chicken with rice') so we can calculate exact macros."
  };
}

/**
 * Context-Aware Natural Language Quick Log AI Engine
 * Decomposes multi-item meals, resolves extra context, modifiers, preparation methods,
 * cooking fats, exclusions, restaurant dishes, and hardware calibrations.
 */
export async function analyzeQuickLogWithAI({
  query,
  aiConfig = DEFAULT_AI_CONFIG,
  kitchenCalibration = null,
  householdPantry = null,
  meals = null
}) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return {
      hasFood: false,
      errorMessage: "Please enter or speak a meal description."
    };
  }

  const { calibPrompt, pantryPrompt, storedMeals } = getStoredNutritionContext(kitchenCalibration, householdPantry);
  const mealHistory = Array.isArray(meals) ? meals : storedMeals;

  // 0. Instant local check for unambiguous standalone staples (< 0.1ms, zero API call)
  const quickMatch = findQuickStapleMatch(cleanQuery, mealHistory);
  if (quickMatch && (quickMatch.items?.length > 0 || quickMatch.calories > 0)) {
    return {
      hasFood: true,
      name: quickMatch.name,
      slot: quickMatch.slot || 'meal',
      items: quickMatch.items || [{
        name: quickMatch.name,
        portion: quickMatch.portion || '1 serving',
        calories: quickMatch.calories,
        protein: quickMatch.protein,
        carbs: quickMatch.carbs,
        fats: quickMatch.fats
      }],
      calories: quickMatch.calories,
      protein: quickMatch.protein,
      carbs: quickMatch.carbs,
      fats: quickMatch.fats,
      notes: quickMatch.notes || "Recognized from frequent user staples & local nutrition engine"
    };
  }

  const apiKey = aiConfig?.apiKey || API_KEY;

  // 1. If API key is available, call Gemini Language Models
  if (apiKey) {
    const textModels = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3-flash-preview'
    ];

    const systemInstruction = `You are the elite clinical sports dietitian, USDA nutritional authority, and Quick Log AI Engine for Wolfe OS.
Your task is to parse natural language food logs and voice transcripts with 100% precision.

KEY INTELLIGENCE RULES:
1. MULTIPLE ITEMS & SIDES:
   - Identify EVERY distinct item mentioned in the meal (mains, sides, beverages, sauces, toppings, dressings, snacks).
   - Each item must have its own accurate macro breakdown (calories, protein, carbs, fats) based on clinical USDA benchmarks.
   - Example: "200g chicken breast, 1.2 cups white rice, 0.8 cup steamed broccoli, and 1 tbsp olive oil" -> 4 distinct items.

2. EXTRA INFORMATION, MODIFIERS & PARTIAL CONSUMPTION:
   - Partial Consumption & Fractions: If the user indicates they did not finish everything (e.g. "only ate half", "left a third of the rice", "ate 3/4 of the burger"):
     Scale the portions, calories, and macros for that specific item accordingly.
   - Preparation & Added Fats: If cooking fats or oils are mentioned (e.g. "cooked in 1 tbsp butter", "grilled with 1 tbsp olive oil", "deep fried"):
     Include the oil or butter as an explicit item.
   - Exclusions & Customizations: If the user says "no cheese", "without dressing", "hold the mayo", "skip the sour cream":
     STRICTLY DO NOT include those items.
   - Brand & Restaurant Menus: Understand menu items from Chipotle, Starbucks, Subway, Chick-fil-A, In-N-Out, etc., using true menu nutrition facts.

3. HARDWARE & USER WEIGHT PROTOCOL (ZERO TARE DEDUCTION):
${calibPrompt ? `${calibPrompt}\n` : `   - Primary Large Bowl: 750ml capacity.\n   - Main Dinner Plate: 10.5" outer diameter.\n`}
${pantryPrompt ? `${pantryPrompt}\n` : ''}
   - ZERO TARE DEDUCTION RULE (CRITICAL): The user ALWAYS tares the scale or subtracts plate/bowl weight beforehand!
     Whenever the user specifies a weight in grams (e.g. "400g chicken and rice", "300g food on plate", "250g steak"), that weight is ALREADY 100% TOTAL NET FOOD VOLUME WEIGHT.
     NEVER subtract plate weight (550g) or bowl weight (420g) or any tare deduction from the user's stated grams!
   - When a compound filling is mentioned (e.g. "bun with 70g insides of beef and veggies"):
     Distribute the 70g total filling across the inner ingredients (e.g. 42g beef [80 kcal, 11g P] + 28g veggies [10 kcal, 1g P] = 70g) plus 1 bun (~130 kcal) = 220 kcal, NEVER doubling the filling.

4. CONSERVATIVE UNDERESTIMATION & GROUND-TRUTH MACROS:
   - Wolfe OS Principle: Never over-inflate numbers for protein or calories. When estimating calories, protein, or portion sizes, ALWAYS ROUND DOWN if uncertain so the user never overestimates their nutritional intake.
   - Milk (Standard / Normal Household Milk):
     * DEFAULT TO NORMAL MILK: When the user mentions "milk" (e.g. "milk", "glass of milk", "cup of milk", "milk in coffee/cereal"), treat it as STANDARD / NORMAL MILK (2% reduced fat: ~120 kcal, 8g protein, 11.5g carbs, ~4.8g fats per 1 cup / 240-250ml).
     * NEVER assume whole milk (~150 kcal) unless explicitly specified ("whole milk", "3.25%").
     * NEVER assign 9g, 10g, or more protein to 1 cup of standard milk (it is strictly 8g protein).
   - Cereal with Milk (Cheerios, Multigrain Cheerios, Corn Flakes, etc.):
     * When cereal with milk or a bowl of cereal is mentioned (e.g. "bowl of multigrain cheerios", "cereal with milk"):
       ALWAYS itemize the cereal and the milk as TWO distinct items:
       1) The Cereal (e.g. 1 cup Multigrain Cheerios: ~110 kcal, ~2.5-3g protein, ~24g carbs, ~1.5g fats)
       2) The Milk (e.g. 1 cup or 3/4 cup 2% milk: ~110-120 kcal, ~7-8g protein, ~10-11.5g carbs, ~4-4.8g fats)
       Total meal: ~220-230 kcal, ~10-11g protein, ~34-36g carbs, ~5.5-6.3g fats.
   - Canned Salmon / Can of Salmon: Exactly 200 kcal, 40g protein, 0g carbs, 4g fats per can (150g).
   - Household Protein Shake / Smoothie: A standard shake with 2 cups milk (240-260 kcal, 16-18g P), 1 scoop Canadian Protein vegan powder (120 kcal, 20g P), and 1 banana (105 kcal, 1.3g P) is ~465-485 kcal, ~37-39g protein, ~54g carbs, ~12g fats.
   - Nature Valley Bar / Granola Bar: Exactly 170 kcal, ~3.5g protein, 23g carbs, 7.5g fats per bar / pouch.
   - Custom Iced Tea Mix (Good Host Daily Hydration):
     * When the user mentions "iced tea", "custom iced tea", or an iced tea drink (unless specifically branded commercial bottled tea like Nestea, Brisk, Peace Tea, Arizona):
       1) Good Host Iced Tea Powder: 1 tbsp (~15g) = 60 kcal, 0g protein, 15g carbs, 0g fats.
       2) Creatine Monohydrate: 5g = 0 kcal, 0g protein, 0g carbs, 0g fats.
       3) Pink Himalayan Salt & Lemon Juice (in 1L Water): ~2 kcal, 0g protein, ~0.5g carbs, 0g fats.
       TOTAL FOR THE 1L MIX: Strictly 60-62 kcal, 0g protein, 15-15.5g carbs, 0g fats.
   - Single Whole Produce & Fresh Fruit (Common Sense Principle):
     * Whole Medium Orange (approx 131g): 62 kcal, 1.2g protein, 15.4g carbs, 0.2g fats (0.47 kcal/g).
     * Whole Medium Apple (182g): 95 kcal, 0.5g protein, 25g carbs, 0.3g fats (0.52 kcal/g).
     * Whole Medium Banana (118g): 105 kcal, 1.3g protein, 27g carbs, 0.3g fats (0.89 kcal/g).
   - Bone-In Meats (Chicken Drumsticks, Wings, Bone-in Thighs):
     * Chicken Drumsticks: ~40% bone refuse (~60% edible meat). A 70g drumstick with bone has ~42g edible meat = ~78 kcal, ~10.5g protein, ~3.8g fats.
     * Chicken Wings: ~46% bone refuse (~54% edible meat). A 48g wing has ~26g edible meat = ~65 kcal, ~6.5g protein, ~4.2g fats.
   - Atwater energy consistency: Calories ≈ (Protein * 4) + (Carbs * 4) + (Fats * 9) within ±5%.

5. LIQUID VOLUME & LITRE (L) CONVERSIONS:
   - 1L = 1 Litre = 1000ml = strictly 4 standard cups (250ml each).
   - Normal milk (2% reduced fat) at 1L is 4 cups = 480 kcal, 32g protein, 46g carbs, ~19.2g fats.

OUTPUT FORMAT (STRICT JSON ONLY, NO MARKDOWN OUTSIDE THE JSON):
{
  "hasFood": true,
  "name": "Concise Descriptive Title (e.g. Grilled Chicken, White Rice & Steamed Broccoli)",
  "slot": "meal",
  "items": [
    {
      "name": "Clean Ingredient Name",
      "portion": "Explicit Portion (e.g. 180g, 1.2 cups, 1 drumstick (~70g gross, ~42g meat))",
      "estimatedGrams": 180,
      "calories": 297,
      "protein": 55.8,
      "carbs": 0,
      "fats": 6.5
    }
  ],
  "calories": 297,
  "protein": 55.8,
  "carbs": 0,
  "fats": 6.5,
  "notes": "Brief summary of applied modifiers"
}`;

    const prompt = `Parse this food log entry accurately into itemized ingredients and calculate strict macros: "${cleanQuery}"`;

    for (const model of textModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              maxOutputTokens: 2048,
            }
          })
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const parts = data?.candidates?.[0]?.content?.parts || [];
          const textPart = parts.find(p => p.text && !p.thought) || parts[0];
          const rawText = textPart?.text || '';
          if (rawText) {
            const parsed = safeParseJson(rawText);
            if (parsed && parsed.hasFood !== false && Array.isArray(parsed.items) && parsed.items.length > 0) {
              const isCannedSalmon = /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /can\s+of\s+salmon|canned\s+salmon|salmon\s+can/i.test(it.name || '')));

              if (isCannedSalmon && parsed.items.length <= 1 && (parsed.protein !== 40 || parsed.calories !== 200)) {
                parsed.name = "Canned Salmon";
                parsed.items = [
                  { name: "Canned Salmon", portion: "1 can (150g)", estimatedGrams: 150, calories: 200, protein: 40, carbs: 0, fats: 4 }
                ];
                parsed.notes = "Calibrated to verified sports nutrition ground truth (200 kcal, 40g protein per can)";
              }

              const isNatureValley = /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(parsed.name || '') ||
                (parsed.items.length === 1 && parsed.items.some(it => /nature\s*valley|oats\s*(?:and|&)\s*honey\s*bar/i.test(it.name || '')));

              if (isNatureValley && parsed.items.length <= 1 && (parsed.calories === 190 || parsed.calories === 0 || !parsed.calories)) {
                parsed.name = parsed.name || "Nature Valley Bar";
                parsed.items = [
                  { name: "Nature Valley Bar", portion: "1 bar / pouch (35g)", estimatedGrams: 35, calories: 170, protein: 3.5, carbs: 23, fats: 7.5 }
                ];
                parsed.notes = "Calibrated to verified nutrition facts (170 kcal, 3.5g protein, 23g carbs, 7.5g fats per bar/pouch)";
              }

              // Custom Iced Tea Mix Safeguard
              const isIcedTeaQuery = /(?:^|\s)(?:iced|ice)\s*tea(?:\s|$)/i.test(cleanQuery) && !/\bbottled|brisk|nestea|arizona|sweet\s+tea\s+bottle\b/i.test(cleanQuery);
              if (isIcedTeaQuery && (parsed.items.length <= 1 || parsed.calories > 80)) {
                parsed.name = "Custom Iced Tea";
                parsed.items = [
                  { name: "Good Host Iced Tea Powder", portion: "1 tbsp (15g)", calories: 60, protein: 0, carbs: 15, fats: 0 },
                  { name: "Creatine Monohydrate", portion: "5g", calories: 0, protein: 0, carbs: 0, fats: 0 },
                  { name: "Pink Himalayan Salt & Lemon Juice in 1L Water", portion: "1L (1000ml)", calories: 2, protein: 0, carbs: 0.5, fats: 0 }
                ];
                parsed.notes = "Calibrated to user custom hydration mix: Good Host powder, 5g creatine, Himalayan salt, and lemon juice in 1L water (60 kcal, 15g carbs)";
              }

              // Single Orange / Fresh Fruit Common Sense Safeguard
              const isOrangeQuery = /(?:^|\s)(?:an?\s+)?(?:orange|clementine|mandarin|tangerine)(?:s)?(?:\s|$)/i.test(cleanQuery) && !/\b(?:juice|soda|chicken|sauce)\b/i.test(cleanQuery);
              const orangeGramMatch = cleanQuery.match(/(\d+(?:\.\d+)?)\s*(?:g|grams?)\s*(?:of\s+)?(?:an?\s+)?(?:orange|clementine|mandarin|tangerine)/i)
                || cleanQuery.match(/(?:an?\s+)?(?:orange|clementine|mandarin|tangerine)s?\s*(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:g|grams?)/i);

              if (isOrangeQuery && (parsed.items.length <= 1 || !parsed.hasFood || parsed.calories > 150)) {
                const netG = orangeGramMatch ? parseFloat(orangeGramMatch[1]) : null;
                const cal = netG ? Math.round(netG * 0.47) : 62;
                const p = netG ? Number((netG * 0.009).toFixed(1)) : 1.2;
                const c = netG ? Number((netG * 0.118).toFixed(1)) : 15.4;
                const f = netG ? Number((netG * 0.001).toFixed(1)) : 0.2;
                const portionStr = netG ? `${netG}g` : "1 medium (131g)";

                parsed.name = "Fresh Orange";
                parsed.items = [
                  { name: "Fresh Orange", portion: portionStr, estimatedGrams: netG || 131, calories: cal, protein: p, carbs: c, fats: f }
                ];
                parsed.notes = netG ? `Calibrated to USDA whole fresh orange (${netG}g net food weight)` : "Calibrated to USDA standard medium orange (62 kcal, 1.2g protein, 15.4g carbs)";
              }

              parsed.items = reconcileVisionMealItems(parsed.items || [], cleanQuery);

              const itemsSumCalories = parsed.items.reduce((s, it) => s + (Number(it.calories) || 0), 0);
              const itemsSumProtein = parsed.items.reduce((s, it) => s + (Number(it.protein) || 0), 0);
              const itemsSumCarbs = parsed.items.reduce((s, it) => s + (Number(it.carbs) || 0), 0);
              const itemsSumFats = parsed.items.reduce((s, it) => s + (Number(it.fats) || 0), 0);

              const totalCalories = itemsSumCalories > 0
                ? Math.round(itemsSumCalories)
                : (parsed.calories || calculateCaloriesFromMacros(itemsSumProtein, itemsSumCarbs, itemsSumFats));
              const totalProtein = Math.round(itemsSumProtein * 10) / 10;
              const totalCarbs = Math.round(itemsSumCarbs * 10) / 10;
              const totalFats = Math.round(itemsSumFats * 10) / 10;

              return {
                hasFood: true,
                name: parsed.name || "Analyzed Meal",
                slot: parsed.slot || "meal",
                items: parsed.items,
                calories: totalCalories,
                protein: totalProtein,
                carbs: totalCarbs,
                fats: totalFats,
                notes: parsed.notes || "Verified by Wolfe Quick Log AI"
              };
            }
          }
        }
      } catch (err) {
        // Fall to next model
      }
    }
  }

  // 2. Offline / Fallback Local Engine
  const localParsed = parseMealDescription(cleanQuery, { kitchenCalibration, householdPantry, meals: mealHistory });
  if (localParsed && localParsed.items && localParsed.items.length > 0) {
    return {
      hasFood: true,
      name: localParsed.name,
      slot: localParsed.slot || 'meal',
      items: localParsed.items,
      calories: localParsed.calories,
      protein: localParsed.protein,
      carbs: localParsed.carbs,
      fats: localParsed.fats,
      notes: localParsed.notes || "Calculated from verified sports nutrition ingredient database"
    };
  }

  return {
    hasFood: false,
    errorMessage: `Could not identify foods in "${cleanQuery}". Try e.g. "200g chicken, 1 cup rice, 1 cup broccoli" or "2 eggs on toast with butter".`
  };
}

/**
 * Scans a Nutrition Facts label, packaging text, or barcode from a food product image using Gemini Vision
 */
export async function scanNutritionLabelWithAI({ imageBase64, mimeType = 'image/jpeg', aiConfig = DEFAULT_AI_CONFIG }) {
  const apiKey = aiConfig?.apiKey || API_KEY;
  if (!apiKey || !imageBase64) {
    return {
      hasLabel: false,
      errorMessage: "No API key configured or no image provided."
    };
  }

  const rawBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const visionModels = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest'
  ];

  const systemInstruction = `You are an OCR nutrition facts label reader and barcode scanner for Wolfe OS.
Inspect the food label, nutrition facts table, packaging, or barcode in the image.
Extract exact printed nutrition facts:
- "productName": Clean name of the product or item
- "brand": Brand name if visible
- "servingSize": Printed serving size (e.g. "1 bar (42g)", "2 scoops (64g)", "1 cup (240ml)")
- "servingsPerContainer": Number or string if visible
- "calories": Number of calories per serving
- "protein": Grams of protein per serving (number)
- "carbs": Grams of total carbohydrates per serving (number)
- "fats": Grams of total fat per serving (number)
- "fiber": Grams of dietary fiber per serving (number or null)
- "sugar": Grams of total sugars per serving (number or null)
- "barcodeNumber": Numeric barcode (UPC / EAN) digits if visible in image, else null
- "hasLabel": Set to false ONLY if the image does not contain any readable food label, package, barcode, or nutritional info.
- "errorMessage": String explanation if hasLabel is false.

Return ONLY valid JSON matching this schema:
{
  "hasLabel": true,
  "productName": "Nature Valley Bar",
  "brand": "Nature Valley",
  "servingSize": "1 bar / pouch (35g)",
  "servingsPerContainer": 1,
  "calories": 170,
  "protein": 3.5,
  "carbs": 23,
  "fats": 7.5,
  "fiber": 2,
  "sugar": 11,
  "barcodeNumber": null,
  "notes": "Exact values read from Nutrition Facts label"
}`;

  const prompt = "Read the Nutrition Facts label, product title, and barcode from this food package.";

  for (const model of visionModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType || 'image/jpeg',
                    data: rawBase64
                  }
                }
              ]
            }
          ],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 2048
          }
        })
      });

      clearTimeout(timeoutId);
      if (!response.ok) continue;

      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const textPart = parts.find(p => p.text && !p.thought) || parts[0];
      const rawText = textPart?.text || '';

      if (rawText) {
        const parsed = safeParseJson(rawText);
        if (parsed) {
          if (parsed.hasLabel === false) {
            return {
              hasLabel: false,
              errorMessage: parsed.errorMessage || "Could not read Nutrition Facts label. Please ensure the label is well-lit and clear."
            };
          }
          let itemCals = Number(parsed.calories) || calculateCaloriesFromMacros(parsed.protein, parsed.carbs, parsed.fats);
          let itemP = Number(parsed.protein) || 0;
          let itemC = Number(parsed.carbs) || 0;
          let itemF = Number(parsed.fats) || 0;

          if (/nature\s*valley/i.test(`${parsed.brand || ''} ${parsed.productName || ''}`) && (itemCals === 190 || itemCals === 0 || !itemCals)) {
            itemCals = 170;
            itemP = 3.5;
            itemC = 23;
            itemF = 7.5;
          }

          return {
            hasLabel: true,
            productName: parsed.productName || "Packaged Food Item",
            brand: parsed.brand || "",
            servingSize: parsed.servingSize || "1 serving",
            servingsPerContainer: parsed.servingsPerContainer || 1,
            calories: itemCals,
            protein: itemP,
            carbs: itemC,
            fats: itemF,
            fiber: parsed.fiber != null ? Number(parsed.fiber) : null,
            sugar: parsed.sugar != null ? Number(parsed.sugar) : null,
            barcodeNumber: parsed.barcodeNumber || null,
            notes: parsed.notes || "Read from Nutrition Facts label"
          };
        }
      }
    } catch (err) {
      // try next model
    }
  }

  return {
    hasLabel: false,
    errorMessage: "Could not read label. Please take a clearer, closer photo of the Nutrition Facts panel or barcode."
  };
}

/**
 * Lookup barcode directly from Open Food Facts API
 */
export async function lookupBarcodeOpenFoodFacts(barcode) {
  const cleanBarcode = (barcode || '').replace(/\D/g, '');
  if (!cleanBarcode || cleanBarcode.length < 8) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const nutriments = p.nutriments || {};

    const cals = Math.round(Number(nutriments['energy-kcal_serving'] || nutriments['energy-kcal_100g'] || 0));
    const protein = Math.round(Number(nutriments['proteins_serving'] || nutriments['proteins_100g'] || 0));
    const carbs = Math.round(Number(nutriments['carbohydrates_serving'] || nutriments['carbohydrates_100g'] || 0));
    const fats = Math.round(Number(nutriments['fat_serving'] || nutriments['fat_100g'] || 0));
    const fiber = nutriments['fiber_serving'] != null ? Math.round(Number(nutriments['fiber_serving'])) : null;
    const sugar = nutriments['sugars_serving'] != null ? Math.round(Number(nutriments['sugars_serving'])) : null;

    return {
      hasLabel: true,
      productName: p.product_name || p.generic_name || `Barcode Item (${cleanBarcode})`,
      brand: p.brands || '',
      servingSize: p.serving_size || '1 serving',
      calories: cals || calculateCaloriesFromMacros(protein, carbs, fats),
      protein,
      carbs,
      fats,
      fiber,
      sugar,
      barcodeNumber: cleanBarcode,
      notes: "Verified via Open Food Facts database"
    };
  } catch (e) {
    return null;
  }
}

/**
 * Search branded foods and products via Open Food Facts and Gemini FDA/Nutrition database
 */
export async function searchBrandedFoodDatabase({ query, aiConfig = DEFAULT_AI_CONFIG }) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery || cleanQuery.length < 2) return [];

  const apiKey = aiConfig?.apiKey || API_KEY || (typeof localStorage !== 'undefined' ? (JSON.parse(localStorage.getItem('wolfe_os_settings_v3') || '{}')?.aiConfig?.apiKey || JSON.parse(localStorage.getItem('wolfe_settings') || '{}')?.aiConfig?.apiKey) : '');
  const results = [];
  const seenNames = new Set();

  // 1. Query Open Food Facts search API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanQuery)}&search_simple=1&action=process&json=true&page_size=6`, {
      headers: { 'User-Agent': 'WolfeOS/1.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && Array.isArray(data.products)) {
        for (const p of data.products) {
          if (!p.product_name) continue;
          const nutriments = p.nutriments || {};
          const cals = Math.round(Number(nutriments['energy-kcal_serving'] || nutriments['energy-kcal_100g'] || 0));
          const protein = Math.round(Number(nutriments['proteins_serving'] || nutriments['proteins_100g'] || 0));
          const carbs = Math.round(Number(nutriments['carbohydrates_serving'] || nutriments['carbohydrates_100g'] || 0));
          const fats = Math.round(Number(nutriments['fat_serving'] || nutriments['fat_100g'] || 0));

          if (cals > 0 || protein > 0) {
            const key = (p.product_name + (p.brands || '')).toLowerCase();
            if (!seenNames.has(key)) {
              seenNames.add(key);
              results.push({
                id: p.code || `off-${Math.random().toString(36).substr(2, 9)}`,
                name: p.product_name,
                brand: p.brands || '',
                servingSize: p.serving_size || '1 serving',
                calories: cals,
                protein,
                carbs,
                fats,
                fiber: nutriments['fiber_serving'] != null ? Math.round(Number(nutriments['fiber_serving'])) : null,
                sugar: nutriments['sugars_serving'] != null ? Math.round(Number(nutriments['sugars_serving'])) : null,
                source: 'Open Food Facts'
              });
            }
          }
        }
      }
    }
  } catch (err) {}

  // 2. Gemini fallback / enhancer: precise FDA/USDA manufacturer label data
  if (results.length < 3 && apiKey) {
    const models = [
      'gemini-3.5-flash-lite',
      'gemini-flash-lite-latest',
      'gemini-3.6-flash',
      'gemini-3.5-flash'
    ];

    const prompt = `Search the verified food and nutrition database for the branded food: "${cleanQuery}".
Return up to 4 exact or closely matching branded food items with exact manufacturer Nutrition Facts label data.`;

    const systemInstruction = `You are a clinical sports dietitian and precise FDA & USDA branded food label authority.
For the user's food/brand search query, return exact manufacturer Nutrition Facts label values.
Return ONLY valid JSON matching this schema:
[
  {
    "id": "item-id",
    "name": "Full Product Name (e.g. Good Culture 2% Low-Fat Classic Cottage Cheese)",
    "brand": "Brand Name (e.g. Good Culture)",
    "servingSize": "Exact Serving Size (e.g. 1/2 cup (110g))",
    "calories": 100,
    "protein": 14,
    "carbs": 3,
    "fats": 2.5,
    "fiber": 0,
    "sugar": 3
  }
]`;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] },
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
              maxOutputTokens: 1024
            }
          })
        });

        clearTimeout(timeoutId);
        if (!response.ok) continue;

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find(p => p.text && !p.thought) || parts[0];
        const rawText = textPart?.text || '';

        if (rawText) {
          const parsed = safeParseJson(rawText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const item of parsed) {
              const key = (item.name + (item.brand || '')).toLowerCase();
              if (!seenNames.has(key)) {
                seenNames.add(key);
                results.push({
                  id: item.id || `ai-${Math.random().toString(36).substr(2, 9)}`,
                  name: item.name,
                  brand: item.brand || '',
                  servingSize: item.servingSize || '1 serving',
                  calories: Number(item.calories) || calculateCaloriesFromMacros(item.protein, item.carbs, item.fats),
                  protein: Number(item.protein) || 0,
                  carbs: Number(item.carbs) || 0,
                  fats: Number(item.fats) || 0,
                  fiber: item.fiber != null ? Number(item.fiber) : null,
                  sugar: item.sugar != null ? Number(item.sugar) : null,
                  source: 'FDA / Manufacturer Label'
                });
              }
            }
            break;
          }
        }
      } catch (e) {
        // Try next model
      }
    }
  }

  return results;
}
