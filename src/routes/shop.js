'use strict';

const express = require('express');
const { z } = require('zod');
const productRepository = require('../db/repositories/productRepository');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const CATEGORY_LABELS = {
  draps: 'Draps de lit',
  taies: "Taies d'oreiller",
  housses: 'Housses de couette',
  parures: 'Parures de lit',
  couvertures: 'Couvertures',
};

// Query-string params are just as much "user input" as a POST body — they
// are validated the same way rather than trusted because they look like
// simple navigation state.
const shopQuerySchema = z.object({
  category: z.enum(['draps', 'taies', 'housses', 'parures', 'couvertures']).optional(),
  sort: z.enum(['popularity', 'price_asc', 'price_desc', 'newest']).optional(),
  q: z.string().trim().max(100).optional(),
});

router.get(
  '/shop',
  asyncHandler(async (req, res) => {
    const parsed = shopQuerySchema.safeParse(req.query);
    // Invalid/unexpected query params are ignored rather than trusted —
    // fall back to showing the full catalog instead of erroring, since
    // this is just a browsing page.
    const { category, sort, q } = parsed.success ? parsed.data : {};

    const products = q
      ? await productRepository.search(q)
      : await productRepository.listByCategory(category, { sort });

    res.render('shop', {
      title: category ? `${CATEGORY_LABELS[category]} — Floridrap Plus` : 'Boutique — Floridrap Plus',
      products,
      activeCategory: category || null,
      categoryLabels: CATEGORY_LABELS,
      sort: sort || 'popularity',
      searchTerm: q || '',
    });
  })
);

module.exports = router;
