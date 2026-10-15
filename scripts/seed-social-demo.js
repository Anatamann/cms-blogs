'use strict';

/**
 * Load local demo social posts from src/db/seed-data/social-demo.json (gitignored).
 *   node scripts/seed-social-demo.js
 *   node scripts/seed-social-demo.js --replace
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getDb, getSqlite } = require('../src/db/client');
const social = require('../src/services/socialPosts');

const DEMO_PATH = path.join(__dirname, '../src/db/seed-data/social-demo.json');

async function main() {
  if (!fs.existsSync(DEMO_PATH)) {
    console.error('Missing', DEMO_PATH, '(create local demo JSON — it is gitignored)');
    process.exit(1);
  }
  const items = JSON.parse(fs.readFileSync(DEMO_PATH, 'utf8'));
  if (!Array.isArray(items) || items.length < 1) {
    console.error('social-demo.json must be a non-empty array');
    process.exit(1);
  }

  getDb();
  const replace = process.argv.includes('--replace');
  if (replace) {
    getSqlite().prepare('DELETE FROM social_home_pins').run();
    getSqlite().prepare('DELETE FROM social_posts').run();
    console.log('Cleared existing social posts + pins');
  }

  const ids = [];
  for (let i = 0; i < items.length; i += 1) {
    const row = items[i];
    const created = await social.create({
      ...row,
      sortOrder: i,
    });
    ids.push(created.id);
    console.log('+', created.aspectRatio, created.title || created.sourceUrl);
  }

  const pinIds = ids.slice(0, social.MAX_HOME_PINS);
  social.setHomePins(pinIds);
  console.log('Pinned', pinIds.length, 'for home carousel');
  console.log('Done. Social page:', ids.length, 'posts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
