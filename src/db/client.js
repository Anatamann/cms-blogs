'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { drizzle } = require('drizzle-orm/better-sqlite3');
const { migrate } = require('drizzle-orm/better-sqlite3/migrator');

const config = require('../config');
const schema = require('./schema');

/** @type {import('better-sqlite3').Database | null} */
let sqlite = null;
/** @type {ReturnType<typeof drizzle> | null} */
let db = null;

function getDatabasePath() {
  return config.databasePath;
}

/**
 * Open SQLite, apply migrations, return Drizzle db instance.
 * Safe to call multiple times (singleton).
 */
function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(getDatabasePath()), { recursive: true });

  sqlite = new Database(getDatabasePath());
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  db = drizzle(sqlite, { schema });

  const migrationsFolder = path.join(__dirname, 'migrations');
  migrate(db, { migrationsFolder });

  return db;
}

function getSqlite() {
  getDb();
  return sqlite;
}

function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

/**
 * Lightweight readiness check for /health.
 * @returns {{ ok: boolean, path: string, error?: string }}
 */
function checkDb() {
  try {
    const raw = getSqlite();
    raw.prepare('SELECT 1 AS ok').get();
    return { ok: true, path: getDatabasePath() };
  } catch (err) {
    return {
      ok: false,
      path: getDatabasePath(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

module.exports = {
  getDb,
  getSqlite,
  closeDb,
  checkDb,
  getDatabasePath,
  schema,
};
