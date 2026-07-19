'use strict';

const express = require('express');
const health = require('./health');
const publicRoutes = require('./public');
const adminRoutes = require('./admin');

const router = express.Router();

router.use(health);
router.use(publicRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
