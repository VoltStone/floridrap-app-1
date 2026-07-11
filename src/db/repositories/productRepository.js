'use strict';

const db = require('../connection');

function parseProduct(row) {
  if (!row) return row;
  return {
    ...row,
    sizes: JSON.parse(row.sizes),
    colors: JSON.parse(row.colors),
    price: row.price_cents / 100,
    compareAtPrice: row.compare_at_price_cents ? row.compare_at_price_cents / 100 : null,
  };
}

// Escape SQL LIKE wildcard characters in user-supplied search text so a
// search for "50%" or "a_b" can't be used to broaden a pattern match
// beyond what the user intended (a minor but real injection-adjacent bug
// class distinct from classic SQL injection).
function escapeLike(value) {
  return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

const CATEGORIES = ['draps', 'taies', 'housses', 'parures', 'couvertures'];

function isValidCategory(category) {
  return CATEGORIES.includes(category);
}

async function listByCategory(category, { sort = 'popularity' } = {}) {
  const sortMap = {
    popularity: 'is_best_seller DESC, created_at DESC',
    price_asc: 'price_cents ASC',
    price_desc: 'price_cents DESC',
    newest: 'created_at DESC',
  };
  // `sort` is validated against an allow-list (never interpolated directly
  // from arbitrary user input) before being used to build ORDER BY, since
  // parameter binding cannot be used for identifiers/column expressions.
  const orderBy = sortMap[sort] || sortMap.popularity;

  if (category && !isValidCategory(category)) {
    return [];
  }

  const { rows } = category
    ? await db.execute({ sql: `SELECT * FROM products WHERE category = ? ORDER BY ${orderBy}`, args: [category] })
    : await db.execute(`SELECT * FROM products ORDER BY ${orderBy}`);

  return rows.map(parseProduct);
}

async function search(term) {
  const escaped = `%${escapeLike(term)}%`;
  const { rows } = await db.execute({
    sql: `SELECT * FROM products WHERE name LIKE ? ESCAPE '\\' ORDER BY is_best_seller DESC`,
    args: [escaped],
  });
  return rows.map(parseProduct);
}

async function getBySlug(slug) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM products WHERE slug = ?', args: [slug] });
  return parseProduct(rows[0]);
}

async function getById(id) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM products WHERE id = ?', args: [id] });
  return parseProduct(rows[0]);
}

async function getFeatured(limit = 4) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM products ORDER BY created_at DESC LIMIT ?',
    args: [limit],
  });
  return rows.map(parseProduct);
}

async function getBestSellers(limit = 4) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM products WHERE is_best_seller = 1 ORDER BY created_at DESC LIMIT ?',
    args: [limit],
  });
  return rows.map(parseProduct);
}

async function getNewArrivals(limit = 4) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM products WHERE is_new = 1 ORDER BY created_at DESC LIMIT ?',
    args: [limit],
  });
  return rows.map(parseProduct);
}

async function getRelated(category, excludeId, limit = 4) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM products WHERE category = ? AND id != ? LIMIT ?',
    args: [category, excludeId, limit],
  });
  return rows.map(parseProduct);
}

async function getAllForAdmin() {
  const { rows } = await db.execute('SELECT * FROM products ORDER BY created_at DESC');
  return rows.map(parseProduct);
}

