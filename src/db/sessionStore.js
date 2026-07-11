'use strict';

const { Store } = require('express-session');
const db = require('./connection');
const logger = require('../utils/logger');

// Replaces `memorystore` (in-process memory) as the express-session store.
// A serverless host like Vercel can spin up a fresh, isolated instance of
// this app for any given request, with no memory shared with whichever
// instance handled the previous request — an in-memory store would mean
// "logged in" and "cart contents" randomly reset mid-visit. Storing
// sessions in the same database as everything else fixes that, at the
// (acceptable, for this app's traffic) cost of one extra query per
// request instead of an in-memory lookup.
class LibsqlSessionStore extends Store {
  async get(sid, callback) {
    try {
      const { rows } = await db.execute({ sql: 'SELECT data, expires_at FROM sessions WHERE sid = ?', args: [sid] });
      const row = rows[0];
      if (!row) return callback(null, null);
      if (Number(row.expires_at) < Date.now()) {
        await this._destroyRow(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err);
    }
  }

  async set(sid, session, callback) {
    try {
      const expiresAt =
        session.cookie && session.cookie.expires
          ? new Date(session.cookie.expires).getTime()
          : Date.now() + 1000 * 60 * 60 * 2; // fallback: 2h, matches the cookie maxAge in app.js

      await db.execute({
        sql: `INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)
              ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
        args: [sid, JSON.stringify(session), expiresAt],
      });

      // Opportunistic cleanup of expired rows, run on roughly 1% of writes
      // rather than on every request or via a separate cron job — cheap,
      // and keeps the table from growing unbounded without needing any
      // extra infrastructure.
      if (Math.random() < 0.01) {
        this._sweepExpired();
      }

      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  async destroy(sid, callback) {
    try {
      await this._destroyRow(sid);
      callback && callback(null);
    } catch (err) {
      callback && callback(err);
    }
  }

  async touch(sid, session, callback) {
    return this.set(sid, session, callback);
  }

  async _destroyRow(sid) {
    await db.execute({ sql: 'DELETE FROM sessions WHERE sid = ?', args: [sid] });
  }

  _sweepExpired() {
    db.execute({ sql: 'DELETE FROM sessions WHERE expires_at < ?', args: [Date.now()] }).catch((err) => {
      logger.error('Session sweep failed', err);
    });
  }
}

module.exports = LibsqlSessionStore;
