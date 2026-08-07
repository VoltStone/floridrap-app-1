'use strict';

const multer = require('multer');
const sharp = require('sharp');
const logger = require('../utils/logger');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION_PX = 6000; // guards against decompression-bomb style images
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// Memory storage, not disk storage: the raw upload is never written to
// disk as-is — it only ever gets re-encoded (see processProductImage
// below) and then stored as a base64 string in the database, never as a
// file. This was already true before (disk storage was only ever a
// staging step for the security reasons described below), but it's also
// now the only option that works at all: a serverless host like Vercel
// has no writable, persistent local disk to stage files on in the first
// place.
const MAX_GALLERY_FILES = 6; // matches productImageRepository.MAX_IMAGES_PER_PRODUCT

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    // This check is a fast, cheap first filter based on what the client
    // *claims* the content-type is — trivially spoofable, so it is not
    // the real security control. The real control is sharp actually
    // decoding the file content below.
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
}).single('image');

// Same multer config as `upload` above, just accepting several files
// under one field name instead of exactly one — used for the product
// photo gallery. `files: MAX_GALLERY_FILES` caps this at the multer
// level (rejected before any file is even fully received) as well as
// the count re-checked in the route against how many gallery images the
// product already has.
const uploadMultiple = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_GALLERY_FILES },
  fileFilter(req, file, cb) {
    cb(null, ALLOWED_MIME_TYPES.has(file.mimetype));
  },
}).array('images', MAX_GALLERY_FILES);

/**
 * Wraps multer so its errors (oversized file, wrong field name, wrong
 * declared type) become a friendly `req.uploadError` string instead of
 * an unhandled exception — the calling route re-renders its form with
 * this message rather than showing a generic error page.
 */
function uploadImage(req, res, next) {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.uploadError =
        err.code === 'LIMIT_FILE_SIZE'
          ? "L'image dépasse la taille maximale autorisée (5 Mo)."
          : "Le fichier envoyé n'est pas valide.";
    } else if (err) {
      logger.error('Unexpected upload error', err);
      req.uploadError = "Une erreur est survenue lors de l'envoi de l'image.";
    } else if (req.file && !ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      req.uploadError = 'Formats acceptés : JPEG, PNG, WebP.';
    }
    next();
  });
}

/**
 * Same wrapping as uploadImage() above, for the multi-file gallery field.
 */
function uploadGalleryImages(req, res, next) {
  uploadMultiple(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      req.uploadError =
        err.code === 'LIMIT_FILE_SIZE'
          ? "Une image dépasse la taille maximale autorisée (5 Mo)."
          : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
            ? `Vous ne pouvez pas envoyer plus de ${MAX_GALLERY_FILES} photos à la fois.`
            : "Un des fichiers envoyés n'est pas valide.";
    } else if (err) {
      logger.error('Unexpected gallery upload error', err);
      req.uploadError = "Une erreur est survenue lors de l'envoi des photos.";
    } else if (req.files && req.files.some((f) => !ALLOWED_MIME_TYPES.has(f.mimetype))) {
      req.uploadError = 'Formats acceptés : JPEG, PNG, WebP.';
    }
    next();
  });
}

/**
 * The real validation + re-encoding for a single already-received file
 * buffer, shared by both the single-photo and gallery upload paths.
 * Throws (rather than returning an error string) on invalid content —
 * callers decide how to turn that into a user-facing message, since the
 * single-image and gallery routes want slightly different wording.
 */
async function validateAndReencode(buffer) {
  const image = sharp(buffer, { failOn: 'error' });
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error('not_an_image');
  }
  if (metadata.width > MAX_DIMENSION_PX || metadata.height > MAX_DIMENSION_PX) {
    throw new Error('too_large');
  }

  const outBuffer = await image
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer(); // sharp re-encodes fresh bytes here — never the original upload

  return { base64: outBuffer.toString('base64'), mime: 'image/webp' };
}

/**
 * The real validation + sanitization step. Attempts to actually decode
 * the uploaded bytes as an image with sharp (which sniffs real file
 * structure, not the claimed content-type) and, on success, re-encodes
 * it from scratch as WebP. Re-encoding is what strips any embedded
 * metadata/payload and guarantees what ends up stored is nothing but
 * pixel data — not a copy of whatever bytes the client actually sent.
 *
 * The result is left on `req` as a base64 string + mime type
 * (`req.uploadedImage`), not written anywhere — the calling route hands
 * that straight to productRepository.updateImage(), which stores it in
 * the database. See src/db/schema.sql for why.
 */
async function processProductImage(req, res, next) {
  if (req.uploadError || !req.file) {
    return next();
  }

  try {
    req.uploadedImage = await validateAndReencode(req.file.buffer);
    next();
  } catch (err) {
    // sharp throws when the bytes aren't a genuine, decodable image at
    // all — e.g. a renamed .php file, a truncated file, or a crafted
    // polyglot. This is the actual security boundary, not the
    // extension/MIME-type check above.
    logger.security('image_upload_rejected_invalid_content', { ip: req.ip, userId: req.user && req.user.id });
    req.uploadError =
      err.message === 'too_large'
        ? 'Image trop grande (dimensions maximales : 6000x6000px).'
        : "Le fichier envoyé n'est pas une image valide.";
    next();
  }
}

/**
 * Same validation as processProductImage, applied to every file in a
 * gallery upload. The whole batch is rejected together if any single
 * file is invalid, rather than silently skipping the bad one and saving
 * the rest — a partial success here would be confusing (the admin
 * selected N photos, expects N to appear) and it's simple to just ask
 * them to fix and re-select.
 */
async function processGalleryImages(req, res, next) {
  if (req.uploadError || !req.files || req.files.length === 0) {
    return next();
  }

  try {
    const results = [];
    for (const file of req.files) {
      results.push(await validateAndReencode(file.buffer));
    }
    req.uploadedGalleryImages = results;
    next();
  } catch (err) {
    logger.security('gallery_image_upload_rejected_invalid_content', {
      ip: req.ip,
      userId: req.user && req.user.id,
    });
    req.uploadError =
      err.message === 'too_large'
        ? 'Une image dépasse les dimensions maximales autorisées (6000x6000px).'
        : "Un des fichiers envoyés n'est pas une image valide.";
    next();
  }
}

module.exports = {
  uploadImage,
  processProductImage,
  uploadGalleryImages,
  processGalleryImages,
  MAX_GALLERY_FILES,
};

