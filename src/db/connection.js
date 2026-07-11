'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@libsql/client');
const env = require('../config/env');
const logger = require('../utils/logger');

// This client works two ways, chosen automatically by which env vars are
// set — no other code in the app needs to know or care which one is
// active, since it's always the same `db.execute(...)` / `db.transaction()`
// API either way:
//
//  - TURSO_DATABASE_URL set (production / Vercel): connects to a remote
//    Turso database over HTTP. This is what makes the app work on Vercel
//    at all — serverless functions have no writable, persistent local
//    disk, so a local SQLite file (the previous approach) got wiped/failed
//    to write on every cold start.
//  - Not set (local dev): opens a local embedded SQLite file, so `npm run
//    dev` still works with zero setup / no account needed, exactly like
//    before.
const usingRemote = Boolean(env.TURSO_DATABASE_URL);

if (!usingRemote) {
  fs.mkdirSync(path.dirname(env.dbPath), { recursive: true });
}

const db = createClient({
  url: usingRemote ? env.TURSO_DATABASE_URL : `file:${env.dbPath}`,
  authToken: env.TURSO_AUTH_TOKEN, // ignored/unused for local file mode
});

// Best-effort only: for a remote/HTTP connection there is no guarantee this
// pragma stays in effect for every later request (each may be a fresh
// connection under the hood), so the app's actual data-integrity guarantees
// (e.g. refusing to delete a product referenced by past orders) are
// enforced explicitly in the repositories rather than relied on here. This
// just keeps local-file mode behaving exactly as it did before.
db.execute('PRAGMA foreign_keys = ON;').catch((err) => {
  logger.error('Failed to set PRAGMA foreign_keys', err);
});

logger.info('Database connected', { mode: usingRemote ? 'turso (remote)' : 'local file', path: usingRemote ? undefined : env.dbPath });

module.exports = db;
