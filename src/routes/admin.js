'use strict';

const express = require('express');
const adminController = require('../controllers/adminController');
const mediaController = require('../controllers/mediaController');
const {
  requireAuth,
  requireSuperAdmin,
  redirectIfAuthenticated,
  ensureCsrf,
  verifyCsrf,
  flashMiddleware,
  exposeAdminLocals,
} = require('../middleware/auth');
const { handleUpload, uploadLimiter } = require('../middleware/upload');
const { loginLimiter, writeLimiter } = require('../middleware/security');

const router = express.Router();

router.use(ensureCsrf);
router.use(flashMiddleware);

// Public within /admin: login
router.get('/login', redirectIfAuthenticated, exposeAdminLocals, adminController.loginForm);
router.post(
  '/login',
  loginLimiter,
  redirectIfAuthenticated,
  adminController.loginSubmit
);

// Everything else requires auth
router.use(requireAuth);
router.use(exposeAdminLocals);

router.get('/', adminController.dashboard);
router.post('/logout', verifyCsrf, adminController.logout);

router.get('/posts', adminController.postsList);
router.get('/posts/new', adminController.postNewGet);
// Form preview / draft (create or unsaved edit) — before /posts/:id/*
router.post(
  '/posts/preview',
  writeLimiter,
  verifyCsrf,
  adminController.postPreviewForm
);
router.post(
  '/posts/draft',
  writeLimiter,
  verifyCsrf,
  adminController.postDraftForMedia
);
router.post('/posts', writeLimiter, verifyCsrf, adminController.postCreate);

router.get('/posts/:id/edit', adminController.postEditGet);
router.post('/posts/:id/edit', writeLimiter, verifyCsrf, adminController.postUpdate);
router.post('/posts/:id/delete', writeLimiter, verifyCsrf, adminController.postDelete);
router.get('/posts/:id/preview', adminController.postPreview);
router.post(
  '/posts/:id/hyperlinks',
  writeLimiter,
  verifyCsrf,
  adminController.hyperlinkCreate
);
router.post(
  '/posts/:id/hyperlinks/:ruleId/edit',
  writeLimiter,
  verifyCsrf,
  adminController.hyperlinkUpdate
);
router.post(
  '/posts/:id/hyperlinks/:ruleId/delete',
  writeLimiter,
  verifyCsrf,
  adminController.hyperlinkDelete
);

router.get('/settings', adminController.settingsGet);
router.post('/settings', writeLimiter, verifyCsrf, adminController.settingsPost);

// Lightweight analytics (all authors)
router.get('/analytics', adminController.analyticsGet);

// Super-admin: author accounts
router.get('/authors', requireSuperAdmin, adminController.authorsList);
router.get('/authors/new', requireSuperAdmin, adminController.authorNewGet);
router.post('/authors', writeLimiter, verifyCsrf, requireSuperAdmin, adminController.authorCreate);
router.get('/authors/:id/edit', requireSuperAdmin, adminController.authorEditGet);
router.post(
  '/authors/:id/edit',
  writeLimiter,
  verifyCsrf,
  requireSuperAdmin,
  adminController.authorUpdate
);
router.post(
  '/authors/:id/delete',
  writeLimiter,
  verifyCsrf,
  requireSuperAdmin,
  adminController.authorDelete
);

// Tags (genres / topics)
router.get('/ads', adminController.adsList);
router.get('/ads/new', adminController.adNewGet);
router.post('/ads', writeLimiter, verifyCsrf, adminController.adCreate);
router.get('/ads/:id/edit', adminController.adEditGet);
router.post('/ads/:id/edit', writeLimiter, verifyCsrf, adminController.adUpdate);
router.post('/ads/:id/delete', writeLimiter, verifyCsrf, adminController.adDelete);

router.get('/social', adminController.socialList);
router.get('/social/new', adminController.socialNewGet);
router.post('/social', writeLimiter, verifyCsrf, adminController.socialCreate);
router.post(
  '/social/fetch-preview',
  writeLimiter,
  verifyCsrf,
  adminController.socialFetchPreview
);
router.post('/social/pins', writeLimiter, verifyCsrf, adminController.socialPinsSave);
router.get('/social/:id/edit', adminController.socialEditGet);
router.post('/social/:id/edit', writeLimiter, verifyCsrf, adminController.socialUpdate);
router.post('/social/:id/delete', writeLimiter, verifyCsrf, adminController.socialDelete);

router.get('/tags', adminController.tagsList);
router.get('/tags/new', adminController.tagNewGet);
router.post('/tags', writeLimiter, verifyCsrf, adminController.tagCreate);
router.post('/tags/import', writeLimiter, verifyCsrf, adminController.tagsImport);
router.get('/tags/:id/edit', adminController.tagEditGet);
router.post('/tags/:id/edit', writeLimiter, verifyCsrf, adminController.tagUpdate);
router.post('/tags/:id/delete', writeLimiter, verifyCsrf, adminController.tagDelete);

// Comment moderation
router.get('/comments', adminController.commentsList);
router.post(
  '/comments/:id/approve',
  writeLimiter,
  verifyCsrf,
  adminController.commentApprove
);
router.post(
  '/comments/:id/reject',
  writeLimiter,
  verifyCsrf,
  adminController.commentReject
);
router.post(
  '/comments/:id/delete',
  writeLimiter,
  verifyCsrf,
  adminController.commentDelete
);

// Media library
router.get('/media', mediaController.mediaLibrary);
router.get('/media.json', mediaController.mediaJson);
router.post(
  '/media/upload',
  uploadLimiter,
  handleUpload,
  verifyCsrf,
  mediaController.mediaUpload
);
router.post('/media/:id/delete', writeLimiter, verifyCsrf, mediaController.mediaDelete);
router.post('/media/:id/alt', writeLimiter, verifyCsrf, mediaController.mediaUpdateAlt);

module.exports = router;
