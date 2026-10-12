'use strict';

/**
 * Unit checks for managed hyperlink engine.
 *   node scripts/managed-links-check.js
 */

const {
  applyManagedLinks,
  applyManagedLinksWithCounts,
  countEligible,
  isValidLinkUrl,
  findNextMatch,
} = require('../src/utils/managedLinks');
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

function run() {
  assert(isValidLinkUrl('/archive'), 'relative url ok');
  assert(isValidLinkUrl('https://example.com/x'), 'https url ok');
  assert(isValidLinkUrl('mailto:a@b.com'), 'mailto ok');
  assert(!isValidLinkUrl('javascript:alert(1)'), 'rejects javascript');
  assert(!isValidLinkUrl('//evil.com'), 'rejects protocol-relative');

  assert(findNextMatch('Eva is Eva', 'Eva', 0) === 0, 'find first Eva');
  assert(findNextMatch('Evangelion', 'Eva', 0) === -1, 'no substring match');
  assert(findNextMatch('the Eva series', 'Eva', 0) === 4, 'word boundary mid-string');
  assert(findNextMatch('eva is Eva', 'Eva', 0) === 7, 'case-sensitive');

  const base = '<p>Eva met Eva and Eva again.</p>';
  const all = applyManagedLinks(base, [
    { id: '1', word: 'Eva', url: 'https://example.com/eva', maxOccurrences: null },
  ]);
  assert((all.match(/<a /g) || []).length === 3, 'links all occurrences');
  assert(all.includes('href="https://example.com/eva"'), 'uses rule url');
  assert(all.includes('target="_blank"'), 'external gets target blank');

  const capped = applyManagedLinks(base, [
    { id: '1', word: 'Eva', url: '/eva', maxOccurrences: 2 },
  ]);
  assert((capped.match(/<a /g) || []).length === 2, 'respects maxOccurrences=2');
  assert(!capped.includes('target="_blank"'), 'relative has no target blank');
  assert(capped.endsWith('Eva again.</p>') || capped.includes('and Eva again'), 'third left plain');

  const withManual =
    '<p><a href="/manual">Eva</a> and Eva later.</p>';
  const skipped = applyManagedLinks(withManual, [
    { id: '1', word: 'Eva', url: '/auto', maxOccurrences: null },
  ]);
  assert(skipped.includes('href="/manual">Eva</a>'), 'keeps manual link');
  assert((skipped.match(/href="\/auto"/g) || []).length === 1, 'only links unlinked match');

  const h1 = '<h1>Eva title</h1><p>Eva body</p>';
  const noH1 = applyManagedLinks(h1, [
    { id: '1', word: 'Eva', url: '/e', maxOccurrences: null },
  ]);
  assert(noH1.startsWith('<h1>Eva title</h1>'), 'skips h1 text');
  assert(noH1.includes('<p><a href="/e"'), 'links paragraph');

  const code = '<p>use <code>Eva</code> and Eva</p>';
  const noCode = applyManagedLinks(code, [
    { id: '1', word: 'Eva', url: '/e', maxOccurrences: null },
  ]);
  assert(noCode.includes('<code>Eva</code>'), 'skips code');
  assert((noCode.match(/<a /g) || []).length === 1, 'links outside code');

  const overlapHtml = '<p>Neon Genesis is great. Neon too.</p>';
  const overlap = applyManagedLinks(overlapHtml, [
    { id: 'short', word: 'Neon', url: '/neon', maxOccurrences: null },
    { id: 'long', word: 'Neon Genesis', url: '/ng', maxOccurrences: null },
  ]);
  assert(/href="\/ng"[^>]*>Neon Genesis<\/a>/.test(overlap), 'longer phrase wins');
  assert(/href="\/neon"[^>]*>Neon<\/a>/.test(overlap), 'later short still links');
  assert(!/href="\/neon"[^>]*>Neon<\/a> Genesis/.test(overlap), 'does not split longer phrase');

  const { counts } = applyManagedLinksWithCounts(base, [
    { id: 'r1', word: 'Eva', url: '/e', maxOccurrences: 2 },
  ]);
  assert(counts.get('r1') === 2, 'count respects cap');

  assert(countEligible(base, 'Eva') === 3, 'eligible count ignores cap');
  assert(countEligible(h1, 'Eva') === 1, 'eligible skips h1');

  const md = renderMarkdown('# Eva Heading\n\nEva in **body** and [Eva](/manual).\n');
  const fromMd = applyManagedLinks(md, [
    { id: '1', word: 'Eva', url: '/auto', maxOccurrences: null },
  ]);
  assert(fromMd.includes('<h1'), 'markdown has h1');
  const h1Inner = (fromMd.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
  assert(!h1Inner.includes('<a '), 'no link inside h1 from md');
  assert(fromMd.includes('href="/manual"'), 'manual md link preserved');
  assert((fromMd.match(/href="\/auto"/g) || []).length >= 1, 'auto-links body from md');

  if (failed) {
    console.error(`\n${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nAll managed-links checks passed.');
}

run();
