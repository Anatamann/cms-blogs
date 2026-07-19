'use strict';

const mediaService = require('../services/media');
const { paths } = require('../utils/slug');
const { isValidId } = require('../utils/uuid');
const { formatDate } = require('../utils/format');

function mediaLibrary(req, res) {
  const type = ['image', 'gif', 'video', 'all'].includes(req.query.type)
    ? req.query.type
    : 'all';
  const page = Math.max(1, Number(req.query.page) || 1);

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
  });
}

async function mediaUpload(req, res) {
  const type = ['image', 'gif', 'video', 'all'].includes(req.query.type)
    ? req.query.type
    : 'all';

  if (!req.file) {
    req.flash('error', 'Choose a file to upload.');
    return res.redirect(`${paths.admin.media()}?type=${type}`);
  }

  try {
    const alt = String(req.body.alt || '').trim();
    const item = await mediaService.processAndStore(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      { alt }
    );
    req.flash('ok', `Uploaded ${item.type}: ${item.filename}`);
    return res.redirect(`${paths.admin.media()}?type=${type}`);
  } catch (err) {
    req.flash('error', err.message || 'Upload failed.');
    return res.redirect(`${paths.admin.media()}?type=${type}`);
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
  return res.redirect(`${paths.admin.media()}?type=${type}`);
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
  return res.redirect(`${paths.admin.media()}?type=${type}`);
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
