'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { desc, eq, and, or, like, sql } = require('drizzle-orm');
const sharp = require('sharp');

const config = require('../config');
const { getDb, schema } = require('../db/client');
const { generateId, isValidId } = require('../utils/uuid');

const execFileAsync = promisify(execFile);
const { media } = schema;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);
const GIF_MIMES = new Set(['image/gif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

function ensureUploadDirs() {
  for (const sub of ['images', 'gifs', 'videos']) {
    fs.mkdirSync(path.join(config.uploadsDir, sub), { recursive: true });
  }
}

/**
 * @param {string} originalName
 */
function safeOriginalStem(originalName) {
  const base = path.basename(String(originalName || 'file'));
  const stem = base.replace(/\.[^.]+$/, '');
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'file';
}

/**
 * Classify upload from mimetype + extension.
 * @param {{ mimetype: string, originalname: string, size: number }} file
 * @returns {'image'|'gif'|'video'}
 */
function classifyUpload(file) {
  const mime = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();

  if (GIF_MIMES.has(mime) || ext === '.gif') return 'gif';
  if (IMAGE_MIMES.has(mime) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (VIDEO_MIMES.has(mime) || ['.mp4', '.webm', '.mov'].includes(ext)) return 'video';

  const err = new Error(`Unsupported file type: ${mime || ext || 'unknown'}`);
  err.status = 400;
  throw err;
}

/**
 * @param {'image'|'gif'|'video'} type
 * @param {number} size
 */
function assertSizeLimit(type, size) {
  const limits = {
    image: config.media.maxImageBytes,
    gif: config.media.maxGifBytes,
    video: config.media.maxVideoBytes,
  };
  const max = limits[type];
  if (size > max) {
    const mb = (max / (1024 * 1024)).toFixed(0);
    const err = new Error(
      type === 'video'
        ? `Video exceeds ${mb}MB limit`
        : `File exceeds ${mb}MB limit for ${type}`
    );
    err.status = 400;
    throw err;
  }
}

function publicUrl(relativePath) {
  const cleaned = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `/${cleaned}`;
}

/**
 * Relative path under public/: uploads/images/uuid.webp
 * @param {string} absPath
 */
function toPublicRelative(absPath) {
  const publicRoot = path.join(config.rootDir, 'public');
  const rel = path.relative(publicRoot, absPath);
  if (rel.startsWith('..')) {
    throw new Error('Upload path escaped public directory');
  }
  return rel.replace(/\\/g, '/');
}

function thumbPathFor(mainAbsPath) {
  const dir = path.dirname(mainAbsPath);
  const ext = path.extname(mainAbsPath);
  const base = path.basename(mainAbsPath, ext);
  return path.join(dir, `${base}-thumb.webp`);
}

/**
 * @param {Buffer} buffer
 * @param {string} originalname
 * @param {string} mimetype
 * @param {{ alt?: string }} [opts]
 */
async function processAndStore(buffer, originalname, mimetype, opts = {}) {
  ensureUploadDirs();

  const fileMeta = { mimetype, originalname, size: buffer.length };
  const type = classifyUpload(fileMeta);
  assertSizeLimit(type, buffer.length);

  const id = generateId();
  const stem = safeOriginalStem(originalname);
  const alt = String(opts.alt || '').slice(0, 300);

  if (type === 'image') {
    return processImage(id, stem, buffer, alt);
  }
  if (type === 'gif') {
    return processGif(id, stem, buffer, alt);
  }
  return processVideo(id, stem, buffer, mimetype, alt);
}

/**
 * @param {string} id
 * @param {string} stem
 * @param {Buffer} buffer
 * @param {string} alt
 */
async function processImage(id, stem, buffer, alt) {
  const filename = `${id}.webp`;
  const abs = path.join(config.uploadsDir, 'images', filename);
  const thumbAbs = thumbPathFor(abs);

  const pipeline = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await pipeline.metadata();

  await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: config.media.maxImageDimension,
      height: config.media.maxImageDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: config.media.imageQuality })
    .toFile(abs);

  await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: config.media.thumbWidth,
      withoutEnlargement: true,
    })
    .webp({ quality: 70 })
    .toFile(thumbAbs);

  const outMeta = await sharp(abs).metadata();
  const size = fs.statSync(abs).size;
  const rel = toPublicRelative(abs);

  return insertMediaRow({
    id,
    filename: `${stem}-${filename}`,
    path: publicUrl(rel),
    mime: 'image/webp',
    size,
    width: outMeta.width || meta.width || null,
    height: outMeta.height || meta.height || null,
    type: 'image',
    alt,
  });
}

