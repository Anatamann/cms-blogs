'use strict';

const { paths } = require('../utils/slug');
const crypto = require('crypto');

/**
 * Ensure session user for all /admin routes except login.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.currentUser = req.session.user;
    return next();
  }

  if (req.method === 'GET') {
    req.session.returnTo = req.originalUrl;
  }

  return res.redirect(paths.admin.login());
}

/**
 * Redirect authenticated users away from login.
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect(paths.admin.home());
  }
  return next();
}

/**
 * Simple per-session CSRF token for admin forms.
 */
function ensureCsrf(req, _res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  return next();
}

function verifyCsrf(req, res, next) {
  const token = req.body && req.body._csrf;
  const expected = req.session && req.session.csrfToken;
  if (!expected || !token || token !== expected) {
    const err = new Error('Invalid security token. Please try again.');
    err.status = 403;
    return next(err);
  }
  return next();
}

/**
 * One-shot flash messages via session.
 */
function flashMiddleware(req, res, next) {
  res.locals.flash = req.session?.flash || null;
  if (req.session) delete req.session.flash;

  req.flash = (type, message) => {
    if (!req.session) return;
    req.session.flash = { type, message };
  };

  next();
}

function exposeAdminLocals(req, res, next) {
  res.locals.csrfToken = req.session?.csrfToken || '';
  res.locals.currentUser = req.session?.user || null;
  res.locals.isAdmin = true;
  next();
}

module.exports = {
  requireAuth,
  redirectIfAuthenticated,
  ensureCsrf,
  verifyCsrf,
  flashMiddleware,
  exposeAdminLocals,
};
