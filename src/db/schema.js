'use strict';

const { sqliteTable, text, integer, primaryKey, uniqueIndex, index } = require('drizzle-orm/sqlite-core');
const { sql } = require('drizzle-orm');

/**
 * All content PKs/FKs are canonical UUID v4 TEXT (lowercase 8-4-4-4-12).
 * Public URLs use slug columns — never these ids.
 */

const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey().notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    bio: text('bio').notNull().default(''),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    usernameUq: uniqueIndex('users_username_uq').on(t.username),
  })
);

const posts = sqliteTable(
  'posts',
  {
    id: text('id').primaryKey().notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    /** Anime / manga / game / similar work this post is about. */
    workTitle: text('work_title').notNull().default(''),
    /** Slug of work_title for /work/:slug archives (empty if no work). */
    workSlug: text('work_slug').notNull().default(''),
    excerpt: text('excerpt').notNull().default(''),
    bodyMd: text('body_md').notNull().default(''),
    /** Public path or absolute URL for Open Graph / share image */
    coverImage: text('cover_image').notNull().default(''),
    /** JSON array of backdrop still URLs for scroll bg (article progress bands) */
    backdropImages: text('backdrop_images').notNull().default('[]'),
    status: text('status').notNull().default('draft'), // draft | published
    authorId: text('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** Public view counter (simple integer; see incrementViewCount). */
    viewCount: integer('view_count').notNull().default(0),
    publishedAt: text('published_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    slugUq: uniqueIndex('posts_slug_uq').on(t.slug),
    statusIdx: index('posts_status_idx').on(t.status),
    publishedAtIdx: index('posts_published_at_idx').on(t.publishedAt),
    authorIdx: index('posts_author_id_idx').on(t.authorId),
    workSlugIdx: index('posts_work_slug_idx').on(t.workSlug),
  })
);

const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    slugUq: uniqueIndex('categories_slug_uq').on(t.slug),
  })
);

const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey().notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** Optional blurb for genre/topic pages (sidebar, archives). */
    description: text('description').notNull().default(''),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    slugUq: uniqueIndex('tags_slug_uq').on(t.slug),
  })
);

const postCategories = sqliteTable(
  'post_categories',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.categoryId] }),
  })
);

const postTags = sqliteTable(
  'post_tags',
  {
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.tagId] }),
  })
);

const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey().notNull(),
    filename: text('filename').notNull(),
    path: text('path').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull().default(0),
    width: integer('width'),
    height: integer('height'),
    type: text('type').notNull(), // image | gif | video
    alt: text('alt').notNull().default(''),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    typeIdx: index('media_type_idx').on(t.type),
  })
);

/** Key/value site settings — exception: string key PK, not UUID. */
const settings = sqliteTable('settings', {
  key: text('key').primaryKey().notNull(),
  value: text('value').notNull().default(''),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

/** Moderated comments — only status=approved shown publicly. */
const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey().notNull(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorName: text('author_name').notNull(),
    authorEmail: text('author_email').notNull().default(''),
    body: text('body').notNull(),
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    postIdx: index('comments_post_id_idx').on(t.postId),
    statusIdx: index('comments_status_idx').on(t.status),
  })
);

/**
 * Reactions — fixed types (like, fire, love, wow).
 * One row per visitorKey + post + type (toggle off = delete).
 */
const reactions = sqliteTable(
  'reactions',
  {
    id: text('id').primaryKey().notNull(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // like | fire | love | wow
    visitorKey: text('visitor_key').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    postTypeVisitorUq: uniqueIndex('reactions_post_type_visitor_uq').on(
      t.postId,
      t.type,
      t.visitorKey
    ),
    postIdx: index('reactions_post_id_idx').on(t.postId),
  })
);

/**
 * Lightweight analytics pageviews (device + region).
 * Totals for posts also use posts.view_count; reactions use reactions table.
 */
const analyticsEvents = sqliteTable(
  'analytics_events',
  {
    id: text('id').primaryKey().notNull(),
    kind: text('kind').notNull().default('pageview'),
    path: text('path').notNull().default(''),
    postId: text('post_id').references(() => posts.id, { onDelete: 'set null' }),
    device: text('device').notNull().default('unknown'), // desktop | mobile | tablet | bot
    region: text('region').notNull().default('XX'), // ISO-ish country or XX
    visitorKey: text('visitor_key').notNull().default(''),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => ({
    createdAtIdx: index('analytics_events_created_at_idx').on(t.createdAt),
    postIdx: index('analytics_events_post_id_idx').on(t.postId),
    deviceIdx: index('analytics_events_device_idx').on(t.device),
    regionIdx: index('analytics_events_region_idx').on(t.region),
  })
);

module.exports = {
  users,
  posts,
  categories,
  tags,
  postCategories,
  postTags,
  media,
  settings,
  comments,
  reactions,
  analyticsEvents,
};
