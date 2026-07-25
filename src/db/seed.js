'use strict';

/**
 * Seed deterministic sample data for development.
 * Safe to re-run: skips if primary seed user already exists.
 *
 *   npm run db:seed
 */

const path = require('path');
// Load env before config/db
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const { eq } = require('drizzle-orm');

const config = require('../config');
const { getDb, closeDb, schema } = require('./client');
const { isValidId } = require('../utils/uuid');
const { isValidSlug } = require('../utils/slug');

const { users, posts, categories, tags, postCategories, postTags, settings } = schema;

/** Fixed UUIDs (valid v4, lowercase canonical) for reproducible seeds and tests. */
const IDS = {
  userAria: 'a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c',
  userKen: 'b2c3d4e5-f6a7-4b81-9c0d-1e2f3a4b5c6d',
  catReviews: 'c3d4e5f6-a7b8-4c92-8d1e-2f3a4b5c6d7e',
  catNews: 'd4e5f6a7-b8c9-4d03-9e2f-3a4b5c6d7e8f',
  catTheories: 'e5f6a7b8-c9d0-4e14-af3a-4b5c6d7e8f90',
  tagMecha: 'f6a7b8c9-d0e1-4f25-8a4b-5c6d7e8f9012',
  tagShonen: 'a7b8c9d0-e1f2-4066-8b5c-6d7e8f901234',
  tagClassic: 'b8c9d0e1-f2a3-4177-9c6d-7e8f90123456',
  postWelcome: 'c9d0e1f2-a3b4-4288-ad7e-8f9012345678',
  postEva: 'd0e1f2a3-b4c5-4399-be8f-90123456789a',
  postNews: 'e1f2a3b4-c5d6-44aa-8f90-123456789abc',
  postDraft: 'f2a3b4c5-d6e7-45bb-9012-3456789abcde',
  postTheory: 'a3b4c5d6-e7f8-46cc-a123-456789abcdef',
};

const DEFAULT_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'changeme';

function assertCleanIds() {
  for (const [name, id] of Object.entries(IDS)) {
    if (!isValidId(id)) {
      throw new Error(`Seed UUID invalid for ${name}: ${id}`);
    }
  }
}

function assertCleanSlugs(slugs) {
  for (const slug of slugs) {
    if (!isValidSlug(slug)) {
      throw new Error(`Seed slug invalid or reserved: ${slug}`);
    }
  }
}

