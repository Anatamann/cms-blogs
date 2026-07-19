'use strict';

/**
 * Phase 5 theme / a11y checks.
 *   BASE_URL=http://127.0.0.1:3000 npm run test:phase5
 */

const fs = require('fs');
const path = require('path');
const { renderMarkdown } = require('../src/utils/markdown');

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

const cssPath = path.join(__dirname, '../public/css/main.css');
const css = fs.readFileSync(cssPath, 'utf8');

assert(css.includes('--magenta: #ff00ff') || css.includes('--magenta: #FF00FF'), 'magenta token');
assert(css.includes('--cyan: #00ffff') || css.includes('--cyan: #00FFFF'), 'cyan token');
assert(css.includes('--green:'), 'green token');
assert(css.includes('prefers-reduced-motion'), 'reduced-motion media query');
assert(css.includes(':focus-visible'), 'focus-visible styles');
assert(css.includes('scanline') || css.includes('scanlines'), 'scanline treatment');
assert(css.includes('glitch') || css.includes('@keyframes glitch'), 'glitch animation');
assert(css.includes('prefers-contrast'), 'prefers-contrast support');

const html = renderMarkdown('![alt text](/uploads/images/x.webp)');
assert(html.includes('loading="lazy"'), 'markdown images get loading=lazy');
assert(html.includes('decoding="async"') || html.includes('loading="lazy"'), 'img attrs set');

async function http() {
  const base = process.env.BASE_URL;
  if (!base) {
    console.log('(skip HTTP phase5 — set BASE_URL)');
    return;
  }

  const home = await fetch(new URL('/', base));
  const homeHtml = await home.text();
  assert(home.status === 200, 'home 200');
  assert(homeHtml.includes('theme-retro') || homeHtml.includes('data-theme'), 'theme class on body');
  assert(homeHtml.includes('skip-link'), 'skip link present');
  assert(homeHtml.includes('aria-label="Primary"') || homeHtml.includes("aria-label='Primary'"), 'primary nav label');
  assert(homeHtml.includes('main.css'), 'main stylesheet linked');

  const blog = await fetch(new URL('/blog', base));
  const blogHtml = await blog.text();
  assert(blog.status === 200, 'blog 200');
  assert(
    blogHtml.includes('aria-current="page"') || blogHtml.includes("aria-current='page'"),
    'active nav aria-current on blog'
  );

  const cssRes = await fetch(new URL('/css/main.css', base));
  assert(cssRes.status === 200, 'main.css served');
  const cssBody = await cssRes.text();
  assert(cssBody.includes('prefers-reduced-motion'), 'served CSS has reduced-motion');
  assert(cssBody.length > 5000, 'theme CSS is substantial (phase 5 polish)');
}

http()
  .then(() => {
    if (failed > 0) {
      console.error(`\n${failed} phase5 check(s) failed`);
      process.exit(1);
    }
    console.log('\nPhase 5 checks passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
