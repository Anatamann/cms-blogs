'use strict';

const express = require('express');
const health = require('./health');
const seo = require('./seo');
const publicRoutes = require('./public');
const adminRoutes = require('./admin');

const router = express.Router();

router.use(health);
router.use(seo);
router.use(publicRoutes);
router.use('/mantri', adminRoutes);

module.exports = router;
