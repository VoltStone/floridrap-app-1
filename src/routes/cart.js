'use strict';

const express = require('express');
const { z } = require('zod');
const productRepository = require('../db/repositories/productRepository');
const cart = require('../utils/cart');
const { setFlash } = require('../utils/flash');
const { validateBody } = require('../middleware/validate');
const { addToCartSchema, removeCartItemSchema } = require('../schemas/cartSchemas');
const asyncHandler = require('../utils/asyncHandler');
const { DELIVERY_FEE_CENTS } = require('../config/constants');

const router = express.Router();

const updateCartSchema = z.object({
  items: z
    .array(
      z.object({
        lineId: z.string().trim().min(1).max(80),
        quantity: z.coerce.number().int().min(1).max(20),
      })
    )
    .max(50),
});

router.get(
  '/cart',
  asyncHandler(async (req, res) => {
    const { items, subtotalCents } = await cart.hydrate(req);
    res.render('cart', {
      title: 'Mon panier — Floridrap Plus',
      items,
      subtotalCents,
      deliveryFeeCents: DELIVERY_FEE_CENTS,
    });
  })
);

router.post(
  '/cart/add',
  validateBody(addToCartSchema),
  asyncHandler(async (req, res) => {
    // Falls back to a known-safe internal path — never trusts an
    // unvalidated redirect target.
    const safeReturnTo = req.body && /^\/(?!\/)[a-zA-Z0-9\-/]*$/.test(req.body.returnTo || '')
      ? req.body.returnTo
      : '/shop';

    if (req.validationFailed) {
      setFlash(req, 'error', "Impossible d'ajouter ce produit : informations invalides.");
      return res.redirect(safeReturnTo);
    }

    const { productId, size, color, quantity } = req.validatedBody;
    const product = await productRepository.getById(productId);

    // Defense in depth beyond format validation: the size/color submitted
    // must actually belong to this product's declared variants, and the
    // product must exist and be in stock. This stops a tampered request
    // (e.g. from browser dev tools) from adding an invalid or
    // out-of-catalog combination.
    const validVariant =
      product &&
      product.in_stock &&
      product.sizes.includes(size) &&
      product.colors.includes(color);

    if (!validVariant) {
      setFlash(req, 'error', 'Ce produit ou cette variante n’est pas disponible.');
      return res.redirect(safeReturnTo);
    }

    cart.addItem(req, { productId, size, color, quantity });
    setFlash(req, 'success', `${product.name} a été ajouté à votre panier.`);
    res.redirect('/cart');
  })
);

router.post(
  '/cart/update',
  validateBody(updateCartSchema),
  asyncHandler(async (req, res) => {
    if (req.validationFailed) {
      setFlash(req, 'error', 'Impossible de mettre à jour le panier.');
      return res.redirect('/cart');
    }
    cart.updateQuantities(req, req.validatedBody.items);
    setFlash(req, 'success', 'Panier mis à jour.');
    res.redirect('/cart');
  })
);

router.post(
  '/cart/remove',
  validateBody(removeCartItemSchema),
  asyncHandler(async (req, res) => {
    if (req.validationFailed) {
      return res.redirect('/cart');
    }
    cart.removeItem(req, req.validatedBody.lineId);
    setFlash(req, 'success', 'Article retiré du panier.');
    res.redirect('/cart');
  })
);

module.exports = router;