/**
 * Preserve animated GIFs; static GIFs may convert to WebP.
 * @param {string} id
 * @param {string} stem
 * @param {Buffer} buffer
 * @param {string} alt
 */
async function processGif(id, stem, buffer, alt) {
  const meta = await sharp(buffer, { animated: true, failOn: 'none' }).metadata();
  const pages = meta.pages || 1;
  const animated = pages > 1;

  if (animated) {
    const filename = `${id}.gif`;
    const abs = path.join(config.uploadsDir, 'gifs', filename);
    fs.writeFileSync(abs, buffer);

    // Still generate a static thumb from first frame
    const thumbAbs = path.join(config.uploadsDir, 'gifs', `${id}-thumb.webp`);
    await sharp(buffer, { animated: false, failOn: 'none' })
      .resize({ width: config.media.thumbWidth, withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(thumbAbs);

    const size = fs.statSync(abs).size;
    const rel = toPublicRelative(abs);

    return insertMediaRow({
      id,
      filename: `${stem}-${filename}`,
      path: publicUrl(rel),
      mime: 'image/gif',
      size,
      width: meta.width || null,
      height: meta.height || null,
      type: 'gif',
      alt,
    });
  }

  // Static GIF → WebP in images/
  return processImage(id, stem, buffer, alt);
}

/**
 * @param {string} id
 * @param {string} stem
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} alt
 */
async function processVideo(id, stem, buffer, mimetype, alt) {
  const ext =
    EXT_BY_MIME[String(mimetype).toLowerCase()] ||
    path.extname(stem) ||
    '.mp4';
  const safeExt = ['.mp4', '.webm', '.mov'].includes(ext) ? ext : '.mp4';
  const filename = `${id}${safeExt}`;
  const abs = path.join(config.uploadsDir, 'videos', filename);

  fs.writeFileSync(abs, buffer);

  let finalPath = abs;
  let finalMime = mimetype || 'video/mp4';
  let size = fs.statSync(abs).size;

  if (config.media.compressVideo && (await ffmpegAvailable())) {
    const outAbs = path.join(config.uploadsDir, 'videos', `${id}-opt.mp4`);
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-i',
          abs,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '28',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          outAbs,
        ],
        { timeout: 120_000 }
      );
      if (fs.existsSync(outAbs)) {
        const optSize = fs.statSync(outAbs).size;
        if (optSize > 0 && optSize < size) {
          fs.unlinkSync(abs);
          fs.renameSync(outAbs, abs);
          finalMime = 'video/mp4';
          size = fs.statSync(abs).size;
        } else if (fs.existsSync(outAbs)) {
          fs.unlinkSync(outAbs);
        }
      }
    } catch {
      // keep original if ffmpeg fails
      if (fs.existsSync(outAbs)) {
        try {
          fs.unlinkSync(outAbs);
        } catch {
          /* ignore */
        }
      }
    }
  }

  // Optional poster thumb via ffmpeg
  const thumbAbs = path.join(config.uploadsDir, 'videos', `${id}-thumb.webp`);
  if (await ffmpegAvailable()) {
    try {
      const tmpJpg = path.join(config.uploadsDir, 'videos', `${id}-frame.jpg`);
      await execFileAsync(
        'ffmpeg',
        ['-y', '-i', finalPath, '-ss', '00:00:01', '-vframes', '1', tmpJpg],
        { timeout: 30_000 }
      );
      if (fs.existsSync(tmpJpg)) {
        await sharp(tmpJpg)
          .resize({ width: config.media.thumbWidth, withoutEnlargement: true })
          .webp({ quality: 70 })
          .toFile(thumbAbs);
        fs.unlinkSync(tmpJpg);
      }
    } catch {
      /* optional */
    }
  }

  const rel = toPublicRelative(finalPath);
  return insertMediaRow({
    id,
    filename: `${stem}-${path.basename(finalPath)}`,
    path: publicUrl(rel),
    mime: finalMime,
    size,
    width: null,
    height: null,
    type: 'video',
    alt,
  });
}

