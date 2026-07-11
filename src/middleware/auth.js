'use strict';

const userRepository = require('../db/repositories/userRepository');

// Loads the current user (if any) on every request and exposes it to
// views as `currentUser`, so templates can render "Bonjour, X" / login
// links without every route handler doing this lookup manually.
//
// Async, and not wrapped in asyncHandler: Express 5 natively forwards a
// rejected promise from an async middleware to the error handler, so a
// failed lookup (e.g. a database hiccup) can't crash the process or hang
// the request.
async function attachUser(req, res, next) {
  if (req.session && req.session.userId) {
    const user = await userRepository.findPublicById(req.session.userId);
    if (user) {
      req.user = user;
      res.locals.currentUser = user;
      return next();
    }
    // Session references a user that no longer exists (e.g. deleted
    // account) — don't trust it silently, clear it.
    req.session.userId = null;
  }
  res.locals.currentUser = null;
  next();
}

// Principle of least privilege: routes opt in to requiring a session,
// rather than authorization being bolted on after the fact.
function requireAuth(req, res, next) {
  if (!req.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return function roleGuard(req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).render('error', {
        title: 'Accès refusé',
        message: "Vous n'avez pas la permission d'accéder à cette page.",
      });
    }
    next();
  };
}

module.exports = { attachUser, requireAuth, requireRole };
