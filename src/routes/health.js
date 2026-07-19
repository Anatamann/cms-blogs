'use strict';

const express = require('express');
const { checkDb } = require('../db/client');

const router = express.Router();

router.get('/health', (_req, res) => {
  const db = checkDb();
  const status = db.ok ? 'ok' : 'degraded';
  const code = db.ok ? 200 : 503;

  res.status(code).json({
    status,
    service: 'ainmeblog',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      ok: db.ok,
      // path omitted in case of sensitive deploy layouts; presence only
      connected: db.ok,
      error: db.error || undefined,
    },
  });
});

module.exports = router;
