'use strict';

const { eq, asc, desc } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId, isValidId } = require('../utils/uuid');
const {
  fetchPreview,
  cacheImage,
  detectProvider,
  assertSafeHttpUrl,
  displayImage,
  ASPECT_RATIOS,
} = require('./socialPreview');

const { socialPosts, socialHomePins } = schema;
const MAX_HOME_PINS = 10;

function listAll() {
  const db = getDb();
  return db.select().from(socialPosts).orderBy(asc(socialPosts.sortOrder), desc(socialPosts.createdAt)).all();
}

function listActive() {
  const db = getDb();
  return db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.status, 'active'))
    .orderBy(asc(socialPosts.sortOrder), desc(socialPosts.createdAt))
    .all();
}

function getById(id) {
  const db = getDb();
  return db.select().from(socialPosts).where(eq(socialPosts.id, id)).get() || null;
}

/**
 * @param {Record<string, unknown>} input
 */
function normalizeAspect(input) {
  const a = String(input.aspectRatio || input.aspect_ratio || '').trim();
  if (!ASPECT_RATIOS.includes(a)) {
    throw Object.assign(new Error('Pick a card size: Wide 19:6, Square 1:1, or Tall 6:19'), {
      status: 400,
    });
  }
  return a;
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ requireUrl?: boolean }} [opts]
 */
function normalizeInput(input, opts = {}) {
  const sourceUrl = String(input.sourceUrl || input.source_url || '').trim();
  if (opts.requireUrl !== false) {
    if (!sourceUrl) {
      throw Object.assign(new Error('Source URL is required'), { status: 400 });
    }
    assertSafeHttpUrl(sourceUrl);
  }
  const title = String(input.title || '').trim().slice(0, 300);
  const description = String(input.description || '').trim().slice(0, 1000);
  const imageUrl = String(input.imageUrl || input.image_url || '').trim().slice(0, 1000);
  const status = input.status === 'paused' ? 'paused' : 'active';
  const aspectRatio = normalizeAspect(input);
  const provider =
    String(input.provider || '').trim() || (sourceUrl ? detectProvider(sourceUrl) : 'generic');
  const sortOrder = Number.isFinite(Number(input.sortOrder))
    ? Math.floor(Number(input.sortOrder))
    : 0;

  return {
    sourceUrl,
    title,
    description,
    imageUrl,
    status,
    aspectRatio,
    provider: ['youtube', 'x', 'generic'].includes(provider) ? provider : 'generic',
    sortOrder,
  };
}

/**
 * @param {Record<string, unknown>} input
 */
async function create(input) {
  const db = getDb();
  const parsed = normalizeInput(input, { requireUrl: true });
  const id = generateId();
  const now = new Date().toISOString();

  let cachedImagePath = '';
  let previewFetchedAt = null;
  let previewRaw = '';

  if (input.previewRaw) {
    previewRaw = String(input.previewRaw).slice(0, 4000);
    previewFetchedAt = now;
  }

  if (parsed.imageUrl && /^https?:\/\//i.test(parsed.imageUrl)) {
    cachedImagePath = (await cacheImage(parsed.imageUrl, id)) || '';
  } else if (parsed.imageUrl.startsWith('/uploads/')) {
    cachedImagePath = '';
  }

  db.insert(socialPosts)
    .values({
      id,
      ...parsed,
      cachedImagePath,
      previewFetchedAt,
      previewRaw,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getById(id);
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} input
 */
async function update(id, input) {
  const existing = getById(id);
  if (!existing) return null;

  const parsed = normalizeInput(
    {
      sourceUrl: input.sourceUrl != null ? input.sourceUrl : existing.sourceUrl,
      title: input.title != null ? input.title : existing.title,
      description: input.description != null ? input.description : existing.description,
      imageUrl: input.imageUrl != null ? input.imageUrl : existing.imageUrl,
      status: input.status != null ? input.status : existing.status,
      aspectRatio: input.aspectRatio != null ? input.aspectRatio : existing.aspectRatio,
      provider: input.provider != null ? input.provider : existing.provider,
      sortOrder: input.sortOrder != null ? input.sortOrder : existing.sortOrder,
    },
    { requireUrl: true }
  );

  const now = new Date().toISOString();
  /** @type {Record<string, unknown>} */
  const patch = { ...parsed, updatedAt: now };

  if (input.previewRaw != null) {
    patch.previewRaw = String(input.previewRaw).slice(0, 4000);
    patch.previewFetchedAt = now;
  }

  const imageChanged = parsed.imageUrl !== existing.imageUrl;
  if (imageChanged && parsed.imageUrl && /^https?:\/\//i.test(parsed.imageUrl)) {
    patch.cachedImagePath = (await cacheImage(parsed.imageUrl, id)) || '';
  } else if (imageChanged && !parsed.imageUrl) {
    patch.cachedImagePath = '';
  }

  const db = getDb();
  db.update(socialPosts).set(patch).where(eq(socialPosts.id, id)).run();
  return getById(id);
}

function remove(id) {
  const existing = getById(id);
  if (!existing) return false;
  const db = getDb();
  db.delete(socialPosts).where(eq(socialPosts.id, id)).run();
  return true;
}

/**
 * @param {string} sourceUrl
 */
async function previewFromUrl(sourceUrl) {
  return fetchPreview(sourceUrl);
}

function listHomePins() {
  const db = getDb();
  const pins = db
    .select()
    .from(socialHomePins)
    .orderBy(asc(socialHomePins.sortOrder))
    .all();
  return pins.map((pin) => ({
    id: pin.id,
    socialPostId: pin.socialPostId,
    sortOrder: pin.sortOrder,
    post: getById(pin.socialPostId),
  }));
}

/**
 * Active pinned posts for the home carousel (max 10).
 */
function listHomeCarousel() {
  return listHomePins()
    .filter((p) => p.post && p.post.status === 'active')
    .slice(0, MAX_HOME_PINS)
    .map((p) => p.post);
}

/**
 * Replace home pins with ordered post ids (max 10).
 * @param {string[]} postIds
 */
function setHomePins(postIds) {
  const db = getDb();
  const ids = (Array.isArray(postIds) ? postIds : [])
    .map(String)
    .filter(isValidId)
    .slice(0, MAX_HOME_PINS);

  for (const id of ids) {
    if (!getById(id)) {
      throw Object.assign(new Error('One of the pinned posts was not found'), { status: 400 });
    }
  }

  const { getSqlite } = require('../db/client');
  getSqlite().prepare('DELETE FROM social_home_pins').run();
  const now = new Date().toISOString();
  ids.forEach((socialPostId, sortOrder) => {
    db.insert(socialHomePins)
      .values({
        id: generateId(),
        socialPostId,
        sortOrder,
        createdAt: now,
      })
      .run();
  });

  return listHomePins();
}

function presentCard(post) {
  if (!post) return null;
  return {
    ...post,
    displayImage: displayImage(post),
    aspectClass:
      post.aspectRatio === 'wide'
        ? 'social-card--wide'
        : post.aspectRatio === 'tall'
          ? 'social-card--tall'
          : 'social-card--square',
  };
}

module.exports = {
  MAX_HOME_PINS,
  ASPECT_RATIOS,
  listAll,
  listActive,
  getById,
  create,
  update,
  remove,
  previewFromUrl,
  listHomePins,
  listHomeCarousel,
  setHomePins,
  presentCard,
  displayImage,
};
