'use strict';

const { eq, asc, sql, inArray } = require('drizzle-orm');
const { getDb, schema } = require('../db/client');
const { generateId, isValidId } = require('../utils/uuid');

const { ads, postAdPlacements } = schema;

const MAX_PLACEMENTS = 3;
const MOBILE_SLOTS = new Set(['top', 'middle', 'bottom']);

function isValidPromoLink(url) {
  const u = String(url || '').trim();
  if (!u || /\s/.test(u)) return false;
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

function isValidImageUrl(url) {
  const u = String(url || '').trim();
  if (!u) return true; // optional
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

function listAds() {
  const db = getDb();
  return db.select().from(ads).orderBy(asc(ads.name)).all();
}

function listAdsWithUsage() {
  const db = getDb();
  return db
    .select({
      id: ads.id,
      name: ads.name,
      type: ads.type,
      status: ads.status,
      title: ads.title,
      imageUrl: ads.imageUrl,
      linkUrl: ads.linkUrl,
      adsenseClient: ads.adsenseClient,
      adsenseSlot: ads.adsenseSlot,
      adsenseFormat: ads.adsenseFormat,
      createdAt: ads.createdAt,
      updatedAt: ads.updatedAt,
      usageCount: sql`count(${postAdPlacements.id})`.mapWith(Number),
    })
    .from(ads)
    .leftJoin(postAdPlacements, eq(ads.id, postAdPlacements.adId))
    .groupBy(ads.id)
    .orderBy(asc(ads.name))
    .all();
}

function listActiveAds() {
  const db = getDb();
  return db
    .select()
    .from(ads)
    .where(eq(ads.status, 'active'))
    .orderBy(asc(ads.name))
    .all();
}

function getById(id) {
  const db = getDb();
  return db.select().from(ads).where(eq(ads.id, id)).get() || null;
}

/**
 * @param {{
 *   name: string,
 *   type?: string,
 *   status?: string,
 *   title?: string,
 *   imageUrl?: string,
 *   linkUrl?: string,
 *   adsenseClient?: string,
 *   adsenseSlot?: string,
 *   adsenseFormat?: string,
 * }} input
 */
function createAd(input) {
  const db = getDb();
  const parsed = normalizeAdInput(input, { requireName: true });
  const id = generateId();
  const now = new Date().toISOString();
  db.insert(ads)
    .values({
      id,
      ...parsed,
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
function updateAd(id, input) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;
  const parsed = normalizeAdInput(
    {
      name: input.name != null ? input.name : existing.name,
      type: input.type != null ? input.type : existing.type,
      status: input.status != null ? input.status : existing.status,
      title: input.title != null ? input.title : existing.title,
      imageUrl: input.imageUrl != null ? input.imageUrl : existing.imageUrl,
      linkUrl: input.linkUrl != null ? input.linkUrl : existing.linkUrl,
      adsenseClient:
        input.adsenseClient != null ? input.adsenseClient : existing.adsenseClient,
      adsenseSlot: input.adsenseSlot != null ? input.adsenseSlot : existing.adsenseSlot,
      adsenseFormat:
        input.adsenseFormat != null ? input.adsenseFormat : existing.adsenseFormat,
    },
    { requireName: true }
  );
  db.update(ads)
    .set({ ...parsed, updatedAt: new Date().toISOString() })
    .where(eq(ads.id, id))
    .run();
  return getById(id);
}

function removeAd(id) {
  const existing = getById(id);
  if (!existing) return false;
  const db = getDb();
  db.delete(ads).where(eq(ads.id, id)).run();
  return true;
}

function countUsage(adId) {
  const db = getDb();
  const row = db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(postAdPlacements)
    .where(eq(postAdPlacements.adId, adId))
    .get();
  return row?.count || 0;
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ requireName?: boolean }} [opts]
 */
function normalizeAdInput(input, opts = {}) {
  const name = String(input.name || '').trim().slice(0, 120);
  if (opts.requireName && !name) {
    throw Object.assign(new Error('Ad name is required'), { status: 400 });
  }
  const type = input.type === 'google' ? 'google' : 'promo';
  const status = input.status === 'paused' ? 'paused' : 'active';
  const title = String(input.title || '').trim().slice(0, 200);
  const imageUrl = String(input.imageUrl || '').trim().slice(0, 500);
  const linkUrl = String(input.linkUrl || '').trim().slice(0, 500);
  const adsenseClient = String(input.adsenseClient || '').trim().slice(0, 80);
  const adsenseSlot = String(input.adsenseSlot || '').trim().slice(0, 80);
  const adsenseFormat = String(input.adsenseFormat || '').trim().slice(0, 80);

  if (type === 'promo') {
    if (!isValidImageUrl(imageUrl)) {
      throw Object.assign(new Error('Image URL must be https or a /uploads path'), {
        status: 400,
      });
    }
    if (linkUrl && !isValidPromoLink(linkUrl)) {
      throw Object.assign(new Error('Link URL must be http(s) or a site path starting with /'), {
        status: 400,
      });
    }
  } else {
    if (!/^ca-pub-\d+$/i.test(adsenseClient) && adsenseClient) {
      // Allow empty while drafting; require both when active
    }
    if (status === 'active') {
      if (!/^ca-pub-\d+$/i.test(adsenseClient)) {
        throw Object.assign(new Error('Active Google ads need a client id like ca-pub-…'), {
          status: 400,
        });
      }
      if (!adsenseSlot) {
        throw Object.assign(new Error('Active Google ads need an AdSense slot id'), {
          status: 400,
        });
      }
    }
  }

  return {
    name: name || 'Untitled ad',
    type,
    status,
    title,
    imageUrl,
    linkUrl,
    adsenseClient,
    adsenseSlot,
    adsenseFormat,
  };
}

function listPlacementsByPost(postId) {
  const db = getDb();
  return db
    .select()
    .from(postAdPlacements)
    .where(eq(postAdPlacements.postId, postId))
    .orderBy(asc(postAdPlacements.sortOrder))
    .all();
}

/**
 * Resolved placements with ad creatives for public render.
 * Skips paused / missing ads.
 * @param {string} postId
 */
function getResolvedPlacementsForPost(postId) {
  const rows = listPlacementsByPost(postId);
  if (!rows.length) return [];
  const adIds = [...new Set(rows.map((r) => r.adId))];
  const db = getDb();
  const creatives = db.select().from(ads).where(inArray(ads.id, adIds)).all();
  const byId = new Map(creatives.map((a) => [a.id, a]));
  /** @type {Array<{ id: string, showDesktop: boolean, mobileSlot: string|null, sortOrder: number, ad: object }>} */
  const out = [];
  for (const row of rows) {
    const ad = byId.get(row.adId);
    if (!ad || ad.status !== 'active') continue;
    out.push({
      id: row.id,
      showDesktop: !!row.showDesktop,
      mobileSlot: row.mobileSlot || null,
      sortOrder: row.sortOrder,
      ad,
    });
  }
  return out;
}

/**
 * Replace all placements for a post (max 3).
 * @param {string} postId
 * @param {Array<{ adId: string, showDesktop?: boolean, mobileSlot?: string|null }>} items
 */
function setPlacementsForPost(postId, items) {
  const db = getDb();
  const list = Array.isArray(items) ? items : [];
  if (list.length > MAX_PLACEMENTS) {
    throw Object.assign(new Error(`At most ${MAX_PLACEMENTS} ads per post`), { status: 400 });
  }

  const normalized = [];
  const usedSlots = new Set();
  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i] || {};
    const adId = String(raw.adId || '').trim();
    if (!adId) continue;
    if (!isValidId(adId)) {
      throw Object.assign(new Error('Invalid ad id in placements'), { status: 400 });
    }
    const ad = getById(adId);
    if (!ad) {
      throw Object.assign(new Error('One of the selected ads was not found'), { status: 400 });
    }
    const showDesktop = raw.showDesktop === true || raw.showDesktop === 1 || raw.showDesktop === '1';
    let mobileSlot = raw.mobileSlot == null || raw.mobileSlot === '' || raw.mobileSlot === 'none'
      ? null
      : String(raw.mobileSlot);
    if (mobileSlot && !MOBILE_SLOTS.has(mobileSlot)) {
      throw Object.assign(new Error('Mobile slot must be top, middle, or bottom'), { status: 400 });
    }
    if (!showDesktop && !mobileSlot) {
      throw Object.assign(new Error('Each ad needs Desktop and/or a mobile slot'), { status: 400 });
    }
    if (mobileSlot) {
      if (usedSlots.has(mobileSlot)) {
        throw Object.assign(new Error(`Only one ad can use the mobile “${mobileSlot}” slot`), {
          status: 400,
        });
      }
      usedSlots.add(mobileSlot);
    }
    normalized.push({
      adId,
      showDesktop: showDesktop ? 1 : 0,
      mobileSlot,
      sortOrder: i,
    });
  }

  db.delete(postAdPlacements).where(eq(postAdPlacements.postId, postId)).run();
  const now = new Date().toISOString();
  for (const row of normalized) {
    db.insert(postAdPlacements)
      .values({
        id: generateId(),
        postId,
        adId: row.adId,
        showDesktop: row.showDesktop,
        mobileSlot: row.mobileSlot,
        sortOrder: row.sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  return listPlacementsByPost(postId);
}

/**
 * Parse placement fields from a multipart/urlencoded post form.
 * Expects adPlacementAdId[], adPlacementDesktop[], adPlacementMobile[] (parallel arrays)
 * or indexed adPlacements[0][adId] style — we use parallel arrays for EJS simplicity.
 * @param {import('express').Request} req
 */
function parsePlacementsFromRequest(req) {
  const body = req.body || {};
  let adIds = body.adPlacementAdId;
  let desktops = body.adPlacementDesktop;
  let mobiles = body.adPlacementMobile;
  if (adIds == null) return [];
  if (!Array.isArray(adIds)) adIds = [adIds];
  if (!Array.isArray(desktops)) desktops = desktops != null ? [desktops] : [];
  if (!Array.isArray(mobiles)) mobiles = mobiles != null ? [mobiles] : [];

  const items = [];
  for (let i = 0; i < adIds.length; i += 1) {
    const adId = String(adIds[i] || '').trim();
    if (!adId) continue;
    const deskRaw = desktops[i] != null ? String(desktops[i]) : '0';
    const showDesktop = deskRaw === '1' || deskRaw === 'on' || deskRaw === 'true';
    const mobileSlot = mobiles[i] != null ? mobiles[i] : 'none';
    items.push({ adId, showDesktop, mobileSlot });
  }
  return items;
}

module.exports = {
  MAX_PLACEMENTS,
  MOBILE_SLOTS,
  listAds,
  listAdsWithUsage,
  listActiveAds,
  getById,
  createAd,
  updateAd,
  removeAd,
  countUsage,
  listPlacementsByPost,
  getResolvedPlacementsForPost,
  setPlacementsForPost,
  parsePlacementsFromRequest,
  isValidPromoLink,
  isValidImageUrl,
};
