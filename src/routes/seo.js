'use strict';

const express = require('express');
const config = require('../config');
const { paths } = require('../utils/slug');

const router = express.Router();

/**
 * GET /robots.txt
 */
router.get('/robots.txt', (_req, res) => {
  const sitemap = `${config.appUrl.replace(/\/$/, '')}${paths.sitemap()}`;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /mantri',
    'Disallow: /mantri/',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');

  res.type('text/plain').send(body);
});

/**
 * GET /security.txt (RFC 9116 well-known also linked)
 */
router.get(['/security.txt', '/.well-known/security.txt'], (_req, res) => {
  const body = [
    `Contact: ${config.appUrl.replace(/\/$/, '')}${paths.contact()}`,
    'Preferred-Languages: en',
    `Canonical: ${config.appUrl.replace(/\/$/, '')}/.well-known/security.txt`,
    '',
  ].join('\n');

  res.type('text/plain').send(body);
});

module.exports = router;
