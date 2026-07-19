'use strict';

/** Max length after normalization (see product conventions). */
const SLUG_MAX_LENGTH = 120;

/** Slugs that must not collide with static/public routes. */
const RESERVED_SLUGS = new Set([
  'admin',
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
  search: (q) => (q ? `/search?q=${encodeURIComponent(q)}` : '/search'),
  archive: () => '/archive',
  about: () => '/about',
  contact: () => '/contact',
  rss: () => '/rss.xml',
  sitemap: () => '/sitemap.xml',
  admin: {
    home: () => '/admin',
    login: () => '/admin/login',
    logout: () => '/admin/logout',
    posts: () => '/admin/posts',
    postNew: () => '/admin/posts/new',
    /** Admin edit uses UUID id (stable if slug changes). */
    postEdit: (id) => `/admin/posts/${id}/edit`,
    postDelete: (id) => `/admin/posts/${id}/delete`,
    postPreview: (id) => `/admin/posts/${id}/preview`,
    media: () => '/admin/media',
    mediaUpload: () => '/admin/media/upload',
    mediaDelete: (id) => `/admin/media/${id}/delete`,
    mediaAlt: (id) => `/admin/media/${id}/alt`,
    settings: () => '/admin/settings',
  },
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
