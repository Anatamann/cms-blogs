'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const session = require('express-session');

const config = require('./config');
const routes = require('./routes');
const trailingSlash = require('./middleware/trailingSlash');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { paths } = require('./utils/slug');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);

  app.locals.siteName = config.siteName;
  app.locals.paths = paths;
  app.locals.appUrl = config.appUrl;

  app.use(
    helmet({
      contentSecurityPolicy: false, // tighten in hardening phase
    })
  );
  app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use(trailingSlash);
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use(
    session({
      name: 'ainme.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Nav active state + template helpers (Phase 5 a11y)
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    res.locals.navIsActive = (href) => {
      if (!href) return false;
      if (href === '/') return req.path === '/';
      return req.path === href || req.path.startsWith(`${href}/`);
    };
    next();
  });

  app.use(
    express.static(path.join(config.rootDir, 'public'), {
      maxAge: config.isProd ? '1d' : 0,
      index: false,
    })
  );

  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
