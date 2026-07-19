'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = path.resolve(__dirname, '../..');

const dataDir = path.resolve(rootDir, process.env.DATA_DIR || './data');
const databaseFile = process.env.DATABASE_FILE || 'ainme.sqlite';

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  siteName: process.env.SITE_NAME || 'Ainme Blog',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-change-me',
  rootDir,
  dataDir,
  databasePath: path.isAbsolute(databaseFile)
    ? databaseFile
    : path.join(dataDir, databaseFile),
  uploadsDir: path.resolve(rootDir, process.env.UPLOADS_DIR || './public/uploads'),
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  autoSeed: process.env.AUTO_SEED === 'true' || process.env.AUTO_SEED === '1',
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

module.exports = config;
