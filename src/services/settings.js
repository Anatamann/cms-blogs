'use strict';

const { eq } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');

const { settings } = schema;

function getAll() {
  const db = getDb();
  const rows = db.select().from(settings).all();
  /** @type {Record<string, string>} */
  const map = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

/**
 * @param {string} key
 * @param {string} [fallback]
 */
function get(key, fallback = '') {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  return row ? row.value : fallback;
}

/**
 * @param {string} key
 * @param {string} value
 */
function set(key, value) {
  const db = getDb();
  const ts = new Date().toISOString();
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();

  if (existing) {
    db.update(settings)
      .set({ value: String(value), updatedAt: ts })
      .where(eq(settings.key, key))
      .run();
  } else {
    db.insert(settings)
      .values({ key, value: String(value), updatedAt: ts })
      .run();
  }

  return get(key);
}

/**
 * @param {Record<string, string>} entries
 */
function setMany(entries) {
  for (const [key, value] of Object.entries(entries)) {
    set(key, value);
  }
  return getAll();
}

module.exports = {
  getAll,
  get,
  set,
  setMany,
};
