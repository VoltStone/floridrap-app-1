'use strict';

const app = require('./app');
const env = require('./config/env');
const logger = require('./utils/logger');

const server = app.listen(env.PORT, () => {
  logger.info(`Floridrap Plus listening on port ${env.PORT}`, { env: env.NODE_ENV });
});

// Fail loudly on unhandled promise rejections rather than continuing in a
// possibly-corrupted state.
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection', err);
  server.close(() => process.exit(1));
});
