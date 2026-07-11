'use strict';

const { z } = require('zod');

const addToCartSchema = z.object({
  productId: z.coerce.number().int().positive(),
  size: z.string().trim().min(1).max(40),
  color: z.string().trim().min(1).max(40),
  quantity: z.coerce.number().int().min(1).max(20),
  // Only ever used to send the shopper back to the page they added from.
  // Restricted to a same-site relative path (starts with a single "/",
  // never "//" which browsers can interpret as a protocol-relative URL
  // to another host) so this can never become an open redirect.
  returnTo: z
    .string()
    .regex(/^\/(?!\/)[a-zA-Z0-9\-/]*$/)
    .max(200)
    .optional(),
});

const updateCartItemSchema = z.object({
  lineId: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(20),
});

const removeCartItemSchema = z.object({
  lineId: z.string().trim().min(1).max(80),
});

module.exports = { addToCartSchema, updateCartItemSchema, removeCartItemSchema };
