'use strict';

const express = require('express');
const adminController = require('../controllers/adminController');
const mediaController = require('../controllers/mediaController');
const {
  requireAuth,
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
// Form preview (create or unsaved edit) — must be registered before /posts/:id/*
router.post(
  '/posts/preview',
  writeLimiter,
  verifyCsrf,
  adminController.postPreviewForm
);
router.post('/posts', writeLimiter, verifyCsrf, adminController.postCreate);

router.get('/posts/:id/edit', adminController.postEditGet);
router.post('/posts/:id/edit', writeLimiter, verifyCsrf, adminController.postUpdate);
router.post('/posts/:id/delete', writeLimiter, verifyCsrf, adminController.postDelete);
router.get('/posts/:id/preview', adminController.postPreview);

router.get('/settings', adminController.settingsGet);
router.post('/settings', writeLimiter, verifyCsrf, adminController.settingsPost);

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
