'use strict';

// Flat delivery fee added at checkout and shown to the customer as its
// own line, separate from the product subtotal — the shop currently
// delivers everywhere in Tunisia at a single flat rate rather than a
// rate that varies by governorate/weight/etc. If that ever needs to
// vary, this is the one place that would change; every view/email that
// shows a delivery line reads from here rather than hardcoding 600.
const DELIVERY_FEE_CENTS = 600; // 6.000 DT

module.exports = { DELIVERY_FEE_CENTS };
