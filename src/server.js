'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { createApp } = require('./app');
const { getDb, closeDb, checkDb } = require('./db/client');
const { assertSecureConfig } = require('./middleware/security');

function ensureDirs() {
  const dirs = [
    config.dataDir,
    config.uploadsDir,
    path.join(config.uploadsDir, 'images'),
    path.join(config.uploadsDir, 'gifs'),
    path.join(config.uploadsDir, 'videos'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function main() {
  assertSecureConfig();
  ensureDirs();

  // Open DB + run migrations before accepting traffic
  getDb();
  const dbStatus = checkDb();
  if (!dbStatus.ok) {
    throw new Error(`Database not ready: ${dbStatus.error}`);
  }

  if (config.autoSeed) {
    const { seed } = require('./db/seed');
    await seed();
  }

  const app = createApp();

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[ainmeblog] ${config.siteName} listening on port ${config.port} (${config.env})`
    );
    // eslint-disable-next-line no-console
    console.log(`[ainmeblog] database: ${config.databasePath}`);
  });

  // Avoid hanging sockets on deploy
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  let shuttingDown = false;

  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`[ainmeblog] ${signal} received, shutting down…`);
    server.close(() => {
      closeDb();
      // eslint-disable-next-line no-console
      console.log('[ainmeblog] shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('[ainmeblog] forced exit after timeout');
      process.exit(1);
    }, 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    // eslint-disable-next-line no-console
    console.error('[ainmeblog] uncaughtException', err);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[ainmeblog] unhandledRejection', reason);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[ainmeblog] failed to start:', err);
  closeDb();
  process.exit(1);
});
