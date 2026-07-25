'use strict';

/**
 * Phase 1 data-layer checks (migrate + seed + repositories).
 *   npm run test:phase1
 */

const path = require('path');
const fs = require('fs');

// Isolate test DB from dev DB
const testDataDir = path.join(__dirname, '../data/test-phase1');
const testDbPath = path.join(testDataDir, 'phase1.sqlite');

fs.mkdirSync(testDataDir, { recursive: true });
for (const f of fs.readdirSync(testDataDir)) {
  fs.unlinkSync(path.join(testDataDir, f));
}

process.env.DATA_DIR = testDataDir;
process.env.DATABASE_FILE = 'phase1.sqlite';
process.env.AUTO_SEED = '0';

// Clear cached config if any
delete require.cache[require.resolve('../src/config')];

const { isValidId } = require('../src/utils/uuid');
const { isValidSlug, paths } = require('../src/utils/slug');
const { getDb, closeDb, checkDb } = require('../src/db/client');
const { seed, IDS } = require('../src/db/seed');
const posts = require('../src/services/posts');
const categories = require('../src/services/categories');
const tags = require('../src/services/tags');
const settings = require('../src/services/settings');
const users = require('../src/services/users');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

async function run() {
  getDb();
  assert(checkDb().ok, 'database connects after migrate');

  const result = await seed();
  assert(result.skipped === false, 'seed inserts data');

  for (const [name, id] of Object.entries(IDS)) {
    assert(isValidId(id), `seed UUID clean: ${name}`);
  }

  const published = posts.listPosts({ status: 'published', limit: 20 });
  assert(published.total === 4, `4 published posts (got ${published.total})`);
  assert(
    published.items.every((p) => p.status === 'published'),
    'listPosts published filter'
  );
  assert(
    published.items.every((p) => isValidSlug(p.slug)),
    'all published post slugs valid'
  );
  assert(
    published.items.every((p) => isValidId(p.id)),
    'all post ids valid UUID v4'
  );

  const welcome = posts.getBySlug('welcome-to-ainme');
  assert(!!welcome, 'getBySlug welcome-to-ainme');
  assert(welcome.slug === 'welcome-to-ainme', 'slug field clean');
  assert(paths.post(welcome.slug) === '/blog/welcome-to-ainme', 'public path uses slug not UUID');
  assert(!paths.post(welcome.slug).includes(welcome.id), 'public path has no UUID');

  const draft = posts.getBySlug('work-in-progress-notes');
  assert(draft === null, 'draft not returned by public getBySlug');
  const draftAdmin = posts.getBySlug('work-in-progress-notes', { includeDrafts: true });
  assert(!!draftAdmin, 'draft visible with includeDrafts');

  const byId = posts.getById(IDS.postEva);
  assert(!!byId, 'getById uses UUID');
  assert(paths.admin.postEdit(byId.id) === `/mantri/posts/${byId.id}/edit`, 'admin edit path uses UUID');

  const reviews = posts.listPosts({ categorySlug: 'reviews' });
  assert(reviews.total >= 1, 'filter by category slug');
  assert(reviews.items.every((p) => p.categories.some((c) => c.slug === 'reviews')), 'category slug on hydrated posts');

  const mecha = posts.listPosts({ tagSlug: 'mecha' });
  assert(mecha.total >= 1, 'filter by tag slug');

  const cats = categories.listCategories();
  assert(cats.length === 3, '3 categories seeded');
  assert(cats.every((c) => isValidSlug(c.slug) && isValidId(c.id)), 'category ids/slugs clean');

  const tagList = tags.listTags();
  assert(tagList.length === 3, '3 tags seeded');

  const siteTitle = settings.get('site_title');
  assert(!!siteTitle, 'settings site_title');

  const aria = users.getByUsername('aria');
  assert(!!aria && isValidId(aria.id), 'user aria with UUID');

  // Unique slug allocation
  const slug2 = await posts.allocateSlug('welcome-to-ainme');
  assert(slug2 === 'welcome-to-ainme-2', `allocateSlug collision → ${slug2}`);

  // Create + delete roundtrip
  const created = await posts.createPost({
    title: 'Temp Unique Post!!!',
    bodyMd: 'hello',
    status: 'published',
    authorId: IDS.userAria,
    categoryIds: [IDS.catNews],
    tagIds: [IDS.tagClassic],
  });
  assert(created.slug === 'temp-unique-post', `created slug ${created.slug}`);
  assert(isValidId(created.id), 'created post UUID');
  assert(posts.deletePost(created.id) === true, 'deletePost');

  closeDb();

  // cleanup test files
  try {
    for (const f of fs.readdirSync(testDataDir)) {
      fs.unlinkSync(path.join(testDataDir, f));
    }
    fs.rmdirSync(testDataDir);
  } catch {
    /* ignore */
  }

  if (failed > 0) {
    console.error(`\n${failed} phase1 check(s) failed`);
    process.exit(1);
  }
  console.log('\nPhase 1 checks passed');
}

run().catch((err) => {
  console.error(err);
  closeDb();
  process.exit(1);
});
