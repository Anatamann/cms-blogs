'use strict';

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const sharp = require('sharp');
const config = require('../config');

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_IMAGE_BYTES = 4_000_000;

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

/**
 * @param {string} raw
 * @returns {URL}
 */
function assertSafeHttpUrl(raw) {
  let u;
  try {
    u = new URL(String(raw || '').trim());
  } catch {
    throw Object.assign(new Error('Invalid URL'), { status: 400 });
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw Object.assign(new Error('Only http(s) URLs are allowed'), { status: 400 });
  }
  const host = u.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw Object.assign(new Error('That host is not allowed'), { status: 400 });
  }
  // Basic private IP / link-local block
  if (
    /^(10\.|192\.168\.|169\.254\.|127\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host === 'metadata.google.internal'
  ) {
    throw Object.assign(new Error('That host is not allowed'), { status: 400 });
  }
  return u;
}

/**
 * @param {string} url
 * @returns {'youtube'|'x'|'generic'}
 */
function detectProvider(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      return 'youtube';
    }
    if (host === 'x.com' || host === 'twitter.com' || host.endsWith('twitter.com')) {
      return 'x';
    }
  } catch {
    // ignore
  }
  return 'generic';
}

/**
 * @param {string} html
 * @param {string} prop
 * @returns {string}
 */
function metaContent(html, prop) {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
      'i'
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeHtmlEntities(m[1].trim());
  }
  return '';
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function titleFromHtml(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : '';
}

/**
 * Fetch Open Graph-ish preview for any URL.
 * @param {string} sourceUrl
 * @returns {Promise<{ sourceUrl: string, title: string, description: string, imageUrl: string, provider: string, previewRaw: string }>}
 */
async function fetchPreview(sourceUrl) {
  const parsed = assertSafeHttpUrl(sourceUrl);
  const href = parsed.href;
  const provider = detectProvider(href);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'OctoSenseiPreviewBot/1.0 (+https://localhost; link-preview)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    throw Object.assign(new Error(`Could not fetch URL: ${err.message || 'network error'}`), {
      status: 400,
    });
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw Object.assign(new Error(`Fetch failed (${res.status})`), { status: 400 });
  }

  const ctype = String(res.headers.get('content-type') || '');
  if (!/text\/html|application\/xhtml/i.test(ctype) && provider === 'generic') {
    // Still try to read a bit — some CDNs omit type
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_HTML_BYTES) {
    throw Object.assign(new Error('Page is too large to preview'), { status: 400 });
  }
  const html = buf.toString('utf8');

  let title =
    metaContent(html, 'og:title') ||
    metaContent(html, 'twitter:title') ||
    titleFromHtml(html);
  let description =
    metaContent(html, 'og:description') ||
    metaContent(html, 'twitter:description') ||
    metaContent(html, 'description');
  let imageUrl =
    metaContent(html, 'og:image') ||
    metaContent(html, 'og:image:url') ||
    metaContent(html, 'twitter:image') ||
    metaContent(html, 'twitter:image:src');

  // Resolve relative image URLs
  if (imageUrl && imageUrl.startsWith('/')) {
    imageUrl = `${parsed.origin}${imageUrl}`;
  } else if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    try {
      imageUrl = new URL(imageUrl, href).href;
    } catch {
      imageUrl = '';
    }
  }

  title = title.slice(0, 300);
  description = description.slice(0, 1000);
  imageUrl = imageUrl.slice(0, 1000);

  const previewRaw = JSON.stringify({
    title,
    description,
    imageUrl,
    provider,
    fetchedFrom: href,
  }).slice(0, 4000);

  return {
    sourceUrl: href,
    title,
    description,
    imageUrl,
    provider,
    previewRaw,
  };
}

/**
 * Download and cache a remote image under uploads/social-cache.
 * @param {string} imageUrl
 * @param {string} postId
 * @returns {Promise<string>} public path like /uploads/social-cache/….webp
 */
async function cacheImage(imageUrl, postId) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return '';
  try {
    assertSafeHttpUrl(imageUrl);
  } catch {
    return '';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(imageUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'OctoSenseiPreviewBot/1.0' },
    });
  } catch {
    clearTimeout(timer);
    return '';
  }
  clearTimeout(timer);
  if (!res.ok) return '';

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return '';

  const dir = path.join(config.uploadsDir, 'social-cache');
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${String(postId).replace(/[^a-zA-Z0-9_-]/g, '')}.webp`;
  const abs = path.join(dir, fileName);

  try {
    await sharp(buf)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(abs);
  } catch {
    // Fallback: write original with safe ext
    const ext = /\.png(\?|$)/i.test(imageUrl)
      ? '.png'
      : /\.gif(\?|$)/i.test(imageUrl)
        ? '.gif'
        : '.jpg';
    const fallback = path.join(dir, `${String(postId).replace(/[^a-zA-Z0-9_-]/g, '')}${ext}`);
    fs.writeFileSync(fallback, buf);
    return `/uploads/social-cache/${path.basename(fallback)}`;
  }

  return `/uploads/social-cache/${fileName}`;
}

/**
 * Prefer cached local image for display.
 * @param {{ cachedImagePath?: string, imageUrl?: string }} post
 */
function displayImage(post) {
  const cached = String(post?.cachedImagePath || '').trim();
  if (cached) return cached;
  return String(post?.imageUrl || '').trim();
}

module.exports = {
  assertSafeHttpUrl,
  detectProvider,
  fetchPreview,
  cacheImage,
  displayImage,
  ASPECT_RATIOS: ['wide', 'square', 'tall'],
};
