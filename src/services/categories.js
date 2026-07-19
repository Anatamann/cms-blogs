'use strict';

const { eq, asc } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId } = require('../utils/uuid');
const { ensureUniqueSlug, isValidSlug, slugify } = require('../utils/slug');

const { categories } = schema;

function listCategories() {
  const db = getDb();
  return db.select().from(categories).orderBy(asc(categories.name)).all();
}

function getBySlug(slug) {
  const db = getDb();
  return db.select().from(categories).where(eq(categories.slug, slug)).get() || null;
}

function getById(id) {
  const db = getDb();
  return db.select().from(categories).where(eq(categories.id, id)).get() || null;
}

async function slugExists(slug, excludeId) {
  const row = getBySlug(slug);
  if (!row) return false;
  if (excludeId && row.id === excludeId) return false;
  return true;
}

/**
 * @param {{ name: string, slug?: string, description?: string }} input
 */
async function createCategory(input) {
  const db = getDb();
  const id = generateId();
  const slug = await ensureUniqueSlug(input.slug || input.name, (c) => slugExists(c));

  if (!isValidSlug(slug)) {
    throw Object.assign(new Error(`Invalid or reserved slug: ${slug}`), { status: 400 });
  }

  db.insert(categories)
    .values({
      id,
      name: input.name,
      slug,
      description: input.description || '',
      createdAt: new Date().toISOString(),
    })
    .run();

  return getById(id);
}

/**
 * @param {string} id
 * @param {{ name?: string, slug?: string, description?: string }} input
 */
async function updateCategory(id, input) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;

  /** @type {Record<string, unknown>} */
  const patch = {};
  if (input.name != null) patch.name = input.name;
  if (input.description != null) patch.description = input.description;

  if (input.slug != null) {
    const normalized = slugify(input.slug);
    if (!isValidSlug(normalized)) {
      throw Object.assign(new Error(`Invalid or reserved slug: ${normalized}`), { status: 400 });
    }
    if (await slugExists(normalized, id)) {
      throw Object.assign(new Error(`Slug already taken: ${normalized}`), { status: 409 });
    }
    patch.slug = normalized;
  }

  if (Object.keys(patch).length) {
    db.update(categories).set(patch).where(eq(categories.id, id)).run();
  }

  return getById(id);
}

function deleteCategory(id) {
  const db = getDb();
  const result = db.delete(categories).where(eq(categories.id, id)).run();
  return result.changes > 0;
}

module.exports = {
  listCategories,
  getBySlug,
  getById,
  slugExists,
  createCategory,
  updateCategory,
  deleteCategory,
};
