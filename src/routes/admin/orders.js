'use strict';

const express = require('express');
const orderRepository = require('../../db/repositories/orderRepository');
const { validateBody } = require('../../middleware/validate');
const { orderStatusSchema } = require('../../schemas/adminSchemas');
const asyncHandler = require('../../utils/asyncHandler');
const { setFlash } = require('../../utils/flash');

const router = express.Router();

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).render('error', { title: 'Introuvable', message: "Cette commande n'existe pas." });
    return null;
  }
  return id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.render('admin/orders', {
      title: 'Commandes — Administration',
      orders: await orderRepository.listActiveOrders(),
    });
  })
);

// Registered before '/:id' so "finished" is never mistaken for an order ID.
router.get(
  '/finished',
  asyncHandler(async (req, res) => {
    res.render('admin/orders-finished', {
      title: 'Commandes terminées — Administration',
      orders: await orderRepository.listCompletedOrders(),
    });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const order = await orderRepository.getOrderById(id);
    if (!order) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Cette commande n'existe pas." });
    }
    res.render('admin/order-detail', {
      title: `Commande ${order.order_number} — Administration`,
      order,
      items: await orderRepository.findItemsForOrder(order.id),
      errors: {},
    });
  })
);

router.post(
  '/:id/status',
  validateBody(orderStatusSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const order = await orderRepository.getOrderById(id);
    if (!order) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Cette commande n'existe pas." });
    }

    if (req.validationFailed) {
      return res.status(400).render('admin/order-detail', {
        title: `Commande ${order.order_number} — Administration`,
        order,
        items: await orderRepository.findItemsForOrder(order.id),
        errors: req.validationErrors,
      });
    }

    await orderRepository.updateStatus(id, req.validatedBody.status);
    setFlash(req, 'success', `Statut de la commande ${order.order_number} mis à jour.`);
    res.redirect(`/admin/orders/${id}`);
  })
);

// Marking an order done moves it out of the active list (see
// listActiveOrders, which excludes 'completed') and into "Commandes
// terminées" — the order and its items stay in the database, nothing is
// deleted here.
router.post(
  '/:id/complete',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const order = await orderRepository.getOrderById(id);
    if (!order) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Cette commande n'existe pas." });
    }
    await orderRepository.markCompleted(id);
    setFlash(req, 'success', `Commande ${order.order_number} marquée comme terminée.`);
    res.redirect('/admin/orders');
  })
);

// Cancelling, per the shop's chosen workflow, removes the order entirely
// rather than just flagging it — hence the confirmation step below
// before the actual (irreversible) POST.
router.get(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const order = await orderRepository.getOrderById(id);
    if (!order) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Cette commande n'existe pas." });
    }
    res.render('admin/order-cancel-confirm', {
      title: `Annuler la commande ${order.order_number} — Administration`,
      order,
    });
  })
);

router.post(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const order = await orderRepository.getOrderById(id);
    if (!order) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Cette commande n'existe pas." });
    }
    await orderRepository.deleteOrder(id);
    setFlash(req, 'success', `Commande ${order.order_number} annulée et supprimée.`);
    res.redirect('/admin/orders');
  })
);

module.exports = router;