let _ffmpegOk = null;
async function ffmpegAvailable() {
  if (_ffmpegOk != null) return _ffmpegOk;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    _ffmpegOk = true;
  } catch {
    _ffmpegOk = false;
  }
  return _ffmpegOk;
}

/**
 * @param {object} row
 */
function insertMediaRow(row) {
  const db = getDb();
  const ts = new Date().toISOString();
  db.insert(media)
    .values({
      id: row.id,
      filename: row.filename,
      path: row.path,
      mime: row.mime,
      size: row.size,
      width: row.width,
      height: row.height,
      type: row.type,
      alt: row.alt || '',
      createdAt: ts,
    })
    .run();
  return getById(row.id);
}

function getById(id) {
  if (!isValidId(id)) return null;
  const db = getDb();
  const row = db.select().from(media).where(eq(media.id, id)).get();
  return row ? present(row) : null;
}

/**
 * @param {{ type?: string, limit?: number, page?: number, q?: string }} [opts]
 */
function listMedia(opts = {}) {
  const db = getDb();
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 24));
  const offset = (page - 1) * limit;

  const conditions = [];
  if (opts.type && ['image', 'gif', 'video'].includes(opts.type)) {
    conditions.push(eq(media.type, opts.type));
  }
  const q = String(opts.q || '').trim();
  if (q) {
    const term = `%${q.replace(/%/g, '')}%`;
    conditions.push(or(like(media.filename, term), like(media.alt, term)));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const countRow = db
    .select({ count: sql`count(*)`.mapWith(Number) })
    .from(media)
    .where(where)
    .get();

  const rows = db
    .select()
    .from(media)
    .where(where)
    .orderBy(desc(media.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  const total = countRow?.count || 0;
  return {
    items: rows.map(present),
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

function present(row) {
  const thumb = deriveThumbUrl(row.path, row.type);
  return {
    ...row,
    url: row.path,
    thumbUrl: thumb,
    markdown: toMarkdown(row),
    sizeLabel: formatBytes(row.size),
  };
}

function deriveThumbUrl(mainPath, type) {
  if (!mainPath) return null;
  // /uploads/images/uuid.webp → /uploads/images/uuid-thumb.webp
  if (type === 'image' || type === 'gif' || type === 'video') {
    const replaced = mainPath.replace(
      /(\.[a-z0-9]+)$/i,
      '-thumb.webp'
    );
    const abs = path.join(config.rootDir, 'public', replaced.replace(/^\//, ''));
    if (fs.existsSync(abs)) return replaced;
  }
  if (type === 'image' || type === 'gif') return mainPath;
  return null;
}

function toMarkdown(row) {
  const alt = row.alt || row.filename || 'media';
  if (row.type === 'video') {
    return `\n\n<video controls src="${row.path}"${row.alt ? ` title="${escapeAttr(row.alt)}"` : ''}></video>\n\n`;
  }
  return `\n\n![${escapeAttr(alt)}](${row.path})\n\n`;
}

function escapeAttr(s) {
  return String(s).replace(/[[\]]/g, '').replace(/"/g, "'");
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {string} id
 * @param {string} alt
 */
function updateAlt(id, alt) {
  const db = getDb();
  const existing = getById(id);
  if (!existing) return null;
  db.update(media)
    .set({ alt: String(alt || '').slice(0, 300) })
    .where(eq(media.id, id))
    .run();
  return getById(id);
}

/**
 * Delete DB row + files (main + thumb).
 * @param {string} id
 */
function deleteMedia(id) {
  const row = getById(id);
  if (!row) return false;

  const db = getDb();
  db.delete(media).where(eq(media.id, id)).run();

  const rel = row.path.replace(/^\//, '');
  const abs = path.join(config.rootDir, 'public', rel);
  const thumbAbs = abs.replace(/(\.[a-z0-9]+)$/i, '-thumb.webp');

  for (const p of [abs, thumbAbs]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  return true;
}

module.exports = {
  IMAGE_MIMES,
  GIF_MIMES,
  VIDEO_MIMES,
  classifyUpload,
  assertSizeLimit,
  processAndStore,
  getById,
  listMedia,
  updateAlt,
  deleteMedia,
  ensureUploadDirs,
  toMarkdown,
  ffmpegAvailable,
};
