'use strict';

const { z } = require('zod');
const { CATEGORIES } = require('../db/repositories/productRepository');

// Sizes/colors arrive from the form as a single comma-separated text field
// (simplest reliable UI for a variable-length list without JavaScript) and
// are split, trimmed, de-duplicated, and bounded here.
const csvListField = (max) =>
  z
    .string()
    .trim()
    .min(1, 'Ce champ est requis')
    .transform((val) =>
      Array.from(
        new Set(
          val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      )
    )
    .refine((arr) => arr.length > 0 && arr.length <= max, {
      message: `Indiquez entre 1 et ${max} valeurs séparées par des virgules`,
    });

// Prices are entered in DT (e.g. "139.000") and converted to integer
// cents/millimes for storage — money is never kept as a float.
const priceField = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,3})?$/, 'Prix invalide')
  .transform((val) => Math.round(parseFloat(val) * 100));

const optionalPriceField = z
  .union([z.literal(''), priceField])
  .optional()
  .transform((val) => (val === '' || val === undefined ? null : val));

const productSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    category: z.enum(CATEGORIES, { errorMap: () => ({ message: 'Catégorie invalide' }) }),
    description: z.string().trim().min(10).max(1000),
    price: priceField,
    compareAtPrice: optionalPriceField,
    material: z.string().trim().min(2).max(150),
    care: z.string().trim().min(2).max(150),
    sizes: csvListField(12),
    colors: csvListField(12),
    inStock: z.enum(['on']).optional(),
    isBestSeller: z.enum(['on']).optional(),
    isNew: z.enum(['on']).optional(),
  })
  .transform((data) => ({
    name: data.name,
    category: data.category,
    description: data.description,
    priceCents: data.price,
    compareAtPriceCents: data.compareAtPrice,
    material: data.material,
    care: data.care,
    sizes: data.sizes,
    colors: data.colors,
    inStock: data.inStock === 'on',
    isBestSeller: data.isBestSeller === 'on',
    isNew: data.isNew === 'on',
  }))
  .refine((data) => !data.compareAtPriceCents || data.compareAtPriceCents > data.priceCents, {
    message: 'Le prix barré doit être supérieur au prix actuel',
    path: ['compareAtPrice'],
  });

// 'completed' and 'cancelled' are deliberately not offered here — they
// have their own dedicated routes/buttons (mark as done, cancel &
// delete) with clearer, harder-to-misclick semantics than a shared
// dropdown. This schema only covers the day-to-day pending/confirmed
// toggle.
const orderStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed'], { errorMap: () => ({ message: 'Statut invalide' }) }),
});

module.exports = { productSchema, orderStatusSchema };
