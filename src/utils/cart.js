'use strict';

const productRepository = require('../db/repositories/productRepository');

function getRawCart(req) {
  if (!Array.isArray(req.session.cart)) {
    req.session.cart = [];
  }
  return req.session.cart;
}

function makeLineId(productId, size, color) {
  return `${productId}:${size}:${color}`;
}

/**
 * Adds a line to the session cart. Only productId/size/color/quantity are
 * ever stored — never a price. The route calling this has already
 * confirmed the product exists, is in stock, and that size/color are
 * among the product's actual declared variants.
 */
function addItem(req, { productId, size, color, quantity }) {
  const cart = getRawCart(req);
  const lineId = makeLineId(productId, size, color);
  const existing = cart.find((i) => i.lineId === lineId);
  if (existing) {
    existing.quantity = Math.min(20, existing.quantity + quantity);
  } else {
    cart.push({ lineId, productId, size, color, quantity });
  }
}

function updateQuantities(req, updates) {
  const cart = getRawCart(req);
  const byLineId = new Map(updates.map((u) => [u.lineId, u.quantity]));
  for (const item of cart) {
    if (byLineId.has(item.lineId)) {
      item.quantity = byLineId.get(item.lineId);
    }
  }
}

function removeItem(req, lineId) {
  req.session.cart = getRawCart(req).filter((i) => i.lineId !== lineId);
}

function clear(req) {
  req.session.cart = [];
}

/**
 * Resolves the session cart against the database: fills in current
 * product name/image/price, drops lines for products that were deleted
 * or went out of stock, and computes the subtotal — always from today's
 * price, never a value carried over from when the item was added.
 */
async function hydrate(req) {
  const cart = getRawCart(req);
  const items = [];
  let subtotalCents = 0;
  let droppedAny = false;

  for (const line of cart) {
    const product = await productRepository.getById(line.productId);
    if (!product || !product.in_stock) {
      droppedAny = true;
      continue;
    }
    // Resolved fresh from the product's current price/size-overrides on
    // every hydrate — same principle as before (never trust a price
    // carried over from when the item was added), just size-aware now.
    const unitPriceCents = productRepository.getPriceForSize(product, line.size);
    const lineTotalCents = unitPriceCents * line.quantity;
    subtotalCents += lineTotalCents;
    items.push({
      lineId: line.lineId,
      productId: line.productId,
      size: line.size,
      color: line.color,
      quantity: line.quantity,
      product,
      unitPriceCents,
      lineTotalCents,
    });
  }

  if (droppedAny) {
    req.session.cart = items.map((i) => ({
      lineId: i.lineId,
      productId: i.productId,
      size: i.size,
      color: i.color,
      quantity: i.quantity,
    }));
  }

  return { items, subtotalCents, count: items.reduce((n, i) => n + i.quantity, 0) };
}

module.exports = { makeLineId, addItem, updateQuantities, removeItem, clear, hydrate };
