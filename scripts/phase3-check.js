'use strict';

/**
 * Phase 3 admin CMS checks.
 *   BASE_URL=http://127.0.0.1:3000 npm run test:phase3
 *
 * Uses seed users aria / SEED_ADMIN_PASSWORD (default changeme).
 */

const { paths } = require('../src/utils/slug');
const { isValidId } = require('../src/utils/uuid');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

assert(paths.admin.postEdit('a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c').includes('/mantri/posts/'), 'admin edit path shape');
assert(
  paths.admin.postEdit('a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c').includes('a1b2c3d4-e5f6-4a70-8b9c-0d1e2f3a4b5c'),
  'admin edit uses UUID'
);
assert(paths.post('hello-world') === '/blog/hello-world', 'public still slug-based');

function getCookie(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (raw.length) {
    return raw.map((c) => c.split(';')[0]).join('; ');
  }
  const single = res.headers.get('set-cookie');
  if (!single) return '';
  return single.split(',').map((p) => p.split(';')[0].trim()).filter((p) => p.includes('=')).join('; ');
}

function mergeCookies(existing, res) {
  const map = new Map();
  String(existing || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const i = pair.indexOf('=');
      if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
    });
  const incoming = getCookie(res);
  String(incoming || '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const i = pair.indexOf('=');
      if (i > 0) map.set(pair.slice(0, i), pair.slice(i + 1));
    });
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractCsrf(html) {
  const m = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return m ? m[1] : null;
}

