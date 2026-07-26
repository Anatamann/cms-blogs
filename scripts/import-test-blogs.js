'use strict';

/**
 * Import ODT posts from public/test-blogs into the CMS (published).
 *
 *   node scripts/import-test-blogs.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { eq } = require('drizzle-orm');

const config = require('../src/config');
const { getDb, closeDb, schema } = require('../src/db/client');
const postsService = require('../src/services/posts');
const tagsService = require('../src/services/tags');
const categoriesService = require('../src/services/categories');
const { slugify } = require('../src/utils/slug');

const { users } = schema;

const TEST_DIR = path.join(config.rootDir, 'public/test-blogs');

/** @type {Array<{ file: string, title: string, slug: string, workTitle: string, excerpt: string, categorySlugs: string[], tagNames: string[] }>} */
const MANIFEST = [
  {
    file: 'Dr. Stone Anime Season 2 Update_ A Monumental Evolution.odt',
    title: 'Dr. Stone Anime Season 2 Update: A Monumental Evolution',
    slug: 'dr-stone-season-2-stone-wars',
    workTitle: 'Dr. Stone',
    excerpt:
      'Season 2 of Dr. Stone, “Stone Wars,” continues Senku’s Kingdom of Science against the Tsukasa Empire with science, strategy, and standout animation.',
    categorySlugs: ['reviews'],
    tagNames: ['Action', 'Comedy'],
  },
  {
    file: '_Mushoku Tensei_ Jobless Reincarnation_ - An Epic Journey of a 30 year old Virgin.odt',
    title: 'Mushoku Tensei: Jobless Reincarnation — Season 1 Recap',
    slug: 'mushoku-tensei-season-1-recap',
    workTitle: 'Mushoku Tensei: Jobless Reincarnation',
    excerpt:
      'A full recap of Mushoku Tensei season 1: Rudeus’s second life, Roxy, Eris, the Mana Calamity, and the road to the Demon Continent.',
    categorySlugs: ['reviews'],
    tagNames: ['Isekai', 'Action', 'Romantic Drama'],
  },
  {
    file: 'Mushoku Tensei Season 2 _ Episode 0.odt',
    title: 'Mushoku Tensei Season 2 — Episode 0: Fitz the Guardian',
    slug: 'mushoku-tensei-season-2-episode-0',
    workTitle: 'Mushoku Tensei: Jobless Reincarnation',
    excerpt:
      'Breaking down Episode 0 “Fitz the Guardian”: Sylphiette’s path, Princess Ariel, and Asura Kingdom politics before Season 2 proper.',
    categorySlugs: ['news', 'reviews'],
    tagNames: ['Isekai', 'Periodic', 'Romantic Drama'],
  },
  {
    file: 'Oshi No ko on billboard cart #1.odt',
    title: 'How Oshi no Ko’s Opening Theme Made History on Billboard',
    slug: 'oshi-no-ko-idol-billboard',
    workTitle: 'Oshi no Ko',
    excerpt:
      'YOASOBI’s “Idol” becomes the first Japanese song to top Billboard Global Excl. U.S. — what powered Oshi no Ko’s global music moment.',
    categorySlugs: ['news'],
    tagNames: ['Romantic Drama', 'Comedy'],
  },
];

