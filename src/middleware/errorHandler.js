'use strict';

const logger = require('../utils/logger');

function notFoundHandler(req, res) {
  res.status(404).render('error', {
    title: 'Page introuvable',
    message: "La page que vous recherchez n'existe pas ou a été déplacée.",
  });
}

// Express recognizes this as an error-handling middleware purely by its
// four-argument arity — must keep all four parameters even though `next`
// is unused, or Express will treat it as a normal middleware.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isCsrfError = err && err.code === 'EBADCSRFTOKEN';
  const status = isCsrfError ? 403 : err.status || err.statusCode || 500;

  // Full error detail (stack, request path, method, user id if present)
  // goes to the server-side log only. Never reflected back to the client —
  // stack traces leak file paths, dependency versions, and internal logic
  // that materially help an attacker.
  logger.error('Unhandled request error', err, {
    method: req.method,
    path: req.originalUrl,
    userId: req.user ? req.user.id : null,
  });

  const genericMessage = isCsrfError
    ? "Votre session a expiré ou la page a été rouverte dans un autre onglet. Merci de réessayer."
    : "Une erreur est survenue. Merci de réessayer dans quelques instants.";

  res.status(status).render('error', {
    title: isCsrfError ? 'Session expirée' : 'Erreur',
    message: genericMessage,
  });
}

module.exports = { notFoundHandler, errorHandler };
