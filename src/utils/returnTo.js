'use strict';

/**
 * Only allow internal admin relative paths (open redirect protection).
 * @param {unknown} value
 * @returns {string|null}
 */
function safeAdminReturnTo(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const u = new URL(value, 'http://ainme.local');
    if (u.origin !== 'http://ainme.local') return null;
    if (!u.pathname.startsWith('/mantri')) return null;
    // block protocol-relative weirdness
    if (value.startsWith('//')) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

/**
 * Append returnTo to a path query string.
 * @param {string} path
 * @param {string|null} returnTo
 */
function withReturnTo(path, returnTo) {
  if (!returnTo) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}

module.exports = {
  safeAdminReturnTo,
  withReturnTo,
};
