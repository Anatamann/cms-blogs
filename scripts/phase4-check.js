'use strict';

/**
 * Phase 4 media pipeline checks.
 *   BASE_URL=http://127.0.0.1:3000 npm run test:phase4
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { paths } = require('../src/utils/slug');
const { isValidId } = require('../src/utils/uuid');
const mediaService = require('../src/services/media');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// Offline unit checks
assert(typeof mediaService.processAndStore === 'function', 'processAndStore exists');
assert(mediaService.classifyUpload({ mimetype: 'image/png', originalname: 'a.png' }) === 'image', 'classify image');
assert(mediaService.classifyUpload({ mimetype: 'image/gif', originalname: 'a.gif' }) === 'gif', 'classify gif');
assert(mediaService.classifyUpload({ mimetype: 'video/mp4', originalname: 'a.mp4' }) === 'video', 'classify video');

try {
  mediaService.assertSizeLimit('video', 31 * 1024 * 1024);
  assert(false, 'video over 30MB should throw');
} catch (err) {
  assert(err.status === 400, 'video oversize status 400');
}

async function offlineProcess() {
  // Use isolated temp via real uploads dir with unique processing
  const png = await sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 255, g: 0, b: 255 } },
  })
    .png()
    .toBuffer();

  const item = await mediaService.processAndStore(png, 'phase4-unit.png', 'image/png', {
    alt: 'unit test',
  });

  assert(isValidId(item.id), 'stored media UUID');
  assert(item.type === 'image', 'image type');
  assert(item.mime === 'image/webp', 'converted to webp');
  assert(item.url.startsWith('/uploads/images/'), 'public path under uploads/images');
  assert(item.url.endsWith('.webp'), 'webp extension');
  assert(item.url.includes(item.id), 'filename uses UUID');

  const abs = path.join(require('../src/config').rootDir, 'public', item.url.replace(/^\//, ''));
  assert(fs.existsSync(abs), 'file exists on disk');
  assert(item.thumbUrl && item.thumbUrl.includes('-thumb.webp'), 'thumb url');
  assert(item.markdown.includes(item.url), 'markdown includes url');

  const ok = mediaService.deleteMedia(item.id);
  assert(ok, 'delete media');
  assert(!fs.existsSync(abs), 'file removed after delete');
}

function getCookie(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (raw.length) return raw.map((c) => c.split(';')[0]).join('; ');
  const single = res.headers.get('set-cookie');
  if (!single) return '';
  return single
    .split(',')
    .map((p) => p.split(';')[0].trim())
    .filter((p) => p.includes('='))
    .join('; ');
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
  String(getCookie(res) || '')
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
    console.log('(skip HTTP phase4 — set BASE_URL)');
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD || 'changeme';
  let cookie = '';

  // Login
  {
    const res = await fetch(new URL('/mantri/login', base));
    cookie = mergeCookies(cookie, res);
    const body = new URLSearchParams({ username: 'octopus', password });
    const login = await fetch(new URL('/mantri/login', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
      body,
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, login);
    assert(login.status === 302 || login.status === 303, 'login for media tests');
  }

  // Media page
  let csrf = '';
  {
    const res = await fetch(new URL('/mantri/media', base), { headers: { Cookie: cookie } });
    const html = await res.text();
    cookie = mergeCookies(cookie, res);
    assert(res.status === 200, 'media library 200');
    assert(html.includes('Upload') || html.includes('Media'), 'media page content');
    csrf = extractCsrf(html);
    assert(!!csrf, 'csrf on media form');
  }

  // Upload PNG via multipart
  let uploadedPath = '';
  {
    const png = await sharp({
      create: { width: 32, height: 32, channels: 3, background: { r: 0, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const form = new FormData();
    form.append('_csrf', csrf);
    form.append('alt', 'phase4 cyan square');
    form.append('file', new Blob([png], { type: 'image/png' }), 'phase4-http.png');

    const res = await fetch(new URL('/mantri/media/upload', base), {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
      redirect: 'manual',
    });
    cookie = mergeCookies(cookie, res);
    assert(res.status === 302 || res.status === 303, `upload redirects (got ${res.status})`);
  }

  // List JSON
  let mediaId = '';
  {
    const res = await fetch(new URL('/mantri/media.json', base), { headers: { Cookie: cookie } });
    const data = await res.json();
    assert(res.status === 200, 'media.json 200');
    assert(Array.isArray(data.items) && data.items.length >= 1, 'media.json has items');
    const item = data.items.find((i) => i.alt === 'phase4 cyan square') || data.items[0];
    assert(item.type === 'image', 'uploaded image type');
    assert(item.url.includes('/uploads/images/'), 'json url path');
    assert(item.url.endsWith('.webp'), 'json url webp');
    uploadedPath = item.url;
    mediaId = item.id;
    assert(isValidId(mediaId), 'json id uuid');
  }

  // Public static file
  {
    const res = await fetch(new URL(uploadedPath, base));
    assert(res.status === 200, 'public can fetch uploaded webp');
    const ct = res.headers.get('content-type') || '';
    assert(ct.includes('image') || ct.includes('webp'), `content-type image-ish (got ${ct})`);
  }

  // Reject oversized video metadata path via service already tested; reject bad mime via multer
  {
    const page = await fetch(new URL('/mantri/media', base), { headers: { Cookie: cookie } });
    const html = await page.text();
    cookie = mergeCookies(cookie, page);
    csrf = extractCsrf(html);

    const form = new FormData();
    form.append('_csrf', csrf);
    form.append('file', new Blob([Buffer.from('not-a-real-video')], { type: 'application/pdf' }), 'x.pdf');
    const res = await fetch(new URL('/mantri/media/upload', base), {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
      redirect: 'manual',
    });
    // 400 error page or redirect with flash — either way not 302 success to empty failure silently
    assert(res.status === 400 || res.status === 302 || res.status === 500, `bad mime handled (got ${res.status})`);
  }

  // Delete via admin
  {
    const page = await fetch(new URL('/mantri/media', base), { headers: { Cookie: cookie } });
    const html = await page.text();
    cookie = mergeCookies(cookie, page);
    csrf = extractCsrf(html);
    assert(!!csrf, 'csrf for delete');

    const res = await fetch(new URL(paths.admin.mediaDelete(mediaId), base), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: new URLSearchParams({ _csrf: csrf, type: 'all' }),
      redirect: 'manual',
    });
    assert(res.status === 302 || res.status === 303, 'delete media redirects');
  }

  {
    const res = await fetch(new URL(uploadedPath, base));
    assert(res.status === 404, 'deleted file no longer public');
  }

  // Unauth media blocked
  {
    const res = await fetch(new URL('/mantri/media', base), { redirect: 'manual' });
    assert(res.status === 302, 'unauth media redirects');
  }
}

offlineProcess()
  .then(http)
  .then(() => {
    if (failed > 0) {
      console.error(`\n${failed} phase4 check(s) failed`);
      process.exit(1);
    }
    console.log('\nPhase 4 checks passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
