'use strict';

const config = require('../config');
const postsService = require('../services/posts');
const categoriesService = require('../services/categories');
const tagsService = require('../services/tags');
const settingsService = require('../services/settings');
const usersService = require('../services/users');
const commentsService = require('../services/comments');
const reactionsService = require('../services/reactions');
const { paths, isValidSlug, slugify } = require('../utils/slug');
const {
  renderMarkdown,
  plainExcerpt,
  truncateText,
  excerptDuplicatesBody,
  firstMarkdownImage,
} = require('../utils/markdown');
const { formatDate, escapeXml, absoluteUrl } = require('../utils/format');
const { ensureVisitorKey } = require('../utils/visitor');
const analyticsService = require('../services/analytics');

function siteMeta() {
  const all = settingsService.getAll();
  return {
    siteTitle: all.site_title || config.siteName,
    siteDescription:
      all.site_description ||
      'Ainme — Anime in Me. Reviews, recaps, and deep cuts for millennial fans: Berserk to DBZ, Eva to AoT, drama nights to cultured late-night rewatches.',
    postsPerPage: Math.min(50, Math.max(1, Number(all.posts_per_page) || 10)),
  };
}

function sidebarData() {
  return {
    categories: categoriesService.listCategories(),
    tags: tagsService.listTags(),
  };
}

function parsePage(query) {
  const n = Number(query.page);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

const CARD_EXCERPT_LEN = 150;
const DEFAULT_OG_PATH = '/images/og-default.svg';

function presentPostCard(post) {
  if (!post) return null;
  const workSlug =
    post.workSlug || (post.workTitle ? slugify(post.workTitle) : '');
  const rawExcerpt = post.excerpt || plainExcerpt(post.bodyMd, CARD_EXCERPT_LEN);
  return {
    ...post,
    excerpt: truncateText(rawExcerpt, CARD_EXCERPT_LEN),
    publishedLabel: formatDate(post.publishedAt || post.createdAt),
    url: paths.post(post.slug),
    workUrl: workSlug ? paths.work(workSlug) : null,
  };
}

/**
 * Absolute Open Graph image for a page/post.
 * @param {object|null} [post]
 */
function resolveOgImage(post) {
  if (post) {
    const cover = String(post.coverImage || '').trim();
    if (cover) {
      return cover.startsWith('http') ? cover : absoluteUrl(config.appUrl, cover);
    }
    const fromBody = firstMarkdownImage(post.bodyMd);
    if (fromBody) {
      return fromBody.startsWith('http')
        ? fromBody
        : absoluteUrl(config.appUrl, fromBody);
    }
  }
  return absoluteUrl(config.appUrl, DEFAULT_OG_PATH);
}

function presentPost(post) {
  if (!post) return null;
  const card = presentPostCard(post);
  return {
    ...card,
    bodyHtml: renderMarkdown(post.bodyMd),
    viewCount: Number(post.viewCount) || 0,
  };
}

function relatedPosts(post, limit = 3) {
  if (!post) return [];
  const seen = new Set([post.id]);
  /** @type {Array<ReturnType<typeof presentPostCard>>} */
  const related = [];

  for (const cat of post.categories || []) {
    const { items } = postsService.listPosts({
      status: 'published',
      categorySlug: cat.slug,
      limit: 6,
    });
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      related.push(presentPostCard(item));
      if (related.length >= limit) return related;
    }
  }

  for (const tag of post.tags || []) {
    const { items } = postsService.listPosts({
      status: 'published',
      tagSlug: tag.slug,
      limit: 6,
    });
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      related.push(presentPostCard(item));
      if (related.length >= limit) return related;
    }
  }

  if (related.length < limit) {
    const { items } = postsService.listPosts({ status: 'published', limit: 8 });
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      related.push(presentPostCard(item));
      if (related.length >= limit) break;
    }
  }

  return related;
}

function home(req, res) {
  const meta = siteMeta();
  const latest = postsService.listPosts({
    status: 'published',
    page: 1,
    limit: 6,
  });

  res.render('pages/home', {
    title: '', // brand only in <title> (avoid "Ainme · Ainme")
    metaDescription: meta.siteDescription,
    siteDescription: meta.siteDescription,
    canonicalUrl: absoluteUrl(config.appUrl, paths.home()),
    ogImage: resolveOgImage(null),
    posts: latest.items.map(presentPostCard),
    pageScripts: ['/js/home-scroll.js'],
    ...sidebarData(),
  });
}

