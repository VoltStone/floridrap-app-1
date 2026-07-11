'use strict';

const db = require('../connection');

async function findByEmail(email) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email.toLowerCase()] });
  return rows[0] || null;
}

async function findPublicById(id) {
  // Deliberately excludes password_hash (and the verification token hash)
  // — callers that only need to display account info should never have
  // sensitive columns in memory/scope at all.
  const { rows } = await db.execute({
    sql: 'SELECT id, email, name, role, email_verified, created_at FROM users WHERE id = ?',
    args: [id],
  });
  return rows[0] || null;
}

/**
 * New accounts are created unverified (email_verified defaults to 0 at
 * the schema level) with a hashed verification token attached. Only the
 * SHA-256 hash is ever stored — never the raw token — mirroring how
 * passwords are handled, so a database read alone can't be used to
 * forge a valid verification link.
 */
async function create({ email, passwordHash, name, verificationTokenHash, verificationTokenExpires }) {
  const result = await db.execute({
    sql: `INSERT INTO users (email, password_hash, name, verification_token_hash, verification_token_expires)
          VALUES (?, ?, ?, ?, ?)`,
    args: [email.toLowerCase(), passwordHash, name, verificationTokenHash, verificationTokenExpires],
  });
  return findPublicById(Number(result.lastInsertRowid));
}

async function findByVerificationTokenHash(tokenHash) {
  const { rows } = await db.execute({
    sql: `SELECT * FROM users
          WHERE verification_token_hash = ?
            AND verification_token_expires IS NOT NULL
            AND verification_token_expires > datetime('now')`,
    args: [tokenHash],
  });
  return rows[0] || null;
}

async function markVerified(userId) {
  await db.execute({
    sql: `UPDATE users
          SET email_verified = 1, verification_token_hash = NULL, verification_token_expires = NULL
          WHERE id = ?`,
    args: [userId],
  });
}

async function setVerificationToken(userId, tokenHash, expiresAt) {
  await db.execute({
    sql: 'UPDATE users SET verification_token_hash = ?, verification_token_expires = ? WHERE id = ?',
    args: [tokenHash, expiresAt, userId],
  });
}

module.exports = {
  findByEmail,
  findPublicById,
  create,
  findByVerificationTokenHash,
  markVerified,
  setVerificationToken,
};
