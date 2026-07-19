'use strict';

const { and, desc, eq, inArray, like, or, sql } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId } = require('../utils/uuid');
const { ensureUniqueSlug, isValidSlug, slugify } = require('../utils/slug');

const { posts, users, categories, tags, postCategories, postTags } = schema;

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string} slug
 * @param {string} [excludeId]
 */
async function slugExists(slug, excludeId) {
  const db = getDb();
  const row = db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.slug, slug))
    .get();

  if (!row) return false;
  if (excludeId && row.id === excludeId) return false;
  return true;
}

/**
 * @param {string} titleOrSlug
 * @param {string} [excludeId]
 */
async function allocateSlug(titleOrSlug, excludeId) {
  const base = slugify(titleOrSlug);
  if (!base) {
    throw Object.assign(new Error('Invalid slug source'), { status: 400 });
  }

  return ensureUniqueSlug(base, async (candidate) => {
    if (!isValidSlug(candidate) && candidate !== base) {
      // ensureUniqueSlug may produce valid candidates; reserved still blocked inside helper
    }
    return slugExists(candidate, excludeId);
  });
}

/**
 * Attach categories + tags + author for a list of post rows.
 * @param {Array<Record<string, unknown>>} postRows
 */
function hydratePosts(postRows) {
  if (!postRows.length) return [];

  const db = getDb();
  const ids = postRows.map((p) => p.id);

  const authorIds = [...new Set(postRows.map((p) => p.authorId))];
  const authorRows = db.select().from(users).where(inArray(users.id, authorIds)).all();
  const authorsById = Object.fromEntries(authorRows.map((a) => [a.id, a]));

  const catLinks = db
    .select({
      postId: postCategories.postId,
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
    })
    .from(postCategories)
    .innerJoin(categories, eq(postCategories.categoryId, categories.id))
    .where(inArray(postCategories.postId, ids))
    .all();

  const tagLinks = db
    .select({
      postId: postTags.postId,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, ids))
    .all();

  const catsByPost = groupBy(catLinks, 'postId');
  const tagsByPost = groupBy(tagLinks, 'postId');

  return postRows.map((p) => ({
    ...p,
    author: authorsById[p.authorId]
      ? {
          id: authorsById[p.authorId].id,
          username: authorsById[p.authorId].username,
          displayName: authorsById[p.authorId].displayName,
          bio: authorsById[p.authorId].bio,
        }
      : null,
    categories: (catsByPost[p.id] || []).map(({ id, name, slug }) => ({ id, name, slug })),
    tags: (tagsByPost[p.id] || []).map(({ id, name, slug }) => ({ id, name, slug })),
  }));
}

function groupBy(rows, key) {
  /** @type {Record<string, typeof rows>} */
  const map = {};
  for (const row of rows) {
    const k = row[key];
    if (!map[k]) map[k] = [];
    map[k].push(row);
  }
  return map;
}

/**
 * @param {{ page?: number, limit?: number, categorySlug?: string, tagSlug?: string, q?: string, status?: 'published'|'draft'|'all' }} opts
 */
function listPosts(opts = {}) {
  const db = getDb();
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(opts.limit) || 10));
  const offset = (page - 1) * limit;
  const status = opts.status || 'published';

  /** @type {import('drizzle-orm').SQL[]} */
  const conditions = [];

  if (status !== 'all') {
    conditions.push(eq(posts.status, status));
  }

  if (opts.q) {
    const term = `%${opts.q}%`;
    conditions.push(or(like(posts.title, term), like(posts.excerpt, term), like(posts.bodyMd, term)));
  }

  let filteredIds = null;

  if (opts.categorySlug) {
    const cat = db.select().from(categories).where(eq(categories.slug, opts.categorySlug)).get();
    if (!cat) {
      return { items: [], page, limit, total: 0, totalPages: 0 };
    }
    const links = db
      .select({ postId: postCategories.postId })
      .from(postCategories)
      .where(eq(postCategories.categoryId, cat.id))
      .all();
    filteredIds = new Set(links.map((l) => l.postId));
  }

  if (opts.tagSlug) {
    const tag = db.select().from(tags).where(eq(tags.slug, opts.tagSlug)).get();
    if (!tag) {
      return { items: [], page, limit, total: 0, totalPages: 0 };
    }
    const links = db
      .select({ postId: postTags.postId })
      .from(postTags)
      .where(eq(postTags.tagId, tag.id))
      .all();
    const tagIds = new Set(links.map((l) => l.postId));
    filteredIds = filteredIds
      ? new Set([...filteredIds].filter((id) => tagIds.has(id)))
      : tagIds;
  }

  if (filteredIds) {
    if (filteredIds.size === 0) {
      return { items: [], page, limit, total: 0, totalPages: 0 };
    }
    conditions.push(inArray(posts.id, [...filteredIds]));
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const countRow = db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(posts)
    .where(whereClause)
    .get();

  const total = countRow?.count || 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  const rows = db
    .select()
    .from(posts)
    .where(whereClause)
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return {
    items: hydratePosts(rows),
    page,
    limit,
    total,
    totalPages,
  };
}

/**
 * Public read by slug (published only by default).
 * @param {string} slug
 * @param {{ includeDrafts?: boolean }} [opts]
 */