function blogIndex(req, res) {
  const meta = siteMeta();
  const page = parsePage(req.query);
  const result = postsService.listPosts({
    status: 'published',
    page,
    limit: meta.postsPerPage,
  });

  res.render('pages/blog', {
    title: 'Blog',
    metaDescription: `All posts — ${meta.siteDescription}`,
    heading: 'Blog',
    subheading: 'Reviews, recaps, news, and deep cuts — sorted for rewatch culture.',
    posts: result.items.map(presentPostCard),
    pagination: {
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
      prevUrl: result.page > 1 ? paths.blogPage(result.page - 1) : null,
      nextUrl:
        result.totalPages && result.page < result.totalPages
          ? paths.blogPage(result.page + 1)
          : null,
    },
    filter: null,
    ...sidebarData(),
  });
}

function blogPost(req, res, next) {
  const { slug } = req.params;
  if (!isValidSlug(slug)) {
    return next();
  }

  const post = postsService.getBySlug(slug);
  if (!post) {
    return next();
  }

  // Simple view counter: once per browser session per post (avoids refresh spam)
  let viewCount = Number(post.viewCount) || 0;
  if (req.session) {
    if (!req.session.viewedPosts) req.session.viewedPosts = [];
    if (!req.session.viewedPosts.includes(post.id)) {
      const nextCount = postsService.incrementViewCount(post.id);
      if (nextCount != null) viewCount = nextCount;
      req.session.viewedPosts.push(post.id);
      // Cap array growth for long sessions
      if (req.session.viewedPosts.length > 200) {
        req.session.viewedPosts = req.session.viewedPosts.slice(-100);
      }
      // Lightweight analytics (device / region) — same session gate as views
      analyticsService.recordPageview(req, {
        postId: post.id,
        path: paths.post(post.slug),
      });
    }
  } else {
    const nextCount = postsService.incrementViewCount(post.id);
    if (nextCount != null) viewCount = nextCount;
    analyticsService.recordPageview(req, {
      postId: post.id,
      path: paths.post(post.slug),
    });
  }

  const presented = presentPost({ ...post, viewCount });
  const meta = siteMeta();
  const visitorKey = req.session?.visitorId || null;
  const comments = commentsService.listApprovedForPost(post.id).map((c) => ({
    ...c,
    createdLabel: formatDate(c.createdAt),
  }));
  const reactions = reactionsService.getForPost(post.id, visitorKey);

  const ogImage = resolveOgImage(presented);
  res.render('pages/post', {
    title: presented.title,
    metaDescription: presented.excerpt,
    post: presented,
    related: relatedPosts(post),
    comments,
    reactions,
    commentFlash: req.session?.commentFlash || null,
    commentForm: req.session?.commentForm || { name: '', email: '', body: '' },
    canonicalUrl: absoluteUrl(config.appUrl, paths.post(presented.slug)),
    ogImage,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: presented.title,
      description: presented.excerpt,
      image: ogImage,
      datePublished: presented.publishedAt || presented.createdAt,
      dateModified: presented.updatedAt,
      author: presented.author
        ? { '@type': 'Person', name: presented.author.displayName }
        : undefined,
      mainEntityOfPage: absoluteUrl(config.appUrl, paths.post(presented.slug)),
    },
    siteDescription: meta.siteDescription,
    ...sidebarData(),
  });

  if (req.session) {
    delete req.session.commentFlash;
    delete req.session.commentForm;
  }
}

/**
 * POST /blog/:slug/comments — moderated (pending until admin approves).
 */
function postComment(req, res, next) {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return next();

  const post = postsService.getBySlug(slug);
  if (!post) return next();

  // Honeypot — bots fill hidden "website" field
  if (req.body.website) {
    return res.redirect(`${paths.post(slug)}#comments`);
  }

  ensureVisitorKey(req);

  try {
    commentsService.createPending({
      postId: post.id,
      authorName: req.body.name,
      authorEmail: req.body.email,
      body: req.body.body,
    });
    req.session.commentFlash = {
      type: 'ok',
      message: 'Locked in — thanks. Your comment is in the moderation queue and will show once approved.',
    };
    req.session.commentForm = { name: '', email: '', body: '' };
  } catch (err) {
    req.session.commentFlash = {
      type: 'error',
      message: err.message || 'Could not submit comment.',
    };
    req.session.commentForm = {
      name: String(req.body.name || ''),
      email: String(req.body.email || ''),
      body: String(req.body.body || ''),
    };
  }

  req.session.save(() => {
    res.redirect(`${paths.post(slug)}#comments`);
  });
}

/**
 * POST /blog/:slug/reactions — toggle reaction type for this visitor.
 */
