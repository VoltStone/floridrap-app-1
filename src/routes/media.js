'use strict';

const express = require('express');
const productRepository = require('../db/repositories/productRepository');
const productImageRepository = require('../db/repositories/productImageRepository');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Serves an admin-uploaded product photo back out of the database (see
// src/db/schema.sql / src/middleware/upload.js for why it's stored there
// instead of on disk). Public and unauthenticated on purpose — product
// photos are public content, same as if they were static files.
const ID_PATTERN = /^[0-9]+$/;

router.get(
  '/media/product/:id',
  asyncHandler(async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) {
      return res.status(404).end();
    }
    const image = await productRepository.getImageData(Number(req.params.id));
    if (!image) {
      return res.status(404).end();
    }
    res.set('Content-Type', image.mime);
    // Moderate cache lifetime rather than "immutable": a re-uploaded photo
    // reuses the same URL (/media/product/:id doesn't change), so a very
    // long/immutable cache would show a stale image after a replacement
    // for up to that long. An hour is a reasonable balance for a small
    // product catalog that doesn't change photos constantly.
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(image.base64, 'base64'));
  })
);

// Same as above, for additional gallery photos. A separate route rather
// than reusing /media/product/:id with a query param, since the two
// serve from entirely different tables and this keeps that distinction
// visible in the URL itself.
router.get(
  '/media/product-image/:id',
  asyncHandler(async (req, res) => {
    if (!ID_PATTERN.test(req.params.id)) {
      return res.status(404).end();
    }
    const image = await productImageRepository.getImageData(Number(req.params.id));
    if (!image) {
      return res.status(404).end();
    }
    res.set('Content-Type', image.mime);
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(image.base64, 'base64'));
  })
);

module.exports = router;
