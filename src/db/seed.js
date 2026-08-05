'use strict';

/**
 * Seed / ensure production catalog for Ainme.
 *
 * - Runs after migrations (getDb applies all src/db/migrations).
 * - Safe to re-run: fills missing users, taxonomy, settings, and catalog posts.
 * - Catalog bodies live in src/db/seed-data/*.md + catalog.json (includes test blogs,
 *   work titles, and tags so Docker production cards show work names + #tags).
 *
 *   npm run db:seed
 *   AUTO_SEED=true npm start
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { eq, and } = require('drizzle-orm');

const config = require('../config');
const { getDb, closeDb, schema } = require('./client');
const { generateId, isValidId } = require('../utils/uuid');
const { isValidSlug, slugify } = require('../utils/slug');

const { users, posts, categories, tags, postCategories, postTags, settings } = schema;

const SEED_DATA_DIR = path.join(__dirname, 'seed-data');
const CATALOG_PATH = path.join(SEED_DATA_DIR, 'catalog.json');

/** Fixed UUIDs for base seed users / categories (tests + reproducible first install). */
const IDS = {
  /** Primary author — login `octopus`, display “Octopus Sensei” (was aria) */
  userOctopus: 'a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c',
  userGokun: 'b2c3d4e5-f6a7-4b81-9c0d-1e2f3a4b5c6d',
  catReviews: 'c3d4e5f6-a7b8-4c92-8d1e-2f3a4b5c6d7e',
  catNews: 'd4e5f6a7-b8c9-4d03-9e2f-3a4b5c6d7e8f',
  catTheories: 'e5f6a7b8-c9d0-4e14-af3a-4b5c6d7e8f90',
  // legacy aliases (same UUIDs)
  userAria: 'a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c',
  userKen: 'b2c3d4e5-f6a7-4b81-9c0d-1e2f3a4b5c6d',
};

// Never hardcode production passwords. Private .env provides SEED_* values.
// Fallback is a weak local-dev placeholder only (change immediately).
const DEFAULT_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'changeme';
const GOKUN_PASSWORD = process.env.SEED_GOKUN_PASSWORD || 'changeme';
const OCTOPUS_USERNAME = 'octopus';
const OCTOPUS_DISPLAY = 'Octopus Sensei';

const SITE_DESCRIPTION =
  'Ainme — Anime in Me. Reviews, recaps, and deep cuts for millennial fans: Berserk to DBZ, Eva to AoT, drama nights to cultured late-night rewatches.';

function nowIso() {
  return new Date().toISOString();
}

function workSlugFromTitle(workTitle) {
  const t = String(workTitle || '').trim();
  return t ? slugify(t) : '';
}

function loadCatalog() {
  if (!fs.existsSync(CATALOG_PATH)) {
    console.warn('[seed] No catalog.json at', CATALOG_PATH);
    return [];
  }
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  return Array.isArray(raw) ? raw : [];
}

function readBody(bodyFile) {
  if (!bodyFile) return '';
  const full = path.join(SEED_DATA_DIR, bodyFile);
  if (!fs.existsSync(full)) {
    console.warn('[seed] missing body file', bodyFile);
    return '';
  }
  return fs.readFileSync(full, 'utf8');
}

/**
 * Ensure a category row by slug.
 */
function ensureCategory(db, { id, name, slug, description }) {
  const existing = db.select().from(categories).where(eq(categories.slug, slug)).get();
  if (existing) return existing;
  const ts = nowIso();
  const row = {
    id: id && isValidId(id) ? id : generateId(),
    name,
    slug,
    description: description || '',
    createdAt: ts,
  };
  db.insert(categories).values(row).run();
  console.log('[seed] + category', slug);
  return row;
}

/**
 * Ensure a tag row by name/slug.
 */
