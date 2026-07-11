'use strict';

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

function onLimitReached(req, res, next, options) {
  logger.security('rate_limit_exceeded', { ip: req.ip, path: req.originalUrl });
  res.status(options.statusCode).json({ error: 'Too many requests. Please try again later.' });
}

// Login/register are the highest-value targets for credential stuffing and
// account enumeration, so they get the tightest limit. Keyed by IP; in a
// real deployment behind a shared corporate NAT this should be combined
// with a per-account lockout/backoff as a secondary control.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: onLimitReached,
});

// Checkout creates DB writes and (in a real deployment) triggers a payment
// call — worth throttling independently of general browsing traffic.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: onLimitReached,
});

// A loose baseline across the whole app as defense-in-depth against basic
// scripted abuse/DoS; generous enough to never bother a real shopper.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: onLimitReached,
});

module.exports = { authLimiter, checkoutLimiter, globalLimiter };
