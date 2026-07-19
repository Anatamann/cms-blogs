'use strict';

const config = require('../config');

function notFound(req, res, _next) {
  res.status(404);

  if (req.accepts('html')) {
    return res.render('pages/404', {
      title: 'Not Found',
      path: req.path,
    });
  }

  if (req.accepts('json')) {
    return res.json({ error: 'Not Found', path: req.path });
  }

  return res.type('txt').send('Not Found');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (!config.isProd) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(status);

  if (req.accepts('html')) {
    return res.render('pages/error', {
      title: 'Error',
      status,
      message: config.isProd && status === 500 ? 'Something went wrong.' : message,
    });
  }

  return res.json({
    error: config.isProd && status === 500 ? 'Internal Server Error' : message,
  });
}

module.exports = {
  notFound,
  errorHandler,
};
