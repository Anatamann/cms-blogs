'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { createApp } = require('./app');
const { getDb, closeDb, checkDb } = require('./db/client');

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

  function shutdown(signal) {
    // eslint-disable-next-line no-console
    console.log(`[ainmeblog] ${signal} received, shutting down…`);
    server.close(() => {
      closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[ainmeblog] failed to start:', err);
  closeDb();
  process.exit(1);
});
