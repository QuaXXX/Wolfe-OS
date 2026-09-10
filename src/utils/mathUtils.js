/**
 * Mathematical formula & LaTeX formatting utilities for Wolfe OS
 */

/**
 * Normalizes a math string for KaTeX rendering:
 * - Strips outer delimiter pairs: $$, $, \[, \]
 * - Replaces common unicode symbols with LaTeX equivalents
 */
export function normalizeMathString(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let str = raw.trim();

  // Strip surrounding $$...$$
  if (str.startsWith('$$') && str.endsWith('$$') && str.length >= 4) {
    str = str.slice(2, -2).trim();
  }
  // Strip surrounding \[...\]
  else if (str.startsWith('\\[') && str.endsWith('\\]') && str.length >= 4) {
    str = str.slice(2, -2).trim();
  }
  // Strip surrounding \(...\)
  else if (str.startsWith('\\(') && str.endsWith('\\)') && str.length >= 4) {
    str = str.slice(2, -2).trim();
  }
  // Strip surrounding single $...$
  else if (str.startsWith('$') && str.endsWith('$') && str.length >= 2) {
    str = str.slice(1, -1).trim();
  }

  // Replace common unicode math symbols with standard LaTeX equivalents
  str = str
    .replace(/×/g, '\\times ')
    .replace(/÷/g, '\\div ')
    .replace(/≠/g, '\\neq ')
    .replace(/≤/g, '\\leq ')
    .replace(/≥/g, '\\geq ')
    .replace(/±/g, '\\pm ')
    .replace(/∑/g, '\\sum ')
    .replace(/√/g, '\\sqrt ');

  return str;
}

/**
 * Checks if a string looks like LaTeX or a mathematical formula
 */
export function isMathExpression(str) {
  if (!str || typeof str !== 'string') return false;
  const s = str.trim();
  return (
    s.startsWith('$$') ||
    s.startsWith('$') ||
    s.startsWith('\\[') ||
    s.includes('\\frac') ||
    s.includes('\\text') ||
    s.includes('\\times') ||
    s.includes('\\sum') ||
    s.includes('\\sqrt') ||
    s.includes('^{') ||
    s.includes('_{') ||
    s.includes('\\cdot') ||
    s.includes('\\sigma') ||
    s.includes('\\beta') ||
    s.includes('\\alpha') ||
    s.includes('\\mu') ||
    /^[A-Za-z0-9_]+\s*=\s*.+/.test(s)
  );
}

/**
 * Normalizes AI output text:
 * - Strips redundant surrounding quotes
 * - Fixes duplicated / nested double quotes: ""Text"" -> "Text"
 * - Fixes escaped quotes: \"\" -> "
 * - Strips empty quote artifacts: e.g. 'at "" for today' -> 'today'
 * - Cleans stray unclosed formatting tokens
 */
export function cleanAiMessage(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.trim();

  // 1. Strip outermost redundant surrounding quotes (single or doubled): e.g. ""Text"" -> Text or "Text" -> Text
  text = text.replace(/^["'`“‘]{1,2}([\s\S]*?)["'`”’]{1,2}$/, '$1').trim();

  // 2. Fix duplicated/nested quotes: ""Text"" -> "Text", \"\" -> "
  text = text.replace(/""([^"]+?)""/g, '"$1"');
  text = text.replace(/\\"+/g, '"');
  text = text.replace(/""+/g, '"');

  // 3. Fix empty quotes artifact: e.g. 'at "" for today' or 'purge ""'
  text = text.replace(/\s*""\s*/g, ' ');

  // 4. Fix accidental quotes before/after punctuation: e.g. " ," -> ","
  text = text.replace(/"\s+([,.?!])/g, '$1');

  return text.trim();
}

