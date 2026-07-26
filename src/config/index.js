'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = path.resolve(__dirname, '../..');

const dataDir = path.resolve(rootDir, process.env.DATA_DIR || './data');
const databaseFile = process.env.DATABASE_FILE || 'ainme.sqlite';

/**
 * Super-admin login usernames (comma-separated) from private env only.
 * These accounts can create/edit/delete authors in /mantri/authors.
 * Example in private .env: SUPER_ADMIN_USERNAMES=myadmin
 * Also accepts SUPER_ADMIN_USERNAME (singular).
 * Empty = no super-admins until you set the env (safer for public templates).
 */
function parseSuperAdmins() {
  const raw =
    process.env.SUPER_ADMIN_USERNAMES || process.env.SUPER_ADMIN_USERNAME || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const superAdminUsernames = parseSuperAdmins();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  siteName: process.env.SITE_NAME || 'Ainme',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  rootDir,
  dataDir,
  databasePath: path.isAbsolute(databaseFile)
    ? databaseFile
    : path.join(dataDir, databaseFile),
  uploadsDir: path.resolve(rootDir, process.env.UPLOADS_DIR || './public/uploads'),
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  autoSeed: process.env.AUTO_SEED === 'true' || process.env.AUTO_SEED === '1',
  /** @type {string[]} lowercase usernames with super-admin privileges */
  superAdminUsernames,
  /**
   * Public site uses HTTPS (APP_URL). Used for Secure cookies, HSTS, CSP upgrade.
   * Local Docker with APP_URL=http://localhost:8080 must NOT force Secure cookies
   * or browsers drop the session and login "fails" with no error.
   */
  publicIsHttps: String(process.env.APP_URL || 'http://localhost:3000')
    .trim()
    .toLowerCase()
    .startsWith('https://'),
  media: {
    maxVideoBytes: Number(process.env.MAX_VIDEO_BYTES) || 30 * 1024 * 1024,
    maxImageBytes: Number(process.env.MAX_IMAGE_BYTES) || 15 * 1024 * 1024,
    maxGifBytes: Number(process.env.MAX_GIF_BYTES) || 15 * 1024 * 1024,
    maxImageDimension: Number(process.env.MAX_IMAGE_DIMENSION) || 1920,
    thumbWidth: Number(process.env.THUMB_WIDTH) || 400,
    imageQuality: Number(process.env.IMAGE_QUALITY) || 80,
    /** When true and ffmpeg is available, re-encode large videos lightly */
    compressVideo: process.env.COMPRESS_VIDEO === 'true' || process.env.COMPRESS_VIDEO === '1',
  },
};

/**
 * @param {{ username?: string } | string | null | undefined} userOrName
 */
function isSuperAdmin(userOrName) {
  const name =
    typeof userOrName === 'string'
      ? userOrName
      : userOrName && userOrName.username
        ? userOrName.username
        : '';
  if (!name) return false;
  return config.superAdminUsernames.includes(String(name).trim().toLowerCase());
}

config.isSuperAdmin = isSuperAdmin;

module.exports = config;
