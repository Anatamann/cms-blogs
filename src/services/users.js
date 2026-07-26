'use strict';

const bcrypt = require('bcryptjs');
const { eq, sql } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId } = require('../utils/uuid');
const config = require('../config');

const { users, posts } = schema;

const USERNAME_RE = /^[a-z][a-z0-9_]{2,31}$/;

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
 * Authors with post counts for admin UI.
 */
function listUsersWithStats() {
  const db = getDb();
  const all = listUsers();
  return all.map((u) => {
    const row = db
      .select({ count: sql`count(*)`.mapWith(Number) })
      .from(posts)
      .where(eq(posts.authorId, u.id))
      .get();
    return {
      ...u,
      postCount: row?.count || 0,
      isSuperAdmin: config.isSuperAdmin(u),
    };
  });
}

function countPostsByAuthor(authorId) {
  const db = getDb();
  const row = db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(posts)
    .where(eq(posts.authorId, authorId))
    .get();
  return row?.count || 0;
}

/**
 * @param {string} username
 * @returns {{ ok: true, username: string } | { ok: false, error: string }}
 */
function normalizeUsername(username) {
  const u = String(username || '')
    .trim()
    .toLowerCase();
  if (!USERNAME_RE.test(u)) {
    return {
      ok: false,
      error:
        'Username must be 3–32 chars, start with a letter, and use only a–z, 0–9, underscore.',
    };
  }
  return { ok: true, username: u };
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
 * Create author with plain password (hashed here).
 * @param {{ username: string, password: string, displayName: string, bio?: string }} input
 */
async function createAuthor(input) {
  const un = normalizeUsername(input.username);
  if (!un.ok) {
    throw Object.assign(new Error(un.error), { status: 400 });
  }
  if (getByUsername(un.username)) {
    throw Object.assign(new Error('That username is already taken.'), { status: 400 });
  }
  const displayName = String(input.displayName || '').trim();
  if (!displayName || displayName.length > 120) {
    throw Object.assign(new Error('Display name is required (max 120 characters).'), {
      status: 400,
    });
  }
  const password = String(input.password || '');
  if (password.length < 4) {
    throw Object.assign(new Error('Password must be at least 4 characters.'), { status: 400 });
  }
  if (password.length > 200) {
    throw Object.assign(new Error('Password is too long.'), { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  return createUser({
    username: un.username,
    passwordHash,
    displayName,
    bio: String(input.bio || '').trim().slice(0, 2000),
  });
}

/**
 * @param {string} username
 * @param {string} password
 * @returns {Promise<object|null>} user row without passwordHash on success
 */
async function authenticate(username, password) {
  const user = getByUsername(String(username || '').trim().toLowerCase());
  if (!user || !password) return null;

  const ok = await bcrypt.compare(String(password), user.passwordHash);
  if (!ok) return null;

  return sessionUser(user);
}

function sessionUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    bio: user.bio,
    isSuperAdmin: config.isSuperAdmin(user),
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
  if (input.displayName != null) {
    const dn = String(input.displayName).trim();
    if (!dn || dn.length > 120) {
      throw Object.assign(new Error('Display name is required (max 120 characters).'), {
        status: 400,
      });
    }
    patch.displayName = dn;
  }
  if (input.bio != null) patch.bio = String(input.bio).slice(0, 2000);

  db.update(users).set(patch).where(eq(users.id, id)).run();
  return getById(id);
}

/**
 * Super-admin author update (profile + optional password).
 * @param {string} id
 * @param {{ displayName?: string, bio?: string, password?: string }} input
 */
async function updateAuthor(id, input) {
  const existing = getById(id);
  if (!existing) {
    throw Object.assign(new Error('Author not found.'), { status: 404 });
  }

  updateProfile(id, {
    displayName: input.displayName != null ? input.displayName : existing.displayName,
    bio: input.bio != null ? input.bio : existing.bio,
  });

  const password = input.password != null ? String(input.password) : '';
  if (password) {
    if (password.length < 4) {
      throw Object.assign(new Error('Password must be at least 4 characters.'), { status: 400 });
    }
    await setPassword(id, password);
  }

  return getById(id);
}

/**
 * @param {string} id
 * @param {string} plainPassword
 */
async function setPassword(id, plainPassword) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;
  const passwordHash = await bcrypt.hash(String(plainPassword), 10);
  db.update(users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run();
  return getById(id);
}

/**
 * Delete author only if they have zero posts and are not a configured super admin.
 * @param {string} id
 * @param {{ actorId?: string }} [opts]
 */
function deleteAuthor(id, opts = {}) {
  const existing = getById(id);
  if (!existing) {
    throw Object.assign(new Error('Author not found.'), { status: 404 });
  }
  if (config.isSuperAdmin(existing)) {
    throw Object.assign(
      new Error('Cannot delete a super-admin account (listed in SUPER_ADMIN_USERNAMES).'),
      { status: 400 }
    );
  }
  if (opts.actorId && opts.actorId === id) {
    throw Object.assign(new Error('You cannot delete your own account.'), { status: 400 });
  }
  const n = countPostsByAuthor(id);
  if (n > 0) {
    throw Object.assign(
      new Error(
        `This author still has ${n} post(s). Reassign or delete those posts first.`
      ),
      { status: 400 }
    );
  }
  const db = getDb();
  db.delete(users).where(eq(users.id, id)).run();
  return true;
}

module.exports = {
  getById,
  getByUsername,
  listUsers,
  listUsersWithStats,
  countPostsByAuthor,
  createUser,
  createAuthor,
  authenticate,
  sessionUser,
  updateProfile,
  updateAuthor,
  setPassword,
  deleteAuthor,
  normalizeUsername,
  USERNAME_RE,
};
