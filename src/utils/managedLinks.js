'use strict';

/**
 * Apply per-post managed hyperlink rules to sanitized body HTML.
 * Skips existing <a>, <h1>, code/pre, and other non-prose tags.
 * Whole-word, case-sensitive matching. Longer phrases win on overlap.
 */

const SKIP_TAGS = new Set([
  'a',
  'h1',
  'code',
  'pre',
  'script',
  'style',
  'kbd',
  'samp',
  'textarea',
  'svg',
]);

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const TOKEN_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;

/**
 * @param {string} url
 * @returns {boolean}
 */
function isValidLinkUrl(url) {
  const u = String(url || '').trim();
  if (!u || /\s/.test(u)) return false;
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  if (/^https?:\/\//i.test(u)) return true;
  if (/^mailto:[^\s@]+@[^\s@]+/i.test(u)) return true;
  return false;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function isExternalUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Letters, numbers, underscore — used for whole-word edges.
 * @param {string} ch
 * @returns {boolean}
 */
function isWordChar(ch) {
  if (!ch) return false;
  return /[\p{L}\p{N}_]/u.test(ch);
}

/**
 * Case-sensitive whole-word (or whole-phrase) search.
 * @param {string} text
 * @param {string} word
 * @param {number} fromIndex
 * @returns {number}
 */
function findNextMatch(text, word, fromIndex) {
  if (!word) return -1;
  let idx = text.indexOf(word, fromIndex);
  while (idx !== -1) {
    const before = idx > 0 ? text[idx - 1] : '';
    const afterIdx = idx + word.length;
    const after = afterIdx < text.length ? text[afterIdx] : '';
    if (!isWordChar(before) && !isWordChar(after)) {
      return idx;
    }
    idx = text.indexOf(word, idx + 1);
  }
  return -1;
}

/**
 * @param {string} href
 * @param {string} textHtml already-safe HTML text content
 * @returns {string}
 */
function makeAnchor(href, textHtml) {
  const safeHref = escapeAttr(href);
  const blank = isExternalUrl(href) ? ' target="_blank"' : '';
  return `<a href="${safeHref}" rel="noopener noreferrer"${blank}>${textHtml}</a>`;
}

/**
 * Normalize rules for the engine.
 * @param {Array<{ id?: string, word: string, url: string, maxOccurrences?: number|null }>} rules
 * @returns {Array<{ key: string, word: string, url: string, max: number }>}
 */
function normalizeRules(rules) {
  if (!Array.isArray(rules) || !rules.length) return [];
  const out = [];
  for (const r of rules) {
    const word = String(r?.word || '');
    const url = String(r?.url || '').trim();
    if (!word || !url || !isValidLinkUrl(url)) continue;
    const maxRaw = r.maxOccurrences;
    const max =
      maxRaw == null || maxRaw === '' || Number(maxRaw) <= 0
        ? Infinity
        : Math.floor(Number(maxRaw));
    out.push({
      key: String(r.id || word),
      word,
      url,
      max,
    });
  }
  // Longer phrases first so they win when positions tie.
  out.sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));
  return out;
}

/**
 * Parse an HTML tag token.
 * @param {string} token
 * @returns {{ name: string, closing: boolean, selfClosing: boolean }|null}
 */
function parseTag(token) {
  if (!token || token.startsWith('<!--')) return null;
  const closing = /^<\//.test(token);
  const selfClosing = /\/\s*>$/.test(token);
  const m = token.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  return {
    name,
    closing,
    selfClosing: selfClosing || VOID_TAGS.has(name),
  };
}

/**
 * Apply managed links to HTML. Returns { html, counts } where counts is Map<key, number>.
 * @param {string} html
 * @param {Array<{ id?: string, word: string, url: string, maxOccurrences?: number|null }>} rules
 * @returns {{ html: string, counts: Map<string, number> }}
 */
function applyManagedLinksWithCounts(html, rules) {
  const normalized = normalizeRules(rules);
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const r of normalized) counts.set(r.key, 0);
  if (!html || !normalized.length) {
    return { html: String(html || ''), counts };
  }

  /** @type {Map<string, number>} */
  const remaining = new Map();
  for (const r of normalized) remaining.set(r.key, r.max);

  /**
   * @param {string} text
   * @returns {string}
   */
  function linkText(text) {
    let out = '';
    let pos = 0;
    while (pos < text.length) {
      /** @type {{ index: number, length: number, rule: typeof normalized[0] }|null} */
      let best = null;
      for (const rule of normalized) {
        const left = remaining.get(rule.key) ?? 0;
        if (left <= 0) continue;
        const idx = findNextMatch(text, rule.word, pos);
        if (idx === -1) continue;
        if (
          !best ||
          idx < best.index ||
          (idx === best.index && rule.word.length > best.length)
        ) {
          best = { index: idx, length: rule.word.length, rule };
        }
      }
      if (!best) {
        out += text.slice(pos);
        break;
      }
      out += text.slice(pos, best.index);
      const matched = text.slice(best.index, best.index + best.length);
      out += makeAnchor(best.rule.url, matched);
      remaining.set(best.rule.key, (remaining.get(best.rule.key) || 1) - 1);
      counts.set(best.rule.key, (counts.get(best.rule.key) || 0) + 1);
      pos = best.index + best.length;
    }
    return out;
  }

  let result = '';
  let lastIndex = 0;
  let skipDepth = 0;
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(html))) {
    const text = html.slice(lastIndex, m.index);
    if (text) {
      result += skipDepth > 0 ? text : linkText(text);
    }
    const token = m[0];
    result += token;
    const parsed = parseTag(token);
    if (parsed) {
      if (parsed.closing) {
        if (SKIP_TAGS.has(parsed.name) && skipDepth > 0) skipDepth -= 1;
      } else if (!parsed.selfClosing) {
        if (SKIP_TAGS.has(parsed.name)) skipDepth += 1;
      }
    }
    lastIndex = TOKEN_RE.lastIndex;
  }
  const rest = html.slice(lastIndex);
  if (rest) {
    result += skipDepth > 0 ? rest : linkText(rest);
  }

  return { html: result, counts };
}

/**
 * @param {string} html
 * @param {Array<{ id?: string, word: string, url: string, maxOccurrences?: number|null }>} rules
 * @returns {string}
 */
function applyManagedLinks(html, rules) {
  return applyManagedLinksWithCounts(html, rules).html;
}

/**
 * Count how many times `word` could be auto-linked in HTML (skip regions respected).
 * @param {string} html
 * @param {string} word
 * @returns {number}
 */
function countEligible(html, word) {
  const w = String(word || '');
  if (!w || !html) return 0;
  const { counts } = applyManagedLinksWithCounts(html, [
    { id: 'eligible', word: w, url: 'https://example.com', maxOccurrences: null },
  ]);
  return counts.get('eligible') || 0;
}

/**
 * @param {string} html
 * @param {Array<{ id?: string, word: string, url: string, maxOccurrences?: number|null }>} rules
 * @returns {Map<string, number>}
 */
function computeLinkCounts(html, rules) {
  return applyManagedLinksWithCounts(html, rules).counts;
}

module.exports = {
  applyManagedLinks,
  applyManagedLinksWithCounts,
  countEligible,
  computeLinkCounts,
  isValidLinkUrl,
  isExternalUrl,
  findNextMatch,
  isWordChar,
};
