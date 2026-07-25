'use strict';

const { eq, asc, sql } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId } = require('../utils/uuid');
const { ensureUniqueSlug, isValidSlug, slugify } = require('../utils/slug');

const { tags, postTags } = schema;

function listTags() {
  const db = getDb();
  return db.select().from(tags).orderBy(asc(tags.name)).all();
}

/**
 * Tags with post counts for admin UI.
 */
function listTagsWithCounts() {
  const db = getDb();
  const rows = db
    .select({
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
      description: tags.description,
      createdAt: tags.createdAt,
      postCount: sql`count(${postTags.postId})`.mapWith(Number),
    })
    .from(tags)
    .leftJoin(postTags, eq(tags.id, postTags.tagId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name))
    .all();
  return rows;
}

function getBySlug(slug) {
  const db = getDb();
  return db.select().from(tags).where(eq(tags.slug, slug)).get() || null;
}

function getById(id) {
  const db = getDb();
  return db.select().from(tags).where(eq(tags.id, id)).get() || null;
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
async function createTag(input) {
  const db = getDb();
  const id = generateId();
  const name = String(input.name || '').trim();
  if (!name) {
    throw Object.assign(new Error('Tag name is required'), { status: 400 });
  }
  const slug = await ensureUniqueSlug(input.slug || name, (c) => slugExists(c));

  if (!isValidSlug(slug)) {
    throw Object.assign(new Error(`Invalid or reserved slug: ${slug}`), { status: 400 });
  }

  db.insert(tags)
    .values({
      id,
      name,
      slug,
      description: String(input.description || '').trim(),
      createdAt: new Date().toISOString(),
    })
    .run();

  return getById(id);
}

/**
 * @param {string} id
 * @param {{ name?: string, slug?: string, description?: string }} input
 */
async function updateTag(id, input) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;

  /** @type {Record<string, unknown>} */
  const patch = {};
  if (input.name != null) {
    const name = String(input.name).trim();
    if (!name) {
      throw Object.assign(new Error('Tag name is required'), { status: 400 });
    }
    patch.name = name;
  }
  if (input.description != null) {
    patch.description = String(input.description).trim();
  }

  if (input.slug != null && String(input.slug).trim() !== '') {
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
    db.update(tags).set(patch).where(eq(tags.id, id)).run();
  }

  return getById(id);
}

function deleteTag(id) {
  const db = getDb();
  const result = db.delete(tags).where(eq(tags.id, id)).run();
  return result.changes > 0;
}

/**
 * Upsert tags by name (for bulk import). Does not overwrite existing descriptions unless empty.
 * @param {Array<{ name: string, description?: string }>} items
 */
async function upsertMany(items) {
  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const item of items) {
    const name = String(item.name || '').trim();
    if (!name) continue;
    const existing = getBySlug(slugify(name));
    if (existing) {
      // Match by slug of name; also try exact name list
      const byName = listTags().find((t) => t.name.toLowerCase() === name.toLowerCase());
      const row = byName || existing;
      if (item.description && !row.description) {
        await updateTag(row.id, { description: item.description });
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    // Check name case-insensitive
    const byName = listTags().find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (byName) {
      if (item.description && !byName.description) {
        await updateTag(byName.id, { description: item.description });
        updated += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    await createTag({ name, description: item.description || '' });
    created += 1;
  }

  return { created, skipped, updated };
}

module.exports = {
  listTags,
  listTagsWithCounts,
  getBySlug,
  getById,
  slugExists,
  createTag,
  updateTag,
  deleteTag,
  upsertMany,
};
