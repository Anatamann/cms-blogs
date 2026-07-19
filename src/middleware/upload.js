'use strict';

const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');

const maxBytes = Math.max(
  config.media.maxVideoBytes,
  config.media.maxImageBytes,
  config.media.maxGifBytes
);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: maxBytes,
    files: 1,
  },
  fileFilter(_req, file, cb) {
    const mime = String(file.mimetype || '').toLowerCase();
    const allowed = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ];
    if (!allowed.includes(mime)) {
      const err = new Error(`Unsupported MIME type: ${mime}`);
      err.status = 400;
      return cb(err);
    }
    return cb(null, true);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many uploads. Try again later.',
});

/**
 * Single file field "file"
 */
const singleUpload = upload.single('file');

function handleUpload(req, res, next) {
  singleUpload(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        err.message = `File too large (max ${(maxBytes / (1024 * 1024)).toFixed(0)}MB)`;
      }
      err.status = 400;
    }
    return next(err);
  });
}

module.exports = {
  handleUpload,
  uploadLimiter,
  maxBytes,
};
