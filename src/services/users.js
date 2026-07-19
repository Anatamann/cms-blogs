'use strict';

const bcrypt = require('bcryptjs');
const { eq } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId } = require('../utils/uuid');

const { users } = schema;

function getById(id) {
  const db = getDb();
  return db.select().from(users).where(eq(users.id, id)).get() || null;
}

function getByUsername(username) {
  const db = getDb();
  return db.select().from(users).where(eq(users.username, username)).get() || null;
}

function listUsers() {
  const db = getDb();
  return db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      bio: users.bio,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .all();
}

/**
 * @param {{ username: string, passwordHash: string, displayName: string, bio?: string, id?: string }} input
 */
function createUser(input) {
  const db = getDb();
  const id = input.id || generateId();
  const ts = new Date().toISOString();

  db.insert(users)
    .values({
      id,
      username: input.username,
      passwordHash: input.passwordHash,
      displayName: input.displayName,
      bio: input.bio || '',
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  return getById(id);
}

/**
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object|null>} user row without passwordHash on success
 */
async function authenticate(username, password) {
  const user = getByUsername(String(username || '').trim());
  if (!user || !password) return null;

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return null;

  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
  };
}

/**
 * @param {string} id
 * @param {{ displayName?: string, bio?: string }} input
 */
function updateProfile(id, input) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;

  /** @type {Record<string, unknown>} */
  const patch = { updatedAt: new Date().toISOString() };
  if (input.displayName != null) patch.displayName = String(input.displayName).trim();
  if (input.bio != null) patch.bio = String(input.bio);

  db.update(users).set(patch).where(eq(users.id, id)).run();
  return getById(id);
}

module.exports = {
  getById,
  getByUsername,
  listUsers,
  createUser,
  authenticate,
  updateProfile,
};