function slugify(name) {
  return name
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/**
 * Ensures a unique slug by appending -2, -3, ... on collision. `excludeId`
 * lets an update check uniqueness without colliding with its own row.
 */
async function uniqueSlug(baseSlug, excludeId) {
  let candidate = baseSlug || 'produit';
  let n = 2;
  for (;;) {
    const { rows } = excludeId
      ? await db.execute({ sql: 'SELECT id FROM products WHERE slug = ? AND id != ?', args: [candidate, excludeId] })
      : await db.execute({ sql: 'SELECT id FROM products WHERE slug = ?', args: [candidate] });
    if (!rows[0]) return candidate;
    candidate = `${baseSlug}-${n}`;
    n += 1;
  }
}

/**
 * Creates a product from already-validated admin input (see
 * src/schemas/adminSchemas.js). `imageUrl` defaults to a neutral
 * placeholder so a product can be created before an image is uploaded.
 */
async function create(data) {
  const slug = await uniqueSlug(slugify(data.name));
  const result = await db.execute({
    sql: `INSERT INTO products
            (slug, name, category, description, price_cents, compare_at_price_cents,
             image_url, material, care, sizes, colors, in_stock, is_best_seller, is_new)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      slug,
      data.name,
      data.category,
      data.description,
      data.priceCents,
      data.compareAtPriceCents || null,
      data.imageUrl || '/assets/placeholder-product.png',
      data.material,
      data.care,
      JSON.stringify(data.sizes),
      JSON.stringify(data.colors),
      data.inStock ? 1 : 0,
      data.isBestSeller ? 1 : 0,
      data.isNew ? 1 : 0,
    ],
  });
  return getById(Number(result.lastInsertRowid));
}

async function update(id, data) {
  const existing = await getById(id);
  if (!existing) return null;

  // Slug is only recomputed if the name actually changed, so existing
  // product URLs (already shared/bookmarked/linked) stay stable across
  // unrelated edits like a price change.
  const slug =
    data.name !== existing.name ? await uniqueSlug(slugify(data.name), id) : existing.slug;

  await db.execute({
    sql: `UPDATE products SET
            slug = ?, name = ?, category = ?, description = ?, price_cents = ?,
            compare_at_price_cents = ?, material = ?, care = ?, sizes = ?, colors = ?,
            in_stock = ?, is_best_seller = ?, is_new = ?
          WHERE id = ?`,
    args: [
      slug,
      data.name,
      data.category,
      data.description,
      data.priceCents,
      data.compareAtPriceCents || null,
      data.material,
      data.care,
      JSON.stringify(data.sizes),
      JSON.stringify(data.colors),
      data.inStock ? 1 : 0,
      data.isBestSeller ? 1 : 0,
      data.isNew ? 1 : 0,
      id,
    ],
  });

  return getById(id);
}

// Called from the dedicated image-upload route. `image` is either
// `{ url }` (kept for a possible future external-URL flow) or
// `{ base64, mime }` for an uploaded file processed by
// src/middleware/upload.js — the bytes are stored directly in the
// database (see schema.sql for why) and served back out via
// GET /media/product/:id, which is what `image_url` is pointed at below.
// Every view template just reads `image_url` as a plain string either
// way, so nothing else in the app needs to know which case applies.
async function updateImage(id, image) {
  if (image && image.base64) {
    await db.execute({
      sql: 'UPDATE products SET image_url = ?, image_data = ?, image_mime = ? WHERE id = ?',
      args: [`/media/product/${id}`, image.base64, image.mime, id],
    });
  } else if (image && image.url) {
    await db.execute({
      sql: 'UPDATE products SET image_url = ?, image_data = NULL, image_mime = NULL WHERE id = ?',
      args: [image.url, id],
    });
  }
}

// Used by GET /media/product/:id to serve an uploaded photo's bytes back
// out. Deliberately a narrow query (not the full parsed product) since
// this runs on every image request.
async function getImageData(id) {
  const { rows } = await db.execute({
    sql: 'SELECT image_data, image_mime FROM products WHERE id = ?',
    args: [id],
  });
  const row = rows[0];
  if (!row || !row.image_data) return null;
  return { base64: row.image_data, mime: row.image_mime || 'image/webp' };
}

/**
 * Throws if the product is referenced by any past order. This is checked
 * explicitly here (rather than relied on as a database foreign-key
 * failure) because FK enforcement can't be guaranteed to persist across
 * every call on a remote connection — the outcome is the same either
 * way: historical orders never silently lose their line-item detail. The
 * route calling this catches the error and tells the admin to mark the
 * product out of stock instead.
 */
async function remove(id) {
  const referenced = await countOrderReferences(id);
  if (referenced > 0) {
    throw new Error(`Cannot delete product ${id}: referenced by ${referenced} order item(s)`);
  }
  await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [id] });
}

async function countOrderReferences(id) {
  const { rows } = await db.execute({
    sql: 'SELECT COUNT(*) as n FROM order_items WHERE product_id = ?',
    args: [id],
  });
  return Number(rows[0].n);
}

module.exports = {
  CATEGORIES,
  isValidCategory,
  listByCategory,
  search,
  getBySlug,
  getById,
  getFeatured,
  getBestSellers,
  getNewArrivals,
  getRelated,
  getAllForAdmin,
  create,
  update,
  updateImage,
  getImageData,
  remove,
  countOrderReferences,
};
