'use strict';

const { v4: uuidv4, validate: uuidValidate, version: uuidVersion } = require('uuid');

/** Canonical UUID v4: lowercase 8-4-4-4-12 with hyphens. */
const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Generate a clean UUID v4 string for table primary keys.
 * @returns {string}
 */
function generateId() {
  return uuidv4().toLowerCase();
}

/**
 * Normalize and validate a UUID string to canonical form.
 * @param {string} value
 * @returns {string|null} canonical UUID or null if invalid
 */
function normalizeId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!UUID_V4_REGEX.test(normalized)) return null;
  if (!uuidValidate(normalized) || uuidVersion(normalized) !== 4) return null;
  return normalized;
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isValidId(value) {
  return normalizeId(value) !== null;
}

module.exports = {
  UUID_V4_REGEX,
  generateId,
  normalizeId,
  isValidId,
};