function postReaction(req, res, next) {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return next();

  const post = postsService.getBySlug(slug);
  if (!post) return next();

  const type = String(req.body.type || '');
  const visitorKey = ensureVisitorKey(req);

  try {
    const result = reactionsService.toggle(post.id, type, visitorKey);
    // JSON for progressive enhancement; form POST also works
    if (req.accepts('json') && req.get('accept')?.includes('application/json')) {
      return res.json(result);
    }
  } catch (err) {
    if (req.accepts('json') && req.get('accept')?.includes('application/json')) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }

  req.session.save(() => {
    res.redirect(`${paths.post(slug)}#reactions`);
  });
}

function workArchive(req, res, next) {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return next();

  const workTitle = postsService.getWorkTitleBySlug(slug);
  if (!workTitle) return next();

  const meta = siteMeta();
  const page = parsePage(req.query);
  const result = postsService.listPosts({
    status: 'published',
    workSlug: slug,
    page,
    limit: meta.postsPerPage,
  });

  const pageUrl = (p) => paths.workPage(slug, p);

  res.render('pages/blog', {
    title: workTitle,
    metaDescription: `Posts about ${workTitle}`,
    heading: workTitle,
    subheading: 'Everything we’ve written about this title — lined up for your binge.',
    posts: result.items.map(presentPostCard),
    pagination: {
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
      prevUrl: result.page > 1 ? pageUrl(result.page - 1) : null,
      nextUrl:
        result.totalPages && result.page < result.totalPages
          ? pageUrl(result.page + 1)
          : null,
    },
    filter: { type: 'work', name: workTitle, slug },
    ...sidebarData(),
  });
}

function categoryArchive(req, res, next) {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return next();

  const category = categoriesService.getBySlug(slug);
  if (!category) return next();

  const meta = siteMeta();
  const page = parsePage(req.query);
  const result = postsService.listPosts({
    status: 'published',
    categorySlug: slug,
    page,
    limit: meta.postsPerPage,
  });

  const pageUrl = (p) =>
    p > 1 ? `${paths.category(slug)}?page=${p}` : paths.category(slug);

  res.render('pages/blog', {
    title: category.name,
    metaDescription: category.description || `Posts in ${category.name}`,
    heading: category.name,
    subheading: category.description || 'Posts in this section of the catalog.',
    posts: result.items.map(presentPostCard),
    pagination: {
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
      prevUrl: result.page > 1 ? pageUrl(result.page - 1) : null,
      nextUrl:
        result.totalPages && result.page < result.totalPages
          ? pageUrl(result.page + 1)
          : null,
    },
    filter: { type: 'category', name: category.name, slug: category.slug },
    ...sidebarData(),
  });
}

function tagArchive(req, res, next) {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return next();

  const tag = tagsService.getBySlug(slug);
  if (!tag) return next();

  const meta = siteMeta();
  const page = parsePage(req.query);
  const result = postsService.listPosts({
    status: 'published',
    tagSlug: slug,
    page,
    limit: meta.postsPerPage,
  });

  const pageUrl = (p) => (p > 1 ? `${paths.tag(slug)}?page=${p}` : paths.tag(slug));

  res.render('pages/blog', {
    title: `#${tag.name}`,
    metaDescription: `Posts tagged ${tag.name}`,
    heading: `#${tag.name}`,
    subheading: 'Genre and topic picks from the catalog.',
    posts: result.items.map(presentPostCard),
    pagination: {
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
      prevUrl: result.page > 1 ? pageUrl(result.page - 1) : null,
      nextUrl:
        result.totalPages && result.page < result.totalPages
          ? pageUrl(result.page + 1)
          : null,
    },
    filter: { type: 'tag', name: tag.name, slug: tag.slug },
    ...sidebarData(),
  });
}

