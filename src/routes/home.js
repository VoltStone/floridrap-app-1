'use strict';

const express = require('express');
const productRepository = require('../db/repositories/productRepository');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [featured, bestSellers, newArrivals] = await Promise.all([
      productRepository.getFeatured(4),
      productRepository.getBestSellers(4),
      productRepository.getNewArrivals(4),
    ]);
    res.render('home', {
      title: 'Floridrap Plus — Linge de maison en Tunisie',
      featured,
      bestSellers,
      newArrivals,
    });
  })
);

module.exports = router;
