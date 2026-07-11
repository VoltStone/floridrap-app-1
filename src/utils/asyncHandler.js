'use strict';

// Express 5 actually forwards rejected async handler promises to next()
// automatically, but wrapping explicitly keeps this codebase correct even
// if it's ever downgraded to Express 4, and makes the intent obvious.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
