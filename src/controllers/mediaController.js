'use strict';

const mediaService = require('../services/media');
const { paths } = require('../utils/slug');
const { isValidId } = require('../utils/uuid');
const { formatDate } = require('../utils/format');
const { safeAdminReturnTo, withReturnTo } = require('../utils/returnTo');

function mediaRedirect(basePath, { type, returnTo, page } = {}) {
  const params = new URLSearchParams();
  if (type && type !== 'all') params.set('type', type);
  if (page && Number(page) > 1) params.set('page', String(page));
  if (returnTo) params.set('returnTo', returnTo);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function mediaLibrary(req, res) {
  const type = ['image', 'gif', 'video', 'all'].includes(req.query.type)
    ? req.query.type
    : 'all';
  const page = Math.max(1, Number(req.query.page) || 1);
  const returnTo = safeAdminReturnTo(req.query.returnTo);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const result = mediaService.listMedia({
    type: type === 'all' ? undefined : type,
    page,
    limit: 24,
    q: q || undefined,
  });

  res.render('admin/media', {
    title: 'Media library',
    items: result.items,
    pagination: result,
    typeFilter: type,
    q,
    formatDate,
    error: null,
    returnTo,
    withReturnTo,
  });
}

async function mediaUpload(req, res) {
  const type = ['image', 'gif', 'video', 'all'].includes(req.body.type || req.query.type)
    ? req.body.type || req.query.type
    : 'all';
  const returnTo = safeAdminReturnTo(req.body.returnTo || req.query.returnTo);
  const files = req.files && req.files.length ? req.files : req.file ? [req.file] : [];

  if (!files.length) {
    req.flash('error', 'Choose one or more files to upload.');
    return res.redirect(mediaRedirect(paths.admin.media(), { type, returnTo }));
  }

  const alt = String(req.body.alt || '').trim();
  const ok = [];
  const failed = [];

  for (const file of files) {
    try {
      const item = await mediaService.processAndStore(
        file.buffer,
        file.originalname,
        file.mimetype,
        { alt }
      );
      ok.push(item.filename || item.type);
    } catch (err) {
      failed.push(`${file.originalname || 'file'}: ${err.message || 'failed'}`);
    }
  }

  if (ok.length && !failed.length) {
    req.flash(
      'ok',
      returnTo
        ? `Uploaded ${ok.length} file(s). Continue editing — use Insert media to embed.`
        : `Uploaded ${ok.length} file(s).`
    );
  } else if (ok.length && failed.length) {
    req.flash(
      'ok',
      `Uploaded ${ok.length}; ${failed.length} failed: ${failed.slice(0, 3).join('; ')}`
    );
  } else {
    req.flash('error', failed[0] || 'Upload failed.');
  }

  if (returnTo && ok.length) {
    return res.redirect(returnTo);
  }
  return res.redirect(mediaRedirect(paths.admin.media(), { type, returnTo }));
}

function mediaDelete(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();

  const ok = mediaService.deleteMedia(id);
  if (ok) {
    req.flash('ok', 'Media deleted.');
  } else {
    req.flash('error', 'Media not found.');
  }
  const type = req.body.type || req.query.type || 'all';
  const returnTo = safeAdminReturnTo(req.body.returnTo || req.query.returnTo);
  return res.redirect(mediaRedirect(paths.admin.media(), { type, returnTo }));
}

function mediaUpdateAlt(req, res, next) {
  const { id } = req.params;
  if (!isValidId(id)) return next();

  const alt = String(req.body.alt || '').trim();
  const item = mediaService.updateAlt(id, alt);
  if (!item) {
    req.flash('error', 'Media not found.');
  } else {
    req.flash('ok', 'Alt text saved.');
  }
  const type = req.body.type || 'all';
  const returnTo = safeAdminReturnTo(req.body.returnTo || req.query.returnTo);
  return res.redirect(mediaRedirect(paths.admin.media(), { type, returnTo }));
}

/**
 * JSON list for post editor media picker modal.
 * Query: q, type, page, limit
 */
function mediaJson(req, res) {
  const type = ['image', 'gif', 'video'].includes(req.query.type)
    ? req.query.type
    : undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24));
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const result = mediaService.listMedia({
    type,
    page,
    limit,
    q: q || undefined,
  });
  res.json({
    items: result.items.map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      thumbUrl: m.thumbUrl,
      markdown: m.markdown,
      alt: m.alt,
      filename: m.filename,
    })),
    page: result.page,
    totalPages: result.totalPages,
    total: result.total,
  });
}

module.exports = {
  mediaLibrary,
  mediaUpload,
  mediaDelete,
  mediaUpdateAlt,
  mediaJson,
};
