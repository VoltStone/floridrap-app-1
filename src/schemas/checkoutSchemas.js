'use strict';

const { z } = require('zod');

const GOVERNORATES = [
  'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba',
  'Kairouan', 'Kasserine', 'Kébili', 'Le Kef', 'Mahdia', 'La Manouba',
  'Médenine', 'Monastir', 'Nabeul', 'Sfax', 'Sidi Bouzid', 'Siliana',
  'Sousse', 'Tataouine', 'Tozeur', 'Tunis', 'Zaghouan',
];

// Deliberately permissive of spaces/dashes since Tunisian numbers are
// often written with separators; still bounded and digit-anchored.
const phoneField = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{6,14}$/, 'Numéro de téléphone invalide');

// NOTE: this schema has no `price` or `total` field at all. The checkout
// route recomputes the order total server-side from the current database
// price of each product in the cart — a client can submit whatever it
// wants in the form, but only productId/size/color/quantity are trusted,
// and even those are re-validated against the actual product record
// before the order is created. This is the single most important control
// against price-tampering in this application.
// paymentMethod is deliberately not part of this schema anymore — the
// shop only accepts cash on delivery, so there is nothing for the client
// to choose. The checkout route sets it to 'cod' itself rather than
// trusting a client-submitted value for a choice that no longer exists.
const checkoutSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: phoneField,
  email: z.string().trim().toLowerCase().email().max(254),
  address: z.string().trim().min(5).max(200),
  city: z.string().trim().min(2).max(100),
  governorate: z.enum(GOVERNORATES, { errorMap: () => ({ message: 'Gouvernorat invalide' }) }),
});

module.exports = { checkoutSchema, GOVERNORATES };
