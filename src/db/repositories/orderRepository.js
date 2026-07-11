'use strict';

const crypto = require('node:crypto');
const db = require('../connection');

function generateOrderNumber() {
  // Random, non-sequential order numbers so a customer can't enumerate
  // other people's orders by incrementing an ID in the confirmation URL.
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `FP-${random}`;
}

/**
 * Creates an order and its line items atomically. `items` must already
 * contain server-trusted prices (looked up from the products table by the
 * caller) — this function never trusts a client-supplied price.
 */
async function createOrder({ userId, customer, paymentMethod, items }) {
  const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const totalCents = subtotalCents; // flat-rate/free shipping in this demo
  const orderNumber = generateOrderNumber();

  const tx = await db.transaction('write');
  try {
    const orderResult = await tx.execute({
      sql: `INSERT INTO orders
              (order_number, user_id, full_name, phone, email, address, city, governorate,
               payment_method, subtotal_cents, total_cents)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        orderNumber,
        userId || null,
        customer.fullName,
        customer.phone,
        customer.email,
        customer.address,
        customer.city,
        customer.governorate,
        paymentMethod,
        subtotalCents,
        totalCents,
      ],
    });

    const orderId = Number(orderResult.lastInsertRowid);

    for (const item of items) {
      await tx.execute({
        sql: `INSERT INTO order_items (order_id, product_id, product_name, size, color, unit_price_cents, quantity)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [orderId, item.productId, item.name, item.size, item.color, item.unitPriceCents, item.quantity],
      });
    }

    await tx.commit();
    return { id: orderId, orderNumber, totalCents };
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

async function findOrdersForUser(userId) {
  const { rows } = await db.execute({
    sql: 'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId],
  });
  return rows;
}

/**
 * Authorization-scoped lookup: an order is only returned if it belongs to
 * the requesting session (userId) OR, for guest checkouts, if the caller
 * also knows the exact order number *and* the email used at checkout.
 * This prevents IDOR — simply knowing/guessing an order number is not
 * sufficient to view someone else's order details.
 */
async function findOrderForOwner({ orderNumber, userId, email }) {
  if (userId) {
    const { rows } = await db.execute({
      sql: 'SELECT * FROM orders WHERE order_number = ? AND user_id = ?',
      args: [orderNumber, userId],
    });
    return rows[0] || null;
  }
  if (email) {
    const { rows } = await db.execute({
      sql: 'SELECT * FROM orders WHERE order_number = ? AND email = ?',
      args: [orderNumber, email.toLowerCase()],
    });
    return rows[0] || null;
  }
  return null;
}

async function findItemsForOrder(orderId) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM order_items WHERE order_id = ?', args: [orderId] });
  return rows;
}

const VALID_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];

/**
 * "Active" means still in progress from the shop's point of view —
 * excludes both 'completed' (fulfilled, archived out of the working
 * list) and 'cancelled' (shouldn't normally linger since cancelling
 * deletes the order outright, but excluded here too as a safety net).
 */
async function listActiveOrders() {
  const { rows } = await db.execute(
    "SELECT * FROM orders WHERE status NOT IN ('completed', 'cancelled') ORDER BY created_at DESC"
  );
  return rows;
}

async function listCompletedOrders() {
  const { rows } = await db.execute("SELECT * FROM orders WHERE status = 'completed' ORDER BY created_at DESC");
  return rows;
}

async function getOrderById(id) {
  const { rows } = await db.execute({ sql: 'SELECT * FROM orders WHERE id = ?', args: [id] });
  return rows[0] || null;
}

async function updateStatus(orderId, status) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid order status: ${status}`);
  }
  await db.execute({ sql: 'UPDATE orders SET status = ? WHERE id = ?', args: [status, orderId] });
}

async function markCompleted(orderId) {
  await db.execute({ sql: "UPDATE orders SET status = 'completed' WHERE id = ?", args: [orderId] });
}

/**
 * A cancelled order is deleted outright, per the shop's chosen workflow
 * (cancel = remove, rather than keep a 'cancelled' row around). Its line
 * items are deleted explicitly in the same transaction, rather than
 * relying on the schema's ON DELETE CASCADE — that cascade depends on
 * `PRAGMA foreign_keys` being enforced, which can't be guaranteed to
 * persist across every call on a remote connection, so doing it
 * explicitly here is what actually guarantees no orphaned rows are left
 * behind.
 */
async function deleteOrder(orderId) {
  const tx = await db.transaction('write');
  try {
    await tx.execute({ sql: 'DELETE FROM order_items WHERE order_id = ?', args: [orderId] });
    await tx.execute({ sql: 'DELETE FROM orders WHERE id = ?', args: [orderId] });
    await tx.commit();
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}

module.exports = {
  createOrder,
  findOrdersForUser,
  findOrderForOwner,
  findItemsForOrder,
  listActiveOrders,
  listCompletedOrders,
  getOrderById,
  updateStatus,
  markCompleted,
  deleteOrder,
  VALID_STATUSES,
};
