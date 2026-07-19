'use strict';

/**
 * Minimal smoke checks for Phase 0 (no test runner required).
 * Run against a live server: BASE_URL=http://localhost:3000 node scripts/smoke-check.js
 */

const { slugify, isValidSlug, paths } = require('../src/utils/slug');
const { generateId, isValidId, normalizeId } = require('../src/utils/uuid');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// --- unit-style checks (no server) ---
assert(slugify('Neon Genesis Review!') === 'neon-genesis-review', 'slugify basic');
assert(slugify('  --Hello__World--  ') === 'hello-world', 'slugify collapse');
assert(isValidSlug('reviews') === true, 'valid slug');
assert(isValidSlug('admin') === false, 'reserved slug blocked');
assert(paths.post('neon-genesis-review') === '/blog/neon-genesis-review', 'post path');
assert(paths.category('reviews') === '/category/reviews', 'category path');
assert(paths.admin.postEdit('550e8400-e29b-41d4-a716-446655440000').includes('550e8400'), 'admin uses id');

const id = generateId();
assert(isValidId(id), 'generateId is valid v4');
assert(normalizeId(id.toUpperCase()) === id, 'normalizeId lowercases');
assert(normalizeId('not-a-uuid') === null, 'normalizeId rejects junk');

async function httpSmoke() {
  const base = process.env.BASE_URL;
  if (!base) {
    console.log('(skip HTTP smoke — set BASE_URL to hit a running server)');
    return;
  }

  const checks = [
    ['/', 200],
    ['/health', 200],
    ['/blog', 200],
    ['/admin', 200],
    ['/nope-missing', 404],
    ['/blog/', 301],
  ];

  for (const [path, expected] of checks) {
    const res = await fetch(new URL(path, base), { redirect: 'manual' });
    assert(res.status === expected, `GET ${path} → ${expected} (got ${res.status})`);
  }

  const health = await fetch(new URL('/health', base)).then((r) => r.json());
  assert(health.status === 'ok', 'health JSON status ok');
  if (health.database) {
    assert(health.database.ok === true, 'health database ok');
  }
}

httpSmoke()
  .then(() => {
    if (failed > 0) {
      console.error(`\n${failed} check(s) failed`);
      process.exit(1);
    }
    console.log('\nAll smoke checks passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