function extractOdtParagraphs(odtPath) {
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'odt-'));
  try {
    execFileSync('unzip', ['-qo', odtPath, 'content.xml', '-d', tmp]);
    const xmlPath = path.join(tmp, 'content.xml');
    const xml = fs.readFileSync(xmlPath, 'utf8');
    // Extract text:p and text:h blocks
    const blocks = [];
    const re = /<text:(?:h|p)\b[^>]*>([\s\S]*?)<\/text:(?:h|p)>/g;
    let m;
    while ((m = re.exec(xml))) {
      const inner = m[1]
        .replace(/<text:line-break\/>/g, '\n')
        .replace(/<text:s[^/]*\/>/g, ' ')
        .replace(/<text:tab\/>/g, '\t')
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#\d+;/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (inner) blocks.push(inner);
    }
    return blocks;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function paragraphsToMarkdown(paras) {
  const lines = [];
  for (const p of paras) {
    // Skip chatty AI wrappers
    if (/^Sure, I can give you/i.test(p)) continue;
    if (/^If I were an excellent blogger/i.test(p)) continue;
    if (/^I hope you enjoyed reading/i.test(p)) continue;
    if (/^That's the recap of/i.test(p)) continue;
    if (/^Source: Conversation with Bing/i.test(p)) {
      lines.push('');
      lines.push('---');
      lines.push('');
      lines.push(`*${p}*`);
      continue;
    }
    if (p === '---') {
      lines.push('');
      lines.push('---');
      lines.push('');
      continue;
    }
    // Bullet-ish lines starting with -
    if (/^[-•]\s/.test(p) || /^- In the /.test(p)) {
      lines.push(p.startsWith('-') ? p : `- ${p}`);
      lines.push('');
      continue;
    }
    // Character list headers
    if (/^Characters introduced/i.test(p) || /^The 4 Greyrat/i.test(p)) {
      lines.push(`## ${p}`);
      lines.push('');
      continue;
    }
    // Short proper names alone → list items if previous was character intro
    if (p.length < 40 && !/[.!?]$/.test(p) && /^[A-Z]/.test(p) && !p.includes('  ')) {
      // keep as paragraph; many are names
    }

    lines.push(p);
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}

async function ensureTags(names) {
  const ids = [];
  for (const name of names) {
    const slug = slugify(name);
    let tag = tagsService.getBySlug(slug);
    if (!tag) {
      // try case-insensitive
      tag = tagsService.listTags().find((t) => t.name.toLowerCase() === name.toLowerCase());
    }
    if (!tag) {
      tag = await tagsService.createTag({ name });
      console.log('  + tag', tag.name);
    }
    ids.push(tag.id);
  }
  return ids;
}

function ensureCategories(slugs) {
  const ids = [];
  for (const slug of slugs) {
    const cat = categoriesService.getBySlug(slug);
    if (!cat) {
      console.warn('  ! missing category', slug, '— skip');
      continue;
    }
    ids.push(cat.id);
  }
  return ids;
}

async function main() {
  getDb();

  const author =
    getDb().select().from(users).where(eq(users.username, 'octopus')).get() ||
    getDb().select().from(users).where(eq(users.username, 'aria')).get() ||
    getDb().select().from(users).all()[0];

  if (!author) {
    console.error('No users in DB. Run npm run db:seed first.');
    process.exit(1);
  }

  console.log('Importing test blogs as author:', author.username);
  console.log('From:', TEST_DIR);

  let created = 0;
  let skipped = 0;

  for (const item of MANIFEST) {
    const odtPath = path.join(TEST_DIR, item.file);
    if (!fs.existsSync(odtPath)) {
      console.warn('Missing file:', item.file);
      continue;
    }

    const existing = postsService.getBySlug(item.slug, { includeDrafts: true });
    if (existing) {
      console.log('skip (exists):', item.slug);
      skipped += 1;
      continue;
    }

    console.log('import:', item.title);
    const paras = extractOdtParagraphs(odtPath);
    let bodyMd = paragraphsToMarkdown(paras);
    if (!bodyMd.trim()) {
      console.warn('  empty body — skip');
      continue;
    }

    // Lead with title as H1 if not present
    if (!bodyMd.startsWith('#')) {
      bodyMd = `# ${item.title}\n\n${bodyMd}`;
    }

    const tagIds = await ensureTags(item.tagNames);
    const categoryIds = ensureCategories(item.categorySlugs);

    const post = await postsService.createPost({
      title: item.title,
      slug: item.slug,
      workTitle: item.workTitle || '',
      excerpt: item.excerpt,
      bodyMd,
      status: 'published',
      authorId: author.id,
      categoryIds,
      tagIds,
    });

    console.log('  →', `/blog/${post.slug}`, `(${post.id})`);
    created += 1;
  }

  console.log(`\nDone. created=${created} skipped=${skipped}`);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  closeDb();
  process.exit(1);
});
