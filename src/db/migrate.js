'use strict';

const fs = require('node:fs');
const path = require('node:path');
const db = require('./connection');
const logger = require('./../utils/logger');

/**
 * SQLite has no `ALTER TABLE ... MODIFY CONSTRAINT`. A database created
 * before either (a) the 'completed' order status, or (b) the removal of
 * card payments, still has the old CHECK constraints baked into the
 * table definition — CREATE TABLE IF NOT EXISTS does not touch an
 * existing table. This detects either outdated case from sqlite_master
 * and rebuilds the table against the current schema, copying every row
 * across. Any legacy 'card' orders are converted to 'cod' during the
 * copy (the business no longer accepts card payments — orders are still
 * preserved, just recorded as cash on delivery going forward) rather
 * than being silently dropped or left violating the new constraint.
 *
 * Note: this no longer relies on `PRAGMA foreign_keys` being enforced
 * (which can't be guaranteed to persist across every call on a remote
 * connection) — order_items rows are copied across untouched, and since
 * this only recreates the `orders` table (not `order_items`), there is
 * nothing here that depends on cascade behavior.
 */
async function upgradeOrdersTableIfNeeded() {
  const { rows } = await db.execute("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'");
  const row = rows[0];

  const upToDate = row && row.sql.includes("'completed'") && !row.sql.includes("'card'");
  if (!row || upToDate) {
    return; // already current (or table doesn't exist yet, schema.sql just created it fresh)
  }

  logger.info('Upgrading orders table (status options and/or payment method constraint)');

  const tx = await db.transaction('write');
  try {
    await tx.execute(`
      CREATE TABLE orders_new (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number    TEXT NOT NULL UNIQUE,
        user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
        full_name       TEXT NOT NULL,
        phone           TEXT NOT NULL,
        email           TEXT NOT NULL,
        address         TEXT NOT NULL,
        city            TEXT NOT NULL,
        governorate     TEXT NOT NULL,
        payment_method  TEXT NOT NULL CHECK (payment_method IN ('cod')),
        subtotal_cents  INTEGER NOT NULL,
        total_cents     INTEGER NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    await tx.execute(`
      INSERT INTO orders_new
        (id, order_number, user_id, full_name, phone, email, address, city, governorate,
         payment_method, subtotal_cents, total_cents, status, created_at)
      SELECT
        id, order_number, user_id, full_name, phone, email, address, city, governorate,
        'cod', subtotal_cents, total_cents, status, created_at
      FROM orders;
    `);
    await tx.execute('DROP TABLE orders;');
    await tx.execute('ALTER TABLE orders_new RENAME TO orders;');
    await tx.execute('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);');
    await tx.commit();
    logger.info('Orders table upgraded successfully');
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Adds the email-verification columns to a users table that predates
 * this feature. SQLite supports ALTER TABLE ADD COLUMN directly as long
 * as the new column is nullable or has a constant default, which is the
 * case for all three columns here — no full table rebuild needed.
 *
 * Critical detail: the new email_verified column defaults to 0
 * (unverified). Immediately after adding it, every row that existed
 * *before* this migration ran is backfilled to 1 — otherwise every
 * existing customer and the seeded admin would suddenly be locked out
 * of login by a requirement that didn't exist when they signed up. Only
 * accounts created after this point go through real verification.
 */
async function upgradeUsersTableIfNeeded() {
  const { rows: columns } = await db.execute('PRAGMA table_info(users)');

  if (columns.some((c) => c.name === 'email_verified')) {
    return; // already up to date
  }

  logger.info('Upgrading users table to add email verification columns');

  const tx = await db.transaction('write');
  try {
    await tx.execute('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;');
    await tx.execute('ALTER TABLE users ADD COLUMN verification_token_hash TEXT;');
    await tx.execute('ALTER TABLE users ADD COLUMN verification_token_expires TEXT;');
    // Backfill: everyone who existed before this migration is grandfathered in as verified.
    await tx.execute('UPDATE users SET email_verified = 1;');
    await tx.commit();
    logger.info('Users table upgraded successfully; existing accounts grandfathered as verified');
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

/**
 * Adds the two columns that let an uploaded product photo be stored in
 * the database itself (see schema.sql for why) rather than on local
 * disk, for a products table that predates this change.
 */
async function upgradeProductsTableIfNeeded() {
  const { rows: columns } = await db.execute('PRAGMA table_info(products)');

  if (columns.some((c) => c.name === 'image_data')) {
    return; // already up to date
  }

  logger.info('Upgrading products table to add image_data/image_mime columns');
  await db.execute('ALTER TABLE products ADD COLUMN image_data TEXT;');
  await db.execute('ALTER TABLE products ADD COLUMN image_mime TEXT;');
  logger.info('Products table upgraded successfully');
}

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.executeMultiple(schema);

  await upgradeOrdersTableIfNeeded();
  await upgradeUsersTableIfNeeded();
  await upgradeProductsTableIfNeeded();

  logger.info('Migration complete');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error('Migration failed', err);
    process.exit(1);
  });
