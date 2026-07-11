'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const orderRepository = require('../db/repositories/orderRepository');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/account',
  requireAuth,
  asyncHandler(async (req, res) => {
    // req.user.id comes from the server-side session, never from a URL
    // param or form field, so there is no way for a logged-in shopper to
    // request another shopper's order history (no IDOR surface here).
    const orders = await orderRepository.findOrdersForUser(req.user.id);
    res.render('account', {
      title: 'Mon compte — Floridrap Plus',
      orders,
    });
  })
);

module.exports = router;