function ensureTag(db, name) {
  const slug = slugify(name);
  if (!slug || !isValidSlug(slug)) {
    throw new Error(`Invalid tag name: ${name}`);
  }
  let row = db.select().from(tags).where(eq(tags.slug, slug)).get();
  if (row) return row;
  row = db
    .select()
    .from(tags)
    .all()
    .find((t) => t.name.toLowerCase() === String(name).toLowerCase());
  if (row) return row;
  const ts = nowIso();
  row = {
    id: generateId(),
    name,
    slug,
    description: '',
    createdAt: ts,
  };
  db.insert(tags).values(row).run();
  console.log('[seed] + tag', name);
  return row;
}

function ensureSetting(db, key, value) {
  const existing = db.select().from(settings).where(eq(settings.key, key)).get();
  if (existing) return existing;
  db.insert(settings)
    .values({ key, value, updatedAt: nowIso() })
    .run();
  console.log('[seed] + setting', key);
  return { key, value };
}

function ensureUsers(db) {
  const ts = nowIso();
  const created = [];
  const octopusBio =
    'Anime in Me since the CRT days. Classics, gut-punch drama, mecha, and the shows you can still talk about at 2 a.m.';

  let octopus = db.select().from(users).where(eq(users.username, OCTOPUS_USERNAME)).get();
  if (!octopus) {
    // Rename legacy "aria" if present (keeps same UUID → posts stay linked)
    const aria = db.select().from(users).where(eq(users.username, 'aria')).get();
    if (aria) {
      db.update(users)
        .set({
          username: OCTOPUS_USERNAME,
          displayName: OCTOPUS_DISPLAY,
          bio: aria.bio || octopusBio,
          updatedAt: ts,
        })
        .where(eq(users.id, aria.id))
        .run();
      created.push('octopus(from aria)');
      console.log('[seed] renamed aria → octopus (Octopus Sensei)');
      octopus = db.select().from(users).where(eq(users.id, aria.id)).get();
    } else {
      const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
      db.insert(users)
        .values({
          id: IDS.userOctopus,
          username: OCTOPUS_USERNAME,
          passwordHash,
          displayName: OCTOPUS_DISPLAY,
          bio: octopusBio,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      created.push(OCTOPUS_USERNAME);
      console.log('[seed] + user', OCTOPUS_USERNAME, `(${OCTOPUS_DISPLAY})`);
    }
  } else {
    /** @type {Record<string, unknown>} */
    const patch = {};
    if (octopus.displayName !== OCTOPUS_DISPLAY) {
      patch.displayName = OCTOPUS_DISPLAY;
    }
    // Optional: reset password when SEED_RESET_OCTOPUS_PASSWORD=true (or always set from SEED_ADMIN_PASSWORD in non-prod)
    if (
      process.env.SEED_RESET_OCTOPUS_PASSWORD === 'true' ||
      process.env.SEED_RESET_OCTOPUS_PASSWORD === '1'
    ) {
      patch.passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
      console.log('[seed] ~ octopus password reset from SEED_ADMIN_PASSWORD');
    }
    if (Object.keys(patch).length) {
      patch.updatedAt = ts;
      db.update(users).set(patch).where(eq(users.id, octopus.id)).run();
      if (patch.displayName) console.log('[seed] ~ display name →', OCTOPUS_DISPLAY);
    }
  }

  const gokun = db.select().from(users).where(eq(users.username, 'gokun')).get();
  if (!gokun) {
    // Rename legacy "ken" if present
    const ken = db.select().from(users).where(eq(users.username, 'ken')).get();
    if (ken) {
      const passwordHash = bcrypt.hashSync(GOKUN_PASSWORD, 10);
      db.update(users)
        .set({
          username: 'gokun',
          displayName: 'Gokun Earthling',
          passwordHash,
          bio: 'Seasonal hype, action arcs, and the group-chat arguments that never really end.',
          updatedAt: ts,
        })
        .where(eq(users.id, ken.id))
        .run();
      created.push('gokun(from ken)');
      console.log('[seed] renamed ken → gokun');
    } else {
      const passwordHash = bcrypt.hashSync(GOKUN_PASSWORD, 10);
      db.insert(users)
        .values({
          id: IDS.userGokun,
          username: 'gokun',
          passwordHash,
          displayName: 'Gokun Earthling',
          bio: 'Seasonal hype, action arcs, and the group-chat arguments that never really end.',
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      created.push('gokun');
      console.log('[seed] + user gokun');
    }
  }

  return created;
}

function ensureTaxonomy(db) {
  ensureCategory(db, {
    id: IDS.catReviews,
    name: 'Reviews',
    slug: 'reviews',
    description: 'Spoiler-aware takes on full series, seasons, and specials.',
  });
  ensureCategory(db, {
    id: IDS.catNews,
    name: 'News',
    slug: 'news',
    description: 'Chart moments, drops, and fandom noise worth your weeknights.',
  });
  ensureCategory(db, {
    id: IDS.catTheories,
    name: 'Fan Theories',
    slug: 'fan-theories',
    description: 'Late-night speculation with receipts — mild spoilers when needed.',
  });

  // Genre tags used by catalog (and sidebar)
  const genreNames = [
    'Mecha',
    'Shonen',
    'Classic',
    'Action',
    'Comedy',
    'Isekai',
    'Romantic Drama',
    'Periodic',
    'Rom-Com',
    'ecchi',
    'sports',
  ];
  for (const name of genreNames) {
    ensureTag(db, name);
  }
}

function ensureSettings(db) {
  ensureSetting(db, 'site_title', config.siteName || 'Ainme');
  ensureSetting(db, 'site_description', SITE_DESCRIPTION);
  ensureSetting(db, 'posts_per_page', '10');
}

function linkCategory(db, postId, categoryId) {
  const exists = db
    .select()
    .from(postCategories)
    .where(and(eq(postCategories.postId, postId), eq(postCategories.categoryId, categoryId)))
    .get();
  if (!exists) {
    db.insert(postCategories).values({ postId, categoryId }).run();
  }
}

function linkTag(db, postId, tagId) {
  const exists = db
    .select()
    .from(postTags)
    .where(and(eq(postTags.postId, postId), eq(postTags.tagId, tagId)))
    .get();
  if (!exists) {
    db.insert(postTags).values({ postId, tagId }).run();
  }
}

/**
 * Insert missing catalog posts; backfill work_title / work_slug / tags on existing rows.
 */
function ensureCatalogPosts(db) {
  const catalog = loadCatalog();
  if (!catalog.length) {
    console.warn('[seed] catalog empty — no feature posts ensured');
    return { inserted: 0, updated: 0 };
  }

  const author =
    db.select().from(users).where(eq(users.username, OCTOPUS_USERNAME)).get() ||
    db.select().from(users).where(eq(users.username, 'aria')).get() ||
    db.select().from(users).all()[0];
  if (!author) {
    throw new Error('[seed] No author user available for catalog posts');
  }

  const catBySlug = Object.fromEntries(
    db
      .select()
      .from(categories)
      .all()
      .map((c) => [c.slug, c])
  );

  let inserted = 0;
  let updated = 0;
  const ts = nowIso();

  for (const item of catalog) {
    if (!item.slug || !isValidSlug(item.slug)) {
      console.warn('[seed] skip invalid catalog slug', item.slug);
      continue;
    }

    const workTitle = String(item.workTitle || '').trim();
    const workSlug = item.workSlug || workSlugFromTitle(workTitle);
    const bodyMd = readBody(item.bodyFile) || `# ${item.title}\n\n`;
    const excerpt = item.excerpt || '';

    let post = db.select().from(posts).where(eq(posts.slug, item.slug)).get();

    if (!post) {
      const id = generateId();
      db.insert(posts)
        .values({
          id,
          slug: item.slug,
          title: item.title,
          excerpt,
          bodyMd,
          coverImage: '',
          backdropImages: '[]',
          workTitle,
          workSlug,
          status: 'published',
          authorId: author.id,
          publishedAt: ts,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      post = db.select().from(posts).where(eq(posts.id, id)).get();
      inserted += 1;
      console.log('[seed] + post', item.slug, workTitle ? `(${workTitle})` : '');
    } else {
      // Backfill work title / slug and empty excerpts so cards show correctly
      const patch = {};
      if (workTitle && !post.workTitle) patch.workTitle = workTitle;
      if (workSlug && !post.workSlug) patch.workSlug = workSlug;
      if (excerpt && !post.excerpt) patch.excerpt = excerpt;
      // If body is tiny placeholder and we have a richer seed file, upgrade once
      if (bodyMd.length > (post.bodyMd || '').length + 50) {
        patch.bodyMd = bodyMd;
      }
      if (Object.keys(patch).length) {
        patch.updatedAt = ts;
        db.update(posts).set(patch).where(eq(posts.id, post.id)).run();
        updated += 1;
        console.log('[seed] ~ post', item.slug, Object.keys(patch).join(','));
      }
    }

    for (const cslug of item.categorySlugs || []) {
      const cat = catBySlug[cslug];
      if (cat) linkCategory(db, post.id, cat.id);
    }

    for (const tname of item.tagNames || []) {
      const tag = ensureTag(db, tname);
      linkTag(db, post.id, tag.id);
    }
  }

  // Draft fixture for tests (only on empty-ish installs)
  const draft = db.select().from(posts).where(eq(posts.slug, 'work-in-progress-notes')).get();
  if (!draft) {
    const gokun =
      db.select().from(users).where(eq(users.username, 'gokun')).get() || author;
    db.insert(posts)
      .values({
        id: generateId(),
        slug: 'work-in-progress-notes',
        title: 'Work in Progress Notes',
        excerpt: 'Draft only — should not appear on the public blog list.',
        bodyMd: '# Draft\n\nInvisible to public queries that filter on `published`.',
        coverImage: '',
        backdropImages: '[]',
        workTitle: '',
        workSlug: '',
        status: 'draft',
        authorId: gokun.id,
        publishedAt: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    console.log('[seed] + draft work-in-progress-notes');
  }

  return { inserted, updated };
}

/**
 * Full seed / ensure. Always applies migrations via getDb first.
 * Idempotent: safe on every boot when AUTO_SEED=true.
 */
async function seed() {
  // Migrations: 0000…0005 applied inside getDb()
  const db = getDb();

  console.log(`[seed] Ensuring production catalog → ${config.databasePath}`);
  console.log('[seed] Migrations folder: src/db/migrations (applied on getDb)');

  ensureUsers(db);
  ensureTaxonomy(db);
  ensureSettings(db);
  const catalogResult = ensureCatalogPosts(db);

  const pubCount = db
    .select()
    .from(posts)
    .all()
    .filter((p) => p.status === 'published').length;
  const tagCount = db.select().from(tags).all().length;

  console.log(
    `[seed] Done. published=${pubCount} tags=${tagCount} catalog +${catalogResult.inserted} ~${catalogResult.updated}`
  );
  // Never print passwords to logs (Docker/CI may capture stdout).
  console.log(
    `[seed] Authors: ${OCTOPUS_USERNAME} (${OCTOPUS_DISPLAY}), gokun — passwords from env only (not logged)`
  );
  console.log('[seed] Feature slugs include: dr-stone, mushoku-tensei, oshi-no-ko, evangelion…');

  return {
    skipped: false,
    inserted: catalogResult.inserted,
    updated: catalogResult.updated,
    ids: IDS,
  };
}

if (require.main === module) {
  seed()
    .then(() => {
      closeDb();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed] Failed:', err);
      closeDb();
      process.exit(1);
    });
}

module.exports = { seed, IDS, ensureCatalogPosts, loadCatalog };
