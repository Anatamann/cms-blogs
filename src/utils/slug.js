'use strict';

/** Max length after normalization (see product conventions). */
const SLUG_MAX_LENGTH = 120;

/** Slugs that must not collide with static/public routes. */
const RESERVED_SLUGS = new Set([
  'admin',
  'mantri',
  'blog',
  'search',
  'about',
  'contact',
  'archive',
  'rss',
  'sitemap',
  'api',
  'uploads',
  'login',
  'logout',
  'health',
  'new',
  'edit',
  'media',
  'settings',
  'comments',
  'reactions',
  'work',
  'category',
  'tag',
]);

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalize arbitrary input into a clean kebab-case slug.
 * @param {string} input
 * @returns {string}
 */
function slugify(input) {
  if (input == null) return '';

  let slug = String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (slug.length > SLUG_MAX_LENGTH) {
    slug = slug.slice(0, SLUG_MAX_LENGTH).replace(/-$/g, '');
  }

  return slug;
}

/**
 * @param {string} slug
 * @returns {boolean}
 */
function isValidSlug(slug) {
  if (typeof slug !== 'string' || slug.length === 0 || slug.length > SLUG_MAX_LENGTH) {
    return false;
  }
  if (RESERVED_SLUGS.has(slug)) return false;
  return SLUG_REGEX.test(slug);
}

/**
 * Ensure uniqueness by appending -2, -3, ... when needed.
 * @param {string} base
 * @param {(candidate: string) => boolean | Promise<boolean>} existsCheck true if taken
 * @returns {Promise<string>}
 */
async function ensureUniqueSlug(base, existsCheck) {
  const root = slugify(base);
  if (!root) {
    throw new Error('Cannot build slug from empty input');
  }

  let candidate = root;
  let n = 2;

  while (RESERVED_SLUGS.has(candidate) || (await existsCheck(candidate))) {
    const suffix = `-${n}`;
    const maxBase = SLUG_MAX_LENGTH - suffix.length;
    candidate = `${root.slice(0, maxBase)}${suffix}`;
    n += 1;
    if (n > 10000) {
      throw new Error('Unable to allocate a unique slug');
    }
  }

  return candidate;
}

/**
 * Canonical public URL path builders — keep routes consistent site-wide.
 * Public pages use slugs only; never UUIDs.
 */
const paths = {
  home: () => '/',
  blog: () => '/blog',
  blogPage: (page) => (page && Number(page) > 1 ? `/blog?page=${Number(page)}` : '/blog'),
  post: (slug) => `/blog/${slug}`,
  category: (slug) => `/category/${slug}`,
  tag: (slug) => `/tag/${slug}`,
  /** Anime/manga/work archive — slug from work title. */
  work: (slug) => `/work/${slug}`,
  workPage: (slug, page) =>
    page && Number(page) > 1 ? `/work/${slug}?page=${Number(page)}` : `/work/${slug}`,
  search: (q) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
  archive: () => '/archive',
  about: () => '/about',
  contact: () => '/contact',
  rss: () => '/rss.xml',
  sitemap: () => '/sitemap.xml',
  /** CMS base path is /mantri (not linked in public nav — type the URI). */
  admin: {
    home: () => '/mantri',
    login: () => '/mantri/login',
    logout: () => '/mantri/logout',
    posts: () => '/mantri/posts',
    postNew: () => '/mantri/posts/new',
    /** Edit uses UUID id (stable if slug changes). */
    postEdit: (id) => `/mantri/posts/${id}/edit`,
    postDelete: (id) => `/mantri/posts/${id}/delete`,
    /** Saved post preview (by UUID). */
    postPreview: (id) => `/mantri/posts/${id}/preview`,
    /** Form preview — current editor fields, not saved to DB. */
    postPreviewForm: () => '/mantri/posts/preview',
    /** Save editor draft to session, then continue (e.g. media library). */
    postDraft: () => '/mantri/posts/draft',
    media: () => '/mantri/media',
    mediaUpload: () => '/mantri/media/upload',
    mediaDelete: (id) => `/mantri/media/${id}/delete`,
    mediaAlt: (id) => `/mantri/media/${id}/alt`,
    settings: () => '/mantri/settings',
    tags: () => '/mantri/tags',
    tagNew: () => '/mantri/tags/new',
    tagEdit: (id) => `/mantri/tags/${id}/edit`,
    tagDelete: (id) => `/mantri/tags/${id}/delete`,
    tagsImport: () => '/mantri/tags/import',
    comments: () => '/mantri/comments',
    commentApprove: (id) => `/mantri/comments/${id}/approve`,
    commentReject: (id) => `/mantri/comments/${id}/reject`,
    commentDelete: (id) => `/mantri/comments/${id}/delete`,
  },
  /** Public engagement (slug-based, never UUID). */
  postComment: (slug) => `/blog/${slug}/comments`,
  postReaction: (slug) => `/blog/${slug}/reactions`,
};

module.exports = {
  SLUG_MAX_LENGTH,
  RESERVED_SLUGS,
  SLUG_REGEX,
  slugify,
  isValidSlug,
  ensureUniqueSlug,
  paths,
};
