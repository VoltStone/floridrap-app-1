'use strict';

const express = require('express');
const productRepository = require('../../db/repositories/productRepository');
const productImageRepository = require('../../db/repositories/productImageRepository');
const { validateBody } = require('../../middleware/validate');
const { productSchema } = require('../../schemas/adminSchemas');
const { processProductImage, processGalleryImages } = require('../../middleware/upload');
const asyncHandler = require('../../utils/asyncHandler');
const { setFlash } = require('../../utils/flash');

const router = express.Router();

const CATEGORY_LABELS = {
  draps: 'Draps de lit',
  taies: "Taies d'oreiller",
  housses: 'Housses de couette',
  parures: 'Parures de lit',
  couvertures: 'Couvertures',
};

function emptyFormValues() {
  return { inStock: 'on' };
}

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    return null;
  }
  return id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.render('admin/products', {
      title: 'Produits — Administration',
      products: await productRepository.getAllForAdmin(),
      categoryLabels: CATEGORY_LABELS,
    });
  })
);

router.get('/new', (req, res) => {
  res.render('admin/product-form', {
    title: 'Nouveau produit — Administration',
    mode: 'create',
    product: null,
    values: emptyFormValues(),
    errors: {},
    categoryLabels: CATEGORY_LABELS,
  });
});

router.post(
  '/',
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    if (req.validationFailed) {
      return res.status(400).render('admin/product-form', {
        title: 'Nouveau produit — Administration',
        mode: 'create',
        product: null,
        values: req.body,
        errors: req.validationErrors,
        categoryLabels: CATEGORY_LABELS,
      });
    }

    const product = await productRepository.create(req.validatedBody);
    setFlash(req, 'success', `Produit « ${product.name} » créé. Ajoutez une photo ci-dessous.`);
    res.redirect(`/admin/products/${product.id}/edit`);
  })
);

router.get(
  '/:id/edit',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const product = await productRepository.getById(id);
    if (!product) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    }
    res.render('admin/product-form', {
      title: `Modifier ${product.name} — Administration`,
      mode: 'edit',
      product,
      galleryImages: await productImageRepository.listForProduct(id),
      maxGalleryImages: productImageRepository.MAX_IMAGES_PER_PRODUCT,
      values: {
        name: product.name,
        category: product.category,
        description: product.description,
        price: product.price.toFixed(3),
        compareAtPrice: product.compareAtPrice ? product.compareAtPrice.toFixed(3) : '',
        material: product.material,
        care: product.care,
        sizes: product.sizes.join(', '),
        colors: product.colors.join(', '),
        inStock: product.in_stock ? 'on' : '',
        isBestSeller: product.is_best_seller ? 'on' : '',
        isNew: product.is_new ? 'on' : '',
      },
      errors: {},
      categoryLabels: CATEGORY_LABELS,
    });
  })
);

router.post(
  '/:id',
  validateBody(productSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const product = await productRepository.getById(id);
    if (!product) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    }

    if (req.validationFailed) {
      return res.status(400).render('admin/product-form', {
        title: `Modifier ${product.name} — Administration`,
        mode: 'edit',
        product,
        galleryImages: await productImageRepository.listForProduct(id),
        maxGalleryImages: productImageRepository.MAX_IMAGES_PER_PRODUCT,
        values: req.body,
        errors: req.validationErrors,
        categoryLabels: CATEGORY_LABELS,
      });
    }

    await productRepository.update(id, req.validatedBody);
    setFlash(req, 'success', 'Produit mis à jour.');
    res.redirect('/admin/products');
  })
);

// Image upload is a separate endpoint from the main product form (rather
// than one combined multipart submit) so a plain text edit never needs to
// go through the image pipeline, and an image replacement never has to
// re-validate/re-submit the entire product form.
router.post(
  '/:id/image',
  processProductImage,
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const product = await productRepository.getById(id);
    if (!product) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    }

    if (req.uploadError || !req.uploadedImage) {
      setFlash(req, 'error', req.uploadError || 'Veuillez choisir une image.');
      return res.redirect(`/admin/products/${id}/edit`);
    }

    await productRepository.updateImage(id, req.uploadedImage);
    setFlash(req, 'success', 'Photo mise à jour.');
    res.redirect(`/admin/products/${id}/edit`);
  })
);

// Gallery upload is its own endpoint too, same reasoning as the primary
// image upload above — separate from the main product form, and separate
// from the single-image endpoint since it accepts several files under a
// different field name with its own count cap.
router.post(
  '/:id/gallery',
  processGalleryImages,
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const product = await productRepository.getById(id);
    if (!product) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    }

    if (req.uploadError) {
      setFlash(req, 'error', req.uploadError);
      return res.redirect(`/admin/products/${id}/edit`);
    }
    if (!req.uploadedGalleryImages || req.uploadedGalleryImages.length === 0) {
      setFlash(req, 'error', 'Veuillez choisir au moins une photo.');
      return res.redirect(`/admin/products/${id}/edit`);
    }

    // Re-checked here (not just capped at the multer level) because that
    // cap only limits a single upload batch — this also accounts for
    // photos already in the gallery from previous uploads.
    const currentCount = await productImageRepository.countForProduct(id);
    const max = productImageRepository.MAX_IMAGES_PER_PRODUCT;
    if (currentCount + req.uploadedGalleryImages.length > max) {
      setFlash(
        req,
        'error',
        `Cela dépasserait la limite de ${max} photos de galerie (actuellement ${currentCount}). Retirez-en avant d'en ajouter d'autres.`
      );
      return res.redirect(`/admin/products/${id}/edit`);
    }

    let sortOrder = currentCount;
    for (const image of req.uploadedGalleryImages) {
      await productImageRepository.add(id, image, sortOrder);
      sortOrder += 1;
    }

    setFlash(
      req,
      'success',
      req.uploadedGalleryImages.length === 1
        ? 'Photo ajoutée à la galerie.'
        : `${req.uploadedGalleryImages.length} photos ajoutées à la galerie.`
    );
    res.redirect(`/admin/products/${id}/edit`);
  })
);

router.post(
  '/:id/gallery/:imageId/delete',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const imageId = Number(req.params.imageId);
    if (!Number.isInteger(imageId) || imageId <= 0) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Cette photo n'existe pas." });
    }
    const product = await productRepository.getById(id);
    if (!product) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    }

    await productImageRepository.remove(imageId, id);
    setFlash(req, 'success', 'Photo retirée de la galerie.');
    res.redirect(`/admin/products/${id}/edit`);
  })
);

router.get(
  '/:id/delete',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const product = await productRepository.getById(id);
    if (!product) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    }
    res.render('admin/product-delete-confirm', {
      title: `Supprimer ${product.name} — Administration`,
      product,
      orderCount: await productRepository.countOrderReferences(id),
    });
  })
);

router.post(
  '/:id/delete',
  asyncHandler(async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    const product = await productRepository.getById(id);
    if (!product) {
      return res.status(404).render('error', { title: 'Introuvable', message: "Ce produit n'existe pas." });
    }

    try {
      await productRepository.remove(id);
      setFlash(req, 'success', `Produit « ${product.name} » supprimé.`);
    } catch (err) {
      // This product appears in past order_items — remove() checks that
      // explicitly and throws rather than deleting, so historical orders
      // never lose line-item detail. Guide the admin toward the
      // non-destructive alternative instead.
      setFlash(
        req,
        'error',
        `Impossible de supprimer « ${product.name} » : il fait partie de commandes existantes. Marquez-le plutôt comme "en rupture de stock".`
      );
    }
    res.redirect('/admin/products');
  })
);

module.exports = router;
