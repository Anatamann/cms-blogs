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

const router = express.Router();

router.use(ensureCsrf);
router.use(flashMiddleware);

// Public within /admin: login
router.get('/login', redirectIfAuthenticated, exposeAdminLocals, adminController.loginForm);
router.post('/login', redirectIfAuthenticated, adminController.loginSubmit);

// Everything else requires auth
router.use(requireAuth);
router.use(exposeAdminLocals);

router.get('/', adminController.dashboard);
router.post('/logout', verifyCsrf, adminController.logout);

router.get('/posts', adminController.postsList);
router.get('/posts/new', adminController.postNewGet);
router.post('/posts', verifyCsrf, adminController.postCreate);

router.get('/posts/:id/edit', adminController.postEditGet);
router.post('/posts/:id/edit', verifyCsrf, adminController.postUpdate);
router.post('/posts/:id/delete', verifyCsrf, adminController.postDelete);
router.get('/posts/:id/preview', adminController.postPreview);

router.get('/settings', adminController.settingsGet);
router.post('/settings', verifyCsrf, adminController.settingsPost);

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
router.post('/media/:id/delete', verifyCsrf, mediaController.mediaDelete);
router.post('/media/:id/alt', verifyCsrf, mediaController.mediaUpdateAlt);

module.exports = router;
