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
    excerpt: text('excerpt').notNull().default(''),
    bodyMd: text('body_md').notNull().default(''),
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
};
