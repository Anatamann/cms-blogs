'use strict';

const express = require('express');
const config = require('../config');
const { checkDb } = require('../db/client');

const router = express.Router();

router.get('/health', (_req, res) => {
  const db = checkDb();
  const status = db.ok ? 'ok' : 'degraded';
  const code = db.ok ? 200 : 503;

  res.status(code).json({
    status,
    service: 'ainmeblog',
    env: config.env,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: {
      ok: db.ok,
      connected: db.ok,
      error: db.error || undefined,
    },
  });
});

/** Liveness only — no DB (for orchestrators) */
router.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'alive' });
});

/** Readiness — requires DB */
router.get('/health/ready', (_req, res) => {
  const db = checkDb();
  if (!db.ok) {
    return res.status(503).json({ status: 'not_ready', database: { ok: false } });
  }
  return res.status(200).json({ status: 'ready', database: { ok: true } });
});

module.exports = router;
