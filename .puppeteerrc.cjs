const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // This tells Puppeteer to install Chrome INSIDE your project folder
  // so it's always found regardless of the server's global settings.
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};