function getBySlug(slug, opts = {}) {
  const db = getDb();
  const conditions = [eq(posts.slug, slug)];
  if (!opts.includeDrafts) {
    conditions.push(eq(posts.status, 'published'));
  }

  const row = db
    .select()
    .from(posts)
    .where(and(...conditions))
    .get();

  if (!row) return null;
  return hydratePosts([row])[0];
}

/**
 * Admin read by UUID.
 * @param {string} id
 */
function getById(id) {
  const db = getDb();
  const row = db.select().from(posts).where(eq(posts.id, id)).get();
  if (!row) return null;
  return hydratePosts([row])[0];
}

/**
 * Increment public view counter.
 * @param {string} id post UUID
 * @returns {number|null} new count, or null if missing
 */
function incrementViewCount(id) {
  if (!id) return null;
  const db = getDb();
  db.update(posts)
    .set({ viewCount: sql`COALESCE(${posts.viewCount}, 0) + 1` })
    .where(eq(posts.id, id))
    .run();
  const row = db.select({ viewCount: posts.viewCount }).from(posts).where(eq(posts.id, id)).get();
  return row ? row.viewCount : null;
}

/**
 * @param {{
 *   title: string,
 *   slug?: string,
 *   excerpt?: string,
 *   bodyMd?: string,
 *   status?: 'draft'|'published',
 *   authorId: string,
 *   categoryIds?: string[],
 *   tagIds?: string[],
 * }} input
 */
async function createPost(input) {
  const db = getDb();
  const id = generateId();
  const slugSource = input.slug || input.title;
  const slug = await allocateSlug(slugSource);

  if (!isValidSlug(slug)) {
    throw Object.assign(new Error(`Invalid or reserved slug: ${slug}`), { status: 400 });
  }

  const status = input.status === 'published' ? 'published' : 'draft';
  const ts = nowIso();
  const publishedAt = status === 'published' ? ts : null;

  db.insert(posts)
    .values({
      id,
      slug,
      title: input.title,
      excerpt: input.excerpt || '',
      bodyMd: input.bodyMd || '',
      status,
      authorId: input.authorId,
      viewCount: 0,
      publishedAt,
      createdAt: ts,
      updatedAt: ts,
    })
    .run();

  setTaxonomies(id, input.categoryIds || [], input.tagIds || []);
  return getById(id);
}

/**
 * @param {string} id
 * @param {{
 *   title?: string,
 *   slug?: string,
 *   excerpt?: string,
 *   bodyMd?: string,
 *   status?: 'draft'|'published',
 *   categoryIds?: string[],
 *   tagIds?: string[],
 *   updateSlug?: boolean,
 * }} input
 */
async function updatePost(id, input) {
  const db = getDb();
  const existing = db.select().from(posts).where(eq(posts.id, id)).get();
  if (!existing) return null;

  /** @type {Record<string, unknown>} */
  const patch = { updatedAt: nowIso() };

  if (input.title != null) patch.title = input.title;
  if (input.excerpt != null) patch.excerpt = input.excerpt;
  if (input.bodyMd != null) patch.bodyMd = input.bodyMd;

  if (input.updateSlug && (input.slug || input.title)) {
    const slug = await allocateSlug(input.slug || input.title, id);
    if (!isValidSlug(slug)) {
      throw Object.assign(new Error(`Invalid or reserved slug: ${slug}`), { status: 400 });
    }
    patch.slug = slug;
  } else if (input.slug != null && input.slug !== existing.slug) {
    // Explicit slug change without updateSlug flag still allowed if valid + unique
    const normalized = slugify(input.slug);
    if (!isValidSlug(normalized)) {
      throw Object.assign(new Error(`Invalid or reserved slug: ${normalized}`), { status: 400 });
    }
    if (await slugExists(normalized, id)) {
      throw Object.assign(new Error(`Slug already taken: ${normalized}`), { status: 409 });
    }
    patch.slug = normalized;
  }

  if (input.status === 'published' || input.status === 'draft') {
    patch.status = input.status;
    if (input.status === 'published' && !existing.publishedAt) {
      patch.publishedAt = nowIso();
    }
    if (input.status === 'draft') {
      // keep publishedAt history; public queries filter on status
    }
  }

  db.update(posts).set(patch).where(eq(posts.id, id)).run();

  if (input.categoryIds || input.tagIds) {
    setTaxonomies(
      id,
      input.categoryIds !== undefined ? input.categoryIds : undefined,
      input.tagIds !== undefined ? input.tagIds : undefined
    );
  }

  return getById(id);
}

/**
 * @param {string} id
 * @param {string[]|undefined} categoryIds
 * @param {string[]|undefined} tagIds
 */
function setTaxonomies(id, categoryIds, tagIds) {
  const db = getDb();

  if (categoryIds) {
    db.delete(postCategories).where(eq(postCategories.postId, id)).run();
    for (const categoryId of categoryIds) {
      db.insert(postCategories).values({ postId: id, categoryId }).run();
    }
  }

  if (tagIds) {
    db.delete(postTags).where(eq(postTags.postId, id)).run();
    for (const tagId of tagIds) {
      db.insert(postTags).values({ postId: id, tagId }).run();
    }
  }
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function deletePost(id) {
  const db = getDb();
  const result = db.delete(posts).where(eq(posts.id, id)).run();
  return result.changes > 0;
}

module.exports = {
  slugExists,
  allocateSlug,
  listPosts,
  getBySlug,
  getById,
  incrementViewCount,
  createPost,
  updatePost,
  deletePost,
};
