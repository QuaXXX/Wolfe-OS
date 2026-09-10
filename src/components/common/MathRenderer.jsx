import React, { useMemo } from 'react';
import katex from 'katex';

import { normalizeMathString, isMathExpression } from '../../utils/mathUtils.js';

export { normalizeMathString, isMathExpression };

/**
 * MathRenderer Component:
 * Renders LaTeX equations or expressions using KaTeX with zero crashes.
 */
export const MathRenderer = ({ 
  math, 
  displayMode = false, 
  className = '',
  fallbackClassName = 'font-mono text-xs text-amber-200'
}) => {
  const renderedHtml = useMemo(() => {
    const clean = normalizeMathString(math);
    if (!clean) return null;

    try {
      return katex.renderToString(clean, {
        displayMode,
        throwOnError: false,
        output: 'html',
        strict: false
      });
    } catch (e) {
      return null;
    }
  }, [math, displayMode]);

  if (!math) return null;

  if (renderedHtml) {
    if (displayMode) {
      return (
        <div 
          className={`overflow-x-auto py-2.5 px-3.5 my-1.5 rounded-xl bg-black/50 border border-white/10 text-slate-100 flex items-center justify-center text-sm sm:text-base select-text shadow-inner ${className}`}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      );
    }

    return (
      <span 
        className={`inline-block align-middle select-text mx-0.5 ${className}`}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    );
  }

  // Fallback if KaTeX cannot render
  const cleanFallback = typeof math === 'string' ? math.replace(/^[$]+|[$]+$/g, '').trim() : String(math);
  return (
    <span className={fallbackClassName}>
      {cleanFallback}
    </span>
  );
};

export default MathRenderer;
