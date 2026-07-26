'use strict';

const { eq, sql, desc, gte } = require('drizzle-orm');
const { getDb, getSqlite, schema } = require('../db/client');
const { generateId } = require('../utils/uuid');
const { clientMetaFromRequest } = require('../utils/clientMeta');
const { ensureVisitorKey } = require('../utils/visitor');

const { analyticsEvents, posts, reactions } = schema;

/** Soft cap so the table stays light (oldest rows pruned after insert). */
const MAX_EVENTS = Number(process.env.ANALYTICS_MAX_EVENTS) || 50000;

/**
 * Record a pageview (call once per session hit for a path/post).
 * @param {import('express').Request} req
 * @param {{ postId?: string|null, path?: string }} [opts]
 */
function recordPageview(req, opts = {}) {
  try {
    const db = getDb();
    const meta = clientMetaFromRequest(req);
    const visitorKey = req.session ? ensureVisitorKey(req) : '';
    const path = String(opts.path || meta.path || '').slice(0, 500);
    const postId = opts.postId || null;
    const ts = new Date().toISOString();

    db.insert(analyticsEvents)
      .values({
        id: generateId(),
        kind: 'pageview',
        path,
        postId,
        device: meta.device,
        region: meta.region,
        visitorKey: String(visitorKey).slice(0, 80),
        createdAt: ts,
      })
      .run();

    // Occasional prune (1 in 50 inserts) to avoid growth without a cron
    if (Math.random() < 0.02) {
      pruneOldEvents();
    }
  } catch (err) {
    // Never break page render for analytics
    // eslint-disable-next-line no-console
    console.warn('[analytics] record failed', err.message || err);
  }
}

function pruneOldEvents() {
  try {
    const raw = getSqlite();
    const row = raw.prepare('SELECT COUNT(*) AS c FROM analytics_events').get();
    const count = row?.c || 0;
    if (count <= MAX_EVENTS) return;
    const drop = count - MAX_EVENTS;
    raw
      .prepare(
        `DELETE FROM analytics_events WHERE id IN (
          SELECT id FROM analytics_events ORDER BY created_at ASC LIMIT ?
        )`
      )
      .run(drop);
  } catch {
    // ignore prune errors
  }
}

/**
 * Dashboard + analytics page payload.
 * @param {{ days?: number }} [opts]
 */
function getSummary(opts = {}) {
  const db = getDb();
  const days = Math.min(365, Math.max(1, Number(opts.days) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const totalViewsRow = db
    .select({
      total: sql`COALESCE(SUM(${posts.viewCount}), 0)`.mapWith(Number),
    })
    .from(posts)
    .get();

  const totalReactionsRow = db
    .select({
      total: sql`COUNT(*)`.mapWith(Number),
    })
    .from(reactions)
    .get();

  const eventsTotalRow = db
    .select({
      total: sql`COUNT(*)`.mapWith(Number),
    })
    .from(analyticsEvents)
    .get();

  const eventsRecentRow = db
    .select({
      total: sql`COUNT(*)`.mapWith(Number),
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .get();

  const topPosts = db
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      viewCount: posts.viewCount,
      status: posts.status,
    })
    .from(posts)
    .where(eq(posts.status, 'published'))
    .orderBy(desc(posts.viewCount))
    .limit(15)
    .all();

  // Reaction counts per post
  const reactionByPost = db
    .select({
      postId: reactions.postId,
      total: sql`COUNT(*)`.mapWith(Number),
    })
    .from(reactions)
    .groupBy(reactions.postId)
    .all();

  const reactionMap = Object.fromEntries(reactionByPost.map((r) => [r.postId, r.total]));

  const reactionByType = db
    .select({
      type: reactions.type,
      total: sql`COUNT(*)`.mapWith(Number),
    })
    .from(reactions)
    .groupBy(reactions.type)
    .all();

  const devices = db
    .select({
      device: analyticsEvents.device,
      total: sql`COUNT(*)`.mapWith(Number),
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(analyticsEvents.device)
    .orderBy(desc(sql`COUNT(*)`))
    .all();

  const regions = db
    .select({
      region: analyticsEvents.region,
      total: sql`COUNT(*)`.mapWith(Number),
    })
    .from(analyticsEvents)
    .where(gte(analyticsEvents.createdAt, since))
    .groupBy(analyticsEvents.region)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(20)
    .all();

  // Per-post reaction breakdown for top posts
  const postsWithEngagement = topPosts.map((p) => ({
    ...p,
    reactions: reactionMap[p.id] || 0,
  }));

  // Posts sorted by reactions
  const topByReactions = Object.entries(reactionMap)
    .map(([postId, total]) => {
      const p = db
        .select({
          id: posts.id,
          title: posts.title,
          slug: posts.slug,
          viewCount: posts.viewCount,
        })
        .from(posts)
        .where(eq(posts.id, postId))
        .get();
      return p ? { ...p, reactions: total } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.reactions - a.reactions)
    .slice(0, 10);

  // Daily pageviews (last N days) from analytics_events
  const raw = getSqlite();
  const daily = raw
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS total
       FROM analytics_events
       WHERE created_at >= ?
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC`
    )
    .all(since);

  return {
    days,
    since,
    totals: {
      views: totalViewsRow?.total || 0,
      reactions: totalReactionsRow?.total || 0,
      trackedEvents: eventsTotalRow?.total || 0,
      trackedRecent: eventsRecentRow?.total || 0,
    },
    topPosts: postsWithEngagement,
    topByReactions,
    reactionByType,
    devices,
    regions,
    daily,
  };
}

/**
 * Lightweight stats for main dashboard cards.
 */
function getQuickStats() {
  const db = getDb();
  const views = db
    .select({ total: sql`COALESCE(SUM(${posts.viewCount}), 0)`.mapWith(Number) })
    .from(posts)
    .get();
  const reacts = db
    .select({ total: sql`COUNT(*)`.mapWith(Number) })
    .from(reactions)
    .get();
  return {
    totalViews: views?.total || 0,
    totalReactions: reacts?.total || 0,
  };
}

module.exports = {
  recordPageview,
  getSummary,
  getQuickStats,
  pruneOldEvents,
  MAX_EVENTS,
};
