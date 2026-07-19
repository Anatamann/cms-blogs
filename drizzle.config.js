'use strict';

const path = require('path');

/** @type {import('drizzle-kit').Config} */
module.exports = {
  schema: './src/db/schema.js',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(__dirname, 'data', 'ainme.sqlite'),
  },
};