async function http() {
  const base = process.env.BASE_URL;
  if (!base) {
    console.log('(skip HTTP phase3 — set BASE_URL)');
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD || 'changeme';
  let cookie = '';

  // Unauthenticated admin home → redirect login
  {
    const res = await fetch(new URL('/mantri', base), { redirect: 'manual' });
    assert(res.status === 302 || res.status === 301, `unauth /mantri redirects (got ${res.status})`);
    const loc = res.headers.get('location') || '';
    assert(loc.includes('/mantri/login'), 'redirect to login');
  }

  // Login page
  {
    const res = await fetch(new URL('/mantri/login', base));
    const html = await res.text();
    cookie = mergeCookies(cookie, res);
    assert(res.status === 200, 'login page 200');
    assert(html.includes('password'), 'login form');
  }

  // Bad login
  {
    const body = new URLSearchParams({ username: 'aria', password: 'wrong-password' });
    const res = await fetch(new URL('/mantri/login', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
      body,
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, res);
    assert(res.status === 401 || res.status === 200, 'bad login rejected');
    const html = await res.text();
    assert(html.toLowerCase().includes('invalid'), 'bad login message');
  }

  // Good login
  {
    const body = new URLSearchParams({ username: 'aria', password });
    const res = await fetch(new URL('/mantri/login', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
      body,
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, res);
    assert(res.status === 302 || res.status === 303, `login success redirect (got ${res.status})`);
    assert((res.headers.get('location') || '').includes('/mantri'), 'login goes to admin');
  }

  // Dashboard
  {
    const res = await fetch(new URL('/mantri', base), { headers: { Cookie: cookie } });
    const html = await res.text();
    cookie = mergeCookies(cookie, res);
    assert(res.status === 200, 'dashboard 200');
    assert(html.includes('Dashboard') || html.includes('Posts'), 'dashboard content');
  }

  // Posts list
  let editUrl = '';
  let csrf = '';
  {
    const res = await fetch(new URL('/mantri/posts', base), { headers: { Cookie: cookie } });
    const html = await res.text();
    cookie = mergeCookies(cookie, res);
    assert(res.status === 200, 'posts list 200');
    assert(html.includes('welcome-to-ainme') || html.includes('Welcome'), 'lists seed posts');
    const m = html.match(/\/mantri\/posts\/([0-9a-f-]{36})\/edit/);
    assert(!!m, 'edit links use UUID');
    if (m) {
      assert(isValidId(m[1]), 'edit UUID valid v4');
      editUrl = `/mantri/posts/${m[1]}/edit`;
    }
  }

  // Create post
  let createdId = '';
  {
    const formPage = await fetch(new URL('/mantri/posts/new', base), { headers: { Cookie: cookie } });
    const formHtml = await formPage.text();
    cookie = mergeCookies(cookie, formPage);
    csrf = extractCsrf(formHtml);
    assert(!!csrf, 'csrf on new post form');

    const body = new URLSearchParams({
      _csrf: csrf,
      title: 'Phase Three Test Post',
      slug: 'phase-three-test-post',
      excerpt: 'Created by phase3-check',
      bodyMd: '# Hello\n\nFrom admin CMS.',
      status: 'published',
    });

    const res = await fetch(new URL('/mantri/posts', base), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body,
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, res);
    assert(res.status === 302 || res.status === 303, `create redirects (got ${res.status})`);
    const loc = res.headers.get('location') || '';
    const m = loc.match(/\/mantri\/posts\/([0-9a-f-]{36})\/edit/);
    assert(!!m, 'create redirects to UUID edit URL');
    createdId = m ? m[1] : '';
    assert(isValidId(createdId), 'created id is UUID v4');
  }

  // Public post by slug
  {
    const res = await fetch(new URL('/blog/phase-three-test-post', base));
    assert(res.status === 200, 'public post by slug after publish');
    const html = await res.text();
    assert(html.includes('Phase Three') || html.includes('Hello'), 'public renders body');
    assert(!html.includes(createdId), 'public HTML should not need UUID');
  }

  // Preview
  {
    const res = await fetch(new URL(`/mantri/posts/${createdId}/preview`, base), {
      headers: { Cookie: cookie },
    });
    assert(res.status === 200, 'admin preview 200');
  }

  // Settings page + save
  {
    const formPage = await fetch(new URL('/mantri/settings', base), { headers: { Cookie: cookie } });
    const formHtml = await formPage.text();
    cookie = mergeCookies(cookie, formPage);
    csrf = extractCsrf(formHtml);
    assert(!!csrf, 'csrf on settings');

    const body = new URLSearchParams({
      _csrf: csrf,
      site_title: 'Ainme Blog',
      site_description: 'Phase 3 settings check',
      posts_per_page: '10',
    });
    const res = await fetch(new URL('/mantri/settings', base), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body,
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, res);
    assert(res.status === 302 || res.status === 303, 'settings save redirects');
  }

  // Delete created post
  {
    const editPage = await fetch(new URL(`/mantri/posts/${createdId}/edit`, base), {
      headers: { Cookie: cookie },
    });
    const editHtml = await editPage.text();
    cookie = mergeCookies(cookie, editPage);
    csrf = extractCsrf(editHtml);
    assert(!!csrf, 'csrf on edit for delete');

    const res = await fetch(new URL(`/mantri/posts/${createdId}/delete`, base), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: new URLSearchParams({ _csrf: csrf }),
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, res);
    assert(res.status === 302 || res.status === 303, 'delete redirects');
  }

  {
    const res = await fetch(new URL('/blog/phase-three-test-post', base));
    assert(res.status === 404, 'deleted post gone from public');
  }

  // Logout
  {
    const dash = await fetch(new URL('/mantri', base), { headers: { Cookie: cookie } });
    const html = await dash.text();
    cookie = mergeCookies(cookie, dash);
    csrf = extractCsrf(html);
    if (csrf) {
      const res = await fetch(new URL('/mantri/logout', base), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookie,
        },
        body: new URLSearchParams({ _csrf: csrf }),
        redirect: 'manual',
      });
      assert(res.status === 302 || res.status === 303, 'logout redirects');
    }
  }

  void editUrl;
}

http()
  .then(() => {
    if (failed > 0) {
      console.error(`\n${failed} phase3 check(s) failed`);
      process.exit(1);
    }
    console.log('\nPhase 3 checks passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
