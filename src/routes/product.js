'use strict';

const express = require('express');
const productRepository = require('../db/repositories/productRepository');
const productImageRepository = require('../db/repositories/productImageRepository');
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

    // The primary photo (product.image_url) always comes first, followed
    // by any additional gallery photos in the order they were uploaded —
    // one combined list is simplest for the template to cycle through,
    // rather than the view having to know about two separate sources.
    const galleryImages = await productImageRepository.listForProduct(product.id);
    const images = [{ url: product.image_url }, ...galleryImages];

    res.render('product', {
      title: `${product.name} — Floridrap Plus`,
      product,
      images,
      related,
    });
  })
);

module.exports = router;
