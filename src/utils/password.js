'use strict';

const argon2 = require('argon2');

// argon2.hash() generates a cryptographically random salt per call and
// embeds it (plus the algorithm parameters) in the returned string, so
// every user gets a unique salt automatically — there is no separate
// salt column to manage or accidentally reuse.
//
// argon2id (the library default) is used rather than argon2i/argon2d: it
// hybridizes resistance to both GPU/ASIC cracking (memory-hardness) and
// side-channel timing attacks, which is what OWASP currently recommends
// for password storage over bcrypt/PBKDF2 where available.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MB, OWASP-recommended minimum for argon2id
  timeCost: 2,
  parallelism: 1,
};

async function hashPassword(plainPassword) {
  return argon2.hash(plainPassword, HASH_OPTIONS);
}

async function verifyPassword(hash, plainPassword) {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // argon2.verify throws on a malformed/foreign hash format rather than
    // returning false — treat that the same as "wrong password" so a
    // corrupted hash can never be mistaken for a successful login.
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
