'use strict';

const { csrfSync } = require('csrf-sync');
const logger = require('../utils/logger');

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  // This app is server-rendered HTML forms, not a JSON/SPA API, so the
  // token travels as a hidden input (`_csrf`) rather than a custom header.
  // The token itself is bound to the server-side session (synchronizer
  // token pattern) — an attacker's site can make the browser send the
  // session cookie automatically, but it cannot read or guess the token
  // value to include in a forged form, which is exactly what stops CSRF.
  getTokenFromRequest: (req) => req.body && req.body._csrf,
});

// Makes a fresh/current token available to every view via `csrfToken`,
// so any page that renders a form (login, register, add-to-cart,
// checkout) can embed it without each route remembering to do so.
function attachCsrfToken(req, res, next) {
  res.locals.csrfToken = generateToken(req);
  next();
}

// Wraps the library's protection middleware purely to log denials as a
// security event before the generic error handler turns it into a
// user-facing 403.
function csrfProtection(req, res, next) {

  console.log("BODY:", req.body);
  console.log("CSRF RECEIVED:", req.body?._csrf);

  csrfSynchronisedProtection(req, res, (err) => {
    if (err) {
      logger.security('csrf_validation_failed', { 
        ip:req.ip,
        path:req.originalUrl
      });
    }
    next(err);
  });
}
