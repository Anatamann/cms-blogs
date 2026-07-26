'use strict';

/**
 * Lightweight client hints from the request (no external geo IP DB).
 * Region prefers CDN/proxy country headers; falls back to XX.
 */

/**
 * @param {string} ua
 * @returns {'desktop'|'mobile'|'tablet'|'bot'|'unknown'}
 */
function parseDevice(ua) {
  const s = String(ua || '');
  if (!s) return 'unknown';
  if (
    /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|wget|curl|python-requests/i.test(
      s
    )
  ) {
    return 'bot';
  }
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s)) {
    return 'tablet';
  }
  if (/Mobile|iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(s)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Best-effort country/region code from common reverse-proxy headers.
 * @param {import('express').Request} req
 * @returns {string} 2–3 letter code or XX
 */
function parseRegion(req) {
  const h = req.headers || {};
  const candidates = [
    h['cf-ipcountry'],
    h['CF-IPCountry'],
    h['x-vercel-ip-country'],
    h['x-country-code'],
    h['cloudfront-viewer-country'],
    h['x-appengine-country'],
  ];

  for (const raw of candidates) {
    const code = String(raw || '')
      .trim()
      .toUpperCase();
    if (code && code !== 'XX' && code !== 'T1' && /^[A-Z]{2,3}$/.test(code)) {
      return code;
    }
  }

  // Weak fallback: primary Accept-Language region (en-US → US)
  const al = String(h['accept-language'] || '');
  const m = al.match(/^[a-z]{2,3}[-_]([A-Za-z]{2})/);
  if (m) {
    return m[1].toUpperCase();
  }

  return 'XX';
}

/**
 * @param {import('express').Request} req
 */
function clientMetaFromRequest(req) {
  const ua = req.get('user-agent') || '';
  return {
    device: parseDevice(ua),
    region: parseRegion(req),
    path: String(req.originalUrl || req.path || '').slice(0, 500),
  };
}

module.exports = {
  parseDevice,
  parseRegion,
  clientMetaFromRequest,
};
