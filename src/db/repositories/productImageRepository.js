'use strict';

const db = require('../connection');

const MAX_IMAGES_PER_PRODUCT = 6;

/**
 * Returns lightweight references (id + serving URL), not the base64
 * bytes — this runs on every product-detail page view, so pulling the
 * full image data for a list is wasteful. The actual bytes are only
 * fetched by GET /media/product-image/:id when a browser requests that
 * specific image.
 */
async function listForProduct(productId) {
  const { rows } = await db.execute({
    sql: 'SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
    args: [productId],
  });
  return rows.map((row) => ({ id: row.id, url: `/media/product-image/${row.id}` }));
}

async function getImageData(id) {
  const { rows } = await db.execute({
    sql: 'SELECT image_data, image_mime FROM product_images WHERE id = ?',
    args: [id],
  });
  const row = rows[0];
  if (!row) return null;
  return { base64: row.image_data, mime: row.image_mime };
}

async function countForProduct(productId) {
  const { rows } = await db.execute({
    sql: 'SELECT COUNT(*) as n FROM product_images WHERE product_id = ?',
    args: [productId],
  });
  return Number(rows[0].n);
}

async function add(productId, image, sortOrder) {
  await db.execute({
    sql: 'INSERT INTO product_images (product_id, image_data, image_mime, sort_order) VALUES (?, ?, ?, ?)',
    args: [productId, image.base64, image.mime, sortOrder],
  });
}

/**
 * Scoped to productId as well as the image's own id — not strictly
 * necessary since the id alone is unique, but it means a route can never
 * accidentally delete a gallery image belonging to a different product
 * even if the two params in the URL didn't actually match up, and it
 * matches the "always scope destructive queries to what the caller
 * actually owns" pattern used elsewhere (e.g. findOrdersForUser).
 */
async function remove(imageId, productId) {
  await db.execute({
    sql: 'DELETE FROM product_images WHERE id = ? AND product_id = ?',
    args: [imageId, productId],
  });
}

module.exports = {
  MAX_IMAGES_PER_PRODUCT,
  listForProduct,
  getImageData,
  countForProduct,
  add,
  remove,
};
