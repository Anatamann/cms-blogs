'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Content-Security-Policy directives for SSR + local assets + JSON-LD.
 * JSON-LD uses inline <script type="application/ld+json"> → allow 'unsafe-inline' for scripts.
 */
const cspDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  fontSrc: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  imgSrc: ["'self'", 'data:', 'blob:'],
  mediaSrc: ["'self'", 'blob:'],
  objectSrc: ["'none'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  connectSrc: ["'self'"],
  // Only force HTTPS upgrades when the public APP_URL is https://
  upgradeInsecureRequests: config.publicIsHttps ? [] : null,
};

// Remove null directives (helmet rejects them)
if (!config.publicIsHttps) {
  delete cspDirectives.upgradeInsecureRequests;
}

const helmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: cspDirectives,
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-site' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.publicIsHttps
    ? { maxAge: 15552000, includeSubDomains: true, preload: false }
    : false,
};

/** Login brute-force protection */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Try again later.',
  skipSuccessfulRequests: false,
});

/** Contact form spam protection */
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CONTACT) || 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many contact submissions. Try again later.',
});

/** General write/API throttle (admin mutations beyond upload) */
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_WRITE) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Slow down.',
});

/** Public comments */
const commentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_COMMENT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many comments. Try again later.',
});

/** Public reactions */
const reactionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REACTION) || 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many reactions. Slow down.',
});

/**
 * Reject weak default secrets in production.
 */
function assertSecureConfig() {
  if (!config.isProd) return;

  const weakSecrets = new Set([
    'dev-only-change-me',
    'change-me-to-a-long-random-string',
    'change-me-in-production',
    '',
  ]);

  if (weakSecrets.has(config.sessionSecret) || config.sessionSecret.length < 24) {
    throw new Error(
      '[security] SESSION_SECRET must be a strong random string (≥24 chars) in production'
    );
  }
}

module.exports = {
  helmetOptions,
  loginLimiter,
  contactLimiter,
  writeLimiter,
  commentLimiter,
  reactionLimiter,
  assertSecureConfig,
  cspDirectives,
};
