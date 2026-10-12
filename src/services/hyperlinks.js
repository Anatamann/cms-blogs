'use strict';

const { eq, and, asc } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId } = require('../utils/uuid');
const {
  applyManagedLinksWithCounts,
  isValidLinkUrl,
} = require('../utils/managedLinks');
const { renderMarkdown } = require('../utils/markdown');

const { postHyperlinks, posts } = schema;

function listByPost(postId) {
  const db = getDb();
  return db
    .select()
    .from(postHyperlinks)
    .where(eq(postHyperlinks.postId, postId))
    .orderBy(asc(postHyperlinks.word))
    .all();
}

function getById(id) {
  const db = getDb();
  return db.select().from(postHyperlinks).where(eq(postHyperlinks.id, id)).get() || null;
}

function getByPostAndWord(postId, word) {
  const db = getDb();
  return (
    db
      .select()
      .from(postHyperlinks)
      .where(and(eq(postHyperlinks.postId, postId), eq(postHyperlinks.word, word)))
      .get() || null
  );
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
function parseMaxOccurrences(raw) {
  if (raw == null || raw === '' || raw === 'all' || raw === 'All') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.floor(n), 10000);
}

/**
 * @param {{ postId: string, word: string, url: string, maxOccurrences?: number|null|string }} input
 */
function create(input) {
  const db = getDb();
  const postId = String(input.postId || '');
  const word = String(input.word || '');
  // Preserve exact word (case-sensitive); only trim ends.
  const trimmedWord = word.trim();
  const url = String(input.url || '').trim();

  if (!postId) {
    throw Object.assign(new Error('Post id is required'), { status: 400 });
  }
  if (!trimmedWord) {
    throw Object.assign(new Error('Word is required'), { status: 400 });
  }
  if (!isValidLinkUrl(url)) {
    throw Object.assign(
      new Error('URL must be http(s), mailto, or a site path starting with /'),
      { status: 400 }
    );
  }

  const post = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get();
  if (!post) {
    throw Object.assign(new Error('Post not found'), { status: 404 });
  }

  if (getByPostAndWord(postId, trimmedWord)) {
    throw Object.assign(new Error(`A hyperlink rule for “${trimmedWord}” already exists`), {
      status: 409,
    });
  }

  const id = generateId();
  const maxOccurrences = parseMaxOccurrences(input.maxOccurrences);
  const now = new Date().toISOString();

  db.insert(postHyperlinks)
    .values({
      id,
      postId,
      word: trimmedWord,
      url,
      maxOccurrences,
      linkedCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  recomputeCounts(postId);
  return getById(id);
}

/**
 * @param {string} id
 * @param {{ word?: string, url?: string, maxOccurrences?: number|null|string }} input
 */
function update(id, input) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;

  /** @type {Record<string, unknown>} */
  const patch = { updatedAt: new Date().toISOString() };

  if (input.word != null) {
    const trimmedWord = String(input.word).trim();
    if (!trimmedWord) {
      throw Object.assign(new Error('Word is required'), { status: 400 });
    }
    if (trimmedWord !== existing.word) {
      const clash = getByPostAndWord(existing.postId, trimmedWord);
      if (clash && clash.id !== id) {
        throw Object.assign(new Error(`A hyperlink rule for “${trimmedWord}” already exists`), {
          status: 409,
        });
      }
    }
    patch.word = trimmedWord;
  }

  if (input.url != null) {
    const url = String(input.url).trim();
    if (!isValidLinkUrl(url)) {
      throw Object.assign(
        new Error('URL must be http(s), mailto, or a site path starting with /'),
        { status: 400 }
      );
    }
    patch.url = url;
  }

  if (input.maxOccurrences !== undefined) {
    patch.maxOccurrences = parseMaxOccurrences(input.maxOccurrences);
  }

  db.update(postHyperlinks).set(patch).where(eq(postHyperlinks.id, id)).run();
  recomputeCounts(existing.postId);
  return getById(id);
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function remove(id) {
  const existing = getById(id);
  if (!existing) return false;
  const db = getDb();
  db.delete(postHyperlinks).where(eq(postHyperlinks.id, id)).run();
  recomputeCounts(existing.postId);
  return true;
}

/**
 * Recompute linked_count for every rule on a post from current body Markdown.
 * @param {string} postId
 */
function recomputeCounts(postId) {
  const db = getDb();
  const post = db
    .select({ bodyMd: posts.bodyMd })
    .from(posts)
    .where(eq(posts.id, postId))
    .get();
  if (!post) return;

  const rules = listByPost(postId);
  if (!rules.length) return;

  const html = renderMarkdown(post.bodyMd || '');
  const { counts } = applyManagedLinksWithCounts(
    html,
    rules.map((r) => ({
      id: r.id,
      word: r.word,
      url: r.url,
      maxOccurrences: r.maxOccurrences,
    }))
  );

  const now = new Date().toISOString();
  for (const rule of rules) {
    const linkedCount = counts.get(rule.id) || 0;
    db.update(postHyperlinks)
      .set({ linkedCount, updatedAt: now })
      .where(eq(postHyperlinks.id, rule.id))
      .run();
  }
}

/**
 * Render body Markdown then apply this post's managed links.
 * @param {string} bodyMd
 * @param {string|null|undefined} postId
 * @returns {string}
 */
function renderBodyHtml(bodyMd, postId) {
  const html = renderMarkdown(bodyMd || '');
  if (!postId) return html;
  const rules = listByPost(postId);
  if (!rules.length) return html;
  return applyManagedLinksWithCounts(
    html,
    rules.map((r) => ({
      id: r.id,
      word: r.word,
      url: r.url,
      maxOccurrences: r.maxOccurrences,
    }))
  ).html;
}

module.exports = {
  listByPost,
  getById,
  getByPostAndWord,
  create,
  update,
  remove,
  recomputeCounts,
  renderBodyHtml,
  parseMaxOccurrences,
};
