'use strict';

const multer = require('multer');
const rateLimit = require('express-rate-limit');
const config = require('../config');

/** Max files per multi-upload request */
const MAX_FILES = 12;
/** Total batch size across all files in one request */
const MAX_BATCH_BYTES = 30 * 1024 * 1024;

const maxPerFileBytes = Math.max(
  config.media.maxVideoBytes,
  config.media.maxImageBytes,
  config.media.maxGifBytes
);

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: maxPerFileBytes,
    files: MAX_FILES,
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

const multiUpload = upload.array('files', MAX_FILES);

/**
 * Multi-file field "files" (with legacy single "file" via same array if present).
 * Enforces total batch size ≤ 30MB.
 */
function handleUpload(req, res, next) {
  multiUpload(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          err.message = `A file is too large (max ${(maxPerFileBytes / (1024 * 1024)).toFixed(0)}MB per file)`;
        } else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          err.message = `Too many files (max ${MAX_FILES} per upload)`;
        }
        err.status = 400;
      }
      return next(err);
    }

    // Normalize: always req.files array
    if (!req.files || !req.files.length) {
      if (req.file) req.files = [req.file];
      else req.files = [];
    }

    const total = req.files.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
    if (total > MAX_BATCH_BYTES) {
      const e = new Error(
        `Total upload size ${(total / (1024 * 1024)).toFixed(1)}MB exceeds the ${MAX_BATCH_BYTES / (1024 * 1024)}MB limit`
      );
      e.status = 400;
      return next(e);
    }

    return next();
  });
}

module.exports = {
  handleUpload,
  uploadLimiter,
  maxBytes: maxPerFileBytes,
  MAX_FILES,
  MAX_BATCH_BYTES,
};
