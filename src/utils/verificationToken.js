'use strict';

const crypto = require('node:crypto');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateVerificationToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  return { token, tokenHash, expiresAt };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = { generateVerificationToken, hashToken };
