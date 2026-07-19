'use strict';

const { generateId } = require('./uuid');

/**
 * Stable visitor key for reactions (session-backed).
 * Creates a session visitorId on first use.
 * @param {import('express').Request} req
 * @returns {string}
 */
function ensureVisitorKey(req) {
  if (!req.session) return generateId();
  if (!req.session.visitorId) {
    req.session.visitorId = generateId();
  }
  return req.session.visitorId;
}

module.exports = {
  ensureVisitorKey,
};