async function seed() {
  assertCleanIds();
  assertCleanSlugs([
    'welcome-to-ainme',
    'neon-genesis-evangelion-review',
    'spring-season-spotlight',
    'work-in-progress-notes',
    'who-is-the-lcl',
    'reviews',
    'news',
    'fan-theories',
    'mecha',
    'shonen',
    'classic',
  ]);

  const db = getDb();

  const existing = db.select().from(users).where(eq(users.username, 'aria')).get();
  if (existing) {
    console.log('[seed] Already seeded (user "aria" exists). Skipping.');
    return { skipped: true };
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const ts = new Date().toISOString();

  console.log(`[seed] Writing sample data → ${config.databasePath}`);

  db.insert(users)
    .values([
      {
        id: IDS.userAria,
        username: 'aria',
        passwordHash,
        displayName: 'Aria Neon',
        bio: 'Anime in Me since the CRT days. Classics, gut-punch drama, mecha, and the shows you can still talk about at 2 a.m.',
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: IDS.userKen,
        username: 'gokun',
        passwordHash: await bcrypt.hash('Gokun', 10),
        displayName: 'Gokun Earthling',
        bio: 'Seasonal hype, action arcs, and the group-chat arguments that never really end.',
        createdAt: ts,
        updatedAt: ts,
      },
    ])
    .run();

  db.insert(categories)
    .values([
      {
        id: IDS.catReviews,
        name: 'Reviews',
        slug: 'reviews',
        description: 'Spoiler-aware takes on full series, seasons, and specials.',
        createdAt: ts,
      },
      {
        id: IDS.catNews,
        name: 'News',
        slug: 'news',
        description: 'Chart moments, drops, and fandom noise worth your weeknights.',
        createdAt: ts,
      },
      {
        id: IDS.catTheories,
        name: 'Fan Theories',
        slug: 'fan-theories',
        description: 'Late-night speculation with receipts — mild spoilers when needed.',
        createdAt: ts,
      },
    ])
    .run();

  db.insert(tags)
    .values([
      { id: IDS.tagMecha, name: 'Mecha', slug: 'mecha', description: '', createdAt: ts },
      { id: IDS.tagShonen, name: 'Shonen', slug: 'shonen', description: '', createdAt: ts },
      { id: IDS.tagClassic, name: 'Classic', slug: 'classic', description: '', createdAt: ts },
    ])
    .run();

  db.insert(settings)
    .values([
      { key: 'site_title', value: config.siteName, updatedAt: ts },
      {
        key: 'site_description',
        value:
          'Ainme — Anime in Me. Reviews, recaps, and deep cuts for millennial fans: Berserk to DBZ, Eva to AoT, drama nights to cultured late-night rewatches.',
        updatedAt: ts,
      },
      { key: 'posts_per_page', value: '10', updatedAt: ts },
    ])
    .run();

  db.insert(posts)
    .values([
      {
        id: IDS.postWelcome,
        slug: 'welcome-to-ainme',
        title: 'Welcome to the feed',
        excerpt: 'Ainme means Anime in Me — who we are, what we watch, and why this couch never gets cold.',
        bodyMd: [
          '# Welcome to the feed',
          '',
          '**Ainme** = **Anime in Me**. The name is the thesis.',
          '',
          'If you can talk all day about *Berserk*, *Monster*, *Dragon Ball*, and *Neon Genesis Evangelion* — then pivot to early-2000s and 2010s heat like *Akame ga Kill!*, *Attack on Titan*, *Your Lie in April*, and the unapologetically “cultured” late-night shelf (*High School DxD*, we’re looking at you) — you’re home.',
          '',
          'We write reviews, recaps, news, and theory spirals with the volume up. No gatekeeping on era or genre. If it’s in you, it belongs here.',
          '',
          'Grab a seat on the virtual couch.',
        ].join('\n'),
        status: 'published',
        authorId: IDS.userAria,
        publishedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: IDS.postEva,
        slug: 'neon-genesis-evangelion-review',
        title: 'Neon Genesis Evangelion Review',
        excerpt: 'A classic mecha series that still rewires your brain.',
        bodyMd: [
          '# Neon Genesis Evangelion',
          '',
          'Instrumentality, entry plugs, and the sound of a dying city.',
          '',
          '## Verdict',
          '',
          'Essential. Rewatch with a notebook.',
        ].join('\n'),
        status: 'published',
        authorId: IDS.userAria,
        publishedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: IDS.postNews,
        slug: 'spring-season-spotlight',
        title: 'Spring Season Spotlight',
        excerpt: 'Three shows worth your weeknights this season.',
        bodyMd: [
          '# Spring Season Spotlight',
          '',
          '1. The unexpected rom-com that still hits like a 90s OVA',
          '2. The slow-burn mecha for late-night rewatches',
          '3. The short-form series you can finish before bed',
        ].join('\n'),
        status: 'published',
        authorId: IDS.userKen,
        publishedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: IDS.postTheory,
        slug: 'who-is-the-lcl',
        title: 'Who Is the LCL?',
        excerpt: 'A friendly spiral into Eva lore (mild spoilers).',
        bodyMd: [
          '# Who Is the LCL?',
          '',
          'Not a person — a sea of life. Here is why that still messes with viewers.',
        ].join('\n'),
        status: 'published',
        authorId: IDS.userAria,
        publishedAt: ts,
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: IDS.postDraft,
        slug: 'work-in-progress-notes',
        title: 'Work in Progress Notes',
        excerpt: 'Draft only — should not appear on the public blog list.',
        bodyMd: '# Draft\n\nInvisible to public queries that filter on `published`.',
        status: 'draft',
        authorId: IDS.userKen,
        publishedAt: null,
        createdAt: ts,
        updatedAt: ts,
      },
    ])
    .run();

  db.insert(postCategories)
    .values([
      { postId: IDS.postWelcome, categoryId: IDS.catNews },
      { postId: IDS.postEva, categoryId: IDS.catReviews },
      { postId: IDS.postNews, categoryId: IDS.catNews },
      { postId: IDS.postTheory, categoryId: IDS.catTheories },
      { postId: IDS.postDraft, categoryId: IDS.catNews },
    ])
    .run();

  db.insert(postTags)
    .values([
      { postId: IDS.postEva, tagId: IDS.tagMecha },
      { postId: IDS.postEva, tagId: IDS.tagClassic },
      { postId: IDS.postTheory, tagId: IDS.tagMecha },
      { postId: IDS.postNews, tagId: IDS.tagShonen },
      { postId: IDS.postWelcome, tagId: IDS.tagClassic },
    ])
    .run();

  console.log('[seed] Done.');
  console.log(
    `[seed] Admin logins: aria / ${DEFAULT_PASSWORD} · gokun / Gokun`
  );
  console.log('[seed] Sample public slugs: welcome-to-ainme, neon-genesis-evangelion-review, …');

  return { skipped: false, ids: IDS };
}

if (require.main === module) {
  seed()
    .then((result) => {
      closeDb();
      process.exit(result.skipped ? 0 : 0);
    })
    .catch((err) => {
      console.error('[seed] Failed:', err);
      closeDb();
      process.exit(1);
    });
}

module.exports = { seed, IDS };
