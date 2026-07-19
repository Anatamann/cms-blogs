'use strict';

const express = require('express');
const { paths } = require('../utils/slug');
const publicController = require('../controllers/publicController');

const router = express.Router();

router.get(paths.home(), publicController.home);
router.get(paths.blog(), publicController.blogIndex);
router.get('/blog/:slug', publicController.blogPost);
router.get('/category/:slug', publicController.categoryArchive);
router.get('/tag/:slug', publicController.tagArchive);
router.get(paths.search(), publicController.search);
router.get(paths.archive(), publicController.archive);
router.get(paths.about(), publicController.about);
router.get(paths.contact(), publicController.contactGet);
router.post(paths.contact(), publicController.contactPost);
router.get(paths.rss(), publicController.rss);
router.get(paths.sitemap(), publicController.sitemap);

module.exports = router;
