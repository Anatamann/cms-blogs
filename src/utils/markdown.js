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
 * Convert Markdown to sanitized HTML for public post bodies.
 * @param {string} markdown
 * @returns {string}
 */
function renderMarkdown(markdown) {
  const raw = marked.parse(markdown || '', { async: false });
  return sanitizeHtml(String(raw), SANITIZE_OPTIONS);
}

/**
 * Plain-text excerpt fallback from markdown (strip syntax lightly).
 * @param {string} markdown
 * @param {number} [maxLen]
 */
function plainExcerpt(markdown, maxLen = 160) {
  const text = String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[#>*_\-~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

module.exports = {
  renderMarkdown,
  plainExcerpt,
};
