'use strict';

/**
 * Phase 6 hardening / SEO / ops checks.
 *   BASE_URL=http://127.0.0.1:3000 npm run test:phase6
 */

const fs = require('fs');
const path = require('path');
const { helmetOptions, assertSecureConfig } = require('../src/middleware/security');

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
assert(helmetOptions.contentSecurityPolicy, 'helmet CSP configured');
assert(
  helmetOptions.contentSecurityPolicy.directives.defaultSrc.includes("'self'"),
  'CSP default-src self'
);
assert(
  helmetOptions.contentSecurityPolicy.directives.frameAncestors.includes("'none'"),
  'CSP frame-ancestors none'
);

const backup = path.join(__dirname, 'backup.sh');
const restore = path.join(__dirname, 'restore.sh');
assert(fs.existsSync(backup), 'backup.sh exists');
assert(fs.existsSync(restore), 'restore.sh exists');
assert(fs.existsSync(path.join(__dirname, '../docs/DEPLOY.md')), 'DEPLOY.md exists');

// assertSecureConfig should not throw in development
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
try {
  assertSecureConfig();
  assert(true, 'assertSecureConfig ok in non-prod');
} catch (err) {
  assert(false, `assertSecureConfig threw unexpectedly: ${err.message}`);
}

async function http() {
  const base = process.env.BASE_URL;
  if (!base) {
    console.log('(skip HTTP phase6 — set BASE_URL)');
    return;
  }

  const home = await fetch(new URL('/', base));
  assert(home.status === 200, 'home 200');

  const csp = home.headers.get('content-security-policy');
  assert(!!csp, 'CSP header present');
  assert(csp.includes("default-src 'self'") || csp.includes("default-src 'self'"), 'CSP default-src');

  const xcto = home.headers.get('x-content-type-options');
  assert(xcto === 'nosniff', 'X-Content-Type-Options nosniff');

  const xfo = home.headers.get('x-frame-options');
  assert(!!xfo, 'X-Frame-Options set');

  const powered = home.headers.get('x-powered-by');
  assert(!powered, 'X-Powered-By hidden');

  const robots = await fetch(new URL('/robots.txt', base));
  const robotsText = await robots.text();
  assert(robots.status === 200, 'robots.txt 200');
  assert(robotsText.includes('Disallow: /admin'), 'robots disallows admin');
  assert(robotsText.toLowerCase().includes('sitemap:'), 'robots lists sitemap');

  const securityTxt = await fetch(new URL('/.well-known/security.txt', base));
  assert(securityTxt.status === 200, 'security.txt 200');

  const ready = await fetch(new URL('/health/ready', base));
  const readyJson = await ready.json();
  assert(ready.status === 200, 'health/ready 200');
  assert(readyJson.status === 'ready', 'health ready status');

  const live = await fetch(new URL('/health/live', base));
  assert(live.status === 200, 'health/live 200');

  const homeHtml = await home.text();
  assert(homeHtml.includes('og:site_name') || homeHtml.includes('og:url'), 'OG meta present');
  assert(homeHtml.includes('twitter:card'), 'twitter card meta');

  // Contact rate limit headers on POST without full form may 400 but limiter attaches
  const contactGet = await fetch(new URL('/contact', base));
  assert(contactGet.status === 200, 'contact page 200');
}

http()
  .then(() => {
    if (failed > 0) {
      console.error(`\n${failed} phase6 check(s) failed`);
      process.exit(1);
    }
    console.log('\nPhase 6 checks passed');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
