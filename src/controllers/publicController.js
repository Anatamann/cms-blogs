'use strict';

const config = require('../config');
const postsService = require('../services/posts');
const categoriesService = require('../services/categories');
const tagsService = require('../services/tags');
const settingsService = require('../services/settings');
const usersService = require('../services/users');
const { paths, isValidSlug } = require('../utils/slug');
const { renderMarkdown, plainExcerpt } = require('../utils/markdown');
const { formatDate, escapeXml, absoluteUrl } = require('../utils/format');

function siteMeta() {
  const all = settingsService.getAll();
  return {
    siteTitle: all.site_title || config.siteName,
    siteDescription:
      all.site_description || 'Lightweight anime blogging — retro vibes, modern stack.',
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

function presentPost(post) {
  if (!post) return null;
  const excerpt = post.excerpt || plainExcerpt(post.bodyMd);
  return {
    ...post,
    excerpt,
    bodyHtml: renderMarkdown(post.bodyMd),
    publishedLabel: formatDate(post.publishedAt || post.createdAt),
    url: paths.post(post.slug),
  };
}

function presentPostCard(post) {
  if (!post) return null;
  return {
    ...post,
    excerpt: post.excerpt || plainExcerpt(post.bodyMd, 140),
    publishedLabel: formatDate(post.publishedAt || post.createdAt),
    url: paths.post(post.slug),
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
    title: meta.siteTitle,
    metaDescription: meta.siteDescription,
    siteDescription: meta.siteDescription,
    posts: latest.items.map(presentPostCard),
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
    subheading: 'Reviews, news, and theories.',
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

  const presented = presentPost(post);
  const meta = siteMeta();

  res.render('pages/post', {
    title: presented.title,
    metaDescription: presented.excerpt,
    post: presented,
    related: relatedPosts(post),
    canonicalUrl: absoluteUrl(config.appUrl, paths.post(presented.slug)),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: presented.title,
      description: presented.excerpt,
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
    subheading: category.description || 'Category archive',
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
    subheading: 'Tag archive',
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
    metaDescription: 'Search published posts',
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
    metaDescription: 'Full post archive',
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
    metaDescription: 'Get in touch',
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
      metaDescription: 'Get in touch',
      sent: false,
      error: 'Please fill in name, email, and message.',
      form: { name, email, message },
      ...sidebarData(),
    });
  }

  // Phase 2: acknowledge only (no mail transport). Phase 6 can store or email.
  res.render('pages/contact', {
    title: 'Contact',
    metaDescription: 'Get in touch',
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
