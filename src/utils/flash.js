'use strict';

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

// Reads and immediately clears any pending flash message, exposing it to
// views as `flash`. Placed in the middleware chain after the session so
// it runs on every request.
function attachFlash(req, res, next) {
  res.locals.flash = req.session.flash || null;
  req.session.flash = null;
  next();
}

module.exports = { setFlash, attachFlash };
