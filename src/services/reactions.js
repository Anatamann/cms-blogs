'use strict';

const { and, eq, sql } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId, isValidId } = require('../utils/uuid');

const { reactions, posts } = schema;

/** Fixed reaction set for the public UI. */
const REACTION_TYPES = [
  { type: 'like', label: 'Like', emoji: '👍' },
  { type: 'fire', label: 'Fire', emoji: '🔥' },
  { type: 'love', label: 'Love', emoji: '💜' },
  { type: 'wow', label: 'Wow', emoji: '😮' },
];

const TYPE_SET = new Set(REACTION_TYPES.map((r) => r.type));

/**
 * @param {string} postId
 * @param {string} [visitorKey]
 * @returns {{ types: typeof REACTION_TYPES, counts: Record<string, number>, mine: string[] }}
 */
function getForPost(postId, visitorKey) {
  const empty = {
    types: REACTION_TYPES,
    counts: Object.fromEntries(REACTION_TYPES.map((r) => [r.type, 0])),
    mine: [],
  };
  if (!isValidId(postId)) return empty;

  const db = getDb();
  const rows = db
    .select({
      type: reactions.type,
      count: sql`count(*)`.mapWith(Number),
    })
    .from(reactions)
    .where(eq(reactions.postId, postId))
    .groupBy(reactions.type)
    .all();

  const counts = { ...empty.counts };
  for (const row of rows) {
    if (TYPE_SET.has(row.type)) counts[row.type] = row.count;
  }

  let mine = [];
  if (visitorKey) {
    mine = db
      .select({ type: reactions.type })
      .from(reactions)
      .where(and(eq(reactions.postId, postId), eq(reactions.visitorKey, visitorKey)))
      .all()
      .map((r) => r.type);
  }

  return { types: REACTION_TYPES, counts, mine };
}

/**
 * Toggle a reaction for visitor on post.
 * @param {string} postId
 * @param {string} type
 * @param {string} visitorKey
 * @returns {{ active: boolean, counts: Record<string, number>, mine: string[] }}
 */
function toggle(postId, type, visitorKey) {
  if (!isValidId(postId) || !TYPE_SET.has(type) || !visitorKey) {
    throw Object.assign(new Error('Invalid reaction'), { status: 400 });
  }

  const db = getDb();
  const post = db.select({ id: posts.id }).from(posts).where(eq(posts.id, postId)).get();
  if (!post) {
    throw Object.assign(new Error('Post not found'), { status: 404 });
  }

  const existing = db
    .select()
    .from(reactions)
    .where(
      and(
        eq(reactions.postId, postId),
        eq(reactions.type, type),
        eq(reactions.visitorKey, visitorKey)
      )
    )
    .get();

  let active = false;
  if (existing) {
    db.delete(reactions).where(eq(reactions.id, existing.id)).run();
    active = false;
  } else {
    db.insert(reactions)
      .values({
        id: generateId(),
        postId,
        type,
        visitorKey,
        createdAt: new Date().toISOString(),
      })
      .run();
    active = true;
  }

  const state = getForPost(postId, visitorKey);
  return { active, counts: state.counts, mine: state.mine };
}

module.exports = {
  REACTION_TYPES,
  getForPost,
  toggle,
};