function search(req, res) {
  const meta = siteMeta();
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const page = parsePage(req.query);

  let result = { items: [], page: 1, total: 0, totalPages: 0, limit: meta.postsPerPage };
  if (q) {
    result = postsService.listPosts({
      status: 'published',
      q,
      page,
      limit: meta.postsPerPage,
    });
  }

  const pageUrl = (p) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${paths.search()}?${qs}` : paths.search();
  };

  res.render('pages/search', {
    title: q ? `Search: ${q}` : 'Search',
    metaDescription: 'Search reviews, recaps, and anime deep cuts.',
    q,
    posts: result.items.map(presentPostCard),
    pagination: {
      page: result.page,
      totalPages: result.totalPages,
      total: result.total,
      prevUrl: result.page > 1 ? pageUrl(result.page - 1) : null,
      nextUrl:
        result.totalPages && result.page < result.totalPages
          ? pageUrl(result.page + 1)
          : null,
    },
    ...sidebarData(),
  });
}

function archive(_req, res) {
  const result = postsService.listPosts({
    status: 'published',
    page: 1,
    limit: 100,
  });

  /** @type {Record<string, Array<ReturnType<typeof presentPostCard>>>} */
  const byYear = {};
  for (const post of result.items.map(presentPostCard)) {
    const year = (post.publishedAt || post.createdAt || '').slice(0, 4) || 'Unknown';
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(post);
  }

  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  res.render('pages/archive', {
    title: 'Archive',
    metaDescription: 'Full archive of anime reviews, recaps, and culture posts — year by year.',
    years,
    byYear,
    total: result.total,
    ...sidebarData(),
  });
}

function about(_req, res) {
  const meta = siteMeta();
  const authors = usersService.listUsers();

  res.render('pages/about', {
    title: 'About',
    metaDescription: meta.siteDescription,
    siteDescription: meta.siteDescription,
    authors,
    ...sidebarData(),
  });
}

function contactGet(_req, res) {
  res.render('pages/contact', {
    title: 'Contact',
    metaDescription: 'Tips, corrections, collabs, and watch recommendations for Ainme.',
    sent: false,
    error: null,
    form: { name: '', email: '', message: '' },
    ...sidebarData(),
  });
}

function contactPost(req, res) {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim();
  const message = String(req.body?.message || '').trim();

  if (!name || !email || !message) {
    return res.status(400).render('pages/contact', {
      title: 'Contact',
      metaDescription: 'Tips, corrections, collabs, and watch recommendations for Ainme.',
      sent: false,
      error: 'Name, email, and message are all required — fill the form and try again.',
      form: { name, email, message },
      ...sidebarData(),
    });
  }

  // Acknowledge only (no mail transport yet).
  res.render('pages/contact', {
    title: 'Contact',
    metaDescription: 'Tips, corrections, collabs, and watch recommendations for Ainme.',
    sent: true,
    error: null,
    form: { name: '', email: '', message: '' },
    ...sidebarData(),
  });
}

function rss(_req, res) {
  const meta = siteMeta();
  const { items } = postsService.listPosts({ status: 'published', page: 1, limit: 30 });

  const channelLink = escapeXml(config.appUrl);
  const channelTitle = escapeXml(meta.siteTitle);
  const channelDesc = escapeXml(meta.siteDescription);

  const itemXml = items
    .map((post) => {
      const link = escapeXml(absoluteUrl(config.appUrl, paths.post(post.slug)));
      const title = escapeXml(post.title);
      const description = escapeXml(post.excerpt || plainExcerpt(post.bodyMd));
      const pubDate = post.publishedAt
        ? new Date(post.publishedAt).toUTCString()
        : new Date(post.createdAt).toUTCString();
      const guid = link;
      return [
        '<item>',
        `<title>${title}</title>`,
        `<link>${link}</link>`,
        `<guid isPermaLink="true">${guid}</guid>`,
        `<pubDate>${pubDate}</pubDate>`,
        `<description>${description}</description>`,
        '</item>',
      ].join('');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${channelTitle}</title>
<link>${channelLink}</link>
<description>${channelDesc}</description>
${itemXml}
</channel>
</rss>`;

  res.type('application/rss+xml').send(xml);
}

function sitemap(_req, res) {
  const { items } = postsService.listPosts({ status: 'published', page: 1, limit: 500 });
  const cats = categoriesService.listCategories();
  const tags = tagsService.listTags();

  const staticPaths = [
    paths.home(),
    paths.blog(),
    paths.archive(),
    paths.about(),
    paths.contact(),
    paths.search(),
  ];

  const urls = [
    ...staticPaths.map((p) => absoluteUrl(config.appUrl, p)),
    ...items.map((p) => absoluteUrl(config.appUrl, paths.post(p.slug))),
    ...cats.map((c) => absoluteUrl(config.appUrl, paths.category(c.slug))),
    ...tags.map((t) => absoluteUrl(config.appUrl, paths.tag(t.slug))),
  ];

  const body = urls
    .map(
      (loc) =>
        `<url><loc>${escapeXml(loc)}</loc><changefreq>weekly</changefreq></url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  res.type('application/xml').send(xml);
}

module.exports = {
  home,
  blogIndex,
  blogPost,
  postComment,
  postReaction,
  workArchive,
  categoryArchive,
  tagArchive,
  search,
  archive,
  about,
  contactGet,
  contactPost,
  rss,
  sitemap,
};
