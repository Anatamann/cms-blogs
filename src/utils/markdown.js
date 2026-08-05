'use strict';

const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

marked.setOptions({
  gfm: true,
  breaks: false,
});

const SANITIZE_OPTIONS = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'img',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'figure',
    'figcaption',
    'video',
    'source',
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'srcset', 'alt', 'title', 'width', 'height', 'loading', 'class'],
    a: ['href', 'name', 'target', 'rel', 'class'],
    video: ['src', 'controls', 'width', 'height', 'poster', 'preload'],
    source: ['src', 'type'],
    code: ['class'],
    pre: ['class'],
    span: ['class'],
    div: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        loading: attribs.loading || 'lazy',
        decoding: attribs.decoding || 'async',
      },
    }),
  },
};

/**
 * Convert Markdown to sanitized HTML for post bodies.
 * Body images stay normal in-flow; cover/backdrop stills are separate.
 * @param {string} markdown
 * @returns {string}
 */
function renderMarkdown(markdown) {
  const raw = marked.parse(markdown || '', { async: false });
  return sanitizeHtml(String(raw), SANITIZE_OPTIONS);
}

/**
 * Parse backdrop_images JSON from DB into a clean URL list.
 * @param {string|string[]|null|undefined} raw
 * @returns {string[]}
 */
function parseBackdropImages(raw) {
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s || '').trim()).filter(Boolean);
  }
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x || '').trim()).filter(Boolean);
    }
  } catch {
    // comma-separated fallback
    return s
      .split(/[\n,]+/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Ordered image URLs from markdown (for scroll backdrop / preload).
 * @param {string} markdown
 * @returns {string[]}
 */
function listMarkdownImages(markdown) {
  const md = String(markdown || '');
  const out = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(md))) {
    const src = (m[1] || '').trim();
    if (src) out.push(src);
  }
  return out;
}

/**
 * Plain-text from markdown (strip syntax lightly).
 * @param {string} markdown
 */
function plainText(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
    .replace(/[#>*_\-~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain-text excerpt fallback from markdown.
 * @param {string} markdown
 * @param {number} [maxLen]
 */
function plainExcerpt(markdown, maxLen = 160) {
  const text = plainText(markdown);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

/**
 * Truncate for consistent card display.
 * @param {string} text
 * @param {number} [maxLen]
 */
function truncateText(text, maxLen = 150) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

/**
 * True when excerpt repeats the opening of the body (preview should hide it).
 * @param {string} excerpt
 * @param {string} bodyMd
 */
function excerptDuplicatesBody(excerpt, bodyMd) {
  const ex = plainText(excerpt).toLowerCase();
  const body = plainText(bodyMd).toLowerCase();
  if (!ex || !body) return false;
  if (body.startsWith(ex) || ex.startsWith(body.slice(0, Math.min(ex.length, 80)))) {
    return true;
  }
  // Near-identical first ~100 chars
  const n = Math.min(100, ex.length, body.length);
  if (n >= 40 && ex.slice(0, n) === body.slice(0, n)) return true;
  return false;
}

/**
 * First image URL from markdown body (for OG fallback).
 * @param {string} markdown
 * @returns {string|null}
 */
function firstMarkdownImage(markdown) {
  const md = String(markdown || '');
  const m = md.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/);
  if (m && m[1]) return m[1].trim();
  const html = md.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (html && html[1]) return html[1].trim();
  return null;
}

module.exports = {
  renderMarkdown,
  plainExcerpt,
  plainText,
  truncateText,
  excerptDuplicatesBody,
  firstMarkdownImage,
  listMarkdownImages,
  parseBackdropImages,
};
