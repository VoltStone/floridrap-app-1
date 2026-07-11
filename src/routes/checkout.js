'use strict';

const express = require('express');
const cart = require('../utils/cart');
const orderRepository = require('../db/repositories/orderRepository');
const { validateBody } = require('../middleware/validate');
const { checkoutSchema, GOVERNORATES } = require('../schemas/checkoutSchemas');
const { checkoutLimiter } = require('../middleware/rateLimiters');
const asyncHandler = require('../utils/asyncHandler');
const { setFlash } = require('../utils/flash');
const { sendMail } = require('../utils/mailer');
const { orderConfirmationEmail } = require('../utils/emailTemplates');
const logger = require('../utils/logger');

const router = express.Router();

router.get(
  '/checkout',
  asyncHandler(async (req, res) => {
    const { items, subtotalCents } = await cart.hydrate(req);
    if (items.length === 0) {
      setFlash(req, 'error', 'Votre panier est vide.');
      return res.redirect('/cart');
    }
    res.render('checkout', {
      title: 'Commande — Floridrap Plus',
      items,
      subtotalCents,
      governorates: GOVERNORATES,
      values: req.user ? { fullName: req.user.name, email: req.user.email } : {},
      errors: {},
    });
  })
);

router.post(
  '/checkout',
  checkoutLimiter,
  validateBody(checkoutSchema),
  asyncHandler(async (req, res) => {
    const { items, subtotalCents } = await cart.hydrate(req);

    if (items.length === 0) {
      setFlash(req, 'error', 'Votre panier est vide.');
      return res.redirect('/cart');
    }

    if (req.validationFailed) {
      return res.status(400).render('checkout', {
        title: 'Commande — Floridrap Plus',
        items,
        subtotalCents,
        governorates: GOVERNORATES,
        values: req.body,
        errors: req.validationErrors,
      });
    }

    // Authoritative order data is built entirely from server-side state
    // (today's product prices + names from the DB) — the validated form
    // fields only carry shipping/contact details, never price. This is
    // what prevents a manipulated form field from changing what the
    // customer is actually charged.
    const orderItems = items.map((i) => ({
      productId: i.product.id,
      name: i.product.name,
      size: i.size,
      color: i.color,
      unitPriceCents: i.product.price_cents,
      quantity: i.quantity,
    }));

    const order = await orderRepository.createOrder({
      userId: req.user ? req.user.id : null,
      customer: req.validatedBody,
      paymentMethod: 'cod', // cash on delivery — the only option this shop offers
      items: orderItems,
    });

    cart.clear(req);
    // Lets the confirmation page prove ownership for guest checkouts
    // without adding an unauthenticated order-lookup-by-number endpoint.
    req.session.lastOrder = { orderNumber: order.orderNumber, email: req.validatedBody.email };

    // Best-effort: the order is already committed at this point, so a
    // failed email send must never turn into a failed checkout for the
    // customer. Errors are logged server-side only.
    try {
      const orderRow = await orderRepository.getOrderById(order.id);
      const { subject, html, text } = orderConfirmationEmail({
        order: orderRow,
        items: orderItems.map((i) => ({
          product_name: i.name,
          size: i.size,
          color: i.color,
          unit_price_cents: i.unitPriceCents,
          quantity: i.quantity,
        })),
      });
      await sendMail({ to: orderRow.email, subject, html, text });
    } catch (err) {
      logger.error('Failed to send order confirmation email', err, { orderNumber: order.orderNumber });
    }

    res.redirect(`/checkout/confirmation/${order.orderNumber}`);
  })
);

const ORDER_NUMBER_PATTERN = /^[A-Z0-9-]+$/;

router.get(
  '/checkout/confirmation/:orderNumber',
  asyncHandler(async (req, res) => {
    if (!ORDER_NUMBER_PATTERN.test(req.params.orderNumber)) {
      return res.status(404).render('error', {
        title: 'Commande introuvable',
        message: "Cette commande n'existe pas ou ne vous appartient pas.",
      });
    }
    const sessionMatch = req.session.lastOrder && req.session.lastOrder.orderNumber === req.params.orderNumber;
    const order = await orderRepository.findOrderForOwner({
      orderNumber: req.params.orderNumber,
      userId: req.user ? req.user.id : null,
      email: sessionMatch ? req.session.lastOrder.email : null,
    });

    if (!order) {
      // Same 404 whether the order doesn't exist or simply isn't this
      // visitor's — never confirm/deny existence of someone else's order.
      return res.status(404).render('error', {
        title: 'Commande introuvable',
        message: "Cette commande n'existe pas ou ne vous appartient pas.",
      });
    }

    const orderItems = await orderRepository.findItemsForOrder(order.id);
    res.render('checkout-confirmation', {
      title: 'Commande confirmée — Floridrap Plus',
      order,
      orderItems,
    });
  })
);

module.exports = router;
