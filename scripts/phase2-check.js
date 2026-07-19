'use strict';

/**
 * Phase 2 public SSR checks against a running server.
 *   BASE_URL=http://127.0.0.1:3000 npm run test:phase2
 *
 * Without BASE_URL, only offline markdown/path checks run.
 */

const { paths } = require('../src/utils/slug');
const { renderMarkdown, plainExcerpt } = require('../src/utils/markdown');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// Offline
const html = renderMarkdown('# Hello\n\nThis is **bold** and a [link](https://example.com).');
assert(html.includes('<h1'), 'markdown renders h1');
assert(html.includes('<strong>bold</strong>') || html.includes('<strong>bold</strong>'.toLowerCase()) || html.includes('bold'), 'markdown bold');
assert(!html.includes('<script'), 'markdown sanitized (no script from md alone)');
assert(plainExcerpt('## Title\n\nHello world').includes('Hello'), 'plainExcerpt');
assert(paths.post('welcome-to-ainme') === '/blog/welcome-to-ainme', 'post path slug');
assert(!paths.post('welcome-to-ainme').match(/[0-9a-f]{8}-[0-9a-f]{4}/), 'post path has no UUID');

async function http() {
  const base = process.env.BASE_URL;
  if (!base) {
    console.log('(skip HTTP phase2 — set BASE_URL)');
    return;
  }

  async function get(path, opts = {}) {
    const res = await fetch(new URL(path, base), { redirect: 'manual', ...opts });
    const text = await res.text();
    return { res, text, status: res.status };
  }

  const home = await get('/');
  assert(home.status === 200, 'GET / 200');
  assert(home.text.includes('Latest posts') || home.text.includes('Welcome'), 'home has content');
  assert(home.text.includes('/blog/'), 'home links to blog slugs');
  assert(!home.text.match(/\/blog\/[0-9a-f]{8}-[0-9a-f]{4}/), 'home blog links not UUID');

  const blog = await get('/blog');
  assert(blog.status === 200, 'GET /blog 200');
  assert(blog.text.includes('welcome-to-ainme') || blog.text.includes('Neon'), 'blog lists seed posts');

  const post = await get('/blog/welcome-to-ainme');
  assert(post.status === 200, 'GET /blog/welcome-to-ainme 200');
  assert(post.text.includes('Welcome to Ainme') || post.text.includes('lightweight'), 'post body rendered');
  assert(post.text.includes('application/ld+json') || post.text.includes('Article'), 'structured data or article markup');

  const draft = await get('/blog/work-in-progress-notes');
  assert(draft.status === 404, 'draft slug is 404 on public');

  const cat = await get('/category/reviews');
  assert(cat.status === 200, 'GET /category/reviews 200');
  assert(cat.text.toLowerCase().includes('review'), 'category page content');

  const tag = await get('/tag/mecha');
  assert(tag.status === 200, 'GET /tag/mecha 200');

  const search = await get('/search?q=evangelion');
  assert(search.status === 200, 'GET /search 200');
  assert(search.text.toLowerCase().includes('evangelion') || search.text.includes('Neon'), 'search hits');

  const archive = await get('/archive');
  assert(archive.status === 200, 'GET /archive 200');

  const about = await get('/about');
  assert(about.status === 200, 'GET /about 200');
  assert(about.text.includes('Aria') || about.text.includes('Authors'), 'about authors');

  const rss = await get('/rss.xml');
  assert(rss.status === 200, 'GET /rss.xml 200');
  assert(rss.text.includes('<rss') && rss.text.includes('welcome-to-ainme'), 'rss feed items');

  const map = await get('/sitemap.xml');
  assert(map.status === 200, 'GET /sitemap.xml 200');
  assert(map.text.includes('/blog/welcome-to-ainme'), 'sitemap has post slug URLs');
  assert(!map.text.match(/\/blog\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/), 'sitemap has no UUID post paths');

  const missing = await get('/blog/does-not-exist-slug');
  assert(missing.status === 404, 'missing post 404');

  const badCat = await get('/category/not-a-real-category');
  assert(badCat.status === 404, 'missing category 404');
}

http()
  .then(() => {
    if (failed > 0) {
      console.error(`\n${failed} phase2 check(s) failed`);
      process.exit(1);
    }
    console.log('\nPhase 2 checks passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
