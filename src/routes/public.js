'use strict';

const express = require('express');
const { paths } = require('../utils/slug');
const publicController = require('../controllers/publicController');
const {
  contactLimiter,
  commentLimiter,
  reactionLimiter,
} = require('../middleware/security');

const router = express.Router();

router.get(paths.home(), publicController.home);
router.get(paths.blog(), publicController.blogIndex);

// Legacy /blog/:slug → 301 to /{category}/{slug}
router.get('/blog/:slug', publicController.blogPostRedirect);
// Legacy engagement under /blog/:slug (still accepted; redirects after action)
router.post('/blog/:slug/comments', commentLimiter, publicController.postComment);
router.post('/blog/:slug/reactions', reactionLimiter, publicController.postReaction);

// Legacy /category/:slug → 301 /{slug}
router.get('/category/:slug', publicController.categoryLegacyRedirect);

router.get('/tag/:slug', publicController.tagArchive);
router.get('/work/:slug', publicController.workArchive);
router.get(paths.search(), publicController.search);
router.get(paths.social(), publicController.socialPage);
router.get(paths.archive(), publicController.archive);
router.get(paths.about(), publicController.about);
router.get(paths.contact(), publicController.contactGet);
router.post(paths.contact(), contactLimiter, publicController.contactPost);
router.get(paths.rss(), publicController.rss);
router.get(paths.sitemap(), publicController.sitemap);

// Category-prefixed articles + archives (must be after static routes)
router.post(
  '/:categorySlug/:postSlug/comments',
  commentLimiter,
  publicController.postComment
);
router.post(
  '/:categorySlug/:postSlug/reactions',
  reactionLimiter,
  publicController.postReaction
);
router.get('/:categorySlug/:postSlug', publicController.categoryPost);
router.get('/:categorySlug', publicController.categoryArchive);

module.exports = router;
