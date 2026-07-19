'use strict';

const { and, asc, desc, eq, sql } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId, isValidId } = require('../utils/uuid');
const { escapeHtml } = require('../utils/format');

const { comments, posts } = schema;

const BODY_MAX = 2000;
const NAME_MAX = 80;

/**
 * @param {string} postId
 */
function listApprovedForPost(postId) {
  if (!isValidId(postId)) return [];
  const db = getDb();
  return db
    .select({
      id: comments.id,
      authorName: comments.authorName,
      body: comments.body,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .where(and(eq(comments.postId, postId), eq(comments.status, 'approved')))
    .orderBy(asc(comments.createdAt))
    .all()
    .map((c) => ({
      ...c,
      bodyHtml: escapeHtml(c.body).replace(/\n/g, '<br>'),
    }));
}

/**
 * @param {{ status?: string, page?: number, limit?: number }} [opts]
 */
function listForAdmin(opts = {}) {
  const db = getDb();
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 30));
  const offset = (page - 1) * limit;
  const status = ['pending', 'approved', 'rejected', 'all'].includes(opts.status)
    ? opts.status
    : 'pending';

  const conditions = [];
  if (status !== 'all') {
    conditions.push(eq(comments.status, status));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const countRow = db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(comments)
    .where(where)
    .get();

  const rows = db
    .select({
      id: comments.id,
      postId: comments.postId,
      authorName: comments.authorName,
      authorEmail: comments.authorEmail,
      body: comments.body,
      status: comments.status,
      createdAt: comments.createdAt,
      postTitle: posts.title,
      postSlug: posts.slug,
    })
    .from(comments)
    .leftJoin(posts, eq(comments.postId, posts.id))
    .where(where)
    .orderBy(desc(comments.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const total = countRow?.count || 0;
  return {
    items: rows,
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    statusFilter: status,
  };
}

function countPending() {
  const db = getDb();
  const row = db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(comments)
    .where(eq(comments.status, 'pending'))
    .get();
  return row?.count || 0;
}

/**
 * @param {{ postId: string, authorName: string, authorEmail?: string, body: string }} input
 */
function createPending(input) {
  const name = String(input.authorName || '').trim().slice(0, NAME_MAX);
  const email = String(input.authorEmail || '').trim().slice(0, 200);
  const body = String(input.body || '').trim().slice(0, BODY_MAX);

  if (!isValidId(input.postId)) {
    throw Object.assign(new Error('Invalid post'), { status: 400 });
  }
  if (!name || name.length < 2) {
    throw Object.assign(new Error('Name is required (min 2 characters)'), { status: 400 });
  }
  if (!body || body.length < 3) {
    throw Object.assign(new Error('Comment is too short'), { status: 400 });
  }

  const db = getDb();
  const post = db.select({ id: posts.id }).from(posts).where(eq(posts.id, input.postId)).get();
  if (!post) {
    throw Object.assign(new Error('Post not found'), { status: 404 });
  }

  const id = generateId();
  const ts = new Date().toISOString();
  db.insert(comments)
    .values({
      id,
      postId: input.postId,
      authorName: name,
      authorEmail: email,
      body,
      status: 'pending',
      createdAt: ts,
    })
    .run();

  return { id, status: 'pending' };
}

/**
 * @param {string} id
 * @param {'approved'|'rejected'|'pending'} status
 */
function setStatus(id, status) {
  if (!isValidId(id)) return false;
  if (!['approved', 'rejected', 'pending'].includes(status)) return false;
  const db = getDb();
  const result = db.update(comments).set({ status }).where(eq(comments.id, id)).run();
  return result.changes > 0;
}

function deleteComment(id) {
  if (!isValidId(id)) return false;
  const db = getDb();
  const result = db.delete(comments).where(eq(comments.id, id)).run();
  return result.changes > 0;
}

function getById(id) {
  if (!isValidId(id)) return null;
  const db = getDb();
  return db.select().from(comments).where(eq(comments.id, id)).get() || null;
}

module.exports = {
  BODY_MAX,
  NAME_MAX,
  listApprovedForPost,
  listForAdmin,
  countPending,
  createPending,
  setStatus,
  deleteComment,
  getById,
};
