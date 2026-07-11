'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../../middleware/auth');
const orderRepository = require('../../db/repositories/orderRepository');
const productRepository = require('../../db/repositories/productRepository');
const asyncHandler = require('../../utils/asyncHandler');

const router = express.Router();

// Every route mounted below — including the sub-routers required at the
// bottom of this file — inherits these two guards. There is exactly one
// place in the codebase that decides "is this an admin area", which
// makes it easy to audit rather than trusting every route file to
// remember its own check.
router.use(requireAuth);
router.use(requireRole('admin'));

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const activeOrders = await orderRepository.listActiveOrders();
    const completedOrders = await orderRepository.listCompletedOrders();
    const products = await productRepository.getAllForAdmin();
    res.render('admin/dashboard', {
      title: 'Tableau de bord — Administration',
      stats: {
        totalOrders: activeOrders.length + completedOrders.length,
        pendingOrders: activeOrders.filter((o) => o.status === 'pending').length,
        completedOrders: completedOrders.length,
        totalProducts: products.length,
        outOfStock: products.filter((p) => !p.in_stock).length,
      },
      recentOrders: activeOrders.slice(0, 5),
    });
  })
);

router.use('/products', require('./products'));
router.use('/orders', require('./orders'));

module.exports = router;
