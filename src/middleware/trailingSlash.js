'use strict';

/**
 * Normalize URLs to no trailing slash (except root) with 301.
 */
function trailingSlash(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next();
  }

  const { path: reqPath } = req;
  if (reqPath.length > 1 && reqPath.endsWith('/')) {
    const query = req.url.slice(reqPath.length);
    const target = reqPath.slice(0, -1) + query;
    return res.redirect(301, target);
  }

  return next();
}

module.exports = trailingSlash;
