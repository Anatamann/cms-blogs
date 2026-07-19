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

  const result = mediaService.listMedia({
    type: type === 'all' ? undefined : type,
    page,
    limit: 24,
  });

  res.render('admin/media', {
    title: 'Media library',
    items: result.items,
    pagination: result,
    typeFilter: type,
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

  if (!req.file) {
    req.flash('error', 'Choose a file to upload.');
    return res.redirect(mediaRedirect(paths.admin.media(), { type, returnTo }));
  }

  try {
    const alt = String(req.body.alt || '').trim();
    const item = await mediaService.processAndStore(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      { alt }
    );
    req.flash(
      'ok',
      returnTo
        ? `Uploaded ${item.type}: ${item.filename}. Continue editing your post — use Insert media to embed it.`
        : `Uploaded ${item.type}: ${item.filename}`
    );
    // Prefer returning to the post editor when we came from there
    if (returnTo) {
      return res.redirect(returnTo);
    }
    return res.redirect(mediaRedirect(paths.admin.media(), { type }));
  } catch (err) {
    req.flash('error', err.message || 'Upload failed.');
    return res.redirect(mediaRedirect(paths.admin.media(), { type, returnTo }));
  }
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
 * JSON list for post editor embed panel.
 */
function mediaJson(req, res) {
  const result = mediaService.listMedia({
    type: req.query.type || undefined,
    page: 1,
    limit: 30,
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
  });
}

module.exports = {
  mediaLibrary,
  mediaUpload,
  mediaDelete,
  mediaUpdateAlt,
  mediaJson,
};
