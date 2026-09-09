import React, { useMemo } from 'react';

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

/**
 * Splits inline string into formatted spans (wikilinks, markdown links, bold, italic, code, text)
 */
export function renderInlineContent(text) {
  if (!text) return null;
  // Regex: matches [[wikilinks]], [markdown](links), **bold**, __bold__, `code`, *italic*, _italic_
  const tokenRegex = /(\[\[[^\]]+?\]\]|\[[^\]]+?\]\([^)]+?\)|(?:\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+?`|\*[^*]+?\*|_[^_]+?_))/g;
  const parts = [];
  let lastIdx = 0;
  let match;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }
    const token = match[0];
    const key = `token-${match.index}`;

    // 1. Obsidian [[Wikilink]] or [[Target|Alias]]
    if (token.startsWith('[[') && token.endsWith(']]')) {
      const inner = token.slice(2, -2).trim();
      const [targetRaw, aliasRaw] = inner.split('|');
      const target = (targetRaw || '').trim();
      const label = (aliasRaw || targetRaw || '').trim();

      const handleClickWikilink = (e) => {
        e.stopPropagation();
        // Alt or Ctrl click attempts to open directly in native Obsidian app
        if (e.altKey || e.ctrlKey) {
          const cleanPath = target.replace(/^\/+/, '').replace(/\.md$/, '');
          window.open(`obsidian://open?file=${encodeURIComponent(cleanPath)}`, '_self');
          return;
        }
        // Dispatch in-app navigation event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('wolfe-navigate', { 
            detail: { target, label, raw: token } 
          }));
        }
      };

      parts.push(
        <button
          key={key}
          type="button"
          onClick={handleClickWikilink}
          title={`Link to [[${target}]] (Alt+Click to open in Obsidian)`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 mx-0.5 rounded-md text-[11px] font-medium bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 hover:text-purple-100 hover:border-purple-400/50 transition-all cursor-pointer select-none group active:scale-95 align-middle"
        >
          <span className="opacity-70 group-hover:opacity-100 transition-opacity text-[10px]">🔗</span>
          <span className="font-semibold underline decoration-purple-400/40 underline-offset-2">{label}</span>
        </button>
      );
    } 
    // 2. Markdown Link [Label](url)
    else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, linkText, linkUrl] = linkMatch;
        parts.push(
          <a
            key={key}
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-cyan-400 hover:text-cyan-300 underline underline-offset-2 font-medium transition-colors"
          >
            {linkText}
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    // 3. Bold
    else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
      parts.push(
        <strong key={key} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } 
    // 4. Inline Code
    else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={key} className="px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-mono text-[11px]">
          {token.slice(1, -1)}
        </code>
      );
    } 
    // 5. Italic
    else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      parts.push(
        <em key={key} className="italic text-slate-200">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIdx = match.index + token.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return parts;
}

/**
 * Parses markdown into structured blocks (headers, bullet lists, numbered lists, paragraphs)
 */
function parseMarkdownBlocks(rawText) {
  const clean = cleanAiMessage(rawText);
  if (!clean) return [];

  const lines = clean.split(/\r?\n/);
  const blocks = [];
  let currentList = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      continue;
    }

    // Header: ### Heading or ## Heading or # Heading
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      if (currentList) {
        blocks.push(currentList);
        currentList = null;
      }
      blocks.push({
        type: 'header',
        level: headerMatch[1].length,
        text: headerMatch[2]
      });
      continue;
    }

    // Bullet item (- , * , • )
    const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
    if (bulletMatch) {
      if (!currentList || currentList.type !== 'bullet_list') {
        if (currentList) blocks.push(currentList);
        currentList = { type: 'bullet_list', items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    // Numbered item (1. , 2. )
    const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (numMatch) {
      if (!currentList || currentList.type !== 'numbered_list') {
        if (currentList) blocks.push(currentList);
        currentList = { type: 'numbered_list', items: [] };
      }
      currentList.items.push({ num: numMatch[1], text: numMatch[2] });
      continue;
    }

    // Regular paragraph line
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
    blocks.push({ type: 'paragraph', text: trimmed });
  }

  if (currentList) {
    blocks.push(currentList);
  }

  return blocks;
}

/**
 * FormattedAiText Component:
 * Resilient, clean markdown and AI message presenter.
 * 
 * Props:
 * - text: string (raw response from Gemini or local assistant)
 * - inline: boolean (if true, formats into single compact line, perfect for TopBar toasts)
 * - className: optional css string
 */
export const FormattedAiText = ({ text, inline = false, className = '' }) => {
  const cleaned = useMemo(() => cleanAiMessage(text), [text]);

  if (!cleaned) return null;

  if (inline) {
    // For single-line toasts: replace multiple newlines/bullets with sleek bullet separators
    const singleLine = cleaned
      .replace(/\r?\n[-*•]\s+/g, ' • ')
      .replace(/\r?\n+/g, ' ')
      .trim();

    return (
      <span className={className}>
        {renderInlineContent(singleLine)}
      </span>
    );
  }

  const blocks = parseMarkdownBlocks(cleaned);

  return (
    <div className={`space-y-2 select-text ${className}`}>
      {blocks.map((block, bIdx) => {
        if (block.type === 'header') {
          return (
            <div 
              key={bIdx} 
              className={`font-bold text-white tracking-tight ${
                block.level === 1 ? 'text-sm mt-2' : 'text-xs mt-1.5'
              }`}
              style={{ color: 'var(--accent-primary)' }}
            >
              {renderInlineContent(block.text)}
            </div>
          );
        }

        if (block.type === 'bullet_list') {
          return (
            <ul key={bIdx} className="space-y-1 my-1 pl-1">
              {block.items.map((item, iIdx) => (
                <li key={iIdx} className="flex items-start gap-2 leading-relaxed">
                  <span 
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 opacity-80"
                    style={{ backgroundColor: 'var(--accent-primary)' }} 
                  />
                  <span className="flex-1">
                    {renderInlineContent(item)}
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'numbered_list') {
          return (
            <ol key={bIdx} className="space-y-1 my-1 pl-1">
              {block.items.map((item, iIdx) => (
                <li key={iIdx} className="flex items-start gap-2 leading-relaxed font-sans">
                  <span 
                    className="font-mono text-[10px] font-bold mt-0.5 px-1 rounded shrink-0"
                    style={{ 
                      backgroundColor: 'var(--accent-subtle)', 
                      color: 'var(--accent-primary)',
                      border: '1px solid var(--accent-border)' 
                    }}
                  >
                    {item.num}
                  </span>
                  <span className="flex-1">
                    {renderInlineContent(item.text)}
                  </span>
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={bIdx} className="leading-relaxed font-sans">
            {renderInlineContent(block.text)}
          </p>
        );
      })}
    </div>
  );
};
