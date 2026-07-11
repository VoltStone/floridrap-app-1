'use strict';

// Vercel serverless entry point. This deliberately does NOT call
// app.listen() (that only happens in src/server.js, used for local dev /
// traditional hosting) — Vercel invokes an exported Express app directly
// as a request handler for each incoming request. Every actual route,
// middleware, and view lives in src/app.js unchanged; this file only
// exists to give Vercel something to point at.
module.exports = require('../src/app');
