'use strict';

const express = require('express');
const productRepository = require('../db/repositories/productRepository');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Route param constrained at the router level (Express 5 / path-to-regexp)
// to a safe character set, so anything else 404s before it ever reaches a
// database lookup.
const SLUG_PATTERN = /^[a-z0-9-]+$/;

router.get(
  '/product/:slug',
  asyncHandler(async (req, res) => {
    if (!SLUG_PATTERN.test(req.params.slug)) {
      return res.status(404).render('error', {
        title: 'Produit introuvable',
        message: "Ce produit n'existe pas ou n'est plus disponible.",
      });
    }
    const product = await productRepository.getBySlug(req.params.slug);
    if (!product) {
      return res.status(404).render('error', {
        title: 'Produit introuvable',
        message: "Ce produit n'existe pas ou n'est plus disponible.",
      });
    }
    const related = await productRepository.getRelated(product.category, product.id, 4);
    res.render('product', {
      title: `${product.name} — Floridrap Plus`,
      product,
      related,
    });
  })
);

module.exports = router;